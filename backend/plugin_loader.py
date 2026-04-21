"""Registers the models that are exposed by the running backend.

This module is called once during application startup from `app.py`. The models
registered here are the same ones returned by `/api/models` and accepted by the
prediction endpoint.
"""

from backend.registry import register
# from backend.plugins.dummy_model import plugin as dummy_plugin
from backend.plugins.mfcc_logreg_v1_01 import plugin as mfcc_logreg_plugin
from backend.plugins.wav2vec_ulster_vs_rest_rf import Wav2VecUlsterVsRestRF
from backend.plugins.wav2vec_leinster_vs_rest_logreg import Wav2VecLeinsterVsRestLogReg
from backend.plugins.wav2vec_ulster_leinster_rest_logreg import Wav2VecUlsterLeinsterRestLogReg
from backend.plugins.wav2vec_province_4way_logreg import Wav2VecProvince4WayLogReg


def load_plugins() -> None:
    # Register the test plugin and the deployed models in their display order.
    # register(dummy_plugin)
    register(mfcc_logreg_plugin)
    register(Wav2VecUlsterVsRestRF())
    register(Wav2VecLeinsterVsRestLogReg())
    register(Wav2VecUlsterLeinsterRestLogReg())
    register(Wav2VecProvince4WayLogReg())
