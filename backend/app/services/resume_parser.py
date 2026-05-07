from __future__ import annotations

import json
import logging
import re
from typing import Any, Union

from google import genai
from google.genai import types

from app.core.config import settings

logger = logging.getLogger(__name__)

MAX_INPUT_CHARS = 30_000

EXTRACTION_SYSTEM_PROMPT = """\
You are a resume parser. Read the resume text and return ONLY a JSON object
with EXACTLY these keys:
{
  "skills": [<short technical or domain skill strings>],
  "projects": [<short project descriptions, each <= 200 characters>],
  "experience_summary": "<1-3 sentence overview of the candidate's background>"
}

Rules:
- Output JSON only. No prose, no markdown fences.
- skills: concrete technologies, languages, frameworks, tools, or domain skills.
  Deduplicate. Prefer canonical names (e.g. "PostgreSQL" not "postgres db").
- projects: one entry per project actually mentioned in the resume. Keep each
  entry self-contained and concise.
- experience_summary: factual overview drawn from the resume. No speculation.
- If a field has no information in the resume, return [] or "" — never null.
"""


def _parse_llm_json(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```\s*$", "", text).strip()
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("Model returned non-object JSON")
    return data


def _coerce_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        if isinstance(item, str):
            cleaned = item.strip()
            if cleaned:
                out.append(cleaned)
    return out


def parse_resume_text(raw_text: str) -> dict[str, Union[list[str], str]]:
    """Extract skills, projects, and an experience summary from raw resume text using Gemini."""
    text = (raw_text or "").strip()
    if not text:
        return {"skills": [], "projects": [], "experience_summary": ""}

    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured; cannot run resume extraction.")

    if len(text) > MAX_INPUT_CHARS:
        text = text[:MAX_INPUT_CHARS]

    client = genai.Client(api_key=settings.gemini_api_key)
    response = client.models.generate_content(
        model=settings.resume_extraction_model,
        contents=text,
        config=types.GenerateContentConfig(
            system_instruction=EXTRACTION_SYSTEM_PROMPT,
            temperature=0.2,
            response_mime_type="application/json",
        ),
    )

    data = _parse_llm_json(response.text)

    skills = _coerce_string_list(data.get("skills"))
    projects = _coerce_string_list(data.get("projects"))
    summary_raw = data.get("experience_summary", "")
    experience_summary = summary_raw.strip() if isinstance(summary_raw, str) else ""

    return {
        "skills": skills,
        "projects": projects,
        "experience_summary": experience_summary,
    }
