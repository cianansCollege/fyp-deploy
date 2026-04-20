// Handles audio capture and submission in the main user workflow.
// This module sits between the controls panel and the backend: it manages
// microphone recording, file uploads, playback setup, and calls to the
// prediction endpoint.

import { store } from "./store.js?v=20260410e";
import { predictAudio } from "./api.js?v=20260410e";
import {
  renderPrediction,
  renderError,
  renderFeedbackState,
  renderPredictionHistory,
  savePrediction,
  updatePredictionFeedback,
} from "./predictions.js?v=20260415b";
import { updateMap, clearMapHighlight } from "./map.js?v=20260415c";

let mediaStream = null;
let recordingTrack = null;
let playbackObjectUrl = null;
let recordingStartTime = null;
let recordingTimerId = null;
let recordingAutoStopId = null;
let recordingAudioContext = null;
let recordingSourceNode = null;
let recordingProcessorNode = null;
let recordingMonitorNode = null;
let recordedPcmChunks = [];
let recordedSampleRate = 16000;
let isStoppingRecording = false;
let recordingPeak = 0;
let recordingRmsSumSquares = 0;
let recordingRmsSamples = 0;
let recordingLastLevelLogAt = 0;

const REQUIRED_CLIP_SECONDS = 10;
const RECORDING_COUNTDOWN_SECONDS = 11;
const MICROPHONE_CONSTRAINT_CANDIDATES = [
  true,
  {
    channelCount: 1,
  },
];

function setStatus(message) {
  // Keep status updates local to the recording and prediction workflow.
  document.getElementById("statusMessage").textContent = message;
}

