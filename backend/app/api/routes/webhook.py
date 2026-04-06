from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import ConversationTurn, InterviewSession
from app.services.evaluation_service import claim_evaluation_processing, run_evaluation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks")


@router.post("/vapi")
async def vapi_webhook(request: Request) -> Response:
    """Handle Vapi webhook events for transcript and call lifecycle."""
    try:
        body: dict[str, Any] = await request.json()
    except Exception:
        return Response(status_code=400)

    message = body.get("message", {})
    msg_type = message.get("type", "")

    handler = _HANDLERS.get(msg_type)
    if handler:
        try:
            handler(message)
        except Exception:
            logger.exception("Error handling Vapi webhook event: %s", msg_type)

    return Response(status_code=200)


def _extract_turn_content(item: dict[str, Any]) -> str:
    raw = item.get("message")
    if raw is None:
        raw = item.get("content")
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw.strip()
    if isinstance(raw, list):
        parts: list[str] = []
        for p in raw:
            if isinstance(p, dict):
                if p.get("type") == "text" and isinstance(p.get("text"), str):
                    parts.append(p["text"])
                elif isinstance(p.get("content"), str):
                    parts.append(p["content"])
            elif isinstance(p, str):
                parts.append(p)
        return " ".join(parts).strip()
    return str(raw).strip()


def _normalize_message_role(role: str) -> str:
    r = (role or "unknown").lower()
    if r in ("bot", "assistant"):
        return "assistant"
    if r in ("user", "customer", "caller"):
        return "user"
    if r == "system":
        return "system"
    return role or "unknown"


def _persist_turns_from_end_call_report(db: Session, session_id: int, message: dict[str, Any]) -> None:
    """Backfill conversation_turns from Vapi end-of-call artifact when per-turn webhooks did not run."""
    call = message.get("call") or {}
    artifact = message.get("artifact") or {}
    msgs: list[Any] = list(artifact.get("messages") or call.get("messages") or [])

    def existing_count() -> int:
        return (
            db.scalar(
                select(func.count()).select_from(ConversationTurn).where(
                    ConversationTurn.session_id == session_id
                )
            )
            or 0
        )

    if msgs:
        n_existing = existing_count()
        if n_existing < 2 or n_existing < len(msgs):
            for turn in db.scalars(
                select(ConversationTurn).where(ConversationTurn.session_id == session_id)
            ):
                db.delete(turn)
            db.flush()
            for item in msgs:
                if not isinstance(item, dict):
                    continue
                role_raw = _normalize_message_role(str(item.get("role", "")))
                if role_raw == "system":
                    continue
                content = _extract_turn_content(item)
                if not content:
                    continue
                db.add(ConversationTurn(session_id=session_id, role=role_raw, content=content))
        return

    ttext = artifact.get("transcript")
    if not ttext:
        ttext = message.get("transcript") or call.get("transcript")
    if isinstance(ttext, str) and ttext.strip() and existing_count() < 2:
        for turn in db.scalars(
            select(ConversationTurn).where(ConversationTurn.session_id == session_id)
        ):
            db.delete(turn)
        db.flush()
        db.add(
            ConversationTurn(
                session_id=session_id,
                role="mixed",
                content=ttext.strip(),
            )
        )


def _get_interview_id(message: dict[str, Any]) -> int | None:
    call = message.get("call", {})
    metadata = call.get("metadata") or {}
    iid = metadata.get("interview_id")
    if iid is not None:
        return int(iid)

    assistant = call.get("assistant", {})
    metadata = assistant.get("metadata") or {}
    iid = metadata.get("interview_id")
    if iid is not None:
        return int(iid)
    return None


def _handle_transcript(message: dict[str, Any]) -> None:
    """Persist final transcript turns."""
    transcript_type = message.get("transcriptType", "")
    if transcript_type != "final":
        return

    interview_id = _get_interview_id(message)
    if not interview_id:
        return

    role = message.get("role", "unknown")
    content = message.get("transcript", "")
    if not content:
        return

    db = SessionLocal()
    try:
        session = db.scalar(
            select(InterviewSession).where(InterviewSession.id == interview_id)
        )
        if not session:
            return
        if session.status == "ready":
            session.status = "in_progress"

        turn = ConversationTurn(
            session_id=interview_id,
            role=role,
            content=content,
        )
        db.add(turn)
        db.commit()
    finally:
        db.close()


def _handle_call_start(message: dict[str, Any]) -> None:
    interview_id = _get_interview_id(message)
    if not interview_id:
        return

    call = message.get("call", {})
    call_id = call.get("id")

    db = SessionLocal()
    try:
        session = db.scalar(
            select(InterviewSession).where(InterviewSession.id == interview_id)
        )
        if not session:
            return
        session.status = "in_progress"
        if call_id and not session.vapi_call_id:
            session.vapi_call_id = call_id
        if not session.started_at:
            session.started_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()


def _handle_end_of_call(message: dict[str, Any]) -> None:
    interview_id = _get_interview_id(message)
    if not interview_id:
        return

    db = SessionLocal()
    try:
        session = db.scalar(
            select(InterviewSession).where(InterviewSession.id == interview_id)
        )
        if not session:
            return
        session.status = "ended"
        session.ended_at = datetime.now(timezone.utc)
        if session.started_at:
            session.duration_seconds = (session.ended_at - session.started_at).total_seconds()

        call = message.get("call", {})
        session.recording_url = call.get("recordingUrl")
        session.summary = message.get("summary") or call.get("summary")
        _persist_turns_from_end_call_report(db, interview_id, message)
        claim_evaluation_processing(db, interview_id)
        db.commit()

        _trigger_evaluation_async(interview_id)
    finally:
        db.close()


def _trigger_evaluation_async(session_id: int) -> None:
    """Kick off evaluation in a background thread after call ends."""
    def _run() -> None:
        db = SessionLocal()
        try:
            run_evaluation(db, session_id)
        except Exception:
            logger.exception("Background evaluation failed for session %s", session_id)
        finally:
            db.close()

    threading.Thread(target=_run, daemon=True).start()


def _handle_speech_update(message: dict[str, Any]) -> None:
    pass


_HANDLERS: dict[str, Any] = {
    "transcript": _handle_transcript,
    "call-start": _handle_call_start,
    "end-of-call-report": _handle_end_of_call,
    "speech-update": _handle_speech_update,
}
