"""Builds MFCC features for the classical model pipeline.

The MFCC plugin calls this after audio decoding. It converts the shared
waveform representation into a fixed-length feature vector that can be passed to
the logistic regression classifier.
"""

from __future__ import annotations

import numpy as np
import librosa


def extract_mfcc_summary_features(
    waveform: np.ndarray,
    sr: int,
    n_mfcc: int = 13,
) -> np.ndarray:
    """
    Extract MFCCs and summarise them into a fixed-length feature vector.

    Output shape:
    [mfcc_means..., mfcc_stds...] => length = n_mfcc * 2
    """
    # Compute frame-level MFCCs, then compress them into summary statistics.
    mfcc = librosa.feature.mfcc(y=waveform, sr=sr, n_mfcc=n_mfcc)

    mfcc_means = np.mean(mfcc, axis=1)
    mfcc_stds = np.std(mfcc, axis=1)

    features = np.concatenate([mfcc_means, mfcc_stds]).astype(np.float32)
    return features
