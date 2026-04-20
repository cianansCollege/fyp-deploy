"""Wraps the deployed four-province wav2vec model for API use.

This is the wav2vec variant that maps directly to the province-level interface.
It converts the uploaded clip into a wav2vec embedding, applies the saved
logistic regression model, and returns probabilities for all four provinces.
"""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np

from backend.plugins.base import ModelPlugin
from backend.services.wav2vec_features import audio_bytes_to_embedding

ARTIFACTS_DIR = Path(__file__).resolve().parents[1] / "artifacts"


class Wav2VecProvince4WayLogReg(ModelPlugin):
    id = "wav2vec_province_4way_logreg"
    name = "Four Provinces — Wav2Vec + Logistic Regression"
    description = "Four-class accent classifier for Connacht, Leinster, Munster, and Ulster."

    def __init__(self) -> None:
        # Load the saved model and encoder used by the live backend.
        self.model = joblib.load(
            ARTIFACTS_DIR / "wav2vec_province_4way_logreg_model.joblib"
        )
        self.label_encoder = joblib.load(
            ARTIFACTS_DIR / "wav2vec_province_4way_logreg_label_encoder.joblib"
        )

    def predict(self, audio_bytes: bytes) -> dict:
        # Reuse the shared embedding stage so all wav2vec models see the same input.
        embedding = audio_bytes_to_embedding(audio_bytes)

        probs = self.model.predict_proba([embedding])[0]
        pred_idx = int(np.argmax(probs))
        label = self.label_encoder.inverse_transform([pred_idx])[0]

        # Build the probability list expected by the frontend renderer.
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
