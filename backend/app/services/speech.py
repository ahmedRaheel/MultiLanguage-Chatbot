from functools import lru_cache
from faster_whisper import WhisperModel

@lru_cache
def get_whisper_model() -> WhisperModel:
    return WhisperModel("small", device="cpu", compute_type="int8")

def transcribe(path: str, language: str | None = None) -> tuple[str, str | None]:
    segments, info = get_whisper_model().transcribe(path, language=language or None, vad_filter=True, beam_size=3)
    text = " ".join(s.text.strip() for s in segments if s.text.strip()).strip()
    return text, getattr(info, "language", None)
