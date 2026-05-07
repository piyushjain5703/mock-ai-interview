from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    picture_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    oauth_provider: Mapped[Optional[str]] = mapped_column(String(30), nullable=True, index=True)
    oauth_subject: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    profile: Mapped["Profile"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    resumes: Mapped[list["Resume"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    interviews: Mapped[list["InterviewSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    experience_level: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    preferred_roles: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship(back_populates="profile")


class Resume(Base):
    __tablename__ = "resumes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    file_path: Mapped[str] = mapped_column(String(500))
    parse_status: Mapped[str] = mapped_column(String(30), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="resumes")
    extraction: Mapped["ResumeExtraction"] = relationship(
        back_populates="resume",
        uselist=False,
        cascade="all, delete-orphan",
    )


class ResumeExtraction(Base):
    __tablename__ = "resume_extractions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    resume_id: Mapped[int] = mapped_column(ForeignKey("resumes.id"), unique=True, index=True)
    skills: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    projects: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    experience_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    resume: Mapped[Resume] = relationship(back_populates="extraction")


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    resume_id: Mapped[Optional[int]] = mapped_column(ForeignKey("resumes.id"), nullable=True)

    target_role: Mapped[str] = mapped_column(String(255))
    experience_level: Mapped[str] = mapped_column(String(50))
    interview_type: Mapped[str] = mapped_column(String(50))
    difficulty: Mapped[str] = mapped_column(String(30))
    duration_minutes: Mapped[int] = mapped_column(Integer, default=15)
    company_style: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    status: Mapped[str] = mapped_column(String(30), default="configured")
    vapi_call_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    system_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    recording_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship(back_populates="interviews")
    resume: Mapped[Optional[Resume]] = relationship()
    turns: Mapped[list["ConversationTurn"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="ConversationTurn.timestamp"
    )
    evaluation: Mapped[Optional["EvaluationReport"]] = relationship(
        back_populates="session", uselist=False, cascade="all, delete-orphan"
    )


class ConversationTurn(Base):
    __tablename__ = "conversation_turns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("interview_sessions.id"), index=True)
    role: Mapped[str] = mapped_column(String(30))
    content: Mapped[str] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped[InterviewSession] = relationship(back_populates="turns")


class EvaluationReport(Base):
    __tablename__ = "evaluation_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("interview_sessions.id"), unique=True, index=True)

    status: Mapped[str] = mapped_column(String(30), default="pending")
    overall_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    technical_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    communication_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    problem_solving_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    confidence_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    strengths: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    weaknesses: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recommendations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    detailed_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    session: Mapped[InterviewSession] = relationship(back_populates="evaluation")
