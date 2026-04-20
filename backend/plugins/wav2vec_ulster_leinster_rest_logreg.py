"""Wraps the deployed three-class wav2vec model for API use.

This variant predicts Ulster, Leinster, or Rest. It plugs into the same
runtime path as the other wav2vec models and formats the classifier output for
the shared frontend renderer.
"""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np

from backend.plugins.base import ModelPlugin
from backend.services.wav2vec_features import audio_bytes_to_embedding

ARTIFACTS_DIR = Path(__file__).resolve().parents[1] / "artifacts"


class Wav2VecUlsterLeinsterRestLogReg(ModelPlugin):
    id = "wav2vec_ulster_leinster_rest_logreg"
    name = "Ulster / Leinster / Rest — Wav2Vec + Logistic Regression"
    description = "Three-class accent classifier for Ulster, Leinster, and Rest."

    def __init__(self) -> None:
        # Load the saved model and encoder once during backend startup.
        self.model = joblib.load(
            ARTIFACTS_DIR / "wav2vec_ulster_leinster_rest_logreg_model.joblib"
        )
        self.label_encoder = joblib.load(
            ARTIFACTS_DIR / "wav2vec_ulster_leinster_rest_logreg_label_encoder.joblib"
        )

    def predict(self, audio_bytes: bytes) -> dict:
        # Reuse the shared wav2vec embedding path used across this model family.
        embedding = audio_bytes_to_embedding(audio_bytes)

        probs = self.model.predict_proba([embedding])[0]
        pred_idx = int(np.argmax(probs))
        label = self.label_encoder.inverse_transform([pred_idx])[0]

        # Build a sorted probability list for the current prediction panel.
        probs_list = [
            {
                "label": str(self.label_encoder.inverse_transform([i])[0]),
                "p": float(p),
            }
            for i, p in enumerate(probs)
        ]
        probs_list.sort(key=lambda x: x["p"], reverse=True)

        return {
            "label": str(label),
            "confidence": float(probs[pred_idx]),
            "probs": probs_list,
        }
