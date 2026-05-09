import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

from services.analysis import analyze_transcript
from services.transcription import transcribe_audio

APP_VERSION = "1.0.0"

app = FastAPI(title="TalentSummary API", version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

MAX_AUDIO_SIZE_MB = int(os.getenv("MAX_AUDIO_SIZE_MB", "25"))
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".webm"}


@app.get("/health")
async def health():
    return {"status": "ok", "version": APP_VERSION, "whisper_model": os.getenv("WHISPER_MODEL", "base")}


@app.post("/process")
async def process_interview(audio: UploadFile = File(...)):
    ext = "." + audio.filename.rsplit(".", 1)[-1].lower() if audio.filename and "." in audio.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Format non supporté '{ext}'. Formats acceptés : {', '.join(ALLOWED_EXTENSIONS)}",
        )

    file_bytes = await audio.read()

    size_mb = len(file_bytes) / (1024 * 1024)
    if size_mb > MAX_AUDIO_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"Fichier trop grand ({size_mb:.1f}MB). Maximum : {MAX_AUDIO_SIZE_MB}MB",
        )

    start = time.time()

    try:
        transcription = await transcribe_audio(file_bytes, audio.filename or "audio.mp3")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur transcription : {str(e)}")

    try:
        rapport = await analyze_transcript(transcription)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur analyse IA : {str(e)}")

    processing_time = round(time.time() - start, 1)

    return JSONResponse(
        content={
            "success": True,
            "processing_time_seconds": processing_time,
            "transcription": transcription,
            "rapport": rapport,
        }
    )
