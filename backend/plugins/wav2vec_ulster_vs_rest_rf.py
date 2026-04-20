"""Wraps the deployed Ulster-versus-rest wav2vec model for the live API.

This plugin uses the shared wav2vec embedding pipeline, then applies the saved
random forest classifier to produce a binary region prediction for the frontend.
"""

from pathlib import Path

import joblib
import numpy as np

from backend.plugins.base import ModelPlugin
from backend.services.wav2vec_features import audio_bytes_to_embedding

BASE_DIR = Path(__file__).resolve().parents[1]
ARTIFACTS_DIR = BASE_DIR / "artifacts"


class Wav2VecUlsterVsRestRF(ModelPlugin):
    id = "wav2vec_ulster_vs_rest_rf"
    name = "Ulster Detection (Wav2Vec)"
    description = "Detects whether the speaker is from Ulster."

    def __init__(self):
        # Load the trained classifier artefacts once when the backend starts.
        self.model = joblib.load(
            ARTIFACTS_DIR / "wav2vec_ulster_vs_rest_rf_model.joblib"
        )
        self.label_encoder = joblib.load(
            ARTIFACTS_DIR / "wav2vec_ulster_vs_rest_rf_label_encoder.joblib"
        )

    def predict(self, audio_bytes: bytes):
        # Decode and embed the clip before handing it to the classifier.
        embedding = audio_bytes_to_embedding(audio_bytes)

        probs = self.model.predict_proba([embedding])[0]
        pred_idx = int(np.argmax(probs))
        label = self.label_encoder.inverse_transform([pred_idx])[0]
        # Rebuild labels from the encoder so the response stays model-driven.
        probs_list = [
            {
                "label": str(self.label_encoder.inverse_transform([i])[0]),
                "p": float(p),
            }
            for i, p in enumerate(probs)
        ]
        probs_list.sort(key=lambda item: item["p"], reverse=True)

        return {
            "label": str(label),
            "confidence": float(probs[pred_idx]),
            "probs": probs_list,
        }
