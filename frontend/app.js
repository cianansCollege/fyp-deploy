// Frontend bootstrap for the main user flow.
// This module runs when the page loads, fetches model metadata for the control
// panel, initializes the map and recording modules, and wires the global UI
// actions such as reset and clear history.

import { fetchModels } from "./api.js?v=20260410e";
import { store } from "./store.js?v=20260410e";
import { initRecording } from "./recording.js?v=20260415b";
import { initMap, resetMapView } from "./map.js?v=20260415c";
import { clearPredictionResults } from "./predictions.js?v=20260415b";


function setStatus(message) {
  // Centralise status updates so the page reports the current pipeline step.
  document.getElementById("statusMessage").textContent = message;
}

function renderSelectedModelDescription(modelId) {
  // Show the selected model descriptor beneath the dropdown in the controls panel.
  const modelDescription = document.getElementById("modelDescription");
  if (!modelDescription) {
    return;
  }

  const model = store.models.find((item) => item.id === modelId);

  if (!model) {
    modelDescription.textContent = "No model description available.";
    return;
  }

  modelDescription.textContent =
    model.description || "No model description available.";
}

async function initModels() {
  // Populate the model selector from the backend metadata endpoint.
  const modelSelect = document.getElementById("modelSelect");

  try {
    setStatus("Loading models...");
    const data = await fetchModels();

    const rawModels = Array.isArray(data.models) ? data.models : [];

    const models = rawModels.map((model) => {
      if (typeof model === "string") {
        return { id: model, name: model, description: "" };
      }
      return {
        id: model.id,
        name: model.name ?? model.id,
        description: model.description ?? "",
      };
    });

    store.models = models;
    modelSelect.innerHTML = "";

    if (models.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No models available";
      modelSelect.appendChild(option);
      store.selectedModelId = null;
      renderSelectedModelDescription(null);
      setStatus("No models found.");
      return;
    }

    // Keep the backend order so the UI reflects the registered plugin order.
    for (const model of models) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.name;
      modelSelect.appendChild(option);
    }

    store.selectedModelId = models[0].id;
    modelSelect.value = store.selectedModelId;
    renderSelectedModelDescription(store.selectedModelId);

    modelSelect.addEventListener("change", (event) => {
      store.selectedModelId = event.target.value;
      renderSelectedModelDescription(store.selectedModelId);
      setStatus(`Selected model: ${store.selectedModelId}`);
    });

    setStatus(`Selected model: ${store.selectedModelId}`);
  } catch (error) {
    console.error(error);
    setStatus("Failed to load models.");
  }
}

async function initApp() {
  // Start the supporting modules in the same order the page needs them.
  try {
    await initMap();
  } catch (error) {
    console.error("Map failed to load:", error);
  }

  await initModels();
  initRecording();

  const resetMapBtn = document.getElementById("resetMapBtn");
  if (resetMapBtn) {
    resetMapBtn.addEventListener("click", () => {
      resetMapView();
    });
  }

  const clearHistoryBtn = document.getElementById("clearHistoryBtn");
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", () => {
      clearPredictionResults();
      setStatus("Previous prediction results cleared.");
    });
  }
}

initApp();
