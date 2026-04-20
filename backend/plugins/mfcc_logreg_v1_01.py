"""Wraps the deployed MFCC-based province classifier as a runtime plugin.

This is the classical feature pipeline in the live system. During prediction it
decodes the uploaded clip, extracts MFCC summary features, and feeds them to
the saved logistic regression model before formatting the response for the API.
"""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np

from backend.plugins.base import ModelPlugin
from backend.services.audio import load_audio_from_bytes
from backend.services.features import extract_mfcc_summary_features


class MFCCLogRegV1(ModelPlugin):
    id = "mfcc_logreg_v1_01"
    name = "MFCC + Logistic Regression (v1)"
    description = "MFCC summary features with a Logistic Regression classifier."

    def __init__(self) -> None:
        # Load the trained classifier and label encoder once at startup.
        model_dir = Path(__file__).resolve().parent.parent / "artifacts"

        self.model = joblib.load(model_dir / "mfcc_logreg_v1_model_01.joblib")
        self.label_encoder = joblib.load(model_dir / "mfcc_logreg_v1_label_encoder_01.joblib")

    def predict(self, audio_bytes: bytes) -> dict:
        # Follow the shared runtime pipeline: decode, featurise, classify, format.
        waveform, sr = load_audio_from_bytes(audio_bytes)
        features = extract_mfcc_summary_features(waveform, sr)

        X = features.reshape(1, -1)

        probs = self.model.predict_proba(X)[0]
        pred_index = int(np.argmax(probs))
        pred_label = str(self.label_encoder.inverse_transform([pred_index])[0])
        confidence = float(probs[pred_index])

        # Return a sorted probability list for the frontend panel and history.
        labels = self.label_encoder.classes_
        prob_list = [
            {"label": str(label), "p": float(prob)}
            for label, prob in zip(labels, probs)
        ]
        prob_list.sort(key=lambda item: item["p"], reverse=True)

        return {
            "label": pred_label,
            "confidence": confidence,
            "probs": prob_list,
        }

# Export the startup instance used by the plugin loader.
plugin = MFCCLogRegV1()
