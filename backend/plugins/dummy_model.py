"""Provides a predictable non-ML plugin for integration checks.

This plugin is useful for frontend and API wiring because it does not depend on
audio decoding or model artifacts. It is not part of the real inference
pipeline, but it follows the same response shape as the deployed models.
"""

from __future__ import annotations

from backend.plugins.base import ModelPlugin


class DummyModel(ModelPlugin):
    id = "dummy_v1"
    name = "Dummy Model (v1)"
    description = "Test model for end-to-end frontend/backend integration."

    def predict(self, audio_bytes: bytes) -> dict:
        # Use the byte length to produce repeatable outputs for UI testing.
        audio_size = len(audio_bytes)

        if audio_size % 4 == 0:
            label = "Leinster"
            probs = [
                {"label": "Leinster", "p": 0.68},
                {"label": "Munster", "p": 0.17},
                {"label": "Connacht", "p": 0.10},
                {"label": "Ulster", "p": 0.05},
            ]
        elif audio_size % 4 == 1:
            label = "Munster"
            probs = [
                {"label": "Munster", "p": 0.61},
                {"label": "Leinster", "p": 0.20},
                {"label": "Connacht", "p": 0.12},
                {"label": "Ulster", "p": 0.07},
            ]
        elif audio_size % 4 == 2:
            label = "Connacht"
            probs = [
                {"label": "Connacht", "p": 0.59},
                {"label": "Ulster", "p": 0.18},
                {"label": "Leinster", "p": 0.14},
                {"label": "Munster", "p": 0.09},
            ]
        else:
            label = "Ulster"
            probs = [
                {"label": "Ulster", "p": 0.63},
                {"label": "Connacht", "p": 0.16},
                {"label": "Leinster", "p": 0.13},
                {"label": "Munster", "p": 0.08},
            ]

        return {
            "label": label,
            "confidence": probs[0]["p"],
            "probs": probs,
        }

# Export a ready-made instance so startup registration can import it directly.
plugin = DummyModel()