export function initRecording() {
  // Wire the controls panel once the page has loaded and models are available.
  const recordBtn = document.getElementById("recordBtn");
  const stopBtn = document.getElementById("stopBtn");
  const predictBtn = document.getElementById("predictBtn");
  const audioPlayback = document.getElementById("audioPlayback");
  const audioFileInput = document.getElementById("audioFile");
  const inputDeviceSelect = document.getElementById("inputDeviceSelect");
  const recordingCountdown = document.getElementById("recordingCountdown");

  const feedbackYesBtn = document.getElementById("feedbackYesBtn");
  const feedbackNoBtn = document.getElementById("feedbackNoBtn");
  const correctLabelSection = document.getElementById("correctLabelSection");
  const correctLabelSelect = document.getElementById("correctLabelSelect");
  const saveCorrectionBtn = document.getElementById("saveCorrectionBtn");
  const feedbackMessage = document.getElementById("feedbackMessage");

  if (!recordBtn || !stopBtn || !predictBtn || !audioPlayback) {
    console.error("Recording controls are missing from the page.");
    return;
  }

  function setPlaybackSource(source) {
    // Rebuild the audio preview element whenever the active source changes.
    if (playbackObjectUrl) {
      URL.revokeObjectURL(playbackObjectUrl);
      playbackObjectUrl = null;
    }

    audioPlayback.pause();
    audioPlayback.currentTime = 0;

    if (!source) {
      audioPlayback.removeAttribute("src");
      audioPlayback.load();
      return;
    }

    playbackObjectUrl = URL.createObjectURL(source);
    audioPlayback.src = playbackObjectUrl;
    audioPlayback.muted = false;
    audioPlayback.volume = 1;
    audioPlayback.load();
  }

  function refreshPredictButtonState() {
    // Enable prediction only when there is a clip ready to submit.
    const hasAudioSource = Boolean(
      store.uploadedAudioFile || store.latestAudioBlob
    );
    predictBtn.disabled = !hasAudioSource;
  }

  async function loadInputDevices(preferredDeviceId = store.selectedInputDeviceId) {
    // Refresh the microphone dropdown using the browser's current device list.
    if (
      !inputDeviceSelect ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.enumerateDevices !== "function"
    ) {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((device) => device.kind === "audioinput");

      console.log(
        "Audio input devices:",
        audioInputs.map((device, index) => ({
          index,
          deviceId: device.deviceId,
          label: device.label || "(label unavailable until permission granted)",
        }))
      );

      inputDeviceSelect.innerHTML = "";

      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "Default microphone";
      inputDeviceSelect.appendChild(defaultOption);

      for (const [index, device] of audioInputs.entries()) {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.textContent = device.label || `Microphone ${index + 1}`;
        inputDeviceSelect.appendChild(option);
      }

      const hasPreferredDevice = audioInputs.some(
        (device) => device.deviceId === preferredDeviceId
      );

      inputDeviceSelect.value =
        hasPreferredDevice && preferredDeviceId ? preferredDeviceId : "";
      store.selectedInputDeviceId = inputDeviceSelect.value || null;
    } catch (error) {
      console.warn("Failed to enumerate audio input devices.", error);
    }
  }

  function stopRecordingTimer() {
    // Stop the countdown interval used while recording.
    if (recordingTimerId) {
      clearInterval(recordingTimerId);
      recordingTimerId = null;
    }
  }

  function stopAutoStopTimer() {
    // Cancel the auto-stop timeout if recording ends early.
    if (recordingAutoStopId) {
      clearTimeout(recordingAutoStopId);
      recordingAutoStopId = null;
    }
  }

  function setCountdownDefault() {
    // Restore the helper text shown before recording starts.
    if (!recordingCountdown) {
      return;
    }

    recordingCountdown.textContent =
      `Auto-stop after ${RECORDING_COUNTDOWN_SECONDS} seconds (${REQUIRED_CLIP_SECONDS}s minimum clip)`;
    recordingCountdown.classList.remove("text-danger", "text-success");
    recordingCountdown.classList.add("text-body-secondary");
  }

  function renderRecordingTimer(elapsedSeconds) {
    // Update the live countdown while a recording is in progress.
    if (!recordingCountdown) {
      return;
    }

    const remainingSeconds = Math.max(
      0,
      RECORDING_COUNTDOWN_SECONDS - elapsedSeconds
    );

    if (remainingSeconds > 0) {
      recordingCountdown.textContent =
        `Recording: ${remainingSeconds.toFixed(1)}s remaining`;
      recordingCountdown.classList.remove("text-danger", "text-success");
      recordingCountdown.classList.add("text-body-secondary");
      return;
    }

    recordingCountdown.textContent =
      "Recording complete. Stopping automatically...";
    recordingCountdown.classList.remove("text-danger", "text-body-secondary");
    recordingCountdown.classList.add("text-success");
  }

  function startRecordingTimer() {
    // Start the UI timer that mirrors the recording window.
    stopRecordingTimer();
    renderRecordingTimer(0);
    recordingTimerId = setInterval(() => {
      if (!recordingStartTime) {
        return;
      }
      const elapsedSeconds = (Date.now() - recordingStartTime) / 1000;
      renderRecordingTimer(elapsedSeconds);
    }, 100);
  }

  function writeAscii(view, offset, text) {
    // Helper used when manually writing the WAV header.
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  }

  function encodeMonoWav(samples, sampleRate) {
    // Export captured PCM samples to a browser-playable WAV blob.
    const bytesPerSample = 2;
    const blockAlign = bytesPerSample;
    const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
    const view = new DataView(buffer);

    writeAscii(view, 0, "RIFF");
    view.setUint32(4, 36 + samples.length * bytesPerSample, true);
    writeAscii(view, 8, "WAVE");
    writeAscii(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, "data");
    view.setUint32(40, samples.length * bytesPerSample, true);

    let offset = 44;
    for (let index = 0; index < samples.length; index += 1) {
      const clampedSample = Math.max(-1, Math.min(1, samples[index]));
      const intSample =
        clampedSample < 0
          ? clampedSample * 0x8000
          : clampedSample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += bytesPerSample;
    }

    return new Blob([buffer], { type: "audio/wav" });
  }

  function downmixToMono(audioBuffer) {
    // Collapse browser audio buffers to mono before export and logging.
    const monoSamples = new Float32Array(audioBuffer.length);

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let index = 0; index < channelData.length; index += 1) {
        monoSamples[index] += channelData[index];
      }
    }

    if (audioBuffer.numberOfChannels > 1) {
      for (let index = 0; index < monoSamples.length; index += 1) {
        monoSamples[index] /= audioBuffer.numberOfChannels;
      }
    }

    return monoSamples;
  }

  function mergeFloat32Chunks(chunks) {
    // Combine recorded audio blocks into one contiguous sample array.
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    return merged;
  }

  function logTrackDiagnostics(track) {
    // Log browser microphone metadata to help with capture debugging.
    console.log("Mic track label:", track?.label ?? "(unknown)");
    console.log("Mic track settings:", track?.getSettings?.() ?? {});
    console.log("Mic track constraints:", track?.getConstraints?.() ?? {});
    console.log("Mic track state:", {
      enabled: track?.enabled,
      muted: track?.muted,
      readyState: track?.readyState,
    });
  }

  async function requestMicrophoneStream() {
    // Try the selected microphone first, then fall back to simpler constraints.
    let lastError = null;

    const constraintCandidates = [];
    if (store.selectedInputDeviceId) {
      constraintCandidates.push({
        deviceId: { exact: store.selectedInputDeviceId },
      });
    }
    constraintCandidates.push(...MICROPHONE_CONSTRAINT_CANDIDATES);

    for (const audioConstraints of constraintCandidates) {
      try {
        console.log("Requesting microphone with constraints:", audioConstraints);
        return await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
        });
      } catch (error) {
        console.warn(
          "Microphone request failed for constraints:",
          audioConstraints,
          error
        );
        lastError = error;
      }
    }

    throw lastError ?? new Error("Unable to acquire microphone stream.");
  }

  async function cleanupCaptureGraph() {
    // Tear down any existing Web Audio graph before starting a new recording.
    if (recordingProcessorNode) {
      recordingProcessorNode.onaudioprocess = null;
      recordingProcessorNode.disconnect();
      recordingProcessorNode = null;
    }

    if (recordingSourceNode) {
      recordingSourceNode.disconnect();
      recordingSourceNode = null;
    }

    if (recordingMonitorNode) {
      recordingMonitorNode.disconnect();
      recordingMonitorNode = null;
    }

    if (recordingAudioContext) {
      await recordingAudioContext.close().catch(() => {});
      recordingAudioContext = null;
    }
  }

  async function startPcmCapture(stream) {
    // Capture raw PCM samples so recorded clips are not tied to MediaRecorder codecs.
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Audio recording is not supported in this browser.");
    }

    await cleanupCaptureGraph();

    recordingAudioContext = new AudioContextClass();
    await recordingAudioContext.resume();

    recordedSampleRate = recordingAudioContext.sampleRate;
    recordedPcmChunks = [];
    recordingPeak = 0;
    recordingRmsSumSquares = 0;
    recordingRmsSamples = 0;
    recordingLastLevelLogAt = 0;

    recordingSourceNode =
      recordingAudioContext.createMediaStreamSource(stream);
    recordingProcessorNode =
      recordingAudioContext.createScriptProcessor(4096, 1, 1);
    recordingMonitorNode = recordingAudioContext.createGain();
    recordingMonitorNode.gain.value = 0;

    recordingProcessorNode.onaudioprocess = (event) => {
      // Buffer the incoming samples and track simple level diagnostics.
      const monoChunk = downmixToMono(event.inputBuffer);
      recordedPcmChunks.push(monoChunk);

      let chunkPeak = 0;
      for (let index = 0; index < monoChunk.length; index += 1) {
        const sample = monoChunk[index];
        const absSample = Math.abs(sample);
        chunkPeak = Math.max(chunkPeak, absSample);
        recordingRmsSumSquares += sample * sample;
      }

      recordingPeak = Math.max(recordingPeak, chunkPeak);
      recordingRmsSamples += monoChunk.length;

      const now = Date.now();
      if (now - recordingLastLevelLogAt > 1000) {
        recordingLastLevelLogAt = now;
        console.log("Mic level snapshot:", {
          peak: Number(chunkPeak.toFixed(5)),
          trackMuted: recordingTrack?.muted ?? null,
          samplesCaptured: recordingRmsSamples,
        });
      }
    };

    recordingSourceNode.connect(recordingProcessorNode);
    recordingProcessorNode.connect(recordingMonitorNode);
    recordingMonitorNode.connect(recordingAudioContext.destination);
  }

  async function stopPcmCapture() {
    // Finish PCM capture and return the final WAV blob.
    const mergedSamples = mergeFloat32Chunks(recordedPcmChunks);
    const sampleRate = recordedSampleRate;

    await cleanupCaptureGraph();
    recordedPcmChunks = [];

    if (mergedSamples.length === 0) {
      throw new Error("No microphone audio samples were captured.");
    }

    return encodeMonoWav(mergedSamples, sampleRate);
  }

  function stopMediaStream() {
    // Release the active browser microphone stream once recording ends.
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    recordingTrack = null;
  }

  async function finalizeRecording() {
    // Complete the recording flow, validate the clip, and prepare playback/upload.
    if (!recordingStartTime || isStoppingRecording) {
      return;
    }

    isStoppingRecording = true;
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    stopRecordingTimer();
    stopAutoStopTimer();

    const durationSeconds = (Date.now() - recordingStartTime) / 1000;
    let audioBlob = null;

    try {
      setStatus("Preparing recorded audio...");
      audioBlob = await stopPcmCapture();
    } catch (error) {
      console.error(error);
    }

    const overallRms =
      recordingRmsSamples > 0
        ? Math.sqrt(recordingRmsSumSquares / recordingRmsSamples)
        : 0;

    console.log("Mic recording summary:", {
      durationSeconds: Number(durationSeconds.toFixed(2)),
      peak: Number(recordingPeak.toFixed(5)),
      rms: Number(overallRms.toFixed(5)),
      samplesCaptured: recordingRmsSamples,
      trackMutedAtEnd: recordingTrack?.muted ?? null,
      trackReadyStateAtEnd: recordingTrack?.readyState ?? null,
    });

    stopMediaStream();

    // Reject recordings that do not meet the minimum duration.
    if (durationSeconds + 0.05 < REQUIRED_CLIP_SECONDS) {
      if (recordingCountdown) {
        recordingCountdown.textContent =
          `Too short: ${durationSeconds.toFixed(1)}s recorded. At least ${REQUIRED_CLIP_SECONDS}s is required.`;
        recordingCountdown.classList.remove(
          "text-success",
          "text-body-secondary"
        );
        recordingCountdown.classList.add("text-danger");
      }
      store.latestAudioBlob = null;
      setPlaybackSource(null);
      refreshPredictButtonState();
      setStatus(
        `Recording too short (${durationSeconds.toFixed(1)}s). Please record at least ${REQUIRED_CLIP_SECONDS} seconds.`
      );
      recordingStartTime = null;
      isStoppingRecording = false;
      return;
    }

    // Stop here if capture failed before a playable blob could be produced.
    if (!audioBlob) {
      if (recordingCountdown) {
        recordingCountdown.textContent =
          "Recording failed. Please try again.";
        recordingCountdown.classList.remove(
          "text-success",
          "text-body-secondary"
        );
        recordingCountdown.classList.add("text-danger");
      }
      store.latestAudioBlob = null;
      setPlaybackSource(null);
      refreshPredictButtonState();
      setStatus("Recording failed. No usable microphone audio was captured.");
      recordingStartTime = null;
      isStoppingRecording = false;
      return;
    }

    console.log("Recorded blob type:", audioBlob.type);
    console.log("Recorded blob size:", audioBlob.size);

    if (recordingPeak < 0.001 && overallRms < 0.0005) {
      console.warn(
        "Captured audio appears effectively silent despite successful recording."
      );
    }

    if (recordingCountdown) {
      recordingCountdown.textContent =
        `Recorded ${durationSeconds.toFixed(1)}s clip.`;
      recordingCountdown.classList.remove(
        "text-danger",
        "text-body-secondary"
      );
      recordingCountdown.classList.add("text-success");
    }

    // Make the new clip available for preview and prediction.
    store.latestAudioBlob = audioBlob;
    store.uploadedAudioFile = null;
    setPlaybackSource(audioBlob);
    refreshPredictButtonState();

    setStatus(
      `Recording ready (${durationSeconds.toFixed(1)}s). The first ${REQUIRED_CLIP_SECONDS} seconds will be used.`
    );

    recordingStartTime = null;
    isStoppingRecording = false;
  }

  function startAutoStopTimer() {
    // End the recording automatically once the countdown window expires.
    stopAutoStopTimer();
    recordingAutoStopId = setTimeout(async () => {
      if (!recordingStartTime || isStoppingRecording) {
        return;
      }
      await finalizeRecording();
    }, RECORDING_COUNTDOWN_SECONDS * 1000);
  }

  setCountdownDefault();
  refreshPredictButtonState();
  renderPredictionHistory();
  void loadInputDevices();

  if (inputDeviceSelect) {
    inputDeviceSelect.addEventListener("change", () => {
      // Persist the chosen microphone for the rest of the current session.
      store.selectedInputDeviceId = inputDeviceSelect.value || null;
      setStatus(
        store.selectedInputDeviceId
          ? "Microphone selected."
          : "Using default microphone."
      );
    });
  }

  recordBtn.addEventListener("click", async () => {
    try {
      // Start a fresh recording from the chosen input device.
      mediaStream = await requestMicrophoneStream();
      recordingTrack = mediaStream.getAudioTracks()[0] ?? null;

      if (!recordingTrack) {
        throw new Error("No audio track was returned from getUserMedia.");
      }

      logTrackDiagnostics(recordingTrack);
      await loadInputDevices(recordingTrack.getSettings?.().deviceId ?? store.selectedInputDeviceId);
      recordingTrack.onmute = () => console.warn("Mic track muted");
      recordingTrack.onunmute = () => console.log("Mic track unmuted");
      recordingTrack.onended = () => console.warn("Mic track ended");

      await startPcmCapture(mediaStream);

      recordingStartTime = Date.now();
      isStoppingRecording = false;
      store.latestAudioBlob = null;
      store.uploadedAudioFile = null;
      setPlaybackSource(null);

      startRecordingTimer();
      startAutoStopTimer();
      recordBtn.disabled = true;
      stopBtn.disabled = false;
      refreshPredictButtonState();
      setStatus(
        `Recording... stop any time after ${REQUIRED_CLIP_SECONDS} seconds, or it will auto-stop after ${RECORDING_COUNTDOWN_SECONDS} seconds.`
      );
    } catch (error) {
      console.error(error);
      stopRecordingTimer();
      stopAutoStopTimer();
      await cleanupCaptureGraph().catch(() => {});
      stopMediaStream();
      recordingStartTime = null;
      isStoppingRecording = false;
      setCountdownDefault();
      setStatus("Could not access microphone.");
    }
  });

  stopBtn.addEventListener("click", async () => {
    // Manual stop follows the same completion path as auto-stop.
    await finalizeRecording();
  });

  if (audioFileInput) {
    const onFileSelected = () => {
      // Switch the active audio source from recorded audio to the chosen file.
      const file = audioFileInput.files?.[0] ?? null;

      if (!file) {
        refreshPredictButtonState();
        return;
      }

      store.uploadedAudioFile = file;
      store.latestAudioBlob = null;

      setPlaybackSource(file);
      stopRecordingTimer();
      setCountdownDefault();
      refreshPredictButtonState();

      setStatus(`Audio file selected: ${file.name}`);
    };

    audioFileInput.addEventListener("change", onFileSelected);
    audioFileInput.addEventListener("input", onFileSelected);
  }

  predictBtn.addEventListener("click", async () => {
    // Submit whichever clip is currently active in the controls panel.
    if (!store.selectedModelId) {
      setStatus("No model selected.");
      return;
    }

    let audioSource = null;

    if (store.uploadedAudioFile) {
      audioSource = store.uploadedAudioFile;
    } else if (store.latestAudioBlob) {
      audioSource = store.latestAudioBlob;
    }

    if (!audioSource) {
      setStatus("No recording or uploaded audio available.");
      return;
    }

    try {
      clearMapHighlight();
      setStatus("Running prediction...");

      const result = await predictAudio(audioSource, store.selectedModelId);

      // Save and render the result before syncing the map highlight.
      savePrediction(result);
      renderPrediction(result);
      renderPredictionHistory();

      const predictedLabel = result.label ?? result.predicted_label ?? null;
      const predictionModelId = result.model_id ?? store.selectedModelId ?? null;

      if (predictionModelId && predictedLabel) {
        updateMap(predictionModelId, predictedLabel);
      }

      setStatus("Prediction complete.");
    } catch (error) {
      console.error(error);
      renderError(error.message);
      setStatus(`Prediction failed: ${error.message}`);
    }
  });

  if (feedbackYesBtn) {
    feedbackYesBtn.addEventListener("click", () => {
      // Mark the active prediction as correct and refresh the history display.
      const updated = updatePredictionFeedback({
        wasCorrect: true,
        correctedLabel: null,
      });

      if (!updated) {
        return;
      }

      if (correctLabelSection) {
        correctLabelSection.classList.add("d-none");
      }

      if (feedbackMessage) {
        feedbackMessage.textContent = "Thanks — marked as correct.";
      }

      renderFeedbackState(updated);
      renderPredictionHistory();
    });
  }

  if (feedbackNoBtn) {
    feedbackNoBtn.addEventListener("click", () => {
      // Reveal the correction controls when the user marks a result as incorrect.
      if (correctLabelSection) {
        correctLabelSection.classList.remove("d-none");
      }

      if (feedbackMessage) {
        feedbackMessage.textContent = "Please select the correct province.";
      }
    });
  }

  if (saveCorrectionBtn) {
    saveCorrectionBtn.addEventListener("click", () => {
      // Store the corrected province label against the current history item.
      const correctedLabel = correctLabelSelect?.value ?? "";

      if (!correctedLabel) {
        if (feedbackMessage) {
          feedbackMessage.textContent =
            "Please choose the correct province first.";
        }
        return;
      }

      const updated = updatePredictionFeedback({
        wasCorrect: false,
        correctedLabel,
      });

      if (!updated) {
        return;
      }

      if (feedbackMessage) {
        feedbackMessage.textContent =
          `Saved — marked incorrect, correct province: ${correctedLabel}.`;
      }

      renderFeedbackState(updated);
      renderPredictionHistory();
    });
  }
}
