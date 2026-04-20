// Province map helpers used by the prediction and history flows.
// The map is initialized once when the page loads, then updated after each
// prediction or when an older result is restored from history.

let map;
let provinceLayers = {};
let geojsonLayer;
let mapReady = false;

const defaultStyle = {
  color: "#6c757d",
  weight: 1,
  fillColor: "#dee2e6",
  fillOpacity: 0.5
};

const highlightStyle = {
  color: "#0d6efd",
  weight: 2,
  fillColor: "#0d6efd",
  fillOpacity: 0.6
};

const INITIAL_CENTER = [53.4, -8.2];
const INITIAL_ZOOM = 7;

function normalizeName(value) {
  // Keep label matching stable across map data and model outputs.
  return String(value || "").trim().toLowerCase();
}

function getRegionsToHighlight(modelId, label) {
  // Translate model outputs into one or more province polygons on the map.
  const cleanLabel = String(label || "").trim();

  if (modelId === "wav2vec_ulster_vs_rest_rf") {
    if (cleanLabel === "Ulster") return ["Ulster"];
    if (cleanLabel === "Rest") return ["Leinster", "Munster", "Connacht"];
  }

  if (modelId === "wav2vec_leinster_vs_rest_logreg") {
    if (cleanLabel === "Leinster") return ["Leinster"];
    if (cleanLabel === "Rest") return ["Ulster", "Munster", "Connacht"];
  }

  if (modelId === "wav2vec_ulster_leinster_rest_logreg") {
    if (cleanLabel === "Ulster") return ["Ulster"];
    if (cleanLabel === "Leinster") return ["Leinster"];
    if (cleanLabel === "Rest") return ["Munster", "Connacht"];
  }

  if (
    modelId === "wav2vec_province_4way_logreg" ||
    modelId === "mfcc_logreg_v1_01"
  ) {
    if (["Ulster", "Leinster", "Munster", "Connacht"].includes(cleanLabel)) {
      return [cleanLabel];
    }
  }

  return [];
}

export async function initMap() {
  // Create the base map and index each province layer by name for later lookup.
  map = L.map("map").setView(INITIAL_CENTER, INITIAL_ZOOM);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      attribution: "&copy; OpenStreetMap contributors"
    }
  ).addTo(map);

  const response = await fetch("/static/data/provinces.geojson");
  const geojson = await response.json();

  geojsonLayer = L.geoJSON(geojson, {
    style: defaultStyle,
    onEachFeature: (feature, layer) => {
      const name = feature.properties.NAME;
      provinceLayers[normalizeName(name)] = layer;
      layer.bindTooltip(name);
    }
  }).addTo(map);

  mapReady = true;
}

export function updateMap(modelId, label) {
  // Called after prediction and history restore to apply the correct highlight.
  clearMapHighlight();

  const regions = getRegionsToHighlight(modelId, label);

  regions.forEach((regionName) => {
    const layer = provinceLayers[normalizeName(regionName)];
    if (layer) {
      layer.setStyle(highlightStyle);
    }
  });
}

export function resetMapView() {
  // Return the map to the default Ireland-wide view without changing highlights.
  if (!mapReady || !map) {
    return;
  }

  map.setView(INITIAL_CENTER, INITIAL_ZOOM);
}

export function clearMapHighlight() {
  // Remove any active region highlight before applying a new one.
  Object.values(provinceLayers).forEach((layer) => {
    layer.setStyle(defaultStyle);
  });
}
