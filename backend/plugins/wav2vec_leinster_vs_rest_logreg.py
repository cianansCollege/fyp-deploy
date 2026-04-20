"""Wraps the deployed Leinster-versus-rest wav2vec model for API use.

This plugin shares the same embedding stage as the other wav2vec variants, but
applies a binary logistic regression classifier trained for Leinster detection.
"""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np

from backend.plugins.base import ModelPlugin
from backend.services.wav2vec_features import audio_bytes_to_embedding

ARTIFACTS_DIR = Path(__file__).resolve().parents[1] / "artifacts"


class Wav2VecLeinsterVsRestLogReg(ModelPlugin):
    id = "wav2vec_leinster_vs_rest_logreg"
    name = "Leinster vs Rest — Wav2Vec + Logistic Regression"
    description = "Binary accent classifier for Leinster versus the rest of Ireland."

    def __init__(self) -> None:
        # Load the saved model and label encoder used during live predictions.
        self.model = joblib.load(
            ARTIFACTS_DIR / "wav2vec_leinster_vs_rest_logreg_model.joblib"
        )
        self.label_encoder = joblib.load(
            ARTIFACTS_DIR / "wav2vec_leinster_vs_rest_logreg_label_encoder.joblib"
        )

    def predict(self, audio_bytes: bytes) -> dict:
        # Turn the uploaded clip into the embedding expected by the classifier.
        embedding = audio_bytes_to_embedding(audio_bytes)

        probs = self.model.predict_proba([embedding])[0]
        pred_idx = int(np.argmax(probs))
        label = self.label_encoder.inverse_transform([pred_idx])[0]

        # Keep the output shape consistent with the other plugins.
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
