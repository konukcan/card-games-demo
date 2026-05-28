// self-explanation-experiment/audio-recorder.js
// Punctual audio recorder for hold-to-record verbal explanations.
//
// The participant holds spacebar (or a UI button) to record and releases
// when done. Each recording is saved as a discrete audio segment tagged
// with caller-supplied metadata (prompt type, rule ID, trial number, etc.).
//
// Depends on window.SEConfig for `minRecordingDuration` (seconds).
// Exported as window.SEAudio.

window.SEAudio = (function () {
  "use strict";

  // ── Internal state ──

  // The MediaStream obtained from getUserMedia (persists across recordings
  // so we only ask for mic permission once).
  var stream = null;

  // The active MediaRecorder instance (null when not recording).
  var recorder = null;

  // Array of Blob chunks collected during the current recording.
  // MediaRecorder fires ondataavailable every ~100 ms so we can track
  // elapsed duration responsively.
  var chunks = [];

  // Metadata object passed by the caller when starting a recording.
  // Spread into the final audio segment so downstream code can tag
  // recordings with arbitrary context (promptType, ruleId, etc.).
  var currentMeta = null;

  // High-resolution timestamp (via performance.now()) marking when
  // the current recording started. Used to compute elapsed time.
  var recordingStartTime = null;

  // Boolean flag guarding against double-start calls.
  var recording = false;

  // All completed audio segments accumulated during the session.
  var segments = [];

  // Web Audio analyser for live waveform visualisation during recording
  // (Phase 4 chunk 6). Lazy-initialised on first call to getAnalyser() and
  // reused thereafter — a single AudioContext + MediaStreamSource + Analyser
  // tied to the cached `stream`. We never disconnect/recreate them, so the
  // analyser remains live across record/stop cycles.
  var audioContext = null;
  var sourceNode = null;
  var analyser = null;

  // ── Preferred MIME type ──
  // We prefer WebM/Opus because it is compact and widely supported by
  // browsers that implement MediaRecorder. If the browser does not
  // support it we fall back to whatever default it offers.
  var PREFERRED_MIME = "audio/webm;codecs=opus";

  // ────────────────────────────────────────────────────
  // init() — Request microphone permission.
  //
  // Must be called once before any recording. Returns a Promise that
  // resolves to `true` if permission was granted and `false` otherwise.
  // The obtained MediaStream is cached so subsequent recordings reuse
  // the same stream without re-prompting the user.
  // ────────────────────────────────────────────────────
  function init() {
    return navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (mediaStream) {
        stream = mediaStream;
        console.log("SEAudio: microphone access granted.");
        return true;
      })
      .catch(function (err) {
        console.error("SEAudio: microphone access denied.", err);
        return false;
      });
  }

  // ────────────────────────────────────────────────────
  // startRecording(meta) — Begin a new recording.
  //
  // `meta` is an arbitrary object whose keys are spread into the
  // completed audio segment (e.g. { promptType: "token", ruleId: 3 }).
  //
  // Silently ignores the call if a recording is already in progress
  // (guard against accidental double-start from rapid key presses).
  // ────────────────────────────────────────────────────
  function startRecording(meta) {
    // Guard: already recording — do nothing.
    if (recording) {
      console.warn("SEAudio: startRecording ignored — already recording.");
      return;
    }

    // Guard: init() was never called or failed.
    if (!stream) {
      console.error("SEAudio: cannot record — no microphone stream. Call init() first.");
      return;
    }

    // Reset per-recording state.
    chunks = [];
    currentMeta = meta || {};
    recordingStartTime = performance.now();
    recording = true;

    // Choose MIME type — prefer WebM/Opus, fall back to browser default.
    var options = {};
    if (MediaRecorder.isTypeSupported(PREFERRED_MIME)) {
      options.mimeType = PREFERRED_MIME;
    } else {
      console.warn(
        "SEAudio: '" + PREFERRED_MIME + "' not supported; using browser default."
      );
    }

    // Create the MediaRecorder and wire up the data handler.
    // timeslice = 100 ms so we receive frequent chunks, which lets
    // getElapsedMs() and meetsMinDuration() provide responsive feedback
    // to the UI while the participant is still holding the key.
    recorder = new MediaRecorder(stream, options);

    recorder.ondataavailable = function (e) {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.start(100); // fire ondataavailable every 100 ms
    console.log("SEAudio: recording started.", currentMeta);
  }

  // ────────────────────────────────────────────────────
  // stopRecording() — End the current recording.
  //
  // Returns a Promise that resolves to the completed audio segment
  // object (see module header for structure), or `null` if no
  // recording was in progress.
  //
  // Internally: stops the MediaRecorder, assembles a Blob from the
  // collected chunks, converts it to a base64 string (without the
  // data-URL prefix), and pushes the segment into the internal array.
  // ────────────────────────────────────────────────────
  function stopRecording() {
    // Guard: not currently recording.
    if (!recording || !recorder) {
      console.warn("SEAudio: stopRecording ignored — not recording.");
      return Promise.resolve(null);
    }

    // Capture timing and state BEFORE any async work.
    var duration_ms = Math.round(performance.now() - recordingStartTime);
    var timestamp = new Date().toISOString();
    var meta = currentMeta;
    var stoppedRecorder = recorder;
    var stoppedChunks = chunks;

    // IMPORTANT: Reset state immediately so a new recording can start
    // without waiting for the async base64 conversion. The old
    // MediaRecorder is captured in `stoppedRecorder` and will be
    // cleaned up by the onstop callback. This prevents the
    // "Failed to execute 'start' on MediaRecorder" error that occurs
    // when the old recorder still holds the stream.
    recording = false;
    recorder = null;
    chunks = [];
    currentMeta = null;
    recordingStartTime = null;

    // Return a promise that resolves once the MediaRecorder has flushed
    // its final data chunk and we have converted the Blob to base64.
    //
    // R5/3.1: race against a 5-second timeout. If `onstop` never fires
    // (mic disconnects, encoder error, browser bug, page-hidden during
    // stop), the original code left the participant on a screen with a
    // forever-disabled Continue button and no console message — a real
    // production hang the user already reported. Now: if the timeout
    // wins, resolve with a `recording_unavailable: true` segment so the
    // caller's `.then(continueBtn.disabled = false)` still fires and
    // the participant can advance. The segment is still pushed to the
    // log (with audioData = null) so analysis can detect the failure.
    var STOP_TIMEOUT_MS = 5000;
    return new Promise(function (resolve) {
      var resolved = false;
      function _resolveOnce(segment) {
        if (resolved) return;
        resolved = true;
        resolve(segment);
      }

      var timeoutId = setTimeout(function () {
        if (resolved) return;
        console.error(
          "SEAudio: stopRecording timed out after " + STOP_TIMEOUT_MS +
          "ms — onstop never fired. Resolving with recording_unavailable."
        );
        var failureSegment = Object.assign({}, meta, {
          timestamp: timestamp,
          duration_ms: duration_ms,
          audioData: null,
          recording_unavailable: true,
          failure_reason: "stop_timeout",
        });
        segments.push(failureSegment);
        _resolveOnce(failureSegment);
      }, STOP_TIMEOUT_MS);

      stoppedRecorder.onstop = function () {
        if (resolved) return;
        clearTimeout(timeoutId);

        // Assemble all chunks into a single Blob.
        var mimeType = stoppedRecorder.mimeType || "audio/webm";
        var blob = new Blob(stoppedChunks, { type: mimeType });

        // Convert the Blob to a base64 string using FileReader.
        var reader = new FileReader();
        reader.onloadend = function () {
          if (resolved) return;
          // reader.result is a data URL like "data:audio/webm;base64,AAAA..."
          // We strip the prefix so audioData is pure base64.
          var base64 = (reader.result || "").split(",")[1] || "";

          var segment = Object.assign({}, meta, {
            timestamp: timestamp,
            duration_ms: duration_ms,
            audioData: base64,
          });

          segments.push(segment);

          console.log(
            "SEAudio: recording stopped. Duration: " + duration_ms + " ms, " +
            "segments total: " + segments.length
          );
          _resolveOnce(segment);
        };

        reader.onerror = function () {
          if (resolved) return;
          console.error("SEAudio: FileReader failed to read blob.");
          var seg = Object.assign({}, meta, {
            timestamp: timestamp,
            duration_ms: duration_ms,
            audioData: null,
            recording_unavailable: true,
            failure_reason: "filereader_error",
          });
          segments.push(seg);
          _resolveOnce(seg);
        };

        reader.readAsDataURL(blob);
      };

      // Actually stop the recorder — this triggers the onstop callback
      // after the final ondataavailable fires.
      try {
        stoppedRecorder.stop();
      } catch (e) {
        if (resolved) return;
        clearTimeout(timeoutId);
        console.error("SEAudio: stoppedRecorder.stop() threw —", e);
        var errSeg = Object.assign({}, meta, {
          timestamp: timestamp,
          duration_ms: duration_ms,
          audioData: null,
          recording_unavailable: true,
          failure_reason: "stop_threw",
        });
        segments.push(errSeg);
        _resolveOnce(errSeg);
      }
    });
  }

  // ────────────────────────────────────────────────────
  // getElapsedMs() — Milliseconds elapsed since recording started.
  //
  // Returns 0 if not currently recording. Useful for driving a live
  // duration indicator in the UI.
  // ────────────────────────────────────────────────────
  function getElapsedMs() {
    if (!recording || recordingStartTime === null) return 0;
    return Math.round(performance.now() - recordingStartTime);
  }

  // ────────────────────────────────────────────────────
  // meetsMinDuration() — Whether the current recording has reached
  // the minimum acceptable length.
  //
  // Reads SEConfig.minRecordingDuration (in seconds) and compares
  // against the elapsed time. Returns false if not recording.
  // ────────────────────────────────────────────────────
  function meetsMinDuration() {
    if (!recording) return false;
    var minMs = (window.SEConfig ? window.SEConfig.minRecordingDuration : 2.5) * 1000;
    return getElapsedMs() >= minMs;
  }

  // ────────────────────────────────────────────────────
  // getSegments() — Return a shallow copy of all completed segments.
  //
  // Returns an array; each element is the segment object produced by
  // stopRecording(). The copy prevents external code from accidentally
  // mutating the internal store.
  // ────────────────────────────────────────────────────
  function getSegments() {
    return segments.slice();
  }

  // ────────────────────────────────────────────────────
  // isRecording() — Whether a recording is currently in progress.
  // ────────────────────────────────────────────────────
  function isRecording() {
    return recording;
  }

  // ────────────────────────────────────────────────────
  // getAnalyser() — Returns a Web Audio AnalyserNode reading from the
  // cached mic stream, or null if init() hasn't completed.
  //
  // Lazy-initialised on first call. The analyser stays connected to the
  // stream for the lifetime of the page — callers can read time-domain
  // amplitude data from it any time, but values will only be meaningful
  // (i.e. non-flat) while the user is actually speaking into the mic.
  // ────────────────────────────────────────────────────
  function getAnalyser() {
    if (!stream) return null;
    if (analyser) return analyser;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioContext = new Ctx();
      sourceNode = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      // fftSize 512 gives 256-sample time-domain buffer — enough resolution
      // for a smooth waveform without burning CPU on each frame.
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      sourceNode.connect(analyser);
      // Note: we do NOT connect analyser to audioContext.destination — that
      // would route the mic to the speakers (echo).
      console.log("SEAudio: waveform analyser initialised.");
    } catch (err) {
      console.warn("SEAudio: could not initialise analyser.", err);
      return null;
    }
    return analyser;
  }

  // ── Public API ──
  return {
    init: init,
    startRecording: startRecording,
    stopRecording: stopRecording,
    getElapsedMs: getElapsedMs,
    meetsMinDuration: meetsMinDuration,
    getSegments: getSegments,
    isRecording: isRecording,
    getAnalyser: getAnalyser
  };
})();
