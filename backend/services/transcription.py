import os
import tempfile

from faster_whisper import WhisperModel

_model = None


def _get_model() -> WhisperModel:
    global _model
    if _model is None:
        model_name = os.getenv("WHISPER_MODEL", "base")
        _model = WhisperModel(model_name, device="cpu", compute_type="int8")
    return _model


async def transcribe_audio(file_bytes: bytes, filename: str) -> str:
    model = _get_model()

    suffix = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ".mp3"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        segments, _ = model.transcribe(tmp_path, language="fr", beam_size=5)
        return " ".join(segment.text.strip() for segment in segments)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
