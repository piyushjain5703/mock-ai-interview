from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import EvaluationReport, InterviewSession, User
from app.schemas import DashboardStats, InterviewHistoryItem

router = APIRouter(prefix="/history")


@router.get("", response_model=list[InterviewHistoryItem])
def list_history(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    interview_type: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = (
        select(InterviewSession, EvaluationReport)
        .outerjoin(EvaluationReport, EvaluationReport.session_id == InterviewSession.id)
        .where(InterviewSession.user_id == user.id)
        .order_by(InterviewSession.created_at.desc())
    )
    if interview_type:
        q = q.where(InterviewSession.interview_type == interview_type)

    q = q.offset(offset).limit(limit)
    rows = db.execute(q).all()

    items: list[InterviewHistoryItem] = []
    for session, report in rows:
        items.append(
            InterviewHistoryItem(
                id=session.id,
                target_role=session.target_role,
                experience_level=session.experience_level,
                interview_type=session.interview_type,
                difficulty=session.difficulty,
                duration_minutes=session.duration_minutes,
                company_style=session.company_style,
                status=session.status,
                started_at=session.started_at,
                ended_at=session.ended_at,
                created_at=session.created_at,
                duration_seconds=session.duration_seconds,
                overall_score=report.overall_score if report else None,
                evaluation_status=report.status if report else None,
            )
        )
    return items


@router.get("/stats", response_model=DashboardStats)
def get_stats(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    base = select(InterviewSession).where(InterviewSession.user_id == user.id)

    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0

    ended_q = base.where(InterviewSession.status == "ended")
    completed = db.scalar(select(func.count()).select_from(ended_q.subquery())) or 0

    total_seconds = (
        db.scalar(
            select(func.coalesce(func.sum(InterviewSession.duration_seconds), 0)).where(
                InterviewSession.user_id == user.id,
                InterviewSession.status == "ended",
            )
        )
        or 0
    )
    total_minutes = round(total_seconds / 60, 1)

    eval_q = (
        select(EvaluationReport.overall_score)
        .join(InterviewSession, InterviewSession.id == EvaluationReport.session_id)
        .where(
            InterviewSession.user_id == user.id,
            EvaluationReport.status == "completed",
            EvaluationReport.overall_score.isnot(None),
        )
    )
    scores = db.scalars(eval_q).all()

    average_score = round(sum(scores) / len(scores), 1) if scores else None
    best_score = round(max(scores), 1) if scores else None

    trend_rows = db.execute(
        select(
            InterviewSession.id,
            InterviewSession.created_at,
            EvaluationReport.overall_score,
        )
        .join(EvaluationReport, EvaluationReport.session_id == InterviewSession.id)
        .where(
            InterviewSession.user_id == user.id,
            EvaluationReport.status == "completed",
            EvaluationReport.overall_score.isnot(None),
        )
        .order_by(InterviewSession.created_at.asc())
        .limit(30)
    ).all()

    score_trend = [
        {
            "interview_id": row[0],
            "date": row[1].isoformat() if row[1] else None,
            "score": round(row[2], 1),
        }
        for row in trend_rows
    ]

    type_rows = db.execute(
        select(InterviewSession.interview_type, func.count())
        .where(InterviewSession.user_id == user.id)
        .group_by(InterviewSession.interview_type)
    ).all()
    type_breakdown = {row[0]: row[1] for row in type_rows}

    return DashboardStats(
        total_interviews=total,
        completed_interviews=completed,
        average_score=average_score,
        best_score=best_score,
        total_practice_minutes=total_minutes,
        score_trend=score_trend,
        type_breakdown=type_breakdown,
    )
