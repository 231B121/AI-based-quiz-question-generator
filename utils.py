import io
import re
from PyPDF2 import PdfReader

def extract_text_from_pdf(file_storage):
  
    file_bytes = file_storage.read()
    reader = PdfReader(io.BytesIO(file_bytes))
    text_pages = []
    for page in reader.pages:
        try:
            text_pages.append(page.extract_text() or "")
        except Exception:
            text_pages.append("")
    return "\n".join(text_pages)

def clean_text(text):
    if not text:
        return ""
    s = re.sub(r"\s+", " ", text).strip()
    s = "".join(ch for ch in s if ch.isprintable())
    return s