"""Load plain text from resume files; sanitize for PostgreSQL TEXT (no NUL bytes)."""

from __future__ import annotations

from pathlib import Path


def sanitize_postgres_text(value: str, max_len: int | None = None) -> str:
    """PostgreSQL rejects NUL (0x00) in text/varchar."""
    cleaned = value.replace("\x00", "")
    if max_len is not None:
        cleaned = cleaned[:max_len]
    return cleaned


def extract_text_from_file(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader

            reader = PdfReader(str(path))
            parts: list[str] = []
            for page in reader.pages:
                parts.append(page.extract_text() or "")
            return "\n".join(parts)
        except Exception:
            return ""
    if suffix == ".docx":
        try:
            import docx

            document = docx.Document(str(path))
            return "\n".join(p.text for p in document.paragraphs)
        except Exception:
            return ""
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""
