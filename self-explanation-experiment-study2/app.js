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

  // ── Fix 3: double-submit guard (design §10.7) ──
  // Prevents the save + completion block from running twice if start() is
  // somehow called concurrently or re-entered.
  var _saveStarted = false;

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
    "https://app.prolific.com/submissions/complete?cc=SE2_COMPLETE";

  // Prolific SCREENOUT URL — participants are redirected here when they fail
  // the comprehension check. The screenout cc is Prolific-generated per study
  // (each study gets a different opaque code like "C1H2IQ95"), passed via the
  // `screenoutCode` URL parameter that Prolific appends to the study URL.
  // Falls back to "SE2_SCREENOUT" for dev / smoke-test paths where no real
  // Prolific study is involved.
  function _getScreenoutCode() {
    var p = new URLSearchParams(window.location.search);
    return p.get("screenoutCode") || "SE2_SCREENOUT";
  }
  var PROLIFIC_SCREENOUT_URL =
    "https://app.prolific.com/submissions/complete?cc=" + _getScreenoutCode();

  // DataPipe experiment ID for SE study #2 production data. Routes
  // participant saves to OSF node 5dnrc (the dedicated SE study #2 component
  // under scuvk), separating production data from pilot/test data which
  // lived at scuvk root via the shared experiment id RWyWRsZqLgFu.
  // Set as an option on GallerySave.saveResults — defaults to the shared
  // id, so back-compat with rule-gallery study #1 saves is preserved.
  var DATAPIPE_EXPERIMENT_ID_SE_STUDY2 = "S7yzMl8WGZ4M";

  // ════════════════════════════════════════════════════
  // Screenout — comprehension-fail re-entry prevention
  // ════════════════════════════════════════════════════
  //
  // Three layers, defense in depth:
  //   1. SAVE partial data with screenedOut:true so we have evidence the
  //      participant attempted + failed (their PID + comprehension answers
  //      land on OSF/Worker for post-hoc review).
  //   2. REDIRECT to Prolific with cc=SE_SCREENOUT after a short countdown
  //      so Prolific closes the submission natively (this is the actual
  //      gate against re-entry).
  //   3. LocalStorage marker (PID-scoped) so even if the redirect is blocked
  //      or the participant force-closes the tab, a fresh boot from the same
  //      browser + same PID is caught and re-shown the screenout.

  function _screenoutKey() {
    var pid = (SEConfig && SEConfig.PROLIFIC_PID) || "anon";
    return "se_study2_screened_out:" + pid;
  }

  function _isAlreadyScreenedOut() {
    try { return localStorage.getItem(_screenoutKey()) === "true"; }
    catch (_e) { return false; }
  }

  function _markScreenedOut() {
    try { localStorage.setItem(_screenoutKey(), "true"); }
    catch (_e) {}
  }

  // Renders a screenout overlay + countdown + redirects to Prolific.
  // `reasonHTML` is the user-facing explanation (HTML allowed).
  // Skipped (no redirect) under test contexts so Playwright doesn't navigate
  // to prolific.com mid-spec.
  function _renderScreenoutAndRedirect(reasonHTML, redirectDelayMs) {
    var skipRedirect = (function () {
      try {
        var p = new URLSearchParams(window.location.search);
        if (p.get("skipScreenoutRedirect") === "1") return true;
      } catch (_e) {}
      if (navigator.webdriver) return true;
      return false;
    })();
    var delaySec = Math.max(1, Math.round((redirectDelayMs || 5000) / 1000));

    var app = document.getElementById("app");
    app.innerHTML =
      '<div style="max-width:560px;margin:80px auto;padding:36px;' +
      'background:#fff;border:1px solid #e2e8f0;border-radius:10px;' +
      'text-align:center;font-family:system-ui,sans-serif;color:#1e293b;">' +
      '<h2 style="margin:0 0 16px;color:#374151;">Thank you for your time</h2>' +
      '<div style="line-height:1.7;color:#475569;">' + reasonHTML + '</div>' +
      '<p id="se-screenout-countdown" style="margin-top:24px;color:#94a3b8;font-size:14px;">' +
      (skipRedirect
        ? '(dev mode: redirect skipped)'
        : 'Returning you to Prolific in ' + delaySec + 's...') +
      '</p></div>';

    if (skipRedirect) return;

    var remaining = delaySec;
    var countdown = document.getElementById("se-screenout-countdown");
    var tick = setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(tick);
        window.location.href = PROLIFIC_SCREENOUT_URL;
      } else if (countdown) {
        countdown.textContent = "Returning you to Prolific in " + remaining + "s...";
      }
    }, 1000);
  }

  // Saves a minimal screenout payload (PID + comprehension answers + reason)
  // through the standard save cascade, then renders the screenout overlay.
  // Marks localStorage so a refresh on the same PID is caught at boot.
  async function _handleComprehensionFailScreenout(sessionContext) {
    var ts = new Date().toISOString().replace(/[:.]/g, "-");
    var screenoutPayload = {
      experiment: "se_study2",
      experimentTag: "se_study2_v1",
      experimentVersion: EXPERIMENT_VERSION,
      samplingScheme: SAMPLING_SCHEME,
      snapshotId: (SEConfig && SEConfig.seSnapshot) || null,
      screenedOut: true,
      screenoutReason: "comprehension_failed",
      screenoutAt: new Date().toISOString(),
      comprehension: (typeof Study2Comprehension !== "undefined")
        ? Study2Comprehension.getData() : null,
      metadata: sessionContext.metadata || null
    };

    var filename =
      "se2_" + sessionContext.sessionId + "_" + ts + "_screenout.json";

    // Always mark localStorage FIRST — even if the save fails, the boot-time
    // check still catches refreshes.
    _markScreenedOut();

    try {
      var saveOptions = {
        forceLocal: SEConfig.save === "local",
        // Distinct subdir from regular saves so post-hoc analysis can find
        // screenouts at a glance without filtering all of results_gallery/study2/.
        workerDir: "results_gallery/study2/screenouts",
        // Route DataPipe → OSF to the dedicated SE study #2 component
        // (osf.io/5dnrc/), same destination as completed-session saves.
        datapipeExperimentId: DATAPIPE_EXPERIMENT_ID_SE_STUDY2
      };
      await GallerySave.saveResults(
        filename, JSON.stringify(screenoutPayload), saveOptions
      );
      console.log("SEApp: screenout partial data saved as " + filename);
    } catch (e) {
      console.warn("SEApp: screenout save failed (continuing to redirect):", e);
    }

    _renderScreenoutAndRedirect(
      "<p>Unfortunately you did not pass the comprehension check, so the " +
      "study cannot continue. You will not be penalized — your Prolific " +
      "submission will be returned to the queue or partially compensated " +
      "per the researcher's settings.</p>",
      5000
    );
  }

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
      var initConfig;
      if (SEConfig.isStudy2()) {
        // Study #2: extended cyborg-hunter config — tab-away threshold,
        // sidebar scoring, paste/drop collection, screenout disabled (pilot).
        initConfig = {
          participantId: pid,
          preset: "standard",
          thresholds: { tabAwayDurationMs: 10000 },
          scoring: { soft: { sidebarEvent: { weight: 1 } } },
          collectForPostHoc: { pasteDropContent: true },
          screenout: { enabled: false }
        };
      } else {
        // v2 lifecycle: minimal config
        initConfig = {
          participantId: pid,
          preset: "standard"
        };
      }
      var monitor = window.IntegrityMonitor.init(initConfig);
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
  // GuardFriction — fullscreen + AI-refusal active layer
  // ════════════════════════════════════════════════════

  // _renderFullscreenEntryGate() — Renders a one-click gate screen that
  // (a) requests fullscreen via the user's click gesture, then
  // (b) starts GuardFriction monitoring.
  // Returns a Promise resolving once the gate has been clicked (or skipped).
  //
  // Skip conditions (resolve immediately without any UI):
  //   - GuardFriction library missing (extension script failed to load)
  //   - URL `?gf=off` (manual override)
  //   - navigator.webdriver (Playwright/headless — would fight the overlay)
  //   - URL `?skipTutorial=1` (dev/test fast-path)
  //
  // Modes (via URL `?gf=`):
  //   - default (no param)  — strict: requests fullscreen + monitors all
  //   - `?gf=observe`        — observeOnly: monitor + log, no blocking overlay
  //   - `?gf=off`            — skip entirely
  function _gfShouldSkip() {
    if (!window.GuardFriction) return true;
    var p = new URLSearchParams(window.location.search);
    if (p.get("gf") === "off") return true;
    if (p.get("skipTutorial") === "1") return true;
    if (navigator.webdriver) return true;
    return false;
  }

  function _renderFullscreenEntryGate() {
    return new Promise(function (resolve) {
      if (_gfShouldSkip()) { resolve({ skipped: true }); return; }

      var observeOnly =
        (new URLSearchParams(window.location.search)).get("gf") === "observe";

      var app = document.getElementById("app");
      app.innerHTML =
        '<div style="max-width:640px; margin:80px auto; padding:32px; ' +
        'background:#fff; border:1px solid #e2e8f0; border-radius:10px; ' +
        'text-align:center; font-family:system-ui, sans-serif; color:#1e293b;">' +
        '<h2 style="margin:0 0 16px; font-size:20px;">Before you begin</h2>' +
        '<p style="line-height:1.6; margin:8px 0 24px;">' +
        'To keep the experiment fair for everyone, this study runs in ' +
        '<strong>fullscreen mode</strong>. Please close any browser sidebars, ' +
        'AI assistant tabs, or extension panels, then click below to enter ' +
        'fullscreen and start the tutorial.' +
        '</p>' +
        '<button id="se-gf-enter-btn" class="se-btn-continue" ' +
        'style="font-size:15px; padding:12px 28px;">' +
        'Enter fullscreen and begin' +
        '</button>' +
        '<p style="font-size:12px; color:#64748b; margin:20px 0 0;">' +
        'You can exit fullscreen at any time by pressing Esc, but doing so ' +
        'mid-experiment will pause the session until you return to fullscreen.' +
        '</p></div>';

      var btn = document.getElementById("se-gf-enter-btn");
      btn.addEventListener("click", function () {
        // Within the user gesture: request fullscreen FIRST so the browser
        // accepts the call. Then start monitoring (after a short delay so
        // fullscreen-entry events have settled before baseline capture).
        try { window.GuardFriction.requestFullscreen(); } catch (_e) {}

        // Subscribe to violations BEFORE start() so we capture every event
        // from t=0. Buffer them on window — read into the payload at save.
        window._guardFrictionViolations = [];
        try {
          window.GuardFriction.onViolation(function (v) {
            window._guardFrictionViolations.push({
              phase: v.phase,
              reason: v.reason,
              t: v.t,
              duration: v.duration || null
            });
          });
        } catch (_e) {}

        setTimeout(function () {
          try {
            var token = window.GuardFriction.start({
              observeOnly: observeOnly,
              debug: false
            });
            window._guardFrictionToken = token;
            console.log("[GuardFriction] active. observeOnly=" + observeOnly);
          } catch (e) {
            console.warn("[GuardFriction] start() failed:", e);
          }
          resolve({ skipped: false, observeOnly: observeOnly });
        }, 150);
      });
    });
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
    // Wipe consent cache too — without this, ?clear=1 doesn't truly reset
    // the participant flow (consent screen would auto-skip).
    if (typeof Study2Consent !== "undefined" && typeof Study2Consent.clear === "function") {
      Study2Consent.clear();
    }
    [localStorage, sessionStorage].forEach(function (store) {
      // Iterate keys in reverse so removeItem during iteration is safe.
      for (var i = store.length - 1; i >= 0; i--) {
        var k = store.key(i);
        if (k && (k.indexOf("se_group_") === 0
                  || k.indexOf("se_study2_screened_out") === 0)) {
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

      // ── 0bis. AI refusal notices (GuardFriction) ──
      // Adds meta tags + invisible alert region + DOM-walker markers that
      // signal to AI agents reading the page (sidebar LLMs, browser-control
      // agents, screen-reader-style scrapers) that they must not assist.
      // Cheap, side-effect-free, runs even when fullscreen enforcement is
      // off — orthogonal layer.
      //
      // Gated:
      //   - Library missing (e.g. extension script failed to load) — skip silently
      //   - URL param `?gf=off` — opt-out for manual dev/testing
      //   - navigator.webdriver true (Playwright) — skip so tests don't fight
      //     the GuardFriction overlay
      try {
        var _gfMode = (new URLSearchParams(window.location.search)).get("gf");
        var _gfDisabled = _gfMode === "off" || navigator.webdriver;
        if (window.GuardFriction && !_gfDisabled) {
          window.GuardFriction.injectRefusalNotices();
        }
      } catch (_e) { /* no-op */ }

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

      // ── 0b.5 Boot-time screenout check ──
      // If this PID was screened out on a previous attempt in this browser,
      // immediately re-show the screenout overlay + redirect. This is the
      // belt-and-suspenders layer behind Prolific's native submission close.
      // Skips under test contexts (navigator.webdriver), and the user can
      // override via ?clear=1 (which clears the marker via handleClearParam).
      if (SEConfig.isStudy2()
          && !navigator.webdriver
          && _isAlreadyScreenedOut()) {
        console.log("SEApp: previous screenout detected for this PID — blocking re-entry.");
        _renderScreenoutAndRedirect(
          "<p>Our records indicate you previously attempted this study and " +
          "were not able to continue. Returning you to Prolific.</p>",
          4000
        );
        return;
      }

      // ── 0c. Boot-time param validation (design §10.7) ──
      //
      // STUDY2_PARAM_MISSING: detect a misconfigured study #2 launch where a
      // clearly-study-#2 signal is present but ?study2=1 was forgotten.
      // Conservative signal: condition === "explain" is only valid in study #2
      // and is not a valid v2 condition, so it is an unambiguous indicator.
      // We do NOT trigger on ruleScope alone since ruleScope defaults to
      // "all10" in v2 URLs as well, which would false-positive real v2 sessions.
      if (!SEConfig.isStudy2() && SEConfig.condition === "explain") {
        SESnapshotLoader.showFailScreen(
          "STUDY2_PARAM_MISSING",
          "This study link is missing the ?study2=1 setting — please contact the researcher."
        );
        return;
      }

      // Study #2 condition validation (fail-closed):
      if (SEConfig.isStudy2()) {
        var STUDY2_VALID_CONDITIONS = ["silent", "explain"];
        if (STUDY2_VALID_CONDITIONS.indexOf(SEConfig.condition) === -1) {
          SESnapshotLoader.showFailScreen(
            "BAD_CONDITION_PARAM",
            "The study link is missing or has an invalid condition setting."
          );
          return;
        }

        var STUDY2_VALID_RULESCOPES = ["all10", "group"];
        if (STUDY2_VALID_RULESCOPES.indexOf(SEConfig.ruleScope) === -1) {
          SESnapshotLoader.showFailScreen(
            "BAD_RULESCOPE_PARAM",
            "The study link has an invalid rule-scope setting."
          );
          return;
        }
      }

      // ── 0d. Consent (study #2 only) ──
      // Stanford/CICL consent overlay (ported from rule-gallery). Runs AFTER
      // URL param validation (so a misconfigured launch fails fast without
      // making the participant read consent) but BEFORE session metadata
      // generation (so a participant who closes the consent screen leaves
      // no sessionId / startTime behind). Skips in:
      //   - non-study-2 mode (v2 lifecycle has its own consent path)
      //   - ?skipTutorial=1 (test fast-path)
      //   - navigator.webdriver (Playwright)
      //   - localStorage cache hit (browser already consented this study)
      //     — handled inside Study2Consent.run() itself.
      var consentResult = null;
      var consentSkipParam = (new URLSearchParams(window.location.search)).get("skipTutorial") === "1";
      if (SEConfig.isStudy2()
          && typeof Study2Consent !== "undefined"
          && !consentSkipParam
          && !navigator.webdriver) {
        consentResult = await Study2Consent.run();
      }

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
        consent: consentResult                  // {consentedAt, cached} or null
          ? {
              consentedAt: consentResult.consentedAt,
              cached: !!consentResult.cached     // true → consent was granted in a prior session this browser
            }
          : null,
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

      // ── Study #2 vs v2 routing ──
      // buildV3 routes on the URL signal (?study2=1) set before the snapshot
      // loads; the loader then also sets studyMode=true (harmless double-set).
      var curriculum = SEConfig.isStudy2()
        ? await SECurriculum.buildV3()
        : await SECurriculum.build();

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

      // ── Study #2 metadata additions ──
      if (SEConfig.isStudy2()) {
        metadata.ruleScope = curriculum.ruleScope || SEConfig.ruleScope || null;
        metadata.group = curriculum.group || null;
        metadata.studyMode = true;
        metadata.roundtableRunId = window.SE_ROUNDTABLE_RUN_ID || null;
        metadata.roundtableEnabled = !!window.SE_ROUNDTABLE_RUN_ID;
        // Rule-presentation order: the per-PID-shuffled array of 10 rule_ids
        // in the order they were presented to this participant. Pre-reg
        // specifies "uniformly random rule order per participant" — the
        // ruleOrder field is the auditable artifact of that shuffle.
        metadata.ruleOrder = Array.isArray(curriculum.ruleOrder) ? curriculum.ruleOrder.slice() : null;
        metadata.exemplarOrders = {};
        for (var i = 0; i < curriculum.rules.length; i++) {
          var r = curriculum.rules[i];
          if (r.exemplarPermutation) {
            metadata.exemplarOrders[r.id || r.rule_id || r.ruleId] = r.exemplarPermutation;
          }
        }
      }

      console.log("SEApp: curriculum built.", {
        rules: metadata.curriculum,
        seSnapshotId: metadata.seSnapshotId,
        groupAssignment: metadata.groupAssignment,
      });

      // ── 4. Tutorial ──
      // v2: no separate practice round — instruction screens + a mic test
      // on a real card. SETutorial.run() ignores its argument; we pass
      // null explicitly to document that the practice rule is gone.
      // Study #2: the tutorial variant skips the mic test (typed-only).
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

      // ── 4b. Comprehension check (study #2 only) ──
      // Runs after the woven tutorial (which now includes the practice
      // round inline as polished slides — see SETutorial.runStudy2). By this
      // point participants have classified two practice hands and seen
      // feedback, so they meet the comprehension check having already used
      // the full UI. onPass continues the session; onFail shows a screen-out
      // message and throws COMPREHENSION_FAILED to halt the session cleanly.
      if (SEConfig.isStudy2()) {
        await new Promise(function (resolve, reject) {
          Study2Comprehension.start(
            function onPass() { resolve(); },
            function onFail() {
              // Three-layer screenout:
              //   1. Save partial data (PID + comprehension answers) so we
              //      have evidence + can build the Prolific blocklist
              //      post-hoc.
              //   2. Set localStorage marker so a browser refresh on the
              //      same PID is caught at boot.
              //   3. Render overlay + redirect to Prolific with cc=SE_SCREENOUT
              //      so Prolific closes the submission natively (the actual
              //      gate against re-claim).
              // Fire-and-forget — the redirect handles user-facing UX,
              // and we throw to halt the outer flow.
              _handleComprehensionFailScreenout({
                sessionId: sessionId,
                metadata: metadata
              });
              reject(new Error("COMPREHENSION_FAILED"));
            }
          );
        });
      }

      // ── 4c. Fullscreen entry gate (GuardFriction) ──
      // Renders a one-click screen whose click both enters fullscreen and
      // boots GuardFriction monitoring. Lives AFTER the comprehension check
      // by design: participants only meet the integrity layer once they've
      // demonstrated they understood the task, so attrition at the gate
      // doesn't mix with attrition for the wrong reasons. Click is the
      // user-gesture that lets requestFullscreen succeed. Silently skips
      // in test contexts (navigator.webdriver, ?skipTutorial=1, ?gf=off).
      await _renderFullscreenEntryGate();

      // ── 5. Main experiment ──
      // Loop through each rule in the curriculum sequentially. Each call
      // to SEGame.start() runs the full gallery + classification flow for
      // one rule and returns { trials, audioSegments, ruleWriteup }.
      // Phase 4 chunk 7: ruleWriteup is the typed rule articulation captured
      // immediately after the last classification trial of each rule —
      // primary rule-inference DV, comparable to the rule-gallery pilot.
      //
      // Study #2 additions:
      //   - gameResult also carries postGalleryGuess and galleryStudyMs.
      //   - For ruleScope=all10, a block-rest screen fires after rule 5.
      var allTrials = [];
      var allAudioSegments = [];
      var allRuleWriteups = [];
      // Study #2 per-rule accumulators
      var allPostGalleryGuesses = [];
      var allGalleryStudyMs = [];

      var totalRules = curriculum.rules.length;
      var blockRestDone = false;  // guard: only one block-rest for all10

      for (var i = 0; i < totalRules; i++) {
        var ruleData = curriculum.rules[i];
        var rulePosition = i + 1; // 1-based position

        console.log(
          "SEApp: starting rule " + rulePosition + "/" + totalRules +
          " (" + ruleData.ruleId + ")"
        );

        // R6/6.1: pass the curriculum's actual length so the progress
        // bar and per-rule heading reflect what's really running, not
        // SEConfig.nRules (which may be tampered or trimmed).
        var gameResult = await SEGame.start(
          ruleData, rulePosition, totalRules
        );

        // Accumulate trials and the per-rule typed writeup.
        allTrials = allTrials.concat(gameResult.trials);
        // gameResult.audioSegments comes from SEAudio.getSegments(), which
        // is CUMULATIVE across the whole session — every rule returns the
        // full list to-date. Replacing (not concatenating) avoids the
        // duplicate-segment bug where rule 1's mic-test would appear N
        // times after N rules. (The same fix applies to the recap step
        // below.)
        // Study #2: startStudy2 doesn't return audioSegments (no audio);
        // guard so allAudioSegments stays [] rather than becoming undefined.
        if (gameResult.audioSegments !== undefined) {
          allAudioSegments = gameResult.audioSegments;
        }
        if (gameResult.ruleWriteup) {
          allRuleWriteups.push(gameResult.ruleWriteup);
        }

        // Study #2: collect per-rule post-gallery guess and gallery study time.
        if (SEConfig.isStudy2()) {
          allPostGalleryGuesses.push(gameResult.postGalleryGuess || null);
          allGalleryStudyMs.push(
            typeof gameResult.galleryStudyMs === "number" ? gameResult.galleryStudyMs : null
          );
        }

        // ── Rule-transition / block-rest (C2 / study #2) ──
        if (rulePosition < totalRules) {
          if (SEConfig.isStudy2()) {
            // Study #2 all10: insert a block-rest screen at the boundary
            // between the two blocks of 5 (after rule 5, before rule 6).
            // For group (5 rules) there is no block boundary — no rest screen.
            var isAll10 = (SEConfig.ruleScope === "all10" || curriculum.ruleScope === "all10");
            var isBlockBoundary = isAll10 && rulePosition === 5 && !blockRestDone;
            if (isBlockBoundary) {
              blockRestDone = true;
              SEUI.clearApp();
              await SEUI.renderBlockRest(document.getElementById("app"), {});
            } else {
              // Brief auto-advance rule-transition buffer between rules
              SEUI.clearApp();
              await SEUI.renderRuleTransitionBuffer(
                document.getElementById("app"),
                rulePosition,
                totalRules
              );
            }
          } else {
            // v2 path: ~1.5 s "Game N of M complete / Next game" between rules.
            // Don't show after the last rule — the bulk articulation phase follows.
            SEUI.clearApp();
            await SEUI.renderRuleTransitionBuffer(
              document.getElementById("app"),
              rulePosition,
              totalRules
            );
          }
        }
      }

      console.log(
        "SEApp: all games complete. " +
        allTrials.length + " trials, " +
        allAudioSegments.length + " audio segments, " +
        allRuleWriteups.length + " rule writeups."
      );

      // ── 5b. Phase C: end-of-curriculum typed phase ──
      // Study #2: skip bulk articulation entirely; run the end re-query instead.
      // v2:       run the original bulk articulation + synthesis screens.

      // Accumulated end re-query guesses (study #2 only; empty for v2).
      var endRequeryGuesses = [];

      // v2 bulk articulation accumulators (empty for study #2).
      var endOfCurriculumWriteups = [];
      var endOfCurriculumSynthesis = null;
      var bulkErrors = [];

      if (SEConfig.isStudy2()) {
        // ── Study #2: end re-query ──
        // For each rule id in curriculum.endRequeryRuleIds, find the RuleData,
        // show a brief transition message, then renderRuleQuery.
        var endRequeryIds = curriculum.endRequeryRuleIds || [];

        // Brief transition: "Almost done — a couple of the trickier rules again"
        if (endRequeryIds.length > 0) {
          SEUI.clearApp();
          var transitionApp = document.getElementById("app");
          var transitionWrapper = document.createElement("div");
          transitionWrapper.className = "se-message se-animate-in";
          transitionWrapper.style.cssText = "max-width:520px;margin:80px auto;text-align:center;";

          var transitionHeading = document.createElement("h2");
          transitionHeading.textContent = "Almost done!"; /* COPY */
          transitionWrapper.appendChild(transitionHeading);

          var transitionBody = document.createElement("p");
          transitionBody.style.cssText = "color:#475569;line-height:1.7;";
          transitionBody.textContent =
            "We’d like to revisit a couple of the trickier rules from earlier. " +
            "You’ll see the winning hands again and we’ll ask for your " +
            "best guess at the rule."; /* COPY */
          transitionWrapper.appendChild(transitionBody);

          // Silent participants haven't typed before; introduce the text box.
          if (SEConfig.isSilent()) {
            var silentNote = document.createElement("p");
            silentNote.style.cssText = "color:#64748b;font-size:14px;margin-top:12px;";
            silentNote.textContent =
              "Please type your answer in the text box that appears on the next screen."; /* COPY */
            transitionWrapper.appendChild(silentNote);
          }

          var transitionBtn = document.createElement("button");
          transitionBtn.className = "se-btn-continue";
          transitionBtn.textContent = "Continue"; /* COPY */
          transitionBtn.style.marginTop = "24px";
          transitionWrapper.appendChild(transitionBtn);
          transitionApp.appendChild(transitionWrapper);

          await new Promise(function (resolve) {
            transitionBtn.addEventListener("click", resolve);
          });
        }

        // ── Per-rule end re-query ──
        var STUDY2_RULE_PROMPT_END =
          "In your own words, what do you think the rule is? " +
          "Describe what makes a hand a winning hand."; /* COPY */

        for (var ei = 0; ei < endRequeryIds.length; ei++) {
          var erRuleId = endRequeryIds[ei];
          // Find the RuleData for this rule id in curriculum.rules
          var erRuleData = null;
          for (var ri = 0; ri < curriculum.rules.length; ri++) {
            if (curriculum.rules[ri].ruleId === erRuleId) {
              erRuleData = curriculum.rules[ri];
              break;
            }
          }
          if (!erRuleData) {
            console.warn("SEApp: end re-query rule not found in curriculum:", erRuleId);
            endRequeryGuesses.push({
              ruleId: erRuleId,
              response: null,
              rt: null,
              error: "rule_not_found_in_curriculum"
            });
            continue;
          }

          SEUI.clearApp();
          var erApp = document.getElementById("app");
          var erResult = await SEUI.renderRuleQuery(
            erRuleData.exemplarHands,
            erApp,
            {
              promptText: STUDY2_RULE_PROMPT_END,
              promptType: "end_requery"
            }
          );
          endRequeryGuesses.push({
            ruleId: erRuleId,
            response: erResult.response,
            rt: erResult.rt
          });
        }

        console.log(
          "SEApp: study #2 end re-query complete. " +
          endRequeryGuesses.length + " guesses."
        );

      } else {
        // ── v2: End-of-curriculum bulk articulation (C3 + C7) ──
        // SOLE typed DV in v2: each rule's frozen 6-card gallery, in
        // chronological order, with a typed prompt. Per design §3.2.
        //
        // R2/2.1: try/catch EACH iteration so a single rejected screen
        // does not discard every previously-collected writeup + all
        // classification trials + all audio. The bulk articulation is
        // the most fragile screen and guards the most expensive data.
        // On error, push a placeholder and continue; surface a recap
        // notice but keep the session alive long enough to save.
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
      }

      // ── 6. Recap ──
      // Strategy report + demographics. (Phase 4 chunk 7 also dropped the
      // per-rule voice recap from this step. v2: the typed bulk articulation
      // above replaces both per-round writeup AND per-rule voice recap.)
      var recapResult = await SERecap.run(curriculum);

      // Collect any audio segments recorded during recap. SEAudio
      // accumulates segments across the whole session; just take the
      // current cumulative snapshot. (Same pattern as the per-rule loop —
      // see the comment there.)
      // Study #2 is fully typed — no audio is expected, but we still
      // snapshot so the field is present and consistent.
      allAudioSegments = SEAudio.getSegments();

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
      //
      // Study #2 additions:
      //   - postGalleryGuesses: per-rule post-gallery guesses (explain only)
      //   - endRequeryGuesses: end-of-curriculum re-query guesses
      //   - galleryStudyMs: per-rule gallery study time (ms)
      //   - per-trial integrityTrial: cyborg-hunter per-trial report
      //     (already attached on each trial record from runStudy2Trial)
      //   - metadata: condition, ruleScope, group, studyMode (added above)
      var payload = {
        // v2 schema versioning (constants at top of file, Issue 8)
        experimentVersion: EXPERIMENT_VERSION,
        samplingScheme: SAMPLING_SCHEME,
        metadata: metadata,
        trials: allTrials,
        audioSegments: allAudioSegments,
        ruleWriteups: allRuleWriteups,                       // empty in v2
        endOfCurriculumWriteups: endOfCurriculumWriteups,    // C3 + C7 (empty in study #2)
        endOfCurriculumSynthesis: endOfCurriculumSynthesis,  // C4 (null in study #2)
        bulkErrors: bulkErrors,                              // R2/2.1 — per-rule failures (empty array if all OK)
        recap: {
          strategy: recapResult.strategy,
          demographics: recapResult.demographics
        }
      };

      // ── Study #2 payload fields ──
      if (SEConfig.isStudy2()) {
        payload.postGalleryGuesses = allPostGalleryGuesses;
        payload.endRequeryGuesses = endRequeryGuesses;
        payload.galleryStudyMs = allGalleryStudyMs;
        payload.comprehension = (typeof Study2Comprehension !== "undefined")
          ? Study2Comprehension.getData() : null;

        // Experiment-identity tags. The integer `experimentVersion` above
        // is bumped within a study line; this string tag identifies the
        // study line itself, so saved files in card-games-staging never
        // get confused with study #1's stream. The snapshot id pins the
        // exact stimuli set used.
        payload.experiment = "se_study2";
        payload.experimentTag = "se_study2_v1";
        payload.snapshotId = SEConfig.seSnapshot || null;
      }

      // R4/4.2: payload is built. The rest of the flow (save → completion)
      // shouldn't trigger the leave-the-page guard. Drop it now so the
      // Prolific redirect at the end doesn't fire a browser warning.
      unloadGuardActive = false;
      window.removeEventListener("beforeunload", _beforeUnloadHandler);

      // ── Fix 3: double-submit guard (design §10.7) ──
      // Guard against the save + completion block executing twice (e.g. if
      // start() is called concurrently). The flag is set at module scope so
      // it persists across invocations.
      if (_saveStarted) {
        console.warn("SEApp: save already in progress — ignoring duplicate call.");
        return;
      }
      _saveStarted = true;

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
      // Study #2 uses an `se2_` prefix so its files in the staging repo are
      // visually distinguishable from study #1's `se_*` files and cannot
      // collide on filename (millisecond timestamp also guarantees uniqueness).
      var filenamePrefix = SEConfig.isStudy2() ? "se2_" : "se_";
      var filename = filenamePrefix + sessionId + "_" + timestamp + ".json";

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
      //
      // We write it in two places:
      //   - payload.cyborgHunter            — SE-native convention (kept for
      //     backward compat with any analysis code already reading it).
      //   - payload.metadata.integritySession + integrityScore — the documented
      //     card-games convention that cyborg-hunter's CLI report (`npx
      //     cyborg-hunter report`) looks for first. With both, the CLI ingests
      //     the data without warnings, no adapter needed.
      if (window._integrityMonitor &&
          typeof window._integrityMonitor.getSessionReport === "function") {
        try {
          var sessionReport = window._integrityMonitor.getSessionReport();
          payload.cyborgHunter = sessionReport;
          payload.metadata.integritySession = sessionReport;
          payload.metadata.integrityScore = {
            softScore: sessionReport.softScore,
            softScoreThreshold: sessionReport.softScoreThreshold,
            hardScore: sessionReport.hardScore,
            anyHardTriggered: sessionReport.anyHardTriggered
          };
        } catch (e) {
          console.warn("cyborg-hunter getSessionReport failed:", e);
        }
        try { window._integrityMonitor.destroy(); } catch (_e) {}
      }

      // ── GuardFriction → payload + stop ──
      // Captures the violation log (every fullscreen-exit, tab-hide,
      // window-blur, sidebar-open event during the session) and the final
      // GuardFriction state. Silently no-ops when GuardFriction was skipped
      // (test contexts, ?gf=off).
      if (window.GuardFriction && window._guardFrictionToken) {
        try {
          payload.guardFriction = {
            violations: window._guardFrictionViolations || [],
            finalState: window.GuardFriction.getCurrentState()
          };
        } catch (e) {
          console.warn("GuardFriction report capture failed:", e);
        }
        try {
          window.GuardFriction.stop(window._guardFrictionToken);
        } catch (_e) {}
      }

      var jsonString = JSON.stringify(payload);
      // Study #2 writes to a namespaced subdir of card-games-staging so its
      // files don't mix with study #1's stream at results_gallery/. Also
      // routes DataPipe → OSF to the dedicated study #2 component
      // (osf.io/5dnrc/) via the SE-specific DataPipe experiment id.
      var saveOptions = { forceLocal: SEConfig.save === "local" };
      if (SEConfig.isStudy2()) {
        saveOptions.workerDir = "results_gallery/study2";
        saveOptions.datapipeExperimentId = DATAPIPE_EXPERIMENT_ID_SE_STUDY2;
      }
      await GallerySave.saveResults(filename, jsonString, saveOptions);

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
      // COMPREHENSION_FAILED: the screen-out message was already shown by
      // the onFail handler in the 4c block above — leave it in place.
      var isComprehensionFailure = msg === "COMPREHENSION_FAILED";
      if (isSnapshotFailure || isComprehensionFailure) {
        // Loader / comprehension handler already rendered its screen; leave it.
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
