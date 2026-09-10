from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from docx import Document as DocxDocument
from pypdf import PdfReader

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}

@dataclass
class ExtractedSection:
    text: str
    page_number: int | None = None

def extract_sections(filename: str, data: bytes) -> list[ExtractedSection]:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {suffix}")
    if suffix == ".pdf":
        reader = PdfReader(BytesIO(data))
        return [ExtractedSection((page.extract_text() or "").strip(), i) for i, page in enumerate(reader.pages, 1) if (page.extract_text() or "").strip()]
    if suffix == ".docx":
        doc = DocxDocument(BytesIO(data))
        text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        return [ExtractedSection(text)] if text.strip() else []
    text = data.decode("utf-8", errors="ignore").strip()
    return [ExtractedSection(text)] if text else []

def chunk_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    normalized = " ".join(text.split())
    chunks, start = [], 0
    while start < len(normalized):
        end = min(len(normalized), start + chunk_size)
        if end < len(normalized):
            split = normalized.rfind(" ", start, end)
            if split > start + chunk_size // 2:
                end = split
        chunk = normalized[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(normalized):
            break
        start = max(end - overlap, start + 1)
    return chunks
