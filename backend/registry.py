"""Keeps the in-memory catalogue of model plugins used by the API.

The loader populates this registry at startup. The prediction route uses it to
resolve a selected model ID, while the frontend model picker uses it to list
names and descriptions.
"""

from __future__ import annotations

from typing import Dict

from backend.plugins.base import ModelPlugin


_REGISTRY: Dict[str, ModelPlugin] = {}


def register(plugin: ModelPlugin) -> None:
    # Guard against duplicate IDs so `/api/predict` stays unambiguous.
    if plugin.id in _REGISTRY:
        raise ValueError(f"Duplicate model id: {plugin.id}")
    _REGISTRY[plugin.id] = plugin


def get_model(model_id: str) -> ModelPlugin:
    # Return the plugin instance chosen by the frontend.
    if model_id not in _REGISTRY:
        raise KeyError(f"Unknown model_id: {model_id}")
    return _REGISTRY[model_id]


def list_models() -> list[dict]:
    # Build the lightweight metadata payload returned to the UI.
    return [
        {
            "id": plugin.id,
            "name": plugin.name,
            "description": plugin.description,
        }
        for plugin in _REGISTRY.values()
    ]
