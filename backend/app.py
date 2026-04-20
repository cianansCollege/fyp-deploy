"""Application entry point for the deployed Prototype4 system.

This module is loaded when the backend starts. It registers the available model
plugins, serves the static frontend, and exposes the API routes used in the
main request pipeline:
1. the browser loads the frontend from `/`
2. the frontend fetches model metadata from `/api/models`
3. audio is submitted to `/api/predict` for inference
"""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.plugin_loader import load_plugins
from backend.registry import get_model, list_models


load_plugins()

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

app = FastAPI(title="Prototype4 Accent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
def read_index():
    # Serve the single-page frontend shell.
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/api/health")
def health() -> dict:
    # Lightweight liveness check for the backend service.
    return {"status": "ok"}


@app.get("/api/models")
def api_models() -> dict:
    # Expose model metadata for the frontend selector and model descriptions.
    return {"models": list_models()}


@app.post("/api/predict")
async def api_predict(
    audio: UploadFile = File(...),
    model_id: str = Form(...),
) -> dict:
    # Resolve the selected model before reading and processing the upload.
    try:
        model = get_model(model_id)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Read the uploaded file into memory for the downstream plugin pipeline.
    audio_bytes = await audio.read()

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio upload")

    # Each plugin performs its own preprocessing and inference steps.
    try:
        result = model.predict(audio_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed for model '{model_id}'.",
        ) from exc

    # Return a consistent response shape for the frontend renderer.
    return {
        "request_id": str(uuid.uuid4()),
        "model_id": model_id,
        **result,
    }
