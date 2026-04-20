# Prototype4: Mapping the Spoken Word

Prototype4 is a full-stack prototype for Irish accent analysis from audio.
It currently includes:

- A FastAPI backend with plugin-based model loading
- A browser frontend for recording or uploading audio and viewing results
- Province map highlighting, prediction history, and feedback capture
- Multiple inference plugins, including MFCC-based province classification and several wav2vec-based classifiers

## Project Structure

```text
Prototype4/
  backend/
    app.py                   # FastAPI app + routes
    plugin_loader.py         # Registers model plugins
    registry.py              # In-memory model registry
    schemas.py               # Shared request/response schema helpers
    plugins/
      base.py                # Shared plugin interface
      dummy_model.py         # Deterministic test model
      mfcc_logreg_v1_01.py   # MFCC + Logistic Regression model plugin
      wav2vec_ulster_vs_rest_rf.py  # Wav2Vec + Random Forest plugin
      wav2vec_leinster_vs_rest_logreg.py
      wav2vec_ulster_leinster_rest_logreg.py
      wav2vec_province_4way_logreg.py
    services/
      audio.py               # Audio decode/normalize/resample helpers
      features.py            # MFCC feature extraction
      wav2vec_features.py    # Wav2Vec embedding extraction
    artifacts/               # Trained model artifacts (.joblib)
    training/                # Training scripts used to build deployable artifacts
    requirements.txt
  frontend/
    index.html
    app.js
    api.js
    recording.js
    predictions.js
    map.js
    store.js
    style.css
    styleLightmode.css
    data/provinces.geojson
  testing/
    SystemTests.xlsx
```

## Requirements

- Python 3.10+ (3.11+ recommended)
- `pip`
- `ffmpeg` recommended (used as robust fallback for audio conversion)
- Internet access may be needed on the first wav2vec inference run if the Hugging Face model is not already cached

## Quick Start

1. Open a terminal and go to backend:

```bash
cd /Users/cianan/Desktop/ForSubmission/FinalPrototype/backend
```

2. Create and activate a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Run the server:

```bash
uvicorn app:app --reload
```

5. Open in browser:

- App: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- Health: [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)
- Models: [http://127.0.0.1:8000/api/models](http://127.0.0.1:8000/api/models)
- API Docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

Notes:

- The frontend title is `Mapping the Spoken Word`.
- The first wav2vec prediction can take longer than later requests because the base encoder may need to load and cache.

## How to Use the UI

1. Select a model from the dropdown.
2. Record audio (minimum 10 seconds) or upload an audio file.
3. Click `Predict Accent`.
4. Review:
   - Current prediction and confidence
   - Class probability breakdown
   - Map highlight
   - Prediction history
   - Restored history entries when you click an earlier prediction
5. Provide feedback:
   - `Yes` if correct
   - `No` and choose the correct province if incorrect
6. Use `Reset View` to return the map to its default position.

## API Endpoints

### `GET /api/health`

Returns service status.

Example response:

```json
{
  "status": "ok"
}
```

### `GET /api/models`

Returns registered model metadata.

Example response:

```json
{
  "models": [
    {
      "id": "dummy_v1",
      "name": "Dummy Model (v1)",
      "description": "Test model for end-to-end frontend/backend integration."
    },
    {
      "id": "mfcc_logreg_v1_01",
      "name": "MFCC + Logistic Regression (v1)",
      "description": "MFCC summary features with a Logistic Regression classifier."
    },
    {
      "id": "wav2vec_ulster_vs_rest_rf",
      "name": "Ulster Detection (Wav2Vec)",
      "description": "Detects whether the speaker is from Ulster."
    },
    {
      "id": "wav2vec_leinster_vs_rest_logreg",
      "name": "Leinster vs Rest - Wav2Vec + Logistic Regression",
      "description": "Binary accent classifier for Leinster versus the rest of Ireland."
    },
    {
      "id": "wav2vec_ulster_leinster_rest_logreg",
      "name": "Ulster / Leinster / Rest - Wav2Vec + Logistic Regression",
      "description": "Three-class accent classifier for Ulster, Leinster, and Rest."
    },
    {
      "id": "wav2vec_province_4way_logreg",
      "name": "Four Provinces - Wav2Vec + Logistic Regression",
      "description": "Four-class accent classifier for Connacht, Leinster, Munster, and Ulster."
    }
  ]
}
```

### `POST /api/predict`

Multipart form-data:

- `audio` (file)
- `model_id` (string)

Example response:

```json
{
  "request_id": "uuid",
  "model_id": "dummy_v1",
  "label": "Leinster",
  "confidence": 0.68,
  "probs": [
    { "label": "Leinster", "p": 0.68 },
    { "label": "Munster", "p": 0.17 }
  ]
}
```

## Model Plugin System

Plugins implement the `ModelPlugin` interface in `backend/plugins/base.py`.
The backend startup path explicitly imports and registers the deployed plugins in
`backend/plugin_loader.py`, and runtime lookup happens through
`backend/registry.py`.

Current plugins:

- `dummy_v1`: deterministic output based on audio byte length for integration testing
- `mfcc_logreg_v1_01`: four-way province classification using MFCC summary features + logistic regression
- `wav2vec_ulster_vs_rest_rf`: binary Ulster-vs-rest classification using Wav2Vec2 embeddings + random forest
- `wav2vec_leinster_vs_rest_logreg`: binary Leinster-vs-rest classification using Wav2Vec2 embeddings + logistic regression
- `wav2vec_ulster_leinster_rest_logreg`: three-class Ulster / Leinster / Rest classification using Wav2Vec2 embeddings + logistic regression
- `wav2vec_province_4way_logreg`: four-way province classification using Wav2Vec2 embeddings + logistic regression

## Data + State Notes

- Frontend state is managed in `frontend/store.js`.
- Prediction history and feedback are persisted in browser `localStorage` under `fyp_predictions`.
- Current audio buffers and the currently selected history item are session-only and reset on full reload.
- Clicking a prediction in history restores its result details, map highlight, and saved feedback state.

## Troubleshooting

- Browser shows stale JS/CSS:
  - Hard refresh with `Cmd + Shift + R` (macOS)
- `Failed to load models`:
  - Confirm backend is running on `127.0.0.1:8000`
  - Check terminal logs for plugin load errors
- Wav2Vec model is slow or fails on first use:
  - Confirm `torch`, `transformers`, and `sentencepiece` were installed from `requirements.txt`
  - Ensure internet access is available if the Hugging Face model has not been cached yet
- `Unsupported or unreadable audio format`:
  - Install `ffmpeg` and retry
  - Try `.wav` input to isolate format issues
- Microphone recording fails:
  - Ensure browser microphone permission is granted
- Map fails to load:
  - The rest of the app can still work without the map
  - Check whether `/static/data/provinces.geojson` is being served correctly
- `ModuleNotFoundError` during startup:
  - Activate virtualenv and reinstall `requirements.txt`

## Development Notes

- Frontend assets are served by FastAPI from `/static`.
- The active UI stylesheet is `frontend/style.css`; `frontend/styleLightmode.css` is an alternate light-theme prototype stylesheet.
- No separate frontend build step is required.
- `testing/SystemTests.xlsx` contains manual/system test tracking.
