"""Builds wav2vec embeddings for the neural feature pipeline.

The wav2vec plugin family uses this module after audio decoding. It lazily loads
the shared base encoder, transforms the normalised waveform into hidden states,
and mean-pools them into a single embedding for the downstream classifiers.
"""

import numpy as np
import torch
from transformers import Wav2Vec2Processor, Wav2Vec2Model

from backend.services.audio import load_audio_from_bytes

MODEL_NAME = "facebook/wav2vec2-base"

_processor = None
_model = None


def _load_model():
    # Load the shared encoder only when a wav2vec-backed prediction is requested.
    global _processor, _model

    if _processor is None or _model is None:
        print("Loading wav2vec model...")
        _processor = Wav2Vec2Processor.from_pretrained(MODEL_NAME)
        _model = Wav2Vec2Model.from_pretrained(MODEL_NAME)
        _model.eval()


def audio_bytes_to_embedding(audio_bytes: bytes) -> np.ndarray:
    # Reuse the shared audio loader so wav2vec sees the same 10 s clip as the
    # rest of the system.
    _load_model()

    waveform, _sr = load_audio_from_bytes(audio_bytes)

    # Tokenise the waveform for the Hugging Face wav2vec model.
    inputs = _processor(waveform, sampling_rate=16000, return_tensors="pt")

    with torch.no_grad():
        outputs = _model(**inputs)

    # Mean-pool the time dimension to produce one fixed-size embedding.
    hidden_states = outputs.last_hidden_state
    embedding = hidden_states.mean(dim=1).squeeze().cpu().numpy().astype(np.float32)

    return embedding
