from __future__ import annotations

import re
from typing import Union


def parse_resume_text(raw_text: str) -> dict[str, Union[list[str], str]]:
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    skills = _extract_list(lines, {"skills", "technical skills", "tech stack"})
    projects = _extract_list(lines, {"projects", "project"})
    experience_summary = " ".join(lines[:5])[:500] if lines else ""
    return {
        "skills": skills,
        "projects": projects,
        "experience_summary": experience_summary,
    }


def _extract_list(lines: list[str], headings: set[str]) -> list[str]:
    items: list[str] = []
    capture = False
    for line in lines:
        lowered = line.lower().strip(":")
        if lowered in headings:
            capture = True
            continue
        if capture and re.match(r"^[A-Z][a-zA-Z ]+:$", line):
            break
        if capture:
            split_items = re.split(r"[,|•]", line)
            items.extend([item.strip() for item in split_items if item.strip()])
            if len(items) >= 10:
                break
    return items[:10]
