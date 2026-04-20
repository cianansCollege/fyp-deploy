// Small shared state container for the frontend modules.
// It tracks the selected model, current audio source, and prediction history
// persisted in localStorage between page reloads.

const STORAGE_KEY = "fyp_predictions";

function loadStoredPredictions() {
  // Restore saved prediction history when the page boots.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Failed to load stored predictions", e);
    return [];
  }
}

function saveStoredPredictions(predictions) {
  // Persist the history list after prediction or feedback changes.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(predictions));
  } catch (e) {
    console.error("Failed to save predictions", e);
  }
}

export const store = {
  models: [],
  selectedModelId: null,
  selectedInputDeviceId: null,
  latestAudioBlob: null,
  uploadedAudioFile: null,

  predictions: loadStoredPredictions(),
  currentPredictionId: null,

  persist() {
    // Save the current prediction history snapshot.
    saveStoredPredictions(this.predictions);
  },

  clearPredictions() {
    // Remove all saved history entries and reset the current selection.
    this.predictions = [];
    this.currentPredictionId = null;
    saveStoredPredictions(this.predictions);
  }
};
