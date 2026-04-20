// Frontend wrapper around the backend API.
// These helpers are used by the page bootstrap and the recording module to
// fetch model metadata and submit audio for prediction.

const API_BASE = "";

function guessRecordingFilename(audioSource) {
  // Preserve a sensible extension for recorded blobs sent through FormData.
  const mimeType = audioSource?.type ?? "";

  if (mimeType.includes("mp4")) {
    return "recording.m4a";
  }
  if (mimeType.includes("ogg")) {
    return "recording.ogg";
  }
  if (mimeType.includes("wav")) {
    return "recording.wav";
  }

  return "recording.webm";
}

export async function fetchModels() {
  // Used during page startup to populate the model selector and descriptions.
  const response = await fetch(`${API_BASE}/api/models`);

  if (!response.ok) {
    throw new Error("Failed to fetch models");
  }

  return await response.json();
}

export async function predictAudio(audioSource, modelId) {
  // Submit either an uploaded file or a recorded blob to the prediction route.
  const formData = new FormData();

  if (audioSource instanceof File) {
    formData.append("audio", audioSource, audioSource.name);
  } else {
    formData.append("audio", audioSource, guessRecordingFilename(audioSource));
  }

  formData.append("model_id", modelId);

  const response = await fetch(`${API_BASE}/api/predict`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Prediction failed");
  }

  return await response.json();
}
