"""Defines the contract shared by all backend model plugins.

Each deployed model is wrapped as a plugin so the API can treat them in a
consistent way. The frontend sees model metadata from these classes, and the
prediction route only relies on the `predict` method defined here.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class ModelPlugin(ABC):
    id: str
    name: str
    description: str

    @abstractmethod
    def predict(self, wav_bytes: bytes) -> dict[str, Any]:
        """Run model-specific inference and return a frontend-friendly payload."""
        raise NotImplementedError
