from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload

from app.db import SessionLocal, get_db
from app.deps import get_current_user
from app.models import ConversationTurn, InterviewSession, Profile, Resume, ResumeExtraction, User
from app.schemas import (
    ClientTranscriptPayload,
    InterviewCreateRequest,
    InterviewDetailResponse,
    InterviewResponse,
    InterviewStartResponse,
)
from app.services.evaluation_service import claim_evaluation_processing, run_evaluation
from app.services.vapi_service import build_assistant_config, build_system_prompt

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/interviews")


@router.post("", response_model=InterviewResponse, status_code=status.HTTP_201_CREATED)
def create_interview(
    payload: InterviewCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InterviewResponse:
    if payload.resume_id:
        resume = db.scalar(
            select(Resume).where(Resume.id == payload.resume_id, Resume.user_id == current_user.id)
        )
        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found")

    session = InterviewSession(
        user_id=current_user.id,
        resume_id=payload.resume_id,
        target_role=payload.target_role,
        experience_level=payload.experience_level,
        interview_type=payload.interview_type.value,
        difficulty=payload.difficulty.value,
        duration_minutes=payload.duration_minutes,
        company_style=payload.company_style,
        status="configured",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return InterviewResponse.model_validate(session)


@router.get("", response_model=list[InterviewResponse])
def list_interviews(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[InterviewResponse]:
    sessions = (
        db.scalars(
            select(InterviewSession)
            .where(InterviewSession.user_id == current_user.id)
            .order_by(InterviewSession.created_at.desc())
        )
        .all()
    )
    return [InterviewResponse.model_validate(s) for s in sessions]


@router.get("/{interview_id}", response_model=InterviewDetailResponse)
def get_interview(
    interview_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InterviewDetailResponse:
    session = db.scalar(
        select(InterviewSession)
        .options(joinedload(InterviewSession.turns))
        .where(InterviewSession.id == interview_id, InterviewSession.user_id == current_user.id)
    )
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found")
    return InterviewDetailResponse.model_validate(session)


@router.post("/{interview_id}/start", response_model=InterviewStartResponse)
async def start_interview(
    interview_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InterviewStartResponse:
    session = db.scalar(
        select(InterviewSession).where(
            InterviewSession.id == interview_id, InterviewSession.user_id == current_user.id
        )
    )
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found")
    if session.status not in ("configured", "ended"):
        raise HTTPException(status_code=400, detail=f"Cannot start interview in '{session.status}' state")

    profile = db.scalar(select(Profile).where(Profile.user_id == current_user.id))
    candidate_name = (profile.full_name if profile and profile.full_name else current_user.email.split("@")[0])

    skills: list[str] = []
    projects: list[str] = []
    experience_summary = ""
    if session.resume_id:
        extraction = db.scalar(
            select(ResumeExtraction).where(ResumeExtraction.resume_id == session.resume_id)
        )
        if extraction:
            skills = [s.strip() for s in (extraction.skills or "").split(",") if s.strip()]
            projects = [p.strip() for p in (extraction.projects or "").split(",") if p.strip()]
            experience_summary = extraction.experience_summary or ""

    webhook_url = str(request.base_url).rstrip("/") + "/api/v1/webhooks/vapi"

    system_prompt = build_system_prompt(
        candidate_name=candidate_name,
        target_role=session.target_role,
        experience_level=session.experience_level,
        interview_type=session.interview_type,
        difficulty=session.difficulty,
        duration_minutes=session.duration_minutes,
        skills=skills,
        projects=projects,
        experience_summary=experience_summary,
        company_style=session.company_style,
    )

    assistant_config = build_assistant_config(
        interview_id=session.id,
        system_prompt=system_prompt,
        candidate_name=candidate_name,
        interview_type=session.interview_type,
        webhook_url=webhook_url,
        duration_minutes=session.duration_minutes,
    )

    session.system_prompt = system_prompt
    session.status = "ready"
    session.started_at = datetime.now(timezone.utc)
    # Web interviews: the browser @vapi-ai/web SDK starts the call; Vapi REST POST /call
    # only accepts phone types (outboundPhoneCall / inboundPhoneCall), not webCall.
    # vapi_call_id is filled from the call-start webhook when the client connects.
    vapi_call_id = None

    db.commit()
    db.refresh(session)

    return InterviewStartResponse(
        interview_id=session.id,
        assistant_config=assistant_config,
        vapi_call_id=vapi_call_id,
    )


@router.post("/{interview_id}/client-transcript", response_model=InterviewDetailResponse)
def sync_client_transcript(
    interview_id: int,
    payload: ClientTranscriptPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InterviewDetailResponse:
    """Persist transcript lines captured in the browser before ending the session."""
    session = db.scalar(
        select(InterviewSession).where(
            InterviewSession.id == interview_id,
            InterviewSession.user_id == current_user.id,
        )
    )
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found")
    if session.status not in ("ready", "in_progress"):
        raise HTTPException(
            status_code=400,
            detail="Can only upload a client transcript while the interview is active",
        )

    non_empty = [t for t in payload.turns if t.content.strip()]
    if not non_empty:
        raise HTTPException(status_code=400, detail="No non-empty transcript lines")

    db.execute(delete(ConversationTurn).where(ConversationTurn.session_id == interview_id))
    for row in non_empty:
        text = row.content.strip()
        role = (row.role or "unknown").strip()[:40]
        db.add(ConversationTurn(session_id=interview_id, role=role, content=text))
    db.commit()

    session = db.scalar(
        select(InterviewSession)
        .options(joinedload(InterviewSession.turns))
        .where(InterviewSession.id == interview_id, InterviewSession.user_id == current_user.id)
    )
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found")
    return InterviewDetailResponse.model_validate(session)


@router.post("/{interview_id}/end", response_model=InterviewResponse)
def end_interview(
    interview_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InterviewResponse:
    session = db.scalar(
        select(InterviewSession).where(
            InterviewSession.id == interview_id, InterviewSession.user_id == current_user.id
        )
    )
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found")

    session.status = "ended"
    session.ended_at = datetime.now(timezone.utc)
    if session.started_at:
        session.duration_seconds = (session.ended_at - session.started_at).total_seconds()
    claim_evaluation_processing(db, session.id)
    db.commit()
    db.refresh(session)

    def _run_eval(sid: int) -> None:
        bg_db = SessionLocal()
        try:
            run_evaluation(bg_db, sid)
        except Exception:
            logger.exception("Background evaluation failed for session %s", sid)
        finally:
            bg_db.close()

    threading.Thread(target=_run_eval, args=(session.id,), daemon=True).start()

    return InterviewResponse.model_validate(session)
