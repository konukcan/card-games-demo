// self-explanation-experiment/game.js
// Single-rule game flow orchestrator for the self-explanation experiment.
//
// Coordinates the full flow for one rule in the curriculum:
//   1. Gallery phase — study exemplar winning hands with a countdown timer
//   2. Post-gallery prompt — condition-dependent recording (if applicable)
//   3. Classification phase — trial-by-trial hand classification with
//      condition-dependent prompts, feedback, and checkpoint screens
//
// Classification phase uses a two-column layout:
//   - Main column (left): compact gallery, focal hand, prompt/recording, buttons
//   - History column (right): classified hands stacking vertically
//   The layout is set up ONCE; individual trials update only the focal/prompt/button areas.
//
// Depends on:
//   window.SEConfig        — experiment parameters and condition helpers
//   window.SEUI            — all rendering functions
//   window.SEAudio         — hold-to-record audio recording
//   window.SEHandSelector  — dual-stack coin-flip hand selection
//
// Exported as window.SEGame.

window.SEGame = (function () {
  "use strict";

  // ════════════════════════════════════════════════════
  // Utility helpers
  // ════════════════════════════════════════════════════

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  // _buildStimulusMetadata(selection, ruleData) — Issue 4 option C.
  //
  // Per-trial provenance block. Replaces the legacy
  // strategyScore / strategyMethod / strategyVariant per-trial fields.
  // null for fields that don't apply to the current strategy:
  //   A_entropy:                   entropy_bits + p_accept_emp populated
  //   B_misclass:                  misclass_score + p_accept_emp populated
  //   C_flip_from_random_winning:  edit metadata on losers, others null
  //   D_flip_from_exemplars:       edit_depth + source_exemplar_idx on every hand
  function _buildStimulusMetadata(selection, ruleData) {
    return {
      strategy:            ruleData.adversarialStrategy,
      ground_truth:        selection.groundTruth,
      p_accept_emp:        selection.pAcceptEmp,
      entropy_bits:        selection.entropyBits,
      misclass_score:      selection.misclassScore,
      edit_depth:          selection.editDepth,
      edit_description:    selection.editDescription,
      source_exemplar_idx: selection.sourceExemplarIdx,
      source_hand:         selection.sourceHand,
      score_basis:         selection.scoreBasis,
    };
  }

  // ════════════════════════════════════════════════════
  // Prompt text builders
  // ════════════════════════════════════════════════════

  function getPreClassificationPrompt() {
    if (SEConfig.isDescribe()) {
      return "Describe at least " + SEConfig.describeMinCards +
        " cards you see (any hands).";
    }
    if (SEConfig.isToken()) {
      // Counterfactual framing applies whether or not the multi-card
      // selection affordance is enabled (see SEConfig.hasCardSelection).
      // The literal "losing/winning" slash form is intentional — the
      // recording fires before classification, so we don't yet know
      // which direction the participant will commit to. The slash keeps
      // both options visible.
      return "Do you think this is a winning or losing hand? " +
        "Which cards would have to change to make it losing/winning instead?";
    }
    // Peer condition has its own prompt rendered as part of its custom
    // trial flow; silent / type at non-checkpoint trials get no prompt.
    return null;
  }

  // Prompt shown during the per-trial recording in the peer condition.
  // Frames the trial as judging the peer's verdict rather than classifying
  // the hand directly — a different cognitive move than `token`. The
  // agree/disagree commitment is folded into the verbal response so the
  // recording captures both the judgment and its justification.
  function getPeerPrompt() {
    return "Do you agree with their judgment, and how would you explain it? " +
      "What about the hand do you think led them to this decision?";
  }

  function getCheckpointPrompt() {
    return "What is your current best guess as to what makes a hand winning?";
  }

  // ════════════════════════════════════════════════════
  // Spacebar toggle-record flow
  // ════════════════════════════════════════════════════

  // waitForRecording(promptText, meta, container) — Standalone recording
  // flow used for checkpoints, post-gallery describe prompts, recap.
  //
  // 2026-05-09 unification: now uses the same rich widget as
  // attachRecordingToPromptBox (token / per-trial recording) — live
  // waveform during recording, "✓ Recorded — Replay" widget after stop.
  // Previously rendered a plain .se-recording-indicator with no waveform
  // and no post-stop replay; participants couldn't tell if the recording
  // captured anything.
  //
  // Toggle mechanism: press Space to start, press Space again to stop.
  // Min-duration gate retained on the explicit-stop path. Continue button
  // enables as soon as a valid recording exists.
  function waitForRecording(promptText, meta, container) {
    return new Promise(function (resolve) {
      var widget = SEUI.renderPromptRecordingBox(promptText, container);
      var box = widget.box;
      var continueBtn = SEUI.renderContinueButton(onContinue, container);

      var segment = null;
      var rafId = null;

      function updateLoop() {
        if (SEAudio.isRecording()) {
          SEUI.updatePromptRecordingBox(box, true, SEAudio.getElapsedMs(), SEAudio.meetsMinDuration());
          rafId = requestAnimationFrame(updateLoop);
        }
      }

      function startRecording() {
        // Re-record from a recorded state: clear the recorded UI so the
        // box flips back to recording. updatePromptRecordingBox handles
        // the transition on the next frame; we just need to drop the
        // .recorded class so the waveform canvas is visible again.
        box.classList.remove("recorded");
        SEAudio.startRecording(meta);
        rafId = requestAnimationFrame(updateLoop);
      }

      function stopRecording() {
        if (!SEAudio.isRecording()) return;
        if (!SEAudio.meetsMinDuration()) {
          // Below min — keep recording. updatePromptRecordingBox already
          // shows "Keep going — minimum 2 seconds." via flashStatus
          // semantics in attachRecordingToPromptBox; here we just hint
          // in the console and rely on the rich widget's own status copy.
          console.log("SEGame: keep going — below 2s minimum.");
          return;
        }
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        SEAudio.stopRecording().then(function (seg) {
          // showRecordedSegment switches the box to the "recorded" state
          // with a Replay button — the same UX as token / per-trial.
          SEUI.showRecordedSegment(box, seg);
          segment = seg;
          continueBtn.disabled = false;
        });
      }

      function onKeyDown(e) {
        if (e.code === "Space" && !e.repeat) {
          // Don't intercept Space if focus is on the Replay button (or
          // anything inside the recorded-state UI) — the user might be
          // trying to play back, not toggle recording.
          if (e.target && e.target.classList &&
              e.target.classList.contains("se-rec-replay")) {
            return;
          }
          e.preventDefault();
          if (SEAudio.isRecording()) {
            stopRecording();
          } else {
            startRecording();
          }
        }
      }

      function onContinue() {
        // If recording is still active when participant clicks Continue,
        // force-stop and capture whatever's there (parallel to the
        // classification auto-interrupt in attachRecordingToPromptBox).
        var done = function () {
          document.removeEventListener("keydown", onKeyDown);
          if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
          resolve(segment);
        };
        if (SEAudio.isRecording()) {
          if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
          SEAudio.stopRecording().then(function (seg) {
            SEUI.updatePromptRecordingBox(box, false, 0, false);
            segment = seg;
            done();
          });
        } else {
          done();
        }
      }

      document.addEventListener("keydown", onKeyDown);
    });
  }

  // attachRecordingToPromptBox(meta, box, btns, opts) — Attaches spacebar
  // toggle-record behaviour using the integrated prompt+recording box.
  //
  // Mechanism (Phase 4 chunk 5): press Space to start recording, press Space
  // again to stop. Buttons enable as soon as recording starts (so the user
  // can advance any time). Clicking a Win/Lose button while recording
  // auto-interrupts: stops the recording (no min-duration check at that
  // path, since the user is choosing to advance), captures whatever was
  // said, and resolves.
  //
  // Min duration (2s by default) only gates the explicit "press Space to
  // stop" path: pressing Space too early shows a hint and keeps recording.
  //
  // opts (optional):
  //   canStart()         : function returning bool — recording cannot begin
  //                        unless this returns true. On a blocked attempt
  //                        we briefly shake the box and warn in the status text.
  //   onRecordingStart() : function called when recording actually begins
  //                        (used to lock card selection in token conditions).
  function attachRecordingToPromptBox(meta, box, btns, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var segment = null;
      var rafId = null;
      var gateRevertTimer = null;
      var resolved = false;

      function updateLoop() {
        if (SEAudio.isRecording()) {
          SEUI.updatePromptRecordingBox(box, true, SEAudio.getElapsedMs(), SEAudio.meetsMinDuration());
          rafId = requestAnimationFrame(updateLoop);
        }
      }

      function flashStatus(message, durationMs) {
        // Reusable status flash. Replaces the rec-status text with a warning
        // for `durationMs`, shakes the box, then reverts.
        var status = box.querySelector("[data-role='status']");
        var origStatus = status ? status.textContent : null;
        var origClass = status ? status.className : null;
        if (status) {
          status.textContent = message;
          status.classList.add("se-gate-warn");
        }
        box.classList.add("se-gate-fail");
        if (gateRevertTimer) clearTimeout(gateRevertTimer);
        gateRevertTimer = setTimeout(function () {
          box.classList.remove("se-gate-fail");
          if (status && origStatus !== null) {
            // If recording is now active, let updateLoop set the correct text
            // next frame; otherwise restore the idle text.
            if (!SEAudio.isRecording()) {
              status.textContent = origStatus;
              status.className = origClass || "se-rec-status";
            } else {
              status.classList.remove("se-gate-warn");
            }
          }
        }, durationMs || 1800);
      }

      function startRecording() {
        // Selection gate (token conditions): require ≥1 selected card
        if (typeof opts.canStart === "function" && !opts.canStart()) {
          flashStatus("Select at least one card first.");
          return false;
        }
        // Lock card selection (token conditions) before recording starts
        if (typeof opts.onRecordingStart === "function") {
          opts.onRecordingStart();
        }
        SEAudio.startRecording(meta);
        rafId = requestAnimationFrame(updateLoop);
        // Buttons enable as soon as recording starts — user can interrupt
        // and classify whenever they want.
        SEUI.setButtonsEnabled(btns, true);
        return true;
      }

      function stopRecording(opts2) {
        // opts2.force (bool) — if true, stop regardless of min duration
        // (used by classification-click auto-interrupt). Otherwise, respect
        // the min-duration gate and flash a hint if too short.
        opts2 = opts2 || {};
        if (!SEAudio.isRecording()) return Promise.resolve(null);
        var metMin = SEAudio.meetsMinDuration();
        if (!metMin && !opts2.force) {
          flashStatus("Keep going — minimum 2 seconds.");
          return Promise.resolve(null);
        }
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        return SEAudio.stopRecording().then(function (seg) {
          // Visual update after stop:
          //   • Manual stop (toggle Space again) → show the "✓ Recorded · Replay"
          //     widget so the participant has a clear cue and can verify capture.
          //   • Force stop (auto-interrupt on classify click) → just clear the
          //     recording state; the next trial is about to repaint anyway.
          if (opts2.force) {
            SEUI.updatePromptRecordingBox(box, false, 0, false);
          } else {
            SEUI.showRecordedSegment(box, seg);
          }
          // Always keep the segment regardless of min-duration so analysis
          // can see what was attempted.
          segment = seg;
          if (!resolved) {
            resolved = true;
            resolve(segment);
          }
          return segment;
        });
      }

      function onKeyDown(e) {
        if (e.code === "Space" && !e.repeat) {
          e.preventDefault();
          if (SEAudio.isRecording()) {
            // Toggle off — respect min duration
            stopRecording();
          } else {
            startRecording();
          }
        }
      }

      // Auto-interrupt when classification button is clicked
      btns._stopRecordingIfActive = function () {
        return stopRecording({ force: true });
      };

      btns._cleanupRecording = function () {
        document.removeEventListener("keydown", onKeyDown);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      };

      document.addEventListener("keydown", onKeyDown);
    });
  }

  // attachRecordingToButtons(meta, indicator, btns) — Legacy recording
  // flow using standalone recording indicator. Used for contexts where
  // the integrated prompt box is not appropriate.
  // Phase 4 chunk 5: toggle mechanism (press to start, press to stop) +
  // button auto-interrupt parity with attachRecordingToPromptBox.
  function attachRecordingToButtons(meta, indicator, btns) {
    return new Promise(function (resolve) {
      var segment = null;
      var rafId = null;
      var resolved = false;

      function updateLoop() {
        if (SEAudio.isRecording()) {
          SEUI.updateRecordingIndicator(indicator, true, SEAudio.getElapsedMs(), SEAudio.meetsMinDuration());
          rafId = requestAnimationFrame(updateLoop);
        }
      }

      function startRecording() {
        SEAudio.startRecording(meta);
        rafId = requestAnimationFrame(updateLoop);
        SEUI.setButtonsEnabled(btns, true);
      }

      function stopRecording(opts2) {
        opts2 = opts2 || {};
        if (!SEAudio.isRecording()) return Promise.resolve(null);
        var metMin = SEAudio.meetsMinDuration();
        if (!metMin && !opts2.force) {
          console.log("SEGame: keep going — below 2s minimum.");
          return Promise.resolve(null);
        }
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        return SEAudio.stopRecording().then(function (seg) {
          SEUI.updateRecordingIndicator(indicator, false, 0, false);
          segment = seg;
          if (!resolved) {
            resolved = true;
            resolve(segment);
          }
          return segment;
        });
      }

      function onKeyDown(e) {
        if (e.code === "Space" && !e.repeat) {
          e.preventDefault();
          if (SEAudio.isRecording()) {
            stopRecording();
          } else {
            startRecording();
          }
        }
      }

      btns._stopRecordingIfActive = function () {
        return stopRecording({ force: true });
      };

      btns._cleanupRecording = function () {
        document.removeEventListener("keydown", onKeyDown);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      };

      document.addEventListener("keydown", onKeyDown);
    });
  }

  // ════════════════════════════════════════════════════
  // Classification button flow
  // ════════════════════════════════════════════════════

  function waitForClassification(btns) {
    return new Promise(function (resolve) {
      // Phase 4 chunk 5: clicking a classification button auto-interrupts
      // any active recording (via the _stopRecordingIfActive hook installed
      // by attachRecordingToPromptBox). We AWAIT that stop before resolving
      // — otherwise the next trial can start a new SEAudio recording while
      // the previous one is still being finalized, causing race conditions.
      //
      // The button values come from btns.values rather than being hardcoded,
      // so the peer condition's Agree/Disagree buttons return "agree"/"disagree"
      // and the standard Win/Lose buttons return "winning"/"losing".
      var values = btns.values || { primary: "winning", secondary: "losing" };

      function finish(value) {
        btns.primaryBtn.removeEventListener("click", onPrimary);
        btns.secondaryBtn.removeEventListener("click", onSecondary);
        SEUI.setButtonsEnabled(btns, false);
        var stopPromise =
          (typeof btns._stopRecordingIfActive === "function")
            ? btns._stopRecordingIfActive()
            : Promise.resolve(null);
        Promise.resolve(stopPromise).then(function () {
          resolve(value);
        });
      }
      function onPrimary()   { finish(values.primary); }
      function onSecondary() { finish(values.secondary); }
      btns.primaryBtn.addEventListener("click", onPrimary);
      btns.secondaryBtn.addEventListener("click", onSecondary);
    });
  }

  // ════════════════════════════════════════════════════
  // Gallery phase
  // ════════════════════════════════════════════════════

  function runGalleryPhase(ruleData, rulePosition, totalRules) {
    // R6/6.1: total comes from the actual curriculum length when
    // available; falls back to SEConfig.nRules for legacy callers.
    var nRules = (typeof totalRules === "number" && totalRules > 0)
      ? totalRules
      : SEConfig.nRules;
    return new Promise(function (resolve) {
      SEUI.clearApp();
      var app = document.getElementById("app");

      // Lock #app to viewport height so the gallery's flex-fill chain
      // can't be inflated by the pre-scaled card markup. Same technique
      // as renderEndOfRoundWriteup. Cleared on Continue (and on any
      // future clearApp via ui.js).
      app.classList.add("se-fit-viewport");

      // Progress info
      SEUI.renderProgressBar(rulePosition, nRules, app);
      var heading = document.createElement("div");
      heading.className = "se-game-heading";
      heading.textContent = "Game " + rulePosition + " of " + nRules;
      app.appendChild(heading);

      // Study prompt — frames the gallery as something to think with,
      // not a passive waiting screen. Sits above the cards.
      var prompt = document.createElement("div");
      prompt.className = "se-study-prompt";
      prompt.textContent =
        "All of these hands are winning hands in this game. Take your " +
        "time and look at what these winning hands have in common to " +
        "try to infer the rule of the game.";
      app.appendChild(prompt);

      // Gallery in study mode (vertical stack, large cards with adaptive
      // sizing). With se-fit-viewport on #app, the gallery flex-fills the
      // remaining vertical space inside the panel — clear the inline
      // maxHeight that renderGallery hardcodes (65vh) so the CSS rule for
      // #app.se-fit-viewport > .se-gallery .se-gallery-stack can take over.
      var galleryEl = SEUI.renderGallery(ruleData.exemplarHands, app, true);
      var stackEl = galleryEl.querySelector(".se-gallery-stack");
      if (stackEl) stackEl.style.maxHeight = "";

      // Continue button — disabled with a live countdown label until the
      // minimum study time elapses, then enables as a normal Continue.
      // Replaces the old pill timer + delayed-Continue dance.
      var btn = SEUI.renderContinueButton(function () {
        app.classList.remove("se-fit-viewport");
        resolve();
      }, app);

      var remaining = SEConfig.galleryTime;
      function paintLabel() {
        if (remaining > 0) {
          btn.textContent = "Continue (available in " + remaining + "s)";
          btn.disabled = true;
        } else {
          btn.textContent = "Continue";
          btn.disabled = false;
        }
      }
      paintLabel();

      var intervalId = setInterval(function () {
        remaining--;
        if (remaining <= 0) {
          clearInterval(intervalId);
          intervalId = null;
          enableContinue();
        } else {
          paintLabel();
        }
      }, 1000);

      function enableContinue() {
        if (SEConfig.reEngagement) {
          // Brief "Get ready" interlude before the button lights up,
          // hiding the gallery so participants don't keep studying past
          // the floor. Button stays disabled with a placeholder label.
          galleryEl.style.display = "none";
          btn.textContent = "Get ready...";
          btn.disabled = true;

          var readyMsg = document.createElement("div");
          readyMsg.className = "se-message info";
          readyMsg.textContent = "Get ready...";
          app.appendChild(readyMsg);

          setTimeout(function () {
            readyMsg.remove();
            galleryEl.style.display = "";
            remaining = 0;
            paintLabel();
          }, 2500);
        } else {
          remaining = 0;
          paintLabel();
        }
      }
    });
  }

  // ════════════════════════════════════════════════════
  // Post-gallery prompt
  // ════════════════════════════════════════════════════

  function runPostGalleryPrompt(ruleData, rulePosition) {
    if (SEConfig.isCheckpoint(0)) {
      return runCheckpointPrompt(ruleData, rulePosition, 0);
    }

    if (SEConfig.isDescribe()) {
      return runDescribePrompt(ruleData, rulePosition, 0);
    }

    return Promise.resolve();
  }

  // runCheckpointPrompt(ruleData, rulePosition, trialNumber, layoutRefs)
  //
  // Renders the type-condition's "best guess" checkpoint INLINE — never
  // a clearApp + new page. Two flavors:
  //
  //   trial 0  : post-gallery, layoutRefs is null. The gallery is on screen
  //              from runGalleryPhase; the gallery's Continue button is
  //              still mounted (from when the participant clicked it past
  //              the countdown — we resolve before re-rendering). We
  //              explicitly remove that leftover Continue, then append the
  //              checkpoint UI to #app under the gallery.
  //
  //   trial 3+ : mid-game, layoutRefs is populated. Replace the focal/
  //              prompt/button areas in-place with the checkpoint UI so
  //              the surrounding two-column classification layout (gallery
  //              column + history column + progress bar) stays visible.
  //              On Continue, the next trial's runTrial() clears these
  //              same areas — no extra cleanup needed here.
  //
  // Both flavors call waitForRecording with the same recording flow.
  function runCheckpointPrompt(ruleData, rulePosition, trialNumber, layoutRefs) {
    var meta = {
      promptType: "checkpoint",
      ruleId: ruleData.ruleId,
      rulePosition: rulePosition,
      trialNumber: trialNumber
    };

    if (layoutRefs) {
      // Mid-game checkpoint: render INTO the persistent layout's mutable
      // areas. focalArea gets the checkpoint heading; promptArea +
      // buttonArea host the prompt + recording indicator + Continue.
      layoutRefs.focalArea.innerHTML = "";
      layoutRefs.promptArea.innerHTML = "";
      layoutRefs.buttonArea.innerHTML = "";
      SEUI.renderCheckpointPrompt(layoutRefs.focalArea);
      // waitForRecording's three children (prompt, indicator, Continue)
      // get appended to a single container; we use promptArea so they sit
      // beneath the checkpoint heading and above the empty buttonArea.
      return waitForRecording(getCheckpointPrompt(), meta, layoutRefs.promptArea);
    }

    // Trial 0: post-gallery. Gallery cards are still on screen; remove the
    // gallery's leftover Continue button so the new recording-Continue is
    // the only one visible. (Bug fix: previously two Continue buttons.)
    var app = document.getElementById("app");
    var leftoverContinue = app.querySelector(".se-btn-continue");
    if (leftoverContinue) {
      leftoverContinue.parentNode && leftoverContinue.parentNode.removeChild(leftoverContinue);
    }
    SEUI.renderCheckpointPrompt(app);
    return waitForRecording(getCheckpointPrompt(), meta, app);
  }

  function runDescribePrompt(ruleData, rulePosition, trialNumber) {
    // Don't clear app — keep the gallery visible on screen so participants
    // can describe cards from any hand including the gallery.
    var app = document.getElementById("app");

    // Bug fix (mirrors runCheckpointPrompt at trial 0): the gallery's
    // leftover Continue button stays mounted in #app from the countdown.
    // When waitForRecording renders its own Continue, the participant
    // sees two of them and the leftover one ignores clicks. Strip it.
    var leftoverContinue = app.querySelector(".se-btn-continue");
    if (leftoverContinue) {
      leftoverContinue.parentNode && leftoverContinue.parentNode.removeChild(leftoverContinue);
    }

    // Add the recording prompt below the existing gallery
    return waitForRecording(
      getPreClassificationPrompt(),
      {
        promptType: "describe-postgallery",
        ruleId: ruleData.ruleId,
        rulePosition: rulePosition,
        trialNumber: trialNumber
      },
      app
    );
  }

  // ════════════════════════════════════════════════════
  // Single trial (within two-column layout)
  // ════════════════════════════════════════════════════

  // runTrial(trialNumber, selection, ruleData, rulePosition, layoutRefs)
  // Runs a single classification trial within the persistent two-column layout.
  // Only updates the focal area, prompt area, and button area — does NOT
  // rebuild the gallery or history column.
  //
  // `layoutRefs` — the object returned by SEUI.renderClassificationLayout.
  async function runTrial(trialNumber, selection, ruleData, rulePosition, layoutRefs) {
    // Clear the mutable areas (focal, prompt, buttons)
    layoutRefs.focalArea.innerHTML = "";
    layoutRefs.promptArea.innerHTML = "";
    layoutRefs.buttonArea.innerHTML = "";

    // ── Peer setup (peer condition only) ──
    // Generate the fictional peer's claim with i.i.d. Bernoulli sampling.
    // Independent draws per trial mean the realised correct/incorrect mix
    // varies naturally, so participants can't reason by elimination across
    // a session. The banner replaces the default focal-panel header below
    // ("Classify This Hand" → "Another participant said..."), since the
    // framing has shifted: the participant judges the peer, not the hand.
    var peerClaim = null;
    var peerCorrect = null;
    var focalLabelEl = null;
    if (SEConfig.isPeer()) {
      peerCorrect = Math.random() < SEConfig.peerCorrectRate;
      peerClaim = peerCorrect
        ? selection.category
        : (selection.category === "winning" ? "losing" : "winning");
      focalLabelEl = SEUI.renderPeerBanner(peerClaim);
    }

    // ── Focal hand ──
    // The multi-card selection affordance only renders when the condition
    // is token / token-type AND tokenSelection is enabled. Describe, silent,
    // type, and peer never get selection.
    var focalEl = SEUI.renderFocalHand(
      selection.hand,
      layoutRefs.focalArea,
      {
        selectable: SEConfig.hasCardSelection(),
        label: focalLabelEl
      }
    );

    // ── Prompt area + Buttons ──
    var btns;

    if (SEConfig.isPeer()) {
      // Peer condition: Agree / Disagree buttons + recording prompt asking
      // about the peer's reasoning. Buttons enable once a valid recording
      // exists, same as token. No card selection.
      var peerBox = SEUI.renderPromptRecordingBox(getPeerPrompt(), layoutRefs.promptArea);
      btns = SEUI.renderButtons(function () {}, function () {}, layoutRefs.buttonArea, {
        labels:  { primary: "Agree", secondary: "Disagree" },
        values:  { primary: "agree", secondary: "disagree" },
        classes: { primary: "se-btn-agree", secondary: "se-btn-disagree" }
      });
      SEUI.setButtonsEnabled(btns, false);

      attachRecordingToPromptBox(
        {
          promptType: "peer",
          ruleId: ruleData.ruleId,
          rulePosition: rulePosition,
          trialNumber: trialNumber,
          peerClaim: peerClaim,
          peerCorrect: peerCorrect
        },
        peerBox.box,
        btns,
        null
      );
    } else {
      var promptText = getPreClassificationPrompt();

      if (promptText !== null && !SEConfig.isSilent()) {
        // Token / describe: prompt + recording box, buttons gated on recording.
        var prBox = SEUI.renderPromptRecordingBox(promptText, layoutRefs.promptArea);
        btns = SEUI.renderButtons(function () {}, function () {}, layoutRefs.buttonArea);
        SEUI.setButtonsEnabled(btns, false);

        // When card selection is enabled (token / token-type with the flag on),
        // gate recording start on having selected ≥ 1 card and lock the
        // selection once recording begins. When the flag is off, the recording
        // can start immediately and no selection is captured.
        var recordingOpts = SEConfig.hasCardSelection() ? {
          canStart: function () { return focalEl.getSelectionCount() > 0; },
          onRecordingStart: function () { focalEl.lockSelection(); }
        } : null;

        attachRecordingToPromptBox(
          {
            promptType: SEConfig.isDescribe() ? "describe" : "token",
            ruleId: ruleData.ruleId,
            rulePosition: rulePosition,
            trialNumber: trialNumber
          },
          prBox.box,
          btns,
          recordingOpts
        );
      } else {
        // Silent or type-only (non-checkpoint): no prompt, buttons enabled
        btns = SEUI.renderButtons(function () {}, function () {}, layoutRefs.buttonArea);
        SEUI.setButtonsEnabled(btns, true);
      }
    }

    // ── Wait for classification ──
    var trialStartTime = performance.now();
    var response = await waitForClassification(btns);
    var rt = Math.round(performance.now() - trialStartTime);

    // Clean up recording listeners
    if (btns._cleanupRecording) {
      btns._cleanupRecording();
    }

    // ── Derive belief + correctness ──
    // For non-peer conditions, response IS the belief about the hand
    // ("winning"/"losing"). For peer, response is the literal click
    // ("agree"/"disagree"); we derive the belief by combining the peer's
    // claim with whether the participant agreed. correctness uses the
    // derived belief in both cases so analyses can compare uniformly.
    var responseLabel, agreed;
    if (SEConfig.isPeer()) {
      agreed = (response === "agree");
      responseLabel = agreed
        ? peerClaim
        : (peerClaim === "winning" ? "losing" : "winning");
    } else {
      agreed = null;
      responseLabel = response;
    }
    var correct = (responseLabel === selection.category);

    // ── Feedback ── (legacy v2 path; dead in study #3, which uses
    // runStudy2Trial. Kept consistent with the new self-paced verdict so it
    // still works if ?feedback=on is ever used outside study #3.)
    if (SEConfig.feedback) {
      SEUI.setButtonsEnabled(btns, false);
      await SEUI.showFeedback(focalEl, selection.category, correct, responseLabel);
    }

    // ── Checkpoint (type-level prompt after classification + feedback) ──
    if (SEConfig.isCheckpoint(trialNumber)) {
      // Pass layoutRefs so the checkpoint renders inline — preserves the
      // two-column classification context instead of opening a "new page".
      await runCheckpointPrompt(ruleData, rulePosition, trialNumber, layoutRefs);
    }

    // ── Add to history column ──
    // History always shows the participant's belief about the hand
    // (winning/losing), even in peer where the literal button click was
    // agree/disagree. responseLabel is the derived belief.
    if (layoutRefs.historyItems) {
      SEUI.addToHistoryColumn(
        layoutRefs.historyItems, selection.hand, selection.category,
        responseLabel, correct, SEConfig.feedback
      );
    }

    // ── Build trial record ──
    // selectedCardIndices captures which positions in the focal hand the
    // participant clicked (token conditions only; null for silent/describe/type).
    // selectionCount is a derived convenience for analysis.
    var selectedIndices = (focalEl.getSelectedIndices)
      ? focalEl.getSelectedIndices()
      : null;
    return {
      // ── Schema versioning (B6) ──
      // Bumped when major schema changes land. v2 = mature design (snapshot-
      // driven curriculum, fixed pool sampling, end-of-curriculum bulk DV).
      experimentVersion: 2,
      // 'fixed_pool_v1' if the snapshot-based selector ran for this rule;
      // 'dual_stack_coinflip_v0' if the legacy create() path was taken
      // (only when ruleData.fixedTrialPool is empty/missing).
      samplingScheme: (ruleData.fixedTrialPool && ruleData.fixedTrialPool.length > 0)
        ? "fixed_pool_v1"
        : "dual_stack_coinflip_v0",

      // ── Existing trial fields ──
      ruleId: ruleData.ruleId,
      rulePosition: rulePosition,
      ruleDifficulty: ruleData.difficulty,
      trialNumber: trialNumber,
      hand: selection.hand,
      handCategory: selection.category,
      // response is the literal button click ("winning"/"losing" for normal
      // conditions, "agree"/"disagree" for peer). responseLabel is the
      // derived belief about the hand — always "winning" or "losing", so
      // analyses can compare uniformly across conditions.
      response: response,
      responseLabel: responseLabel,
      correct: correct,
      rt: rt,

      // ── v1 dual-stack fields (null in v2 fixed_pool_v1) ──
      // selection.* nullifies these in createFromPool; the stale values
      // here document where the dual-stack semantics used to live.
      difficultyScore: selection.difficultyScore,
      stackSource: selection.stackSource,
      stackPosition: selection.stackPosition,

      // ── v2 fixed-pool fields (Issue 4 option C — clean break) ──
      // Legacy strategyVariant/strategyMethod/strategyScore REMOVED from
      // per-trial schema. All per-hand provenance now in stimulusMetadata.
      adversarialStrategy: ruleData.adversarialStrategy || null,
      pairId: selection.pairId || null,
      groupAssignment: ruleData.groupAssignment || null,
      fallbackUsed: ruleData.fallbackUsed || null,
      trialPoolId: ruleData.trialPoolId || null,
      trialPoolOrder: selection.trialPoolOrder == null ? null : selection.trialPoolOrder,
      handId: selection.handId || null,
      stimulusMetadata: _buildStimulusMetadata(selection, ruleData),

      // ── Other existing fields ──
      isCheckpoint: SEConfig.isCheckpoint(trialNumber),
      selectedCardIndices: selectedIndices,
      selectionCount: selectedIndices ? selectedIndices.length : null,
      // Peer-condition fields (null for non-peer trials).
      peerClaim: peerClaim,
      peerCorrect: peerCorrect,
      agreed: agreed,
      timestamp: new Date().toISOString()
    };
  }

  // ════════════════════════════════════════════════════
  // Study #2 per-rule flow
  // ════════════════════════════════════════════════════

  // Prompt wording shown in the post-gallery rule-query screen (explain condition only).
  /* COPY: researcher to confirm — mirror the rule-gallery pilot's elicitation prompt */
  var STUDY2_RULE_PROMPT =
    "In your own words, what do you think the rule is? " +
    "Describe what makes a hand a winning hand.";

  // startStudy2(ruleData, rulePosition, totalRules)
  //
  // Study #2 per-rule flow:
  //   1. Self-paced gallery (renderStudy2Gallery) — resolves with study time in ms.
  //   2. Post-gallery rule-query (explain condition only) — resolves with typed guess.
  //   3. Build fixed-pool selector (createFromPool, nTrials = 6).
  //   4. Two-column classification layout (renderClassificationLayout).
  //   5. 6 sequential trials via runStudy2Trial.
  //
  // Returns { trials, postGalleryGuess, galleryStudyMs }.
  async function startStudy2(ruleData, rulePosition, totalRules) {
    console.log(
      "SEGame[study2]: starting rule " + ruleData.ruleId +
      " (position " + rulePosition + ")"
    );

    SEUI.clearApp();
    var app = document.getElementById("app");

    // R6/6.1: total comes from the actual curriculum length when available;
    // falls back to SEConfig.nRules for legacy callers.
    var nRules = (typeof totalRules === "number" && totalRules > 0)
      ? totalRules
      : SEConfig.nRules;

    // ── Phase 1: Self-paced gallery ──
    if (window._integrityMonitor) {
      window._integrityMonitor.startTrial({
        trialId: ruleData.ruleId + "-gallery",
        phase: "gallery"
      });
    }
    var studyMs = await SEUI.renderStudy2Gallery(
      ruleData.exemplarHands,
      app,
      {
        minDwellMs: SEConfig.galleryMinDwellMs,
        rulePosition: rulePosition,
        totalRules: nRules
      }
    );
    var galleryIntegrityTrial = null;
    if (window._integrityMonitor) {
      galleryIntegrityTrial = window._integrityMonitor.endTrial();
    }

    // ── Phase 2: Post-gallery rule-query (explain condition only) ──
    SEUI.clearApp();
    app = document.getElementById("app");

    var postGalleryGuess = null;
    var postGalleryIntegrityTrial = null;
    if (SEConfig.isExplain()) {
      if (window._integrityMonitor) {
        window._integrityMonitor.startTrial({
          trialId: ruleData.ruleId + "-pgq",
          phase: "post_gallery_query"
        });
      }
      postGalleryGuess = await SEUI.renderRuleQuery(
        ruleData.exemplarHands,
        app,
        {
          promptText: STUDY2_RULE_PROMPT,
          promptType: "post_gallery"
        }
      );
      if (window._integrityMonitor) {
        postGalleryIntegrityTrial = window._integrityMonitor.endTrial();
      }
      // Tag each post-gallery guess with its rule_id so the analyst doesn't
      // have to infer rule identity from array position. endRequeryGuesses
      // already carries ruleId; matching the convention here.
      if (postGalleryGuess) {
        postGalleryGuess.ruleId = ruleData.ruleId;
      }
    }

    // ── Phase 3: Build selector ──
    // Study #2 uses a 6-item fixed pool (3 winning + 3 losing).
    // SEConfig.nTrials is set to 6 by the v3 loader. The pool-size guard
    // in the v2 start() only fires when nTrials != pool.length — in study
    // #2 both are 6, so it passes cleanly.
    var selector = SEHandSelector.createFromPool(ruleData.fixedTrialPool, ruleData);

    // ── Phase 4: Two-column classification layout ──
    SEUI.clearApp();
    app = document.getElementById("app");
    var layoutRefs = SEUI.renderClassificationLayout(ruleData.exemplarHands, app);

    // ── Phase 5: 6 sequential classification trials ──
    var trials = [];
    for (var t = 1; t <= 6; t++) {
      var selection = selector.next();
      var record = await runStudy2Trial(t, selection, ruleData, rulePosition, layoutRefs);
      trials.push(record);
    }

    console.log(
      "SEGame[study2]: rule " + ruleData.ruleId + " complete. " +
      trials.length + " trials."
    );

    return {
      trials: trials,
      postGalleryGuess: postGalleryGuess,
      galleryStudyMs: studyMs,
      galleryIntegrityTrial: galleryIntegrityTrial,
      postGalleryIntegrityTrial: postGalleryIntegrityTrial
    };
  }

  // runStudy2Trial(trialNumber, selection, ruleData, rulePosition, layoutRefs)
  //
  // One study #2 classification trial.  Simpler than the v2 runTrial:
  //   - No recording gate: Win/Lose buttons are enabled immediately.
  //   - No peer/token/describe/checkpoint paths.
  //   - Per-trial feedback (green/red + check/cross, 1.5s) when SEConfig.feedback
  //     is on (study #3); study #2 runs with feedback off.
  //   - Keyboard shortcuts: w/W/ArrowLeft → Win; l/L/ArrowRight → Lose.
  //   - Cyborg-hunter per-trial wiring (guarded with if(window._integrityMonitor)).
  async function runStudy2Trial(trialNumber, selection, ruleData, rulePosition, layoutRefs) {
    // Clear the mutable areas from the previous trial
    layoutRefs.focalArea.innerHTML = "";
    layoutRefs.promptArea.innerHTML = "";
    layoutRefs.buttonArea.innerHTML = "";

    // ── Cyborg-hunter: startTrial ──
    if (window._integrityMonitor) {
      window._integrityMonitor.startTrial({
        trialId: ruleData.ruleId + "-t" + trialNumber,
        phase: "classification"
      });
    }

    // ── Focal hand (non-selectable) ──
    // FIX 5: the classification question IS the styled focal-panel header —
    // passed as opts.label, it becomes the .se-focal-panel-label. The
    // separate dry .se-study2-trial-prompt line is gone.
    var focalEl = SEUI.renderFocalHand(selection.hand, layoutRefs.focalArea, {
      selectable: false,
      label: "Do you think this is a winning hand or a losing hand?" /* COPY */
    });

    // ── Win/Lose buttons — enabled immediately ──
    var btns = SEUI.renderButtons(
      function () {},
      function () {},
      layoutRefs.buttonArea
    );
    SEUI.setButtonsEnabled(btns, true);

    // ── Keyboard shortcuts for this trial ──
    // Bound here, removed as soon as waitForClassification resolves.
    function onKeyDown(e) {
      if (e.repeat) return;
      var key = e.key;
      if (key === "w" || key === "W" || key === "ArrowLeft") {
        e.preventDefault();
        if (!btns.primaryBtn.disabled) {
          btns.primaryBtn.click();
        }
      } else if (key === "l" || key === "L" || key === "ArrowRight") {
        e.preventDefault();
        if (!btns.secondaryBtn.disabled) {
          btns.secondaryBtn.click();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);

    // ── Wait for classification ──
    var trialStartTime = performance.now();
    var response = await waitForClassification(btns);
    var rt = Math.round(performance.now() - trialStartTime);

    // Remove the keydown listener for this trial — no leaks across trials
    document.removeEventListener("keydown", onKeyDown);

    var correct = (response === selection.category);

    // ── Cyborg-hunter: endTrial (integrity window ends at the answer, before
    //    the post-answer reflection) ──
    var chReport = null;
    if (window._integrityMonitor) {
      chReport = window._integrityMonitor.endTrial();
    }

    // ── Log the answer in the record column. Study #3 shows the hybrid verdict
    //    item (category background + corner mark + truth/guess lines); study #2
    //    shows the neutral entry. Logged BEFORE the verdict so it lands while
    //    the participant reflects. ──
    if (layoutRefs.historyItems) {
      SEUI.addToHistoryColumn(
        layoutRefs.historyItems,
        selection.hand,
        selection.category,
        response,
        correct,
        SEConfig.feedback
      );
    }

    // ── Per-trial feedback (study #3): self-paced verdict + Next ──
    // Clear the Win/Lose buttons so Next is the only control, then await the
    // participant's Next click (no fixed timer — reflection is self-paced).
    if (SEConfig.feedback) {
      SEUI.setButtonsEnabled(btns, false);
      layoutRefs.buttonArea.innerHTML = "";
      await SEUI.showFeedback(focalEl, selection.category, correct, response);
    }

    // ── Build trial record ──
    // Shape mirrors runTrial's record but drops v2-only fields
    // (peer/token/checkpoint/selectedCardIndices etc.) that don't apply
    // to the study #2 flow.
    var record = {
      // ── Schema versioning ──
      experimentVersion: 3,    // study #2 = v3 flow
      condition: SEConfig.condition,

      // ── Rule / trial identity ──
      ruleId: ruleData.ruleId,
      rulePosition: rulePosition,
      trialNumber: trialNumber,

      // ── Stimulus ──
      hand: selection.hand,
      ground_truth: selection.groundTruth,

      // ── Response ──
      response: response,
      correct: (response === selection.category),
      rt: rt,

      // ── Fixed-pool provenance (mirrors runTrial v2 fields) ──
      edit_distance:     selection.editDepth,
      edit_description:  selection.editDescription,
      source_exemplar_idx: selection.sourceExemplarIdx,
      handId:            selection.handId || null,
      pairId:            selection.pairId || null,
      trialPoolOrder:    selection.trialPoolOrder == null ? null : selection.trialPoolOrder,

      // ── Timestamp ──
      timestamp: new Date().toISOString(),

      // ── Cyborg-hunter per-trial report ──
      integrityTrial: chReport
    };

    return record;
  }

  // ── Practice block removed (FIX 1+2) ──
  // The standalone runPractice() was deleted: the study #2 practice is now
  // woven directly into the tutorial as polished renderTutorialStep slides
  // (see SETutorial.runStudy2). The tutorial's classify-practice slides use
  // TUTORIAL_RULE.testHands and a feedback slide, doing everything the old
  // runPractice did but in the polished aesthetic.

  // ════════════════════════════════════════════════════
  // Main entry point
  // ════════════════════════════════════════════════════

  async function start(ruleData, rulePosition, totalRules) {
    // ── Study #2 branch ──
    // Must come BEFORE any v2 logic so the study #2 flow is fully isolated.
    if (SEConfig.isStudy2()) {
      return startStudy2(ruleData, rulePosition, totalRules);
    }

    // R6/6.1: total comes from the actual curriculum length (passed by
    // app.js), not SEConfig.nRules. Falls back to SEConfig.nRules if
    // unset (legacy callers that pass only two args).
    var nRules = (typeof totalRules === "number" && totalRules > 0)
      ? totalRules
      : SEConfig.nRules;
    console.log(
      "SEGame: starting rule " + ruleData.ruleId +
      " (position " + rulePosition + " of " + nRules + ")"
    );

    // ── Phase 1: Gallery ──
    await runGalleryPhase(ruleData, rulePosition, nRules);

    // ── Phase 2: Post-gallery prompt ──
    await runPostGalleryPrompt(ruleData, rulePosition);

    // ── Phase 3: Classification trials ──
    // v2: per-rule fixed pool from the snapshot (5 winning + 5 losing,
    // shuffled per-participant). NO legacy fallback — if the curriculum
    // says fixedTrialPool is missing or empty, the loader's fail-closed
    // contract was broken and we refuse to start the trial loop.
    var selector;
    if (ruleData.fixedTrialPool && ruleData.fixedTrialPool.length > 0) {
      // Hard-fail when nTrials drifts from pool size — the locked design
      // (§5.2) is 10 trials per rule = 5+5. If the snapshot ships the
      // wrong size OR a URL param tampers with nTrials, refuse rather
      // than crash mid-rule on selector.next() exhaustion.
      if (typeof SEConfig.nTrials === "number" &&
          SEConfig.nTrials !== ruleData.fixedTrialPool.length) {
        var msg = "rule " + ruleData.ruleId +
          ": SEConfig.nTrials=" + SEConfig.nTrials +
          " but pool has " + ruleData.fixedTrialPool.length + " hands";
        console.error("SEGame:", msg);
        if (window.SESnapshotLoader && SESnapshotLoader.showFailScreen) {
          SESnapshotLoader.showFailScreen("SNAPSHOT_POOL_SIZE_MISMATCH", msg);
        }
        throw new Error("SNAPSHOT_POOL_SIZE_MISMATCH: " + msg);
      }
      selector = SEHandSelector.createFromPool(ruleData.fixedTrialPool, ruleData);
    } else if (ruleData.winStack && ruleData.loseStack) {
      // Legacy v1 dual-stack path — retained ONLY for any non-snapshot
      // entry point (catalog browser, archived studies). Snapshot
      // sessions must never reach this branch; if they do, the loader
      // contract is broken upstream.
      selector = SEHandSelector.create(ruleData.winStack, ruleData.loseStack);
    } else {
      var ruleId = ruleData && ruleData.ruleId ? ruleData.ruleId : "(unknown)";
      var emsg = "rule " + ruleId + ": neither fixedTrialPool nor win/loseStack";
      console.error("SEGame: SNAPSHOT_POOL_EMPTY —", emsg);
      if (window.SESnapshotLoader && SESnapshotLoader.showFailScreen) {
        SESnapshotLoader.showFailScreen("SNAPSHOT_POOL_EMPTY", emsg);
      }
      throw new Error("SNAPSHOT_POOL_EMPTY: " + emsg);
    }

    // Register current rule + selector with DevTools so the console
    // helpers (revealRule, revealUpcoming) can peek without us having
    // to expose globals on every closure.
    if (window.DevTools && typeof DevTools._setCurrent === "function") {
      DevTools._setCurrent(ruleData, selector);
    }

    // Set up the two-column classification layout ONCE
    SEUI.clearApp();
    var app = document.getElementById("app");
    // R6/6.1: use actual curriculum length, not SEConfig.nRules
    SEUI.renderProgressBar(rulePosition, nRules, app);

    var layoutRefs = SEUI.renderClassificationLayout(ruleData.exemplarHands, app);

    // Run each trial sequentially, updating only the mutable areas
    var trials = [];
    for (var t = 1; t <= SEConfig.nTrials; t++) {
      var selection = selector.next();
      var trialRecord = await runTrial(
        t, selection, ruleData, rulePosition, layoutRefs
      );
      trials.push(trialRecord);
    }

    // ── Phase 4 (v1, REMOVED in v2): per-round typed writeup ──
    // The end-of-round typed writeup is dropped per design §2 — the typed
    // articulation moves to a single end-of-curriculum bulk screen (Phase C
    // / design §3.2) so participants can't strategize their typed responses
    // mid-curriculum. The classification round ends directly into the
    // rule-transition buffer (C2 → next rule's gallery).

    // Collect all audio segments
    var audioSegments = SEAudio.getSegments();

    console.log(
      "SEGame: rule " + ruleData.ruleId + " complete. " +
      trials.length + " trials, " + audioSegments.length + " audio segments."
    );

    return {
      trials: trials,
      audioSegments: audioSegments,
      // ruleWriteup retained as null in v2 — app.js's allRuleWriteups stays
      // empty so payload.ruleWriteups is [] (per design §8.0 / B8).
      ruleWriteup: null,
    };
  }

  // ── Public API ──
  return {
    start: start
  };
})();
