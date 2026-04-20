// Rendering helpers for the prediction side of the frontend.
// This module is called after a prediction completes, when feedback changes,
// and when a saved result is restored from local history.

import { store } from "./store.js?v=20260410e";
import { updateMap, clearMapHighlight } from "./map.js?v=20260415c";

function generatePredictionId() {
  // Create a simple client-side identifier for history entries.
  return `pred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatConfidencePct(confidence) {
  // Keep confidence formatting consistent across the main panel and history.
  return typeof confidence === "number" ? `${(confidence * 100).toFixed(1)}%` : "-";
}

function formatHistoryTimestamp(timestamp) {
  // Convert stored ISO timestamps into a browser-local display string.
  if (!timestamp) {
    return "-";
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return String(timestamp);
  }

  return parsed.toLocaleString();
}

function formatFeedbackStatus(prediction) {
  // Summarise saved feedback for each history row.
  if (prediction.wasCorrect === true) {
    return "Feedback: Correct";
  }

  if (prediction.wasCorrect === false) {
    if (prediction.correctedLabel) {
      return `Feedback: Incorrect \u2192 ${prediction.correctedLabel}`;
    }
    return "Feedback: Incorrect";
  }

  return "Feedback: Pending";
}

function resolveModelDetails(modelId, fallbackName = "", fallbackDescription = "") {
  // Prefer live model metadata, but keep stored details for restored history items.
  const storedModel = store.models.find((model) => model.id === modelId);

  return {
    name: storedModel?.name ?? fallbackName ?? modelId ?? "-",
    description: storedModel?.description ?? fallbackDescription ?? "",
  };
}

function renderModelDetails(modelId, fallbackName = "", fallbackDescription = "") {
  // Update the current prediction card with the selected model name and descriptor.
  const modelEl = document.getElementById("resultModel");
  const descriptionEl = document.getElementById("resultModelDescription");
  const { name, description } = resolveModelDetails(
    modelId,
    fallbackName,
    fallbackDescription
  );

  if (modelEl) {
    modelEl.textContent = name || "-";
  }

  if (!descriptionEl) {
    return;
  }

  if (description) {
    descriptionEl.textContent = description;
    descriptionEl.classList.remove("d-none");
    return;
  }

  descriptionEl.textContent = "";
  descriptionEl.classList.add("d-none");
}

function setFeedbackButtonState(button, isActive) {
  // Keep button visuals and accessibility state in sync.
  if (!button) {
    return;
  }

  button.classList.toggle("active", isActive);
  button.setAttribute("aria-pressed", isActive ? "true" : "false");
}

function resetFeedbackUI() {
  // Return the feedback panel to its default hidden state.
  const feedbackSection = document.getElementById("feedbackSection");
  const feedbackPlaceholder = document.getElementById("feedbackPlaceholder");
  const correctLabelSection = document.getElementById("correctLabelSection");
  const feedbackMessage = document.getElementById("feedbackMessage");
  const correctLabelSelect = document.getElementById("correctLabelSelect");
  const feedbackYesBtn = document.getElementById("feedbackYesBtn");
  const feedbackNoBtn = document.getElementById("feedbackNoBtn");

  if (feedbackSection) {
    feedbackSection.classList.add("d-none");
  }

  if (feedbackPlaceholder) {
    feedbackPlaceholder.classList.remove("d-none");
  }

  if (correctLabelSection) {
    correctLabelSection.classList.add("d-none");
  }

  if (feedbackMessage) {
    feedbackMessage.textContent = "";
  }

  if (correctLabelSelect) {
    correctLabelSelect.value = "";
  }

  setFeedbackButtonState(feedbackYesBtn, false);
  setFeedbackButtonState(feedbackNoBtn, false);
}

export function renderFeedbackState(prediction = null) {
  // Show the feedback controls once there is an active prediction in view.
  const feedbackSection = document.getElementById("feedbackSection");
  const feedbackPlaceholder = document.getElementById("feedbackPlaceholder");
  const correctLabelSection = document.getElementById("correctLabelSection");
  const feedbackMessage = document.getElementById("feedbackMessage");
  const correctLabelSelect = document.getElementById("correctLabelSelect");
  const feedbackYesBtn = document.getElementById("feedbackYesBtn");
  const feedbackNoBtn = document.getElementById("feedbackNoBtn");

  if (!feedbackSection || !feedbackPlaceholder) {
    return;
  }

  feedbackSection.classList.remove("d-none");
  feedbackPlaceholder.classList.add("d-none");

  setFeedbackButtonState(feedbackYesBtn, prediction?.wasCorrect === true);
  setFeedbackButtonState(feedbackNoBtn, prediction?.wasCorrect === false);

  if (prediction?.wasCorrect === true) {
    if (correctLabelSection) {
      correctLabelSection.classList.add("d-none");
    }
    if (correctLabelSelect) {
      correctLabelSelect.value = "";
    }
    if (feedbackMessage) {
      feedbackMessage.textContent = "Saved feedback: marked as correct.";
    }
    return;
  }

  if (prediction?.wasCorrect === false) {
    if (correctLabelSection) {
      correctLabelSection.classList.remove("d-none");
    }
    if (correctLabelSelect) {
      correctLabelSelect.value = prediction.correctedLabel ?? "";
    }
    if (feedbackMessage) {
      feedbackMessage.textContent = prediction.correctedLabel
        ? `Saved feedback: marked incorrect, correct province: ${prediction.correctedLabel}.`
        : "Saved feedback: marked incorrect.";
    }
    return;
  }

  if (correctLabelSection) {
    correctLabelSection.classList.add("d-none");
  }
  if (correctLabelSelect) {
    correctLabelSelect.value = "";
  }
  if (feedbackMessage) {
    feedbackMessage.textContent = "";
  }
}

export function savePrediction(result) {
  // Store the latest result so it can be revisited from the history panel.
  const modelDetails = resolveModelDetails(
    result.model_id ?? null,
    result.model_name ?? "",
    result.model_description ?? ""
  );

  const prediction = {
    id: generatePredictionId(),
    timestamp: new Date().toISOString(),
    modelId: result.model_id ?? null,
    modelName: modelDetails.name,
    modelDescription: modelDetails.description,
    predictedLabel: result.label ?? null,
    confidence: typeof result.confidence === "number" ? result.confidence : null,
    probabilities: Array.isArray(result.probs) ? result.probs : [],
    wasCorrect: null,
    correctedLabel: null,
  };

  store.predictions.unshift(prediction);
  store.currentPredictionId = prediction.id;
  store.persist();

  return prediction;
}

export function updatePredictionFeedback({ wasCorrect, correctedLabel = null }) {
  // Update feedback on the currently selected history entry.
  const prediction = store.predictions.find(
    (item) => item.id === store.currentPredictionId
  );

  if (!prediction) {
    return null;
  }

  prediction.wasCorrect = wasCorrect;
  prediction.correctedLabel = correctedLabel;

  store.persist();

  return prediction;
}

export function renderPrediction(result) {
  // Populate the current prediction card from an API response or history item.
  renderModelDetails(
    result.model_id ?? null,
    result.model_name ?? "",
    result.model_description ?? ""
  );
  document.getElementById("resultLabel").textContent = result.label || "-";

  document.getElementById("resultConfidence").textContent =
    formatConfidencePct(result.confidence);

  const probList = document.getElementById("probList");
  probList.innerHTML = "";

  if (Array.isArray(result.probs)) {
    // Render the per-class breakdown shown beneath the headline prediction.
    for (const item of result.probs) {
      const li = document.createElement("li");
      li.className = "list-group-item d-flex justify-content-between align-items-center";

      const labelEl = document.createElement("span");
      labelEl.textContent = item.label ?? "-";

      const pctEl = document.createElement("span");
      pctEl.className = "fw-semibold";
      const pct =
        typeof item.p === "number" ? `${(item.p * 100).toFixed(1)}%` : "-";
      pctEl.textContent = pct;

      li.append(labelEl, pctEl);
      probList.appendChild(li);
    }
  }

  renderFeedbackState(result);
}

export function renderPredictionHistory() {
  // Rebuild the history list from the predictions stored in localStorage.
  const historyPlaceholder = document.getElementById("predictionHistoryPlaceholder");
  const historyList = document.getElementById("predictionHistoryList");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");

  if (!historyPlaceholder || !historyList) {
    return;
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.disabled = !Array.isArray(store.predictions) || store.predictions.length === 0;
  }

  if (!Array.isArray(store.predictions) || store.predictions.length === 0) {
    historyPlaceholder.classList.remove("d-none");
    historyList.classList.add("d-none");
    historyList.innerHTML = "";
    return;
  }

  historyPlaceholder.classList.add("d-none");
  historyList.classList.remove("d-none");
  historyList.innerHTML = "";

  for (const prediction of store.predictions) {
    // Each item can be clicked to restore the full result state.
    const item = document.createElement("div");
    item.style.cursor = "pointer";

    item.addEventListener("click", () => {
      restorePrediction(prediction.id);
    });

    item.className = "border rounded p-2 mb-2";
    item.classList.add(
      prediction.id === store.currentPredictionId
        ? "border-primary"
        : "border-secondary-subtle"
    );

    const topRow = document.createElement("div");
    topRow.className = "d-flex justify-content-between align-items-center gap-2";

    const labelEl = document.createElement("span");
    labelEl.className = "fw-semibold";
    labelEl.textContent = prediction.predictedLabel ?? "-";

    const confidenceEl = document.createElement("span");
    confidenceEl.className = "small";
    confidenceEl.textContent = formatConfidencePct(prediction.confidence);

    topRow.append(labelEl, confidenceEl);

    const metaEl = document.createElement("div");
    metaEl.className = "small text-body-secondary mt-1";
    metaEl.textContent = `${formatHistoryTimestamp(prediction.timestamp)} \u00b7 ${
      prediction.modelId ?? "Unknown model"
    }`;

    const feedbackEl = document.createElement("div");
    feedbackEl.className = "small mt-1";
    feedbackEl.textContent = formatFeedbackStatus(prediction);

    item.append(topRow, metaEl, feedbackEl);
    historyList.appendChild(item);
  }
}

export function clearPredictionResults() {
  // Remove all saved results and reset the prediction-related UI.
  store.clearPredictions();

  renderModelDetails(null);
  document.getElementById("resultLabel").textContent = "-";
  document.getElementById("resultConfidence").textContent = "-";
  document.getElementById("probList").innerHTML = "";

  resetFeedbackUI();
  clearMapHighlight();
  renderPredictionHistory();
}

export function renderError(message) {
  // Show API or validation errors in the current prediction panel.
  renderModelDetails(null);
  document.getElementById("resultLabel").textContent = `Error: ${message}`;
  document.getElementById("resultConfidence").textContent = "-";
  document.getElementById("probList").innerHTML = "";

  resetFeedbackUI();
}

export function restorePrediction(predictionId) {
  // Rehydrate the current prediction panel, map, and feedback from history.
  const prediction = store.predictions.find(
    (p) => p.id === predictionId
  );

  if (!prediction) return;

  store.currentPredictionId = predictionId;

  renderPrediction({
    model_id: prediction.modelId,
    model_name: prediction.modelName,
    model_description: prediction.modelDescription,
    label: prediction.predictedLabel,
    confidence: prediction.confidence,
    probs: prediction.probabilities,
    wasCorrect: prediction.wasCorrect,
    correctedLabel: prediction.correctedLabel,
  });

  clearMapHighlight();
  if (prediction.modelId && prediction.predictedLabel) {
    updateMap(prediction.modelId, prediction.predictedLabel);
  }

  // Re-render history to highlight selected
  renderPredictionHistory();
}
