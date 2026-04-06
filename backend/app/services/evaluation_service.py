from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone

from google import genai
from google.genai import types
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import ConversationTurn, EvaluationReport, InterviewSession

logger = logging.getLogger(__name__)


def _parse_llm_json(raw: str) -> dict:
    """Parse model output; strip optional markdown fences."""
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```\s*$", "", text).strip()
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("Model returned non-object JSON")
    return data


EVALUATION_SYSTEM_PROMPT = """\
You are an expert interview evaluator. You will receive:
- Interview metadata (role, type, difficulty, experience level)
- The full conversation transcript between interviewer and candidate

Produce a JSON evaluation with EXACTLY this schema (no markdown fences):
{
  "overall_score": <float 0-10>,
  "technical_knowledge": <float 0-10>,
  "communication": <float 0-10>,
  "problem_solving": <float 0-10>,
  "confidence": <float 0-10>,
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "weaknesses": ["<weakness 1>", "<weakness 2>", ...],
  "recommendations": ["<recommendation 1>", "<recommendation 2>", ...],
  "detailed_feedback": "<2-4 paragraph narrative feedback>"
}

Scoring guide:
- 0-3: Poor — significant gaps, unable to answer core questions
- 4-5: Below average — partial answers, notable weaknesses
- 6-7: Average — solid answers with room for improvement
- 8-9: Strong — comprehensive, well-structured responses
- 10: Exceptional — expert-level, exceeds expectations

Be specific and actionable. Reference actual answers from the transcript.
strengths/weaknesses/recommendations should each have 2-5 items.
"""


def _format_transcript(turns: list[ConversationTurn]) -> str:
    lines: list[str] = []
    for t in turns:
        if t.role == "assistant":
            label = "Interviewer"
        elif t.role in ("user", "customer"):
            label = "Candidate"
        else:
            label = "Conversation"
        lines.append(f"{label}: {t.content}")
    return "\n\n".join(lines)


def _build_evaluation_transcript(session: InterviewSession, turns: list[ConversationTurn]) -> tuple[str, bool]:
    """Returns (text_for_llm, is_sparse). Sparse = few structured turns or summary-only."""
    summary = (session.summary or "").strip()
    body = _format_transcript(turns).strip()
    if body and summary:
        text = f"{body}\n\n---\nEnd-of-call summary:\n{summary}"
    elif body:
        text = body
    elif summary:
        text = f"[No turn-by-turn transcript stored.]\n\nEnd-of-call summary:\n{summary}"
    else:
        text = ""
    sparse = len(turns) < 2 or (len(turns) == 1 and turns[0].role == "mixed")
    return text, sparse


def claim_evaluation_processing(db: Session, session_id: int) -> None:
    """Create or lock an evaluation row as *processing* before starting background work.

    Avoids a race where GET /feedback returns not_started while the worker has not
    yet inserted the report, which caused duplicate threads and a stuck UI.
    """
    er = db.scalar(select(EvaluationReport).where(EvaluationReport.session_id == session_id))
    if er is None:
        db.add(EvaluationReport(session_id=session_id, status="processing"))
    elif er.status != "completed":
        er.status = "processing"
        er.error_message = None


def run_evaluation(db: Session, session_id: int) -> EvaluationReport:
    """Run LLM evaluation on an interview transcript. Returns the report."""
    report: EvaluationReport | None = None
    try:
        session = db.get(InterviewSession, session_id)
        if session is None:
            raise ValueError(f"Interview session {session_id} not found")

        report = session.evaluation
        if report is None:
            report = EvaluationReport(session_id=session_id, status="processing")
            db.add(report)
            db.flush()

        if report.status == "completed":
            return report

        if report.status != "processing":
            report.status = "processing"
        db.commit()

        turns: list[ConversationTurn] = list(
            db.scalars(
                select(ConversationTurn)
                .where(ConversationTurn.session_id == session_id)
                .order_by(ConversationTurn.timestamp)
            ).all()
        )
        db.refresh(session)

        transcript_text, sparse = _build_evaluation_transcript(session, turns)
        if not transcript_text.strip():
            report.status = "failed"
            report.error_message = (
                "No transcript or call summary available. "
                "Use a publicly reachable API URL (e.g. ngrok) for Vapi webhooks, or end the call in-app "
                "so Vapi can post the end-of-call report."
            )
            db.commit()
            return report

        sparse_note = ""
        if sparse:
            sparse_note = (
                "\n\nContext is limited (partial transcript or summary only). "
                "Score conservatively, note gaps in evidence, and suggest practicing with a full recording next time."
            )

        user_prompt = (
            f"Interview metadata:\n"
            f"- Target role: {session.target_role}\n"
            f"- Interview type: {session.interview_type}\n"
            f"- Difficulty: {session.difficulty}\n"
            f"- Experience level: {session.experience_level}\n"
            f"- Duration: {session.duration_minutes} minutes\n\n"
            f"Transcript / notes:\n{transcript_text}"
            f"{sparse_note}"
        )

        if not settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY is not configured")

        client = genai.Client(api_key=settings.gemini_api_key)
        response = client.models.generate_content(
            model=settings.evaluation_model,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=EVALUATION_SYSTEM_PROMPT,
                temperature=0.3,
                response_mime_type="application/json",
            ),
        )
        raw = (response.text or "").strip() or "{}"
        data = _parse_llm_json(raw)

        report.overall_score = float(data.get("overall_score", 0))
        report.technical_score = float(data.get("technical_knowledge", 0))
        report.communication_score = float(data.get("communication", 0))
        report.problem_solving_score = float(data.get("problem_solving", 0))
        report.confidence_score = float(data.get("confidence", 0))

        report.strengths = json.dumps(data.get("strengths", []))
        report.weaknesses = json.dumps(data.get("weaknesses", []))
        report.recommendations = json.dumps(data.get("recommendations", []))
        report.detailed_feedback = data.get("detailed_feedback", "")

        report.status = "completed"
        report.completed_at = datetime.now(timezone.utc)
        report.error_message = None

        db.commit()
        return report

    except Exception as e:
        logger.exception("Evaluation failed for session %s", session_id)
        try:
            if report is None:
                report = db.scalar(select(EvaluationReport).where(EvaluationReport.session_id == session_id))
            if report is not None:
                report.status = "failed"
                report.error_message = str(e)[:500]
                db.commit()
        except Exception:
            logger.exception("Could not persist evaluation failure for session %s", session_id)
        if report is not None:
            return report
        raise


def report_to_response(report: EvaluationReport) -> dict:
    """Convert an EvaluationReport model to the API response dict."""
    from app.schemas import CategoryScores, EvaluationResponse

    category_scores = None
    if report.status == "completed" and report.overall_score is not None:
        category_scores = CategoryScores(
            technical_knowledge=report.technical_score or 0,
            communication=report.communication_score or 0,
            problem_solving=report.problem_solving_score or 0,
            confidence=report.confidence_score or 0,
        )

    def _parse_json_list(raw: str | None) -> list[str]:
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except (json.JSONDecodeError, TypeError):
            return []

    return EvaluationResponse(
        id=report.id,
        session_id=report.session_id,
        status=report.status,
        overall_score=report.overall_score,
        category_scores=category_scores,
        strengths=_parse_json_list(report.strengths),
        weaknesses=_parse_json_list(report.weaknesses),
        recommendations=_parse_json_list(report.recommendations),
        detailed_feedback=report.detailed_feedback,
        error_message=report.error_message,
        created_at=report.created_at,
        completed_at=report.completed_at,
    ).model_dump(mode="json")
