# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev      # Vite dev server on port 5173
npm run build    # TypeScript compile + Vite bundle
npm run preview  # Preview production build
```

There are no test or lint commands configured.

## Environment Variables

**Backend** (`backend/.env`):
- `DATABASE_URL` — Supabase PostgreSQL connection string
- `JWT_SECRET` — JWT signing key
- `GEMINI_API_KEY` — Google Gemini API for interview evaluation
- `VAPI_API_KEY`, `VAPI_PUBLIC_KEY`, `VAPI_WEBHOOK_SECRET` — Vapi voice AI service

**Frontend** (`frontend/.env`):
- `VITE_API_URL=http://localhost:8000/api/v1`
- `VITE_VAPI_PUBLIC_KEY` — Vapi public key for browser SDK

## Architecture

**Backend** — FastAPI + SQLAlchemy on Supabase PostgreSQL. All tables are auto-created at startup (`app/main.py`). The API is mounted at `/api/v1` via a modular router pattern in `app/api/router.py`.

**Frontend** — Single-page React 18 + TypeScript app built with Vite. Almost all view logic lives in `src/App.tsx` (auth, dashboard, interview config, feedback). `src/api.ts` contains all HTTP client calls and shared TypeScript types. `src/InterviewSession.tsx` and `src/FeedbackView.tsx` are the two significant extracted components.

### Key Data Flow

1. User uploads a resume → backend parses PDF/DOCX via `pypdf`/`python-docx` and stores extracted skills/projects in `ResumeExtraction`.
2. User configures an interview (role, difficulty, type, duration) → creates an `InterviewSession` record.
3. Frontend initializes the Vapi.ai browser SDK (`@vapi-ai/web`) with the session config, conducting the live voice call directly in the browser.
4. Vapi sends conversation turns to the backend via webhook (`app/api/routes/webhook.py`), which stores them as `ConversationTurn` records.
5. On interview end, `evaluation_service.py` sends the full transcript to Google Gemini 2.0 Flash to generate an `EvaluationReport` with scores, strengths, and weaknesses.

### Backend Module Map

| Path | Responsibility |
|------|---------------|
| `app/main.py` | App init, CORS config, table creation |
| `app/models.py` | SQLAlchemy ORM (User, Profile, Resume, ResumeExtraction, InterviewSession, ConversationTurn, EvaluationReport) |
| `app/schemas.py` | Pydantic request/response schemas |
| `app/deps.py` | FastAPI dependency injection (current user, DB session) |
| `app/core/config.py` | Pydantic `BaseSettings` — all env vars |
| `app/core/security.py` | JWT creation/verification, bcrypt hashing |
| `app/services/vapi_service.py` | Vapi call setup and configuration |
| `app/services/evaluation_service.py` | Gemini-powered transcript evaluation |
| `app/services/resume_parser.py` | PDF/DOCX → structured data extraction |
