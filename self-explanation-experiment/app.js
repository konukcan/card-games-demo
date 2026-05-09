// self-explanation-experiment/app.js
// Top-level session orchestrator for the self-explanation experiment.
//
// Coordinates the full experiment lifecycle:
//   1. Initialize session metadata (IDs, config, screen info)
//   2. Request microphone permission (non-silent conditions)
//   3. Build curriculum (rule selection + exemplar loading)
//   4. Tutorial (instruction screens + practice round)
//   5. Main experiment (loop through curriculum rules)
//   6. Recap (rule articulation, strategy report, demographics)
//   7. Save results (DataPipe / Cloudflare / local download)
//   8. Completion screen (+ Prolific redirect if applicable)
//
// Depends on:
//   window.SEConfig       — experiment parameters and condition helpers
//   window.SEAudio        — microphone recording
//   window.SECurriculum   — rule selection and data loading
//   window.SETutorial     — instruction screens and practice round
//   window.SEGame         — single-rule game orchestrator
//   window.SERecap        — post-experiment recap sequence
//   window.SEUI           — shared rendering functions
//   window.GallerySave    — DataPipe + Cloudflare + local save cascade
//
// Exported as window.SEApp.

window.SEApp = (function () {
  "use strict";

  // ── Constants ──

  // Experiment version string, included in saved metadata for traceability.
  var VERSION = "1.0.0";

  // v2 schema bumps (Issue 8 — payload constants colocated with VERSION).
  // EXPERIMENT_VERSION goes into payload.experimentVersion. SAMPLING_SCHEME
  // goes into payload.samplingScheme. Bump in lockstep when the persisted
  // shape changes — analysis pipelines pivot on these.
  var EXPERIMENT_VERSION = 2;
  var SAMPLING_SCHEME = "fixed_pool_v2";

  // Prolific completion URL — participants are redirected here after the
  // experiment finishes so Prolific marks them as complete. The completion
  // code is specific to this study.
  var PROLIFIC_COMPLETION_URL =
    "https://app.prolific.com/submissions/complete?cc=SE_COMPLETE";

  // ════════════════════════════════════════════════════
  // Integrity monitor (cyborg-hunter)
  // ════════════════════════════════════════════════════
  //
  // Boots BEFORE snapshot fetch so failed sessions get observed too.
  // Failed sessions don't reach the save step, so the rollup is captured
  // but not persisted — acknowledged design choice (design v2 §9.3 / Issue 6).
  //
  // The library exposes `window.IntegrityMonitor` (NOT `CyborgHunter` — name
  // mismatch with our design draft; the lib's published name wins).
  //
  // plugin-guard-assistance / llm-guard is the planned next round — see
  // presentational-goals-redteam/presentational_goals/docs/index.html for
  // the reference jsPsych implementation; the vanilla-JS port requires its
  // own UX design pass.
  function _bootIntegrityMonitor() {
    if (!window.IntegrityMonitor || typeof window.IntegrityMonitor.init !== "function") {
      console.warn("IntegrityMonitor library not loaded — integrity monitor disabled.");
      return null;
    }
    var pid = SEConfig.PROLIFIC_PID || ("anon_" + Math.random().toString(36).slice(2, 12));
    try {
      var monitor = window.IntegrityMonitor.init({
        participantId: pid,
        preset: "standard",
      });
      monitor.startSession();
      return monitor;
    } catch (e) {
      console.warn("IntegrityMonitor.init failed, monitor disabled:", e);
      return null;
    }
  }

  // ════════════════════════════════════════════════════
  // Session ID generation
  // ════════════════════════════════════════════════════

  // generateSessionId() — Creates a unique session identifier.
  // Prefers crypto.randomUUID() (available in modern browsers over HTTPS),
  // falls back to a timestamp-based ID for older environments or HTTP.
  function generateSessionId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    // Fallback: timestamp + random suffix for reasonable uniqueness
    return "se-" + Date.now() + "-" + Math.random().toString(36).substr(2, 8);
  }

  // ════════════════════════════════════════════════════
  // Participant ID
  // ════════════════════════════════════════════════════

  // getParticipantId() — Returns a participant identifier. Uses the Prolific
  // PID if available (production), otherwise generates a local ID for dev.
  function getParticipantId() {
    if (SEConfig.PROLIFIC_PID) {
      return SEConfig.PROLIFIC_PID;
    }
    return "local-" + Date.now();
  }

  // ════════════════════════════════════════════════════
  // Clear session state
  // ════════════════════════════════════════════════════

  // handleClearParam() — If ?clear=1 is in the URL, wipe all storage keys
  // related to this experiment. Useful during development to reset
  // tutorial completion + group assignment so dev URLs are predictable.
  //
  // R4/4.3: also clears se_group_* keys from BOTH localStorage and
  // sessionStorage. (R4/4.1 moved real-PID group keys to localStorage;
  // anon stays in sessionStorage.) Without this, dev iterations on
  // ?group=X were unpredictable.
  function handleClearParam() {
    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("clear") !== "1") return;
    console.log("SEApp: clearing storage (clear=1).");
    localStorage.removeItem("se_tutorial_done");
    [localStorage, sessionStorage].forEach(function (store) {
      // Iterate keys in reverse so removeItem during iteration is safe.
      for (var i = store.length - 1; i >= 0; i--) {
        var k = store.key(i);
        if (k && k.indexOf("se_group_") === 0) {
          store.removeItem(k);
        }
      }
    });
  }

  // ════════════════════════════════════════════════════
  // Main session flow
  // ════════════════════════════════════════════════════

  // start() — Runs the entire experiment session from initialization through
  // data save and completion screen. This is the single entry point that
  // DOMContentLoaded calls.
  //
  // The flow is strictly sequential: each phase must complete before the
  // next begins. Errors at any point display a generic message and halt.
  async function start() {
    try {
      // ── 0. Integrity monitor (R-stim/9.2) ──
      // Boot BEFORE snapshot fetch so failed sessions get observed too.
      // Library may be missing (CSP, bad path) — _bootIntegrityMonitor
      // returns null in that case and the rest of the flow is unaffected.
      window._integrityMonitor = _bootIntegrityMonitor();

      // ── 0a. Guard: file:// protocol ──
      // Browsers block fetch() on file:// origins for security, which makes
      // SECurriculum.build() fail with an uninformative "Failed to fetch"
      // error. Detect this case up front and show the exact command needed.
      if (window.location.protocol === "file:") {
        SEUI.showMessage(
          "<h2>Please run via a local web server</h2>" +
          '<p style="max-width:560px; margin:12px auto; line-height:1.7;">' +
          "This experiment loads data files via <code>fetch()</code>, which " +
          "browsers block when the page is opened directly from disk " +
          "(<code>file://</code>). Start a local server and open through it:" +
          "</p>" +
          '<pre style="max-width:560px; margin:12px auto; padding:12px 16px; ' +
          'background:#1e1e1e; color:#d4d4d4; border-radius:6px; ' +
          'text-align:left; font-size:13px;">' +
          "cd " + "\"" + "path/to/card-games" + "\"\n" +
          "python3 -m http.server 8080" +
          "</pre>" +
          '<p style="max-width:560px; margin:12px auto; line-height:1.7;">' +
          "Then open " +
          '<code>http://localhost:8080/self-explanation-experiment/demo.html</code>' +
          " in your browser." +
          "</p>",
          "error"
        );
        return;
      }

      // ── 0b. Handle ?clear=1 ──
      handleClearParam();

      // ── 1. Initialize session metadata ──
      var sessionId = generateSessionId();
      var participantId = getParticipantId();
      var startTime = new Date().toISOString();

      console.log("SEApp: session starting.", {
        sessionId: sessionId,
        participantId: participantId,
        condition: SEConfig.condition
      });

      // Build the metadata object with all config params, Prolific IDs,
      // browser info, and screen dimensions. This is included verbatim
      // in the final saved JSON.
      var metadata = {
        sessionId: sessionId,
        participantId: participantId,
        prolificPID: SEConfig.PROLIFIC_PID,
        studyId: SEConfig.STUDY_ID,
        condition: SEConfig.condition,
        feedback: SEConfig.feedback,
        tokenSelection: SEConfig.tokenSelection,
        peerCorrectRate: SEConfig.peerCorrectRate,
        nTrials: SEConfig.nTrials,
        nExemplars: SEConfig.nExemplars,
        nRules: SEConfig.nRules,
        galleryTime: SEConfig.galleryTime,
        reEngagement: SEConfig.reEngagement,
        accumulate: SEConfig.accumulate,
        checkpoints: SEConfig.checkpoints,
        curriculum: [],  // filled after curriculum is built
        startTime: startTime,
        endTime: null,   // filled at finalization
        totalDurationMs: null,
        userAgent: navigator.userAgent,
        screenWidth: screen.width,
        screenHeight: screen.height,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        version: VERSION
      };

      // ── 2. Audio init (non-silent conditions) ──
      // The tutorial handles its own mic init (with retry UI), so we only
      // need to check here if the condition requires audio at all. The
      // actual init happens inside SETutorial.run() via screenAudioExplanation.
      // For silent conditions, no audio initialization is needed.

      // ── 3. Build curriculum ──
      // Fetches frozen exemplars + diagnosticity data, selects rules,
      // builds win/lose hand stacks. This is the main async data-loading step.
      SEUI.showMessage(
        "<h2>Loading...</h2>" +
        '<p style="color:#64748b;">Preparing your session</p>',
        "info"
      );

      var curriculum = await SECurriculum.build();

      // Record the ordered list of rule IDs in metadata
      metadata.curriculum = curriculum.rules.map(function (rd) {
        return rd.ruleId;
      });

      // v2 snapshot metadata (per design §8.2 — full session payload wiring
      // happens in B8; this initial set is enough to log the session start)
      metadata.seSnapshotId = curriculum.seSnapshotId || null;
      metadata.analysisSnapshotId = curriculum.analysisSnapshotId || null;
      metadata.groupAssignment = curriculum.groupAssignment || null;
      metadata.adversarialStrategy = curriculum.adversarialStrategy || null;
      // strategyVariant REMOVED from saved metadata in v2 (Issue 4).
      metadata.groupAssignmentSource = "snapshot";  // v2: baked into snapshot file
      // R6/6.1: nRules now reflects the actual curriculum length, not the
      // SEConfig.nRules URL param. If ?nRules=2 trims the curriculum, OR
      // the snapshot's group size differs from the config, the saved
      // metadata records what actually ran.
      metadata.nRules = curriculum.rules.length;

      console.log("SEApp: curriculum built.", {
        rules: metadata.curriculum,
        seSnapshotId: metadata.seSnapshotId,
        groupAssignment: metadata.groupAssignment,
      });

      // ── 4. Tutorial ──
      // v2: no separate practice round — instruction screens + a mic test
      // on a real card. SETutorial.run() ignores its argument; we pass
      // null explicitly to document that the practice rule is gone.
      await SETutorial.run(null);

      // R4/4.2: install a beforeunload guard for the rest of the session.
      // A participant who closes / reloads mid-curriculum loses progress
      // (no resume logic in v2 yet — that's a separate work item). The
      // guard at least surfaces a browser-native confirmation. Cleared
      // before the save flow so the completion screen doesn't trigger it.
      // Skip for headless / dev contexts (?skipUnloadGuard=1).
      var unloadGuardActive = false;
      function _beforeUnloadHandler(e) {
        if (!unloadGuardActive) return;
        var msg = "Leaving now will discard your progress in this study.";
        e.preventDefault();
        e.returnValue = msg;
        return msg;
      }
      var skipUnloadGuard = (function () {
        try {
          return new URLSearchParams(window.location.search).get("skipUnloadGuard") === "1";
        } catch (_e) { return false; }
      })();
      if (!skipUnloadGuard) {
        unloadGuardActive = true;
        window.addEventListener("beforeunload", _beforeUnloadHandler);
      }

      // ── 5. Main experiment ──
      // Loop through each rule in the curriculum sequentially. Each call
      // to SEGame.start() runs the full gallery + classification flow for
      // one rule and returns { trials, audioSegments, ruleWriteup }.
      // Phase 4 chunk 7: ruleWriteup is the typed rule articulation captured
      // immediately after the last classification trial of each rule —
      // primary rule-inference DV, comparable to the rule-gallery pilot.
      var allTrials = [];
      var allAudioSegments = [];
      var allRuleWriteups = [];

      for (var i = 0; i < curriculum.rules.length; i++) {
        var ruleData = curriculum.rules[i];
        var rulePosition = i + 1; // 1-based position

        console.log(
          "SEApp: starting rule " + rulePosition + "/" + curriculum.rules.length +
          " (" + ruleData.ruleId + ")"
        );

        // R6/6.1: pass the curriculum's actual length so the progress
        // bar and per-rule heading reflect what's really running, not
        // SEConfig.nRules (which may be tampered or trimmed).
        var gameResult = await SEGame.start(
          ruleData, rulePosition, curriculum.rules.length
        );

        // Accumulate trials, audio segments, and the per-rule typed writeup
        allTrials = allTrials.concat(gameResult.trials);
        allAudioSegments = allAudioSegments.concat(gameResult.audioSegments);
        if (gameResult.ruleWriteup) {
          allRuleWriteups.push(gameResult.ruleWriteup);
        }

        // ── Rule-transition buffer (C2) ──
        // ~1.5 s "Game N of M complete / Next game" between rules. Don't
        // show after the last rule — the bulk articulation phase follows.
        if (rulePosition < curriculum.rules.length) {
          SEUI.clearApp();
          await SEUI.renderRuleTransitionBuffer(
            document.getElementById("app"),
            rulePosition,
            curriculum.rules.length
          );
        }
      }

      console.log(
        "SEApp: all games complete. " +
        allTrials.length + " trials, " +
        allAudioSegments.length + " audio segments, " +
        allRuleWriteups.length + " rule writeups."
      );

      // ── 5b. End-of-curriculum bulk articulation (C3 + C7) ──
      // SOLE typed DV in v2: each rule's frozen 6-card gallery, in
      // chronological order, with a typed prompt. Per design §3.2.
      //
      // R2/2.1: try/catch EACH iteration so a single rejected screen
      // does not discard every previously-collected writeup + all
      // classification trials + all audio. The bulk articulation is
      // the most fragile screen and guards the most expensive data.
      // On error, push a placeholder and continue; surface a recap
      // notice but keep the session alive long enough to save.
      var endOfCurriculumWriteups = [];
      var bulkErrors = [];
      for (var bi = 0; bi < curriculum.rules.length; bi++) {
        try {
          SEUI.clearApp();
          var bulkApp = document.getElementById("app");
          var bulkResult = await SEUI.renderBulkArticulation(
            bulkApp,
            curriculum.rules[bi],
            bi + 1,
            curriculum.rules.length,
            { minChars: 10, minSec: 5 }
          );
          endOfCurriculumWriteups.push(bulkResult);
        } catch (err) {
          var errMsg = (err && err.message) ? err.message : String(err);
          console.error(
            "SEApp: bulk articulation failed for rule " +
            curriculum.rules[bi].ruleId + ":", errMsg
          );
          // BULK_GALLERY_RENDER_FAILED / SNAPSHOT_EXEMPLARS_MISSING render
          // the loader's fail screen; bail rather than continue past a
          // missing-stimulus state (research-data integrity).
          if (errMsg.indexOf("BULK_GALLERY_RENDER_FAILED") === 0 ||
              errMsg.indexOf("SNAPSHOT_") === 0) {
            throw err;
          }
          // Other errors (DOM races, unexpected): record and continue,
          // so we still save trials + audio + earlier writeups.
          bulkErrors.push({
            ruleId: curriculum.rules[bi].ruleId,
            rulePosition: bi + 1,
            error: errMsg,
            timestamp: new Date().toISOString(),
          });
          endOfCurriculumWriteups.push({
            ruleId: curriculum.rules[bi].ruleId,
            rulePosition: bi + 1,
            response: null,
            rt: null,
            minChars: 10,
            minSec: 5,
            passedGate: false,
            galleryRendered: null,
            error: errMsg,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // ── 5c. Optional final synthesis screen (C4) ──
      var endOfCurriculumSynthesis = null;
      try {
        SEUI.clearApp();
        endOfCurriculumSynthesis = await SEUI.renderBulkSynthesis(
          document.getElementById("app")
        );
      } catch (err) {
        // Non-fatal — synthesis is optional. Record the error in metadata
        // so analysis can drop the synthesis row without losing the rest.
        console.error("SEApp: synthesis screen failed:", err);
        endOfCurriculumSynthesis = {
          response: null, rt: null, timestamp: new Date().toISOString(),
          skipReason: "render_error",
          error: (err && err.message) ? err.message : String(err),
        };
      }

      console.log(
        "SEApp: bulk articulation complete. " +
        endOfCurriculumWriteups.length + " writeups, synthesis " +
        (endOfCurriculumSynthesis && endOfCurriculumSynthesis.skipReason
          ? "skipped (" + endOfCurriculumSynthesis.skipReason + ")"
          : "submitted") +
        (bulkErrors.length ? " (" + bulkErrors.length + " bulk errors)" : "")
      );

      // ── 6. Recap ──
      // Strategy report + demographics. (Phase 4 chunk 7 also dropped the
      // per-rule voice recap from this step. v2: the typed bulk articulation
      // above replaces both per-round writeup AND per-rule voice recap.)
      var recapResult = await SERecap.run(curriculum);

      // Collect any audio segments recorded during recap
      // (SEAudio.getSegments() returns ALL segments including recap ones)
      var recapAudioSegments = SEAudio.getSegments();
      // The recap segments are those beyond what we already collected
      var newRecapSegments = recapAudioSegments.slice(allAudioSegments.length);
      allAudioSegments = allAudioSegments.concat(newRecapSegments);

      // ── 7. Finalize and save ──
      var endTime = new Date().toISOString();
      metadata.endTime = endTime;
      metadata.totalDurationMs = new Date(endTime) - new Date(startTime);

      // Build the final payload — a single JSON object containing all
      // experiment data: metadata, trial records, audio, per-rule typed
      // writeups, and recap (strategy + demographics).
      //
      // v2 schema additions (B6/B8 + design §8):
      //   - top-level experimentVersion / samplingScheme for downstream
      //     dispatch (so old & new pilot data don't silently look comparable)
      //   - ruleWriteups stays in the payload but is empty in v2 sessions
      //     (per-round typed writeup is dropped per design §2; legacy data
      //     keeps its filled array)
      //   - endOfCurriculumWriteups & endOfCurriculumSynthesis populated by
      //     Phase C (initialized empty so the field is always present)
      var payload = {
        // v2 schema versioning (constants at top of file, Issue 8)
        experimentVersion: EXPERIMENT_VERSION,
        samplingScheme: SAMPLING_SCHEME,
        metadata: metadata,
        trials: allTrials,
        audioSegments: allAudioSegments,
        ruleWriteups: allRuleWriteups,                       // empty in v2
        endOfCurriculumWriteups: endOfCurriculumWriteups,    // C3 + C7
        endOfCurriculumSynthesis: endOfCurriculumSynthesis,  // C4
        bulkErrors: bulkErrors,                              // R2/2.1 — per-rule failures (empty array if all OK)
        recap: {
          strategy: recapResult.strategy,
          demographics: recapResult.demographics
        }
      };

      // R4/4.2: payload is built. The rest of the flow (save → completion)
      // shouldn't trigger the leave-the-page guard. Drop it now so the
      // Prolific redirect at the end doesn't fire a browser warning.
      unloadGuardActive = false;
      window.removeEventListener("beforeunload", _beforeUnloadHandler);

      // Generate a descriptive filename.
      //
      // R3/5.2: do NOT embed PROLIFIC_PID in the filename. Result files
      // can end up in shared storage (DataPipe / GitHub) and exposing
      // raw participant IDs there leaks PII. Use the session UUID
      // instead — uniquely identifies the run, contains no PII, and is
      // already saved inside payload.metadata.sessionId for cross-
      // reference. The PID is still in metadata for the researcher to
      // join against, just not in the filename.
      var timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      var filename = "se_" + sessionId + "_" + timestamp + ".json";

      console.log("SEApp: saving results as " + filename);

      // Show a saving indicator while the save cascade runs
      SEUI.showMessage(
        "<h2>Saving your data...</h2>" +
        '<p style="color:#64748b;">Please wait</p>',
        "info"
      );

      // R-stim/9.3: cyborg-hunter session report -> payload.
      // getSessionReport returns a deep copy of all collected session data
      // (paste/copy/tabAway/sidebar events, scores, AI extension hits, etc.).
      if (window._integrityMonitor &&
          typeof window._integrityMonitor.getSessionReport === "function") {
        try {
          payload.cyborgHunter = window._integrityMonitor.getSessionReport();
        } catch (e) {
          console.warn("cyborg-hunter getSessionReport failed:", e);
        }
        try { window._integrityMonitor.destroy(); } catch (_e) {}
      }

      var jsonString = JSON.stringify(payload);
      await GallerySave.saveResults(filename, jsonString, {
        forceLocal: SEConfig.save === "local"
      });

      console.log("SEApp: results saved successfully.");

      // ── 8. Completion screen ──
      showCompletionScreen(participantId);

    } catch (err) {
      // ── Error handling ──
      // The fail-closed snapshot loader (B2) writes its own dedicated
      // fail screen for SNAPSHOT_*/STRATEGY_*/SNAPSHOT_GROUP_EMPTY codes.
      // Don't overwrite that with a generic message — those screens carry
      // a specific reference code that researchers diagnose against.
      console.error("SEApp: fatal error during session.", err);
      var msg = err && err.message ? err.message : String(err);
      var isSnapshotFailure =
        msg.indexOf("SNAPSHOT_") === 0 ||
        msg.indexOf("STRATEGY_") === 0;
      if (isSnapshotFailure) {
        // Loader already rendered its fail screen; leave it in place.
        return;
      }
      SEUI.showMessage(
        "<h2>Something went wrong</h2>" +
        '<p style="max-width:500px; margin:12px auto; line-height:1.7;">' +
        "An error occurred during the experiment. " +
        "Please try refreshing the page. If the problem persists, " +
        "contact the researcher." +
        "</p>" +
        '<p style="color:#94a3b8; font-size:13px; margin-top:16px;">' +
        "Error: " + msg +
        "</p>",
        "error"
      );
    }
  }

  // ════════════════════════════════════════════════════
  // Completion screen
  // ════════════════════════════════════════════════════

  // showCompletionScreen(participantId) — Clears the app and shows a
  // "Thank you" message. If the participant came from Prolific (has a
  // PROLIFIC_PID), auto-redirects after 3 seconds.
  function showCompletionScreen(participantId) {
    SEUI.clearApp();
    var app = document.getElementById("app");

    // Thank you message
    var content = document.createElement("div");
    content.className = "se-tutorial-content";
    content.style.textAlign = "center";
    content.style.marginTop = "60px";

    var heading = document.createElement("h2");
    heading.textContent = "Thank you for participating!";
    content.appendChild(heading);

    var message = document.createElement("p");
    message.style.maxWidth = "500px";
    message.style.margin = "16px auto";
    message.style.lineHeight = "1.7";
    message.style.fontSize = "16px";
    message.style.color = "#475569";
    message.textContent = "Your responses have been saved successfully.";
    content.appendChild(message);

    // Prolific redirect (if applicable)
    if (SEConfig.PROLIFIC_PID) {
      var redirectMsg = document.createElement("p");
      redirectMsg.style.marginTop = "24px";
      redirectMsg.style.fontSize = "15px";
      redirectMsg.style.color = "#64748b";
      redirectMsg.textContent = "Redirecting to Prolific in 3 seconds...";
      content.appendChild(redirectMsg);

      // Also show a manual link in case the redirect fails
      var link = document.createElement("a");
      link.href = PROLIFIC_COMPLETION_URL;
      link.textContent = "Click here if not redirected automatically";
      link.style.display = "block";
      link.style.marginTop = "12px";
      link.style.fontSize = "14px";
      link.style.color = "#3b82f6";
      content.appendChild(link);

      // Auto-redirect after 3 seconds
      setTimeout(function () {
        window.location.href = PROLIFIC_COMPLETION_URL;
      }, 3000);
    }

    app.appendChild(content);

    console.log("SEApp: session complete.", { participantId: participantId });
  }

  // ════════════════════════════════════════════════════
  // Auto-start on DOMContentLoaded
  // ════════════════════════════════════════════════════

  // When the page finishes loading, automatically start the experiment.
  // This is the only side-effect in this module — everything else is
  // triggered from within start().
  document.addEventListener("DOMContentLoaded", function () {
    start();
  });

  // ── Public API ──
  return {
    start: start
  };
})();
