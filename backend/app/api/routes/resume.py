from __future__ import annotations

from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import SessionLocal, get_db
from app.deps import get_current_user
from app.models import Resume, ResumeExtraction, User
from app.schemas import ResumeExtractionPayload, ResumeResponse
from app.services.resume_parser import parse_resume_text
from app.services.resume_text import extract_text_from_file, sanitize_postgres_text

router = APIRouter(prefix="/resumes")


@router.post("", response_model=ResumeResponse, status_code=status.HTTP_201_CREATED)
def upload_resume(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResumeResponse:
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Filename is required")
    if not file.filename.lower().endswith((".txt", ".pdf", ".docx")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only txt/pdf/docx are supported")

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid4()}_{file.filename}"
    file_path = upload_dir / stored_name
    file_path.write_bytes(file.file.read())

    resume = Resume(user_id=current_user.id, filename=file.filename, file_path=str(file_path), parse_status="pending")
    db.add(resume)
    db.commit()
    db.refresh(resume)

    background_tasks.add_task(parse_resume_job, resume.id)
    return ResumeResponse(id=resume.id, filename=resume.filename, parse_status=resume.parse_status, created_at=resume.created_at)


@router.get("/{resume_id}", response_model=ResumeResponse)
def get_resume(resume_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ResumeResponse:
    resume = db.query(Resume).filter(Resume.id == resume_id, Resume.user_id == current_user.id).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    extraction_payload = None
    if resume.extraction:
        extraction_payload = ResumeExtractionPayload(
            skills=_split_list(resume.extraction.skills),
            projects=_split_list(resume.extraction.projects),
            experience_summary=resume.extraction.experience_summary,
        )
    return ResumeResponse(
        id=resume.id,
        filename=resume.filename,
        parse_status=resume.parse_status,
        created_at=resume.created_at,
        extraction=extraction_payload,
    )


@router.patch("/{resume_id}/extraction", response_model=ResumeResponse)
def update_extraction(
    resume_id: int,
    payload: ResumeExtractionPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResumeResponse:
    resume = db.query(Resume).filter(Resume.id == resume_id, Resume.user_id == current_user.id).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    extraction = resume.extraction
    if extraction is None:
        extraction = ResumeExtraction(resume_id=resume.id)
        db.add(extraction)

    extraction.skills = ",".join(payload.skills)
    extraction.projects = ",".join(payload.projects)
    extraction.experience_summary = payload.experience_summary
    resume.parse_status = "completed"
    db.commit()
    db.refresh(resume)

    return ResumeResponse(
        id=resume.id,
        filename=resume.filename,
        parse_status=resume.parse_status,
        created_at=resume.created_at,
        extraction=payload,
    )


def parse_resume_job(resume_id: int) -> None:
    db = SessionLocal()
    try:
        resume = db.query(Resume).filter(Resume.id == resume_id).first()
        if not resume:
            return
        resume.parse_status = "processing"
        db.commit()

        path = Path(resume.file_path)
        raw_text = sanitize_postgres_text(extract_text_from_file(path), max_len=500_000)
        parsed = parse_resume_text(raw_text)
        extraction = resume.extraction
        if extraction is None:
            extraction = ResumeExtraction(resume_id=resume.id)
            db.add(extraction)
        extraction.skills = sanitize_postgres_text(",".join(parsed.get("skills", [])))
        extraction.projects = sanitize_postgres_text(",".join(parsed.get("projects", [])))
        extraction.experience_summary = sanitize_postgres_text(str(parsed.get("experience_summary", "")))
        extraction.raw_text = sanitize_postgres_text(raw_text, max_len=4000)
        resume.parse_status = "completed"
        db.commit()
    except Exception:
        db.rollback()
        resume = db.query(Resume).filter(Resume.id == resume_id).first()
        if resume:
            resume.parse_status = "failed"
            db.commit()
    finally:
        db.close()


def _split_list(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]
