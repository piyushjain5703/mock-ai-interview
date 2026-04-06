from __future__ import annotations

import threading

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal, get_db
from app.deps import get_current_user
from app.models import EvaluationReport, InterviewSession, User
from app.services.evaluation_service import claim_evaluation_processing, report_to_response, run_evaluation

router = APIRouter(prefix="/interviews")


@router.get("/{interview_id}/feedback")
def get_feedback(
    interview_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = db.scalar(
        select(InterviewSession).where(
            InterviewSession.id == interview_id,
            InterviewSession.user_id == user.id,
        )
    )
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found")

    report = db.scalar(
        select(EvaluationReport).where(EvaluationReport.session_id == interview_id)
    )

    if not report:
        if session.status != "ended":
            raise HTTPException(
                status_code=400,
                detail="Interview has not ended yet",
            )
        return {"status": "not_started", "session_id": interview_id}

    return report_to_response(report)


@router.post("/{interview_id}/evaluate")
def trigger_evaluation(
    interview_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = db.scalar(
        select(InterviewSession).where(
            InterviewSession.id == interview_id,
            InterviewSession.user_id == user.id,
        )
    )
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found")
    if session.status != "ended":
        raise HTTPException(status_code=400, detail="Interview has not ended yet")

    existing = db.scalar(
        select(EvaluationReport).where(EvaluationReport.session_id == interview_id)
    )
    if existing and existing.status == "completed":
        return report_to_response(existing)
    if existing and existing.status == "processing":
        return {"status": "processing", "session_id": interview_id}

    claim_evaluation_processing(db, interview_id)
    db.commit()
    refreshed = db.scalar(
        select(EvaluationReport).where(EvaluationReport.session_id == interview_id)
    )

    def _run_in_background(sid: int) -> None:
        bg_db = SessionLocal()
        try:
            run_evaluation(bg_db, sid)
        finally:
            bg_db.close()

    threading.Thread(target=_run_in_background, args=(interview_id,), daemon=True).start()

    if refreshed:
        return report_to_response(refreshed)
    return {"status": "processing", "session_id": interview_id}
