from __future__ import annotations

import io
import re
from pathlib import Path
from typing import Any


TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".json"}
SUPPORTED_EXTENSIONS = TEXT_EXTENSIONS | {".pdf", ".docx", ".pptx"}


def extract_document(filename: str, content: bytes) -> dict[str, Any]:
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported document type: {suffix or 'unknown'}. "
            "Supported: TXT, MD, CSV, JSON, PDF, DOCX, PPTX."
        )

    if suffix in TEXT_EXTENSIONS:
        text = decode_text(content)
        metadata: dict[str, Any] = {}
    elif suffix == ".pdf":
        text, metadata = extract_pdf(content)
    elif suffix == ".docx":
        text, metadata = extract_docx(content)
    else:
        text, metadata = extract_pptx(content)

    cleaned = normalize_text(text)
    if not cleaned:
        raise ValueError(f"No readable text found in {filename}.")
    return {
        "filename": filename,
        "extension": suffix,
        "text": cleaned,
        "charCount": len(cleaned),
        **metadata,
    }


def decode_text(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "gb18030", "utf-16"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")


def extract_pdf(content: bytes) -> tuple[str, dict[str, Any]]:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(content))
    pages = []
    for index, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text() or ""
        if page_text.strip():
            pages.append(f"[第{index}页]\n{page_text}")
    return "\n\n".join(pages), {"pages": len(reader.pages)}


def extract_docx(content: bytes) -> tuple[str, dict[str, Any]]:
    from docx import Document

    document = Document(io.BytesIO(content))
    parts = [paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()]
    for table_index, table in enumerate(document.tables, start=1):
        parts.append(f"[表格{table_index}]")
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells]
            if any(cells):
                parts.append(" | ".join(cells))
    return "\n".join(parts), {
        "paragraphs": len(document.paragraphs),
        "tables": len(document.tables),
    }


def extract_pptx(content: bytes) -> tuple[str, dict[str, Any]]:
    from pptx import Presentation

    presentation = Presentation(io.BytesIO(content))
    slides = []
    for index, slide in enumerate(presentation.slides, start=1):
        texts = []
        for shape in slide.shapes:
            if getattr(shape, "has_text_frame", False):
                value = shape.text.strip()
                if value:
                    texts.append(value)
            if getattr(shape, "has_table", False):
                for row in shape.table.rows:
                    cells = [cell.text.strip() for cell in row.cells]
                    if any(cells):
                        texts.append(" | ".join(cells))
        notes = ""
        try:
            notes = slide.notes_slide.notes_text_frame.text.strip()
        except (AttributeError, ValueError):
            pass
        if notes:
            texts.append(f"[备注]\n{notes}")
        if texts:
            slides.append(f"[第{index}页]\n" + "\n".join(dict.fromkeys(texts)))
    return "\n\n".join(slides), {"slides": len(presentation.slides)}


def normalize_text(text: str) -> str:
    text = text.replace("\u00a0", " ").replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
