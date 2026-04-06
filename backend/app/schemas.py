from __future__ import annotations

from datetime import datetime
from typing import Optional

from enum import Enum

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    id: int
    email: EmailStr

    model_config = ConfigDict(from_attributes=True)


class ProfilePayload(BaseModel):
    full_name: Optional[str] = None
    experience_level: Optional[str] = None
    preferred_roles: list[str] = Field(default_factory=list)


class ProfileResponse(ProfilePayload):
    user_id: int


class ResumeExtractionPayload(BaseModel):
    skills: list[str] = Field(default_factory=list)
    projects: list[str] = Field(default_factory=list)
    experience_summary: Optional[str] = None


class ResumeResponse(BaseModel):
    id: int
    filename: str
    parse_status: str
    created_at: datetime
    extraction: Optional[ResumeExtractionPayload] = None

    model_config = ConfigDict(from_attributes=True)


# ── Interview schemas ──────────────────────────────────────────────


class InterviewType(str, Enum):
    HR = "hr"
    TECHNICAL = "technical"
    DSA = "dsa"
    SYSTEM_DESIGN = "system_design"


class Difficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class InterviewCreateRequest(BaseModel):
    target_role: str = Field(min_length=1, max_length=255)
    experience_level: str = Field(min_length=1, max_length=50)
    interview_type: InterviewType
    difficulty: Difficulty
    duration_minutes: int = Field(default=15, ge=5, le=60)
    resume_id: Optional[int] = None
    company_style: Optional[str] = None


class ConversationTurnResponse(BaseModel):
    id: int
    role: str
    content: str
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class InterviewResponse(BaseModel):
    id: int
    target_role: str
    experience_level: str
    interview_type: str
    difficulty: str
    duration_minutes: int
    company_style: Optional[str] = None
    status: str
    vapi_call_id: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    created_at: datetime
    duration_seconds: Optional[float] = None
    recording_url: Optional[str] = None
    summary: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class InterviewDetailResponse(InterviewResponse):
    turns: list[ConversationTurnResponse] = Field(default_factory=list)


class InterviewStartResponse(BaseModel):
    interview_id: int
    assistant_config: dict
    vapi_call_id: Optional[str] = None


class ClientTranscriptTurnIn(BaseModel):
    role: str = Field(max_length=40)
    content: str = Field(min_length=1, max_length=50000)


class ClientTranscriptPayload(BaseModel):
    """Final transcript from the browser (Vapi webhooks often miss localhost)."""

    turns: list[ClientTranscriptTurnIn]


# ── Evaluation schemas ────────────────────────────────────────────


class CategoryScores(BaseModel):
    technical_knowledge: float = Field(ge=0, le=10)
    communication: float = Field(ge=0, le=10)
    problem_solving: float = Field(ge=0, le=10)
    confidence: float = Field(ge=0, le=10)


class EvaluationResponse(BaseModel):
    id: int
    session_id: int
    status: str
    overall_score: Optional[float] = None
    category_scores: Optional[CategoryScores] = None
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    detailed_feedback: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


# ── History / Dashboard schemas ───────────────────────────────────


class InterviewHistoryItem(BaseModel):
    id: int
    target_role: str
    experience_level: str
    interview_type: str
    difficulty: str
    duration_minutes: int
    company_style: Optional[str] = None
    status: str
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    created_at: datetime
    duration_seconds: Optional[float] = None
    overall_score: Optional[float] = None
    evaluation_status: Optional[str] = None


class DashboardStats(BaseModel):
    total_interviews: int
    completed_interviews: int
    average_score: Optional[float] = None
    best_score: Optional[float] = None
    total_practice_minutes: float
    score_trend: list[dict] = Field(default_factory=list)
    type_breakdown: dict[str, int] = Field(default_factory=dict)
