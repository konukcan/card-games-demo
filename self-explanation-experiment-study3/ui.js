// self-explanation-experiment/ui.js
// Shared rendering helpers for the self-explanation experiment.
//
// Provides functions to build and update all UI components:
//   - Header bar with progress track
//   - Gallery (vertical stack for classification, grid for study phase)
//   - Two-column classification layout (main column + history column)
//   - Focal hand (white panel with large, centred classification target)
//   - Integrated prompt + recording box
//   - Prompts, recording indicator, buttons
//   - History column (vertical list of classified hands)
//   - Tutorial slides (two-column card layout with navigation)
//   - Feedback overlays, checkpoints, progress bar
//
// Depends on window.CardEx (specifically CardEx.renderHandHTML) for card rendering.
// Exported as window.SEUI.

window.SEUI = (function () {
  "use strict";

  // ── Helpers ──

  // Resolve a container argument: if provided use it, otherwise fall back
  // to the #app element.
  function resolveContainer(container) {
    return container || document.getElementById("app");
  }

  // Create an element, apply optional className, and append to parent.
  function makeEl(tag, className, parent) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (parent) parent.appendChild(el);
    return el;
  }

  // ════════════════════════════════════════════════════
  // Header & top-level progress
  // ════════════════════════════════════════════════════

  // renderHeader(title, ruleLabel, current, total)
  // Creates a header bar above #app with a title, rule indicator,
  // and a thin progress track. Inserts before #app in the DOM.
  //
  // Returns { header, progressFill } for later updates.
  function renderHeader(title, ruleLabel, current, total) {
    var app = document.getElementById("app");
    var body = document.body;

    var header = makeEl("div", "se-header");
    var titleEl = makeEl("span", "se-header-title", header);
    titleEl.textContent = title || "Self-Explanation Experiment";

    var right = makeEl("div", "se-header-right", header);
    var ruleLabelEl = makeEl("span", "se-header-rule-label", right);
    ruleLabelEl.textContent = ruleLabel || "";
    ruleLabelEl.setAttribute("data-role", "rule-label");

    var progressText = makeEl("span", "", right);
    progressText.textContent = current + " / " + total;
    progressText.setAttribute("data-role", "progress-text");

    body.insertBefore(header, app);

    var track = makeEl("div", "se-progress-track");
    var fill = makeEl("div", "se-progress-track-fill", track);
    var pct = total > 0 ? Math.round((current / total) * 100) : 0;
    fill.style.width = pct + "%";
    body.insertBefore(track, app);

    return { header: header, track: track, progressFill: fill, ruleLabelEl: ruleLabelEl, progressText: progressText };
  }

  // updateHeader(headerObj, ruleLabel, current, total)
  function updateHeader(headerObj, ruleLabel, current, total) {
    if (headerObj.ruleLabelEl) {
      headerObj.ruleLabelEl.textContent = ruleLabel || "";
    }
    if (headerObj.progressText) {
      headerObj.progressText.textContent = current + " / " + total;
    }
    if (headerObj.progressFill) {
      var pct = total > 0 ? Math.round((current / total) * 100) : 0;
      headerObj.progressFill.style.width = pct + "%";
    }
  }

  // ════════════════════════════════════════════════════
  // Gallery rendering
  // ════════════════════════════════════════════════════

  // renderGallery(hands, container, compact)
  // Renders winning hands in a soft green panel.
  //
  // `hands` — array of hand arrays (each hand is an array of card objects).
  // `container` — DOM element to append into (defaults to #app).
  // `compact` — if true, uses vertical stack layout with smaller cards (~65px)
  //             for the classification phase. If false (default), uses the
  //             3-column grid with larger cards (~90px) for the study phase.
  //
  // Returns the gallery wrapper DOM element.
  function renderGallery(hands, container, compact) {
    var parent = resolveContainer(container);
    var wrapper = makeEl("div", "se-gallery se-animate-in", parent);

    var label = makeEl("div", "se-gallery-label", wrapper);
    label.textContent = "Winning Hands";

    // Vertical stack layout (one hand per row).
    // Card height depends on context:
    //   - compact (classification phase): small cards, gallery should not
    //     dominate — roughly 35% of viewport height max
    //   - non-compact (gallery study phase): larger cards, gallery can use
    //     more space — roughly 55% of viewport height max
    //
    // We set a max-height on the stack, give each row flex:1, and then
    // do a second-pass measurement to constrain cards to fit.

    // Per Lever #5 A1 (reading-priority compact): classification gallery sits
    // at ~45vh (was 35vh), study mode at ~65vh (was 55vh), giving cards more
    // breathing room. Row backgrounds come from CSS (alternating cream tints).
    var maxGalleryVh = compact ? 45 : 65;
    var stack = makeEl("div", "se-gallery-stack", wrapper);
    stack.style.maxHeight = maxGalleryVh + "vh";

    hands.forEach(function (hand, i) {
      var row = makeEl("div", "se-gallery-row", stack);
      row.style.flex = "1";
      row.style.minHeight = "0";
      row.style.overflow = "hidden";
      row.innerHTML = CardEx.renderHandHTML(hand, {
        cardHeight: 200,  // intentionally oversized; scaled down below
        gap: "4px",
        justify: "center"
      });
    });

    // Second pass: measure actual row dimensions and constrain cards.
    requestAnimationFrame(function () {
      var firstRow = stack.querySelector(".se-gallery-row");
      if (!firstRow) return;
      var rowHeight = firstRow.clientHeight;
      var rowWidth = firstRow.clientWidth;
      var numCards = hands[0] ? hands[0].length : 6;
      var cardGap = 4;
      var rowPadding = 24;

      // Height-based constraint (from row height)
      var heightFromRows = Math.max(40, rowHeight - 4);

      // Width-based constraint (from row width / num cards)
      var availableWidth = rowWidth - rowPadding - (numCards - 1) * cardGap;
      var maxCardWidth = Math.floor(availableWidth / numCards);
      var heightFromWidth = Math.round(maxCardWidth / 0.714);

      // Use whichever is more constraining
      var imgHeight = Math.min(heightFromRows, heightFromWidth);
      imgHeight = Math.max(40, imgHeight);
      var imgWidth = Math.round(imgHeight * 0.714);

      var wrappers = stack.querySelectorAll(".card-wrapper");
      for (var j = 0; j < wrappers.length; j++) {
        wrappers[j].style.height = imgHeight + "px";
        wrappers[j].style.width = imgWidth + "px";
      }
    });

    return wrapper;
  }

  // ════════════════════════════════════════════════════
  // Two-column classification layout
  // ════════════════════════════════════════════════════

  // renderClassificationLayout(galleryHands, container)
  // Creates the two-column grid layout for the classification phase:
  //   - Main column (left): compact gallery, unified focal+prompt panel, buttons
  //   - History column (right): "Your Classifications" + vertically stacking hands
  //
  // The focal hand and the prompt-recording box live inside a single
  // `.se-focal-prompt-panel` wrapper so they read as one cohesive task surface
  // (Phase 4 chunk 3 refactor — saves vertical space and removes the redundant
  // panel chrome between the two areas). Trial code in game.js still targets
  // `focalArea` and `promptArea` independently.
  //
  // This is called ONCE at the start of the classification phase. Individual
  // trials update the focal/prompt/button areas without rebuilding the layout.
  //
  // Returns { layout, mainColumn, focalArea, promptArea, buttonArea, historyColumn, historyItems }
  function renderClassificationLayout(galleryHands, container) {
    var parent = resolveContainer(container);

    // Viewport-fit: lock #app so the layout fills the height and the gallery
    // + focal panel flex-grow to use the vertical space (no idle whitespace
    // below the focal hand). Cleared by clearApp() on the next screen.
    var appEl = document.getElementById("app");
    if (appEl) appEl.classList.add("se-fit-viewport");

    // Two-column grid
    var layout = makeEl("div", "se-classification-layout", parent);

    // ── Left column: main content ──
    var mainCol = makeEl("div", "se-main-column", layout);

    // Compact gallery at top of main column
    renderGallery(galleryHands, mainCol, true);
    // Clear renderGallery's inline maxHeight so the CSS flex-fill applies.
    var clStack = mainCol.querySelector(".se-gallery-stack");
    if (clStack) clStack.style.maxHeight = "";

    // Unified focal+prompt panel (single chrome, internal divider)
    var focalPromptPanel = makeEl("div", "se-focal-prompt-panel", mainCol);

    // Focal hand area (updated each trial)
    var focalArea = makeEl("div", "se-focal-area", focalPromptPanel);

    // Prompt/recording area (updated each trial)
    var promptArea = makeEl("div", "se-prompt-area", focalPromptPanel);

    // Button area stays outside the merged panel — it's the trial action,
    // visually separated from the deliberation surface above.
    var buttonArea = makeEl("div", "se-button-area", mainCol);

    // ── Right column: history ──
    var histCol = makeEl("div", "se-history-column", layout);

    var histLabel = makeEl("div", "se-history-column-label", histCol);
    histLabel.textContent = "Your Classifications";

    var histItems = makeEl("div", "se-history-column-items", histCol);
    histItems.setAttribute("data-role", "history-items");

    return {
      layout: layout,
      mainColumn: mainCol,
      focalArea: focalArea,
      promptArea: promptArea,
      buttonArea: buttonArea,
      historyColumn: histCol,
      historyItems: histItems
    };
  }

  // addToHistoryColumn(histItems, hand, category, response, correct, feedbackOn)
  // Adds a classified hand to the history column (vertical list).
  function addToHistoryColumn(histItems, hand, category, response, correct, feedbackOn) {
    var handDiv = makeEl("div", "se-history-item", histItems);

    handDiv.innerHTML = CardEx.renderHandHTML(hand, {
      cardHeight: 45,
      gap: "1px",
      justify: "center"
    });

    if (feedbackOn) {
      handDiv.classList.add(category);   // category-coloured background/border

      // correctness mark in the corner (green \u2713 / red \u2717)
      var corner = makeEl("div", "se-history-item-corner", handDiv);
      corner.classList.add(correct ? "correct" : "incorrect");
      corner.textContent = correct ? "\u2713" : "\u2717";

      // line 1 \u2014 the truth, in the category colour
      var truth = makeEl("div", "se-history-item-truth", handDiv);
      truth.innerHTML = 'The hand is <b class="' + category + '">' +
        (category === "winning" ? "Winning" : "Losing") + '</b>';

      // line 2 \u2014 the participant's guess, in the correctness colour
      var guess = makeEl("div", "se-history-item-guess", handDiv);
      guess.innerHTML = 'Your guess: <b class="' + (correct ? "correct" : "incorrect") + '">' +
        (response === "winning" ? "Winning" : "Losing") + '</b>';
    } else {
      handDiv.classList.add("neutral");

      var responseLabel = makeEl("div", "se-history-item-response", handDiv);
      responseLabel.textContent = response === "winning" ? "Win" : "Lose";
    }

    // Auto-scroll to bottom
    histItems.parentElement.scrollTop = histItems.parentElement.scrollHeight;
  }

  // ════════════════════════════════════════════════════
  // Focal hand
  // ════════════════════════════════════════════════════

  // renderFocalHand(hand, container, opts)
  // Renders the current classification hand in the focal area.
  //
  // opts (optional):
  //   selectable: bool — if true, cards are clickable. Each click toggles a
  //                      .se-selected class on the corresponding .card-wrapper.
  //                      An instruction line is shown above the cards.
  //   onSelectionChange: function(indicesArray) — called whenever selection changes.
  //
  // The returned focal element exposes selection helpers (used by game.js
  // to gate recording and capture per-trial selection data):
  //   focal.getSelectedIndices() → Array<number>, sorted ascending
  //   focal.getSelectionCount()  → number
  //   focal.lockSelection()      → freezes selection (no more clicks)
  //
  // Selection state itself is closure-scoped so external code can only mutate
  // it via clicks (or via lockSelection to freeze it).
  function renderFocalHand(hand, container, opts) {
    opts = opts || {};
    var parent = resolveContainer(container);

    var panel = makeEl("div", "se-focal-panel se-animate-in", parent);

    // Top-of-panel label. Caller can supply opts.label to replace the
    // default "Classify This Hand" header:
    //   - a pre-built DOM node — used by the peer condition (a banner).
    //   - a string — wrapped in the styled .se-focal-panel-label so the
    //     classification question itself becomes the styled header
    //     (study #2, FIX 5).
    if (opts.label instanceof Node) {
      panel.appendChild(opts.label);
    } else {
      var label = makeEl("div", "se-focal-panel-label", panel);
      label.textContent = (typeof opts.label === "string" && opts.label)
        ? opts.label
        : "Classify This Hand";
    }

    if (opts.selectable) {
      var instructions = makeEl("div", "se-focal-instructions", panel);
      instructions.textContent =
        "Click the minimal set of cards that matter most to your answer.";
    }

    var focal = makeEl("div", "se-focal", panel);
    focal.innerHTML = CardEx.renderHandHTML(hand, {
      cardHeight: 100,
      gap: "4px",
      justify: "center"
    });

    // ── Multi-card selection state (token conditions only) ──
    var selected = new Set();
    var locked = false;

    if (opts.selectable) {
      var cards = focal.querySelectorAll(".card-wrapper");
      cards.forEach(function (card, idx) {
        card.addEventListener("click", function () {
          if (locked) return;
          if (selected.has(idx)) {
            selected.delete(idx);
            card.classList.remove("se-selected");
          } else {
            selected.add(idx);
            card.classList.add("se-selected");
          }
          if (typeof opts.onSelectionChange === "function") {
            opts.onSelectionChange(focal.getSelectedIndices());
          }
        });
      });
    }

    focal.getSelectedIndices = function () {
      var arr = Array.from(selected);
      arr.sort(function (a, b) { return a - b; });
      return arr;
    };
    focal.getSelectionCount = function () { return selected.size; };
    focal.lockSelection = function () {
      locked = true;
      var cards = focal.querySelectorAll(".card-wrapper");
      cards.forEach(function (card) { card.classList.add("se-locked"); });
    };

    return focal;
  }

  // ════════════════════════════════════════════════════
  // Peer-classification banner
  // ════════════════════════════════════════════════════

  // renderPeerBanner(claim, container)
  // Builds the "Another participant said this hand is WINNING/LOSING."
  // banner used in the peer condition. In the live flow this banner is
  // passed as `opts.label` to renderFocalHand so it sits in place of the
  // default "Classify This Hand" header — the framing has changed (the
  // participant judges the peer, not the hand directly), so the original
  // header would mislead.
  //
  // `claim`     — "winning" or "losing" — the fictional peer's classification.
  // `container` — optional. If null/undefined, the banner is returned
  //               detached so the caller can mount it (e.g. via opts.label).
  // Returns the banner element.
  function renderPeerBanner(claim, container) {
    var banner = document.createElement("div");
    banner.className = "se-peer-banner";
    var prefix = document.createElement("span");
    prefix.textContent = "Another participant said this hand is ";
    var chip = document.createElement("span");
    chip.className = "se-peer-claim se-peer-claim--" + claim;
    chip.textContent = claim.toUpperCase();
    var suffix = document.createElement("span");
    suffix.textContent = ".";
    banner.appendChild(prefix);
    banner.appendChild(chip);
    banner.appendChild(suffix);
    if (container) {
      resolveContainer(container).appendChild(banner);
    }
    return banner;
  }

  // ════════════════════════════════════════════════════
  // Integrated Prompt + Recording Box
  // ════════════════════════════════════════════════════

  // renderPromptRecordingBox(promptText, container)
  // Creates a single white box with the prompt text in the upper portion,
  // a thin divider, and recording controls in the lower portion.
  //
  // Returns { box, recordingSection } — the box element and the recording
  // section element (which contains the mic icon, timer, and status).
  function renderPromptRecordingBox(promptText, container) {
    var parent = resolveContainer(container);
    var box = makeEl("div", "se-prompt-recording-box", parent);

    // Upper portion: prompt text
    var promptSection = makeEl("div", "se-prompt-section", box);
    promptSection.innerHTML = promptText;

    // Divider
    makeEl("div", "se-prompt-divider", box);

    // Lower portion: recording controls
    var recSection = makeEl("div", "se-recording-section", box);

    var icon = makeEl("span", "se-rec-icon", recSection);
    icon.textContent = "\uD83C\uDFA4";
    icon.setAttribute("data-role", "icon");

    var timer = makeEl("span", "se-rec-timer", recSection);
    timer.textContent = "0.0s";
    timer.setAttribute("data-role", "timer");

    var status = makeEl("span", "se-rec-status", recSection);
    status.textContent = "Press Space to record";
    status.setAttribute("data-role", "status");

    // Phase 4 chunk 6: live mic waveform canvas. Lives below the recording
    // controls; only visible when the box is in the .recording state (CSS).
    var waveformWrap = makeEl("div", "se-rec-waveform", box);
    var canvas = makeEl("canvas", null, waveformWrap);
    canvas.setAttribute("data-role", "waveform");

    return { box: box, recordingSection: recSection };
  }

  // ─── Live waveform drawing ─────────────────────────────
  // drawWaveform(canvas, analyser) — Draws one frame of time-domain audio
  // amplitude as a polyline. Designed to be called from inside an animation-
  // frame loop while recording. Re-syncs the canvas backing-store dimensions
  // to its CSS size on each call so the line stays sharp on high-DPR displays.
  function drawWaveform(canvas, analyser) {
    if (!canvas || !analyser) return;
    var ctx = canvas.getContext("2d");

    var dpr = window.devicePixelRatio || 1;
    var cssW = canvas.clientWidth || 200;
    var cssH = canvas.clientHeight || 28;
    var pxW = Math.round(cssW * dpr);
    var pxH = Math.round(cssH * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }

    var bufferLen = analyser.fftSize;
    if (!canvas._waveBuf || canvas._waveBuf.length !== bufferLen) {
      canvas._waveBuf = new Uint8Array(bufferLen);
    }
    analyser.getByteTimeDomainData(canvas._waveBuf);

    ctx.clearRect(0, 0, pxW, pxH);
    ctx.lineWidth = 2 * dpr;
    var sage = getComputedStyle(document.documentElement)
      .getPropertyValue("--sage").trim() || "#7FA67D";
    ctx.strokeStyle = sage;
    ctx.lineCap = "round";
    ctx.beginPath();

    var slice = pxW / bufferLen;
    var x = 0;
    for (var i = 0; i < bufferLen; i++) {
      var v = (canvas._waveBuf[i] - 128) / 128.0;
      var y = (pxH / 2) + v * (pxH / 2) * 0.85;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += slice;
    }
    ctx.stroke();
  }

  // showRecordedSegment(box, segment) — Phase 4 chunk 7 follow-up.
  //
  // After a recording successfully stops, switches the prompt-recording-box
  // out of the recording state and into a "recorded" state that confirms
  // capture and offers a replay button. Without this, stopping recording
  // returns the box to the idle "Press Space to record" state — no cue
  // that the recording actually went through.
  //
  // Visual: green-check icon, duration of just-completed recording,
  // a Replay button, and a subtle "or press Space to re-record" hint.
  // Pressing Space again starts a new recording (existing toggle logic),
  // and updatePromptRecordingBox will overwrite this state on next frame.
  function showRecordedSegment(box, segment) {
    if (!box || !segment) return;
    var recSection = box.querySelector(".se-recording-section");
    if (!recSection) return;

    var icon = recSection.querySelector("[data-role='icon']");
    var timer = recSection.querySelector("[data-role='timer']");
    var status = recSection.querySelector("[data-role='status']");

    box.classList.remove("recording");
    box.classList.add("recorded");

    if (icon) {
      icon.innerHTML = '<span class="se-rec-check">✓</span>';
    }
    if (timer) {
      var secs = (segment.duration_ms / 1000).toFixed(1);
      timer.textContent = secs + "s";
    }
    if (status) {
      status.innerHTML =
        '<button type="button" class="se-rec-replay" data-role="replay">' +
        '<span class="se-rec-replay-icon">▶</span> Replay</button>' +
        '<span class="se-rec-rerecord-hint">' +
        ' · or press Space to re-record</span>';
      status.className = "se-rec-status recorded";
    }

    // Wire up replay button. Convert the base64 audio data back to a
    // playable data URL; the resulting <audio> element is created on demand
    // each click so the user can replay multiple times.
    var replayBtn = recSection.querySelector("[data-role='replay']");
    if (replayBtn) {
      replayBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        // Stop any currently-playing replay (e.g. fast double-clicks)
        if (showRecordedSegment._currentAudio) {
          try { showRecordedSegment._currentAudio.pause(); } catch (err) {}
          showRecordedSegment._currentAudio = null;
        }
        var mime = segment.mimeType || "audio/webm";
        var src = "data:" + mime + ";base64," + segment.audioData;
        var audio = new Audio(src);
        showRecordedSegment._currentAudio = audio;
        replayBtn.classList.add("playing");
        audio.addEventListener("ended", function () {
          replayBtn.classList.remove("playing");
          if (showRecordedSegment._currentAudio === audio) {
            showRecordedSegment._currentAudio = null;
          }
        });
        audio.addEventListener("error", function () {
          replayBtn.classList.remove("playing");
        });
        audio.play().catch(function (err) {
          replayBtn.classList.remove("playing");
          console.warn("SEUI: could not play recording.", err);
        });
      });
    }
  }

  // updatePromptRecordingBox(box, isRecording, elapsedMs, meetsMin)
  // Updates the integrated prompt+recording box to reflect recording state.
  function updatePromptRecordingBox(box, isRecording, elapsedMs, meetsMin) {
    var recSection = box.querySelector(".se-recording-section");
    if (!recSection) return;

    var icon = recSection.querySelector("[data-role='icon']");
    var timer = recSection.querySelector("[data-role='timer']");
    var status = recSection.querySelector("[data-role='status']");
    var waveCanvas = box.querySelector("[data-role='waveform']");

    if (isRecording) {
      box.classList.add("recording");
      // Re-record from a recorded state: clear the recorded UI so the
      // post-recording widget doesn't bleed into the new recording.
      box.classList.remove("recorded");
      icon.innerHTML = '<span class="se-rec-dot"></span>';
      var seconds = (elapsedMs / 1000).toFixed(1);
      timer.textContent = seconds + "s";

      if (meetsMin) {
        status.textContent = "Press Space to stop";
        status.className = "se-rec-status ready";
      } else {
        status.textContent = "Keep speaking...";
        status.className = "se-rec-status";
      }

      if (waveCanvas && window.SEAudio && SEAudio.getAnalyser) {
        drawWaveform(waveCanvas, SEAudio.getAnalyser());
      }
    } else {
      box.classList.remove("recording");
      icon.textContent = "\uD83C\uDFA4";
      timer.textContent = "0.0s";
      status.textContent = "Press Space to record";
      status.className = "se-rec-status";
      if (waveCanvas) {
        var cctx = waveCanvas.getContext("2d");
        cctx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
      }
    }
  }

  // ════════════════════════════════════════════════════
  // Prompts (standalone)
  // ════════════════════════════════════════════════════

  // renderPrompt(text, container)
  function renderPrompt(text, container) {
    var parent = resolveContainer(container);
    var prompt = makeEl("div", "se-prompt", parent);
    prompt.innerHTML = text;
    return prompt;
  }

  // ════════════════════════════════════════════════════
  // Recording indicator (standalone, for waitForRecording screens)
  // ════════════════════════════════════════════════════

  // renderRecordingIndicator(container)
  function renderRecordingIndicator(container) {
    var parent = resolveContainer(container);
    var indicator = makeEl("div", "se-recording-indicator", parent);

    var icon = makeEl("span", "se-rec-icon", indicator);
    icon.textContent = "\uD83C\uDFA4";
    icon.setAttribute("data-role", "icon");

    var timer = makeEl("span", "se-rec-timer", indicator);
    timer.textContent = "0.0s";
    timer.setAttribute("data-role", "timer");

    var status = makeEl("span", "se-rec-status", indicator);
    status.textContent = "Press Space to record";
    status.setAttribute("data-role", "status");

    return indicator;
  }

  // updateRecordingIndicator(el, isRecording, elapsedMs, meetsMin)
  function updateRecordingIndicator(el, isRecording, elapsedMs, meetsMin) {
    var icon = el.querySelector("[data-role='icon']");
    var timer = el.querySelector("[data-role='timer']");
    var status = el.querySelector("[data-role='status']");

    if (isRecording) {
      el.classList.add("recording");
      icon.innerHTML = '<span class="se-rec-dot"></span>';
      var seconds = (elapsedMs / 1000).toFixed(1);
      timer.textContent = seconds + "s";

      if (meetsMin) {
        status.textContent = "Press Space to stop";
        status.className = "se-rec-status ready";
      } else {
        status.textContent = "Keep speaking...";
        status.className = "se-rec-status";
      }
    } else {
      el.classList.remove("recording");
      icon.textContent = "\uD83C\uDFA4";
      timer.textContent = "0.0s";
      status.textContent = "Press Space to record";
      status.className = "se-rec-status";
    }
  }

  // ════════════════════════════════════════════════════
  // Buttons
  // ════════════════════════════════════════════════════

  // renderButtons(onPrimary, onSecondary, container, opts)
  // Renders a paired button row. Defaults to Winning / Losing for the normal
  // classification flow; the `opts` parameter lets the peer condition swap
  // in Agree / Disagree without touching the rest of the trial machinery.
  //
  // opts: {
  //   labels: { primary, secondary }   — visible button text
  //   values: { primary, secondary }   — values returned to waitForClassification
  //   classes: { primary, secondary }  — extra class names (default win/lose
  //                                       colour treatment for the standard flow,
  //                                       peer-styled buttons for Agree/Disagree)
  // }
  //
  // Returned object exposes both `primaryBtn`/`secondaryBtn` (semantic) and
  // `winBtn`/`loseBtn` (legacy aliases) so existing call sites still work.
  function renderButtons(onPrimary, onSecondary, container, opts) {
    opts = opts || {};
    var labels  = opts.labels  || { primary: "Winning",  secondary: "Losing"  };
    var values  = opts.values  || { primary: "winning",  secondary: "losing"  };
    var classes = opts.classes || { primary: "se-btn-win", secondary: "se-btn-lose" };

    var parent = resolveContainer(container);
    var row = makeEl("div", "se-buttons", parent);

    var primaryBtn = makeEl("button", "se-btn " + classes.primary, row);
    primaryBtn.textContent = labels.primary;
    primaryBtn.addEventListener("click", function () {
      if (!primaryBtn.disabled) onPrimary();
    });

    var secondaryBtn = makeEl("button", "se-btn " + classes.secondary, row);
    secondaryBtn.textContent = labels.secondary;
    secondaryBtn.addEventListener("click", function () {
      if (!secondaryBtn.disabled) onSecondary();
    });

    return {
      row: row,
      primaryBtn: primaryBtn,
      secondaryBtn: secondaryBtn,
      values: values,
      // Legacy aliases — same elements under the old names so existing
      // code that hits btns.winBtn / btns.loseBtn keeps working.
      winBtn: primaryBtn,
      loseBtn: secondaryBtn
    };
  }

  // setButtonsEnabled(btns, enabled)
  function setButtonsEnabled(btns, enabled) {
    btns.primaryBtn.disabled = !enabled;
    btns.secondaryBtn.disabled = !enabled;
  }

  // ════════════════════════════════════════════════════
  // History (legacy horizontal strip — kept for compatibility)
  // ════════════════════════════════════════════════════

  function renderHistory(container) {
    var parent = resolveContainer(container);
    var wrapper = makeEl("div", "se-history", parent);

    var label = makeEl("div", "se-history-label", wrapper);
    label.textContent = "Previous hands";

    var strip = makeEl("div", "se-history-strip", wrapper);
    strip.setAttribute("data-role", "strip");

    return wrapper;
  }

  function addToHistory(histEl, hand, category, response, correct, feedbackOn) {
    var strip = histEl.querySelector("[data-role='strip']");
    var handDiv = makeEl("div", "se-history-hand", strip);

    handDiv.innerHTML = CardEx.renderHandHTML(hand, {
      cardHeight: 45,
      gap: "1px",
      justify: "center"
    });

    if (feedbackOn) {
      handDiv.classList.add(category);

      var overlay = makeEl("div", "se-history-overlay", handDiv);
      if (correct) {
        overlay.classList.add("correct");
        overlay.textContent = "\u2713";
      } else {
        overlay.classList.add("incorrect");
        overlay.textContent = "\u2717";
      }
    } else {
      handDiv.classList.add("neutral");

      var responseLabel = makeEl("div", "se-history-response-label", handDiv);
      responseLabel.textContent = response === "winning" ? "Win" : "Lose";
    }

    strip.scrollLeft = strip.scrollWidth;
  }

  // ════════════════════════════════════════════════════
  // Feedback
  // ════════════════════════════════════════════════════

  // showFeedback(focalEl, category, correct, response) \u2192 Promise
  //   category = the hand's TRUE category ("winning"/"losing")
  //   response = the participant's guess ("winning"/"losing")
  // Adds a subtle category frame to the focal hand and renders a two-line
  // verdict + a self-paced "Next" button below it. Resolves when Next is
  // clicked (study #3 self-paced pacing). Callers clear the Win/Lose buttons
  // before calling, so Next is the only control on screen.
  function showFeedback(focalEl, category, correct, response) {
    focalEl.classList.add("se-feedback");
    focalEl.classList.add(category === "winning" ? "fb-winning" : "fb-losing");

    var catWord = category === "winning" ? "Winning" : "Losing";
    var guessWord = response === "winning" ? "Winning" : "Losing";

    var verdict = makeEl("div", "se-verdict", focalEl.parentNode || focalEl);
    verdict.classList.add(correct ? "correct" : "incorrect");
    verdict.innerHTML =
      '<div class="se-verdict-text">' +
        '<div class="se-verdict-line1">This hand is a ' +
          '<span class="se-verdict-bubble ' + category + '">' + catWord + '</span> hand.</div>' +
        '<div class="se-verdict-line2">You guessed: ' +
          '<span class="se-verdict-guess">' + guessWord + '</span> ' +
          '<span class="se-verdict-mark">' + (correct ? "\u2713" : "\u2717") + '</span> ' +
          '<span class="se-verdict-word">' + (correct ? "Correct" : "Incorrect") + '.</span></div>' +
      '</div>';

    var next = document.createElement("button");
    next.className = "se-verdict-next";
    next.textContent = "Next \u2192";
    verdict.appendChild(next);

    return new Promise(function (resolve) {
      next.addEventListener("click", function () { resolve(); }, { once: true });
    });
  }

  // ════════════════════════════════════════════════════
  // Checkpoint
  // ════════════════════════════════════════════════════

  function renderCheckpointPrompt(container) {
    var parent = resolveContainer(container);
    var wrapper = makeEl("div", "se-checkpoint se-animate-in", parent);

    var heading = makeEl("h3", "", wrapper);
    heading.textContent = "Checkpoint";

    var body = makeEl("p", "", wrapper);
    body.textContent = "What type of rule do you think determines whether a hand wins?";

    return wrapper;
  }

  // ════════════════════════════════════════════════════
  // Tutorial slides
  // ════════════════════════════════════════════════════

  // renderTutorialStep(config)
  // Renders a polished two-column tutorial slide inside #app.
  //
  // config: {
  //   stepNumber:    number,     // current step (1-based)
  //   totalSteps:    number,     // total steps
  //   centered:      boolean,    // if true, single centered column (no illustration)
  //   heading:       string,     // slide title
  //   bodyHTML:       string,     // HTML for the text column
  //   illustrationFn: function(el),  // optional: populates the illustration panel
  //   highlightText: string,     // optional: text for a highlight box in the text column
  //   showBack:      boolean,    // show Back button (default false)
  //   nextLabel:     string,     // label for next button (default "Next")
  //   hideNext:      boolean,    // if true, omit the Next button entirely —
  //                              // used by classify-practice slides where the
  //                              // participant advances via a Win/Lose click
  //                              // inside the illustration, not a Next button.
  //   onNext:        function,   // callback for Next
  //   onBack:        function    // callback for Back
  // }
  //
  // Returns the slide DOM element (already appended to #app).
  function renderTutorialStep(config) {
    var app = document.getElementById("app");

    // Hide the default #app flex layout — tutorial uses its own wrapper
    app.style.display = "block";
    app.style.padding = "0";
    app.style.maxWidth = "none";
    app.style.minHeight = "auto";

    var wrapper = makeEl("div", "se-tutorial-wrapper", app);
    var slideClass = "se-tutorial-slide";
    if (config.centered) slideClass += " is-transition";
    if (config.compact) slideClass += " is-compact";
    var slide = makeEl("div", slideClass, wrapper);

    // ── Slide body ──
    var body = makeEl("div", "se-tutorial-slide-body", slide);

    if (config.centered) {
      // Single centred column
      var center = makeEl("div", "se-tutorial-centered", body);

      if (config.eyebrow) {
        var eyebC = makeEl("div", "se-tutorial-eyebrow", center);
        eyebC.textContent = config.eyebrow;
      }
      if (config.heading) {
        var h2 = makeEl("h2", "", center);
        h2.textContent = config.heading;
      }
      if (config.bodyHTML) {
        // Use the same .se-tutorial-text class as the two-column path so
        // h2 / p / .lead all get the warm-palette typography from CSS.
        // (Previously this branch hardcoded inline color/font-size on every
        // <p>, which clashed with the chunk-10 palette swap.)
        var textDiv = makeEl("div", "se-tutorial-text", center);
        textDiv.innerHTML = config.bodyHTML;
      }
      if (config.highlightText) {
        var hl = makeEl("div", "se-tutorial-highlight", center);
        var hlp = makeEl("p", "", hl);
        hlp.innerHTML = config.highlightText;
      }
      // Allow centered content to also have a custom builder
      if (config.illustrationFn) {
        config.illustrationFn(center);
      }
    } else {
      // Two-column layout
      var cols = makeEl("div", "se-tutorial-columns", body);

      // Left: text
      var textCol = makeEl("div", "se-tutorial-text", cols);
      if (config.eyebrow) {
        var eyeb = makeEl("div", "se-tutorial-eyebrow", textCol);
        eyeb.textContent = config.eyebrow;
      }
      if (config.heading) {
        var h2b = makeEl("h2", "", textCol);
        h2b.textContent = config.heading;
      }
      if (config.bodyHTML) {
        var textDiv2 = makeEl("div", "", textCol);
        textDiv2.innerHTML = config.bodyHTML;
      }
      if (config.highlightText) {
        var hl2 = makeEl("div", "se-tutorial-highlight", textCol);
        var hlp2 = makeEl("p", "", hl2);
        hlp2.innerHTML = config.highlightText;
      }

      // Right: illustration
      var illCol = makeEl("div", "se-tutorial-illustration", cols);
      if (config.illustrationFn) {
        config.illustrationFn(illCol);
      }
    }

    // ── Navigation row ──
    var nav = makeEl("div", "se-tutorial-nav", slide);

    var stepLabel = makeEl("span", "se-tutorial-step-label", nav);
    stepLabel.textContent = "Step " + config.stepNumber + " of " + config.totalSteps;

    var btnGroup = makeEl("div", "se-tutorial-nav-buttons", nav);

    if (config.showBack && config.onBack) {
      var backBtn = makeEl("button", "se-tutorial-btn se-tutorial-btn-secondary", btnGroup);
      backBtn.textContent = "Back";
      backBtn.addEventListener("click", function () {
        config.onBack();
      });
    }

    // The Next button is omitted on slides that advance via a custom action
    // inside the illustration (e.g. classify-practice slides — the Win/Lose
    // click is the advance action). nextBtn is left null in that case.
    var nextBtn = null;
    if (!config.hideNext) {
      nextBtn = makeEl("button", "se-tutorial-btn se-tutorial-btn-primary", btnGroup);
      nextBtn.textContent = config.nextLabel || "Next";
      nextBtn.setAttribute("data-role", "next-btn");
      if (config.onNext) {
        nextBtn.addEventListener("click", function () {
          if (!nextBtn.disabled) config.onNext();
        });
      }
    }

    // ── Progress bar at bottom ──
    var progressBar = makeEl("div", "se-tutorial-progress", slide);
    var progressFill = makeEl("div", "se-tutorial-progress-fill", progressBar);
    var pct = config.totalSteps > 0 ? Math.round((config.stepNumber / config.totalSteps) * 100) : 0;
    progressFill.style.width = pct + "%";

    return { slide: slide, nextBtn: nextBtn };
  }

  // ════════════════════════════════════════════════════
  // Screen management
  // ════════════════════════════════════════════════════

  // clearApp()
  function clearApp() {
    var app = document.getElementById("app");
    if (app) {
      app.innerHTML = "";
      // Reset any tutorial overrides on #app style
      app.style.display = "";
      app.style.padding = "";
      app.style.maxWidth = "";
      app.style.minHeight = "";
      // Drop screen-scoped layout classes so nothing leaks between screens.
      // se-fit-viewport is added by gallery study + writeup screens to lock
      // #app to a fixed viewport height; it MUST be off for normal screens
      // (otherwise content that legitimately exceeds 100vh gets clipped).
      app.classList.remove("se-fit-viewport");
    }
  }

  // showMessage(text, className)
  function showMessage(text, className) {
    clearApp();
    var app = document.getElementById("app");
    var msg = makeEl("div", "se-message se-animate-in", app);
    if (className) msg.classList.add(className);
    msg.innerHTML = text;
  }

  // renderContinueButton(onContinue, container)
  function renderContinueButton(onContinue, container) {
    var parent = resolveContainer(container);
    var btn = makeEl("button", "se-btn-continue", parent);
    btn.textContent = "Continue";
    btn.disabled = true;

    btn.addEventListener("click", function () {
      if (!btn.disabled) onContinue();
    });

    return btn;
  }

  // ════════════════════════════════════════════════════
  // Progress bar (inline, within #app)
  // ════════════════════════════════════════════════════

  function renderProgressBar(current, total, container) {
    var parent = resolveContainer(container);
    var wrapper = makeEl("div", "se-progress", parent);

    var bar = makeEl("div", "se-progress-bar", wrapper);
    var fill = makeEl("div", "se-progress-fill", bar);

    var pct = total > 0 ? Math.round((current / total) * 100) : 0;
    fill.style.width = pct + "%";

    var label = makeEl("div", "se-progress-label", wrapper);
    label.textContent = current + " / " + total;

    return wrapper;
  }

  // ════════════════════════════════════════════════════
  // End-of-round typed rule writeup screen (Phase 4 chunk 7)
  //
  // DEPRECATED in v2 (mature design, 2026-05-07): the per-round writeup is
  // dropped per design §2 — typed articulation moves to a single
  // end-of-curriculum bulk screen. This function is retained to preserve
  // the option to revive per-round writeups in a future variant; current
  // production code (game.js) does not call it.
  // ════════════════════════════════════════════════════

  // renderEndOfRoundWriteup(galleryHands, container, opts)
  // Shows the end-of-rule typed rule articulation screen and resolves once
  // the participant clicks Continue.
  //
  // Layout (per Phase 3 design — variant C v3 mockup):
  //   - Header: "These were the winning hands"
  //   - Column-stack gallery (matching the rule-gallery pilot's format,
  //     so the typed responses are directly comparable to that data)
  //   - Prompt: "What rule do you think these hands follow? ..."
  //   - Multi-line textarea (focus auto-set on render)
  //   - Continue button (disabled until both gates pass)
  //
  // Gating (inherits from rule-gallery pilot, see gallery-app.js:820-830):
  //   - At least 5 characters typed
  //   - At least 5 seconds elapsed since the screen appeared
  //
  // opts (optional):
  //   minChars     : default 5
  //   minDwellMs   : default 5000
  //   ruleLabel    : optional string for the heading (e.g. "Game 1 of 4")
  //
  // Returns Promise<{ response, dwellMs, editCount, charCount }>.
  function renderEndOfRoundWriteup(galleryHands, container, opts) {
    opts = opts || {};
    var minChars = (typeof opts.minChars === "number") ? opts.minChars : 5;
    var minDwellMs = (typeof opts.minDwellMs === "number") ? opts.minDwellMs : 5000;

    return new Promise(function (resolve) {
      var parent = resolveContainer(container);
      var startTime = performance.now();
      var editCount = 0;

      // Lock #app to an exact viewport height for the duration of this
      // screen — without this, the flex chain below (#app → panel →
      // gallery → stack) is rooted at min-height: 100vh, which lets
      // pre-scaled card content (cardHeight: 200 × 6 rows) push the
      // chain past 100vh and force a page scroll. The class is cleared
      // on Continue (see onContinue below).
      var appEl = document.getElementById("app");
      if (appEl) appEl.classList.add("se-fit-viewport");

      // Outer panel — Warm Workshop chrome via .se-writeup-panel
      var panel = makeEl("div", "se-writeup-panel se-animate-in", parent);

      // Optional small label above the heading
      if (opts.ruleLabel) {
        var subLabel = makeEl("div", "se-writeup-sublabel", panel);
        subLabel.textContent = opts.ruleLabel;
      }

      // Banner heading
      var bannerLabel = makeEl("div", "se-writeup-banner-label", panel);
      bannerLabel.textContent = "These were the winning hands";

      // Column-stack gallery — same format as the rule-gallery pilot (so
      // the typed rule responses live in the same stimulus context as the
      // pilot's data).
      var galleryWrap = makeEl("div", "se-writeup-gallery", panel);
      renderGallery(galleryHands, galleryWrap, false);
      // renderGallery applies the standard --panel-bg + chrome; we override
      // those visually via .se-writeup-gallery .se-gallery in CSS so the
      // gallery sits flush inside the writeup panel.
      //
      // Clear the gallery-stack inline max-height that renderGallery sets
      // (65vh non-compact / 45vh compact) so the CSS rule for the writeup
      // context can take over. The CSS makes the stack flex-grow inside
      // the panel, so the cards expand into otherwise-wasted whitespace
      // below the textarea on tall viewports.
      var stackEl = galleryWrap.querySelector(".se-gallery-stack");
      if (stackEl) stackEl.style.maxHeight = "";

      // Prompt
      var prompt = makeEl("div", "se-writeup-prompt", panel);
      prompt.textContent =
        "What rule do you think these hands follow? Try to describe it as fully as you can.";

      // Textarea
      var textarea = makeEl("textarea", "se-writeup-textarea", panel);
      textarea.placeholder = "Begin typing...";
      textarea.rows = 6;
      textarea.spellcheck = true;

      // Footer row: gating meta on left, Continue button on right
      var footer = makeEl("div", "se-writeup-footer", panel);
      var meta = makeEl("div", "se-writeup-meta", footer);
      meta.textContent =
        "Minimum " + minChars + " characters · " +
        Math.round(minDwellMs / 1000) + " seconds dwell";

      var continueBtn = makeEl("button", "se-btn-continue", footer);
      continueBtn.textContent = "Continue";
      continueBtn.disabled = true;

      // Gate evaluation — runs on every keystroke and once a second so
      // the time gate enables even if the user stops typing.
      var lastValue = "";
      function evaluateGate() {
        var text = textarea.value.trim();
        var charsOk = text.length >= minChars;
        var elapsed = performance.now() - startTime;
        var timeOk = elapsed >= minDwellMs;
        continueBtn.disabled = !(charsOk && timeOk);
      }

      textarea.addEventListener("input", function () {
        // Track edit count: increment on each input event AFTER the first
        // (the first input is the participant starting to type).
        if (textarea.value !== lastValue) {
          editCount++;
          lastValue = textarea.value;
        }
        evaluateGate();
      });

      // Re-evaluate once a second so the time gate clears even with no
      // further typing once minChars is met.
      var gateInterval = setInterval(evaluateGate, 250);

      function onContinue() {
        if (continueBtn.disabled) return;
        clearInterval(gateInterval);
        // Release the viewport lock so the next screen (next rule's
        // gallery study, or end-of-experiment) renders normally.
        if (appEl) appEl.classList.remove("se-fit-viewport");
        var dwellMs = Math.round(performance.now() - startTime);
        var response = textarea.value.trim();
        resolve({
          response: response,
          dwellMs: dwellMs,
          editCount: editCount,
          charCount: response.length
        });
      }
      continueBtn.addEventListener("click", onContinue);

      // Keyboard shortcut: Cmd/Ctrl + Enter submits when gate passes
      textarea.addEventListener("keydown", function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !continueBtn.disabled) {
          e.preventDefault();
          onContinue();
        }
      });

      // Auto-focus the textarea so participants can start typing immediately
      setTimeout(function () { textarea.focus(); }, 80);
    });
  }

  // ════════════════════════════════════════════════════
  // Rule-transition buffer screen (C2 — v2 mature design)
  // ════════════════════════════════════════════════════
  //
  // A short pause (~1.5 s) between rules. Replaces what used to be the
  // per-round writeup as a "breath" between games. Resolves automatically
  // — no participant action required.
  //
  // renderRuleTransitionBuffer(container, justFinishedNumber, totalRules)
  //   container             : the #app element (cleared on entry)
  //   justFinishedNumber    : 1..totalRules — the rule that just ended
  //   totalRules            : the curriculum's nRules
  // Returns a Promise that resolves after the buffer duration elapses.
  function renderRuleTransitionBuffer(container, justFinishedNumber, totalRules, opts) {
    opts = opts || {};
    var durationMs = opts.durationMs || 1500;
    var nextNumber = (justFinishedNumber || 0) + 1;
    var heading = (justFinishedNumber === totalRules)
      ? "Last game complete"
      : "Next game (" + nextNumber + " of " + totalRules + ")";
    container.innerHTML =
      '<div class="se-rule-buffer" style="' +
      "max-width:480px;margin:140px auto;text-align:center;color:#475569;" +
      'font-family:system-ui,-apple-system,sans-serif;">' +
      '<div style="font-size:14px;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">' +
      "GAME " + (justFinishedNumber || 0) + " OF " + totalRules + " COMPLETE" +
      "</div>" +
      '<h2 style="margin:8px 0 0 0;font-weight:500;color:#1e293b;">' +
      heading + "</h2>" +
      "</div>";
    return new Promise(function (resolve) {
      setTimeout(resolve, durationMs);
    });
  }

  // ════════════════════════════════════════════════════
  // End-of-curriculum bulk articulation screen (C3 — v2 mature design)
  // ════════════════════════════════════════════════════
  //
  // After the last classification round, the participant is shown each
  // rule's 6-card gallery in chronological order and writes a typed
  // description of what made the hands "winning" for that rule.
  //
  // This is the SOLE typed DV in v2 (per design §3.2). It must surprise the
  // participant — the demo presets and tutorial deliberately avoid mentioning
  // it (per design §3.3).
  //
  // renderBulkArticulation(container, ruleData, position, total, gateConfig)
  //   container   : the #app element (cleared on entry)
  //   ruleData    : RuleData with .ruleId and .exemplarHands (the gallery)
  //   position    : 1..total — which rule we're currently writing about
  //   total       : the participant's curriculum length (5 in production)
  //   gateConfig  : { minChars: int, minSec: number } — gate before Continue
  //
  // Resolves to:
  //   { ruleId, rulePosition, response, rt, minChars, minSec, passedGate,
  //     timestamp }
  function renderBulkArticulation(container, ruleData, position, total, gateConfig) {
    gateConfig = gateConfig || {};
    var minChars = (typeof gateConfig.minChars === "number") ? gateConfig.minChars : 10;
    var minSec = (typeof gateConfig.minSec === "number") ? gateConfig.minSec : 5;

    // First-screen-only intro line so participants understand the bulk task
    var introHtml = (position === 1)
      ? '<p class="se-bulk-intro" style="max-width:560px;margin:8px auto 24px;line-height:1.7;color:#475569;font-size:15px;">' +
        "For each game, you saw 6 winning hands. Now please describe what " +
        "you think made a hand winning for each one." +
        "</p>"
      : "";

    // Layout target: fit at 1280×900 without scrolling (F2). The gallery
    // wrapper is height-capped to leave room for prompt + textarea + Continue.
    //
    // Anti-autofill (R2/2.5): randomize the textarea's name so cross-rule
    // autofill doesn't surface a previous response as a suggestion. modern
    // browsers ignore autocomplete="off" on <textarea> in many configurations;
    // a unique name per render is the most reliable workaround. We also keep
    // autocomplete="new-password" which Chromium honors more aggressively
    // than "off" for unrecognized field types.
    var textareaName = "se_bulk_" + ruleData.ruleId + "_" +
      Math.random().toString(36).slice(2, 10);
    container.innerHTML =
      '<div class="se-bulk-screen" style="max-width:920px;margin:12px auto;padding:12px 16px;font-family:system-ui,-apple-system,sans-serif;color:#1e293b;">' +
      (position === 1
        ? '<div class="se-eyebrow" style="font-size:13px;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">One more thing</div>'
        : '<div class="se-eyebrow" style="font-size:13px;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">Game ' + position + ' of ' + total + '</div>'
      ) +
      introHtml +
      // C3 (2026-05-09): height-adaptive wrapper. Inline style only the
      // baseline; styles.css adds @media-height breakpoints so 13-inch
      // (1280×800) gets ~56vh (gallery fits without scroll), 1024×768
      // stays capped at 48vh (no overflow), 1440×900+ gets ~62vh.
      '<div class="se-bulk-gallery-wrap"></div>' +
      '<p class="se-bulk-prompt" style="text-align:center;margin:14px 0 8px;font-size:16px;color:#1e293b;">' +
      "These hands all share a rule. What was it?" +
      "</p>" +
      '<textarea class="se-bulk-textarea" rows="3" name="' + textareaName +
      '" autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" ' +
      'style="display:block;width:100%;max-width:680px;margin:0 auto;padding:12px;font-size:15px;line-height:1.5;border:2px solid #cbd5e1;border-radius:6px;font-family:inherit;color:#1e293b;background:#fff;"></textarea>' +
      '<div style="text-align:center;margin-top:12px;">' +
      '<button class="se-bulk-continue" disabled ' +
      'style="padding:10px 24px;font-size:15px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;opacity:0.4;">' +
      "Continue (" + position + "/" + total + ")</button>" +
      '<div class="se-bulk-gate-hint" style="margin-top:6px;font-size:13px;color:#94a3b8;"></div>' +
      "</div>" +
      "</div>";

    // Render the 6-hand gallery via the existing renderGallery() helper —
    // matches the rule-gallery pilot's column-stack format so participant
    // typed responses are directly comparable to that data.
    //
    // R2/2.3: gallery render is LOAD-BEARING for the bulk articulation —
    // a participant typing "what rule do these hands share?" with no
    // visible hands produces uninterpretable data with no way for analysis
    // to detect the missing stimulus after the fact. Hard-fail rather
    // than silently continue with an empty wrapper.
    //
    // compact=true keeps the bulk screen above the fold at 1280×900.
    var galleryWrap = container.querySelector(".se-bulk-gallery-wrap");
    var hands = ruleData.exemplarHands || [];
    var galleryRendered = false;
    if (galleryWrap && hands.length > 0) {
      try {
        renderGallery(hands, galleryWrap, true /* compact */);
        galleryRendered = true;
      } catch (e) {
        console.error("renderBulkArticulation: gallery render failed —", e);
        // Surface to the loader's fail screen so analysis can't be
        // contaminated by writeups recorded against a missing stimulus.
        if (window.SESnapshotLoader && SESnapshotLoader.showFailScreen) {
          SESnapshotLoader.showFailScreen(
            "BULK_GALLERY_RENDER_FAILED",
            "Could not render the rule's exemplar gallery. " +
            "Rule: " + (ruleData.ruleId || "(unknown)") + ". " +
            "Reason: " + (e && e.message ? e.message : String(e))
          );
        }
        return Promise.reject(new Error("BULK_GALLERY_RENDER_FAILED:" +
          (ruleData.ruleId || "(unknown)")));
      }
    }
    if (!galleryRendered) {
      // Defensive: hands.length === 0 reaches here. The snapshot validator
      // already guards against this at load time, but if it ever slips
      // through, fail closed rather than collect anchorless writeups.
      console.error(
        "renderBulkArticulation: no exemplars for rule",
        ruleData && ruleData.ruleId
      );
      if (window.SESnapshotLoader && SESnapshotLoader.showFailScreen) {
        SESnapshotLoader.showFailScreen(
          "SNAPSHOT_EXEMPLARS_MISSING",
          "No exemplar hands available to anchor the rule writeup. " +
          "Rule: " + (ruleData && ruleData.ruleId)
        );
      }
      return Promise.reject(new Error("SNAPSHOT_EXEMPLARS_MISSING:" +
        (ruleData && ruleData.ruleId)));
    }

    var startTime = performance.now();
    var textarea = container.querySelector(".se-bulk-textarea");
    var button = container.querySelector(".se-bulk-continue");
    var hint = container.querySelector(".se-bulk-gate-hint");

    return new Promise(function (resolve) {
      function checkGate() {
        var dwellMs = performance.now() - startTime;
        // R2/2.2: gate on TRIMMED length, not raw — 10 spaces should not pass.
        var trimmed = (textarea.value || "").trim();
        var charCount = trimmed.length;
        var passedChars = charCount >= minChars;
        var passedSec = dwellMs >= minSec * 1000;
        var passed = passedChars && passedSec;
        button.disabled = !passed;
        button.style.opacity = passed ? "1" : "0.4";
        button.style.cursor = passed ? "pointer" : "not-allowed";
        if (!passed) {
          var charsLeft = Math.max(0, minChars - charCount);
          var secsLeft = Math.max(0, Math.ceil(minSec - dwellMs / 1000));
          var parts = [];
          if (charsLeft > 0) parts.push(charsLeft + " more characters");
          if (secsLeft > 0) parts.push(secsLeft + "s more");
          hint.textContent = parts.length ? "Need " + parts.join(" + ") : "";
        } else {
          hint.textContent = "";
        }
      }
      var gateInterval = setInterval(checkGate, 250);
      textarea.addEventListener("input", checkGate);

      function onContinue() {
        if (button.disabled) return;
        clearInterval(gateInterval);
        var rt = Math.round(performance.now() - startTime);
        resolve({
          ruleId: ruleData.ruleId,
          rulePosition: position,
          response: (textarea.value || "").trim(),
          rt: rt,
          minChars: minChars,
          minSec: minSec,
          passedGate: true,
          galleryRendered: galleryRendered,            // R2/2.3 — for analysis
          timestamp: new Date().toISOString(),
        });
      }
      button.addEventListener("click", onContinue);
      // Cmd/Ctrl + Enter submits when gate passes
      textarea.addEventListener("keydown", function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !button.disabled) {
          e.preventDefault();
          onContinue();
        }
      });

      // Auto-focus textarea so participants can start typing
      setTimeout(function () { textarea.focus(); }, 60);
      checkGate();
    });
  }

  // _renderHandColumnHTML(hand) — a column of 6 cards. Reuses the existing
  // card rendering by leaning on CardEx if available; falls back to a
  // minimal text representation so the bulk screen still renders if
  // CardEx is unavailable.
  function _renderHandColumnHTML(hand) {
    if (!hand || !Array.isArray(hand)) return "";
    var html = "";
    for (var i = 0; i < hand.length; i++) {
      var card = hand[i];
      // Use CardEx.renderCardHTML if available (returns an <img> tag string).
      // Otherwise emit a small text-based card for resilience.
      if (window.CardEx && typeof CardEx.renderCardHTML === "function") {
        html += CardEx.renderCardHTML(card);
      } else {
        var suit = (card.suit || "").charAt(0);
        var color = (card.suit === "HEARTS" || card.suit === "DIAMONDS") ? "#dc2626" : "#1e293b";
        html +=
          '<div style="width:48px;height:64px;border:1px solid #cbd5e1;border-radius:4px;display:flex;flex-direction:column;justify-content:space-between;padding:4px;font-family:Georgia,serif;color:' +
          color + ';font-size:13px;background:#fff;">' +
          "<div>" + (card.rank || "?") + "</div>" +
          '<div style="text-align:right;">' + suit + "</div>" +
          "</div>";
      }
    }
    return html;
  }

  // ════════════════════════════════════════════════════
  // Optional final synthesis screen (C4 — v2 mature design)
  // ════════════════════════════════════════════════════
  //
  // After all bulk articulations, an optional "Anything you'd like to add
  // overall?" screen with Skip and Submit buttons.
  //
  // Resolves to:
  //   { response: string|null, rt: number, timestamp: iso8601,
  //     skipReason: 'button' | 'empty_submit' | null }
  //
  // R2/2.4: skipReason distinguishes the two skip paths instead of
  // collapsing both into `skipped: true`. Analysis filtering on
  // `response === null` should still work — but now researchers can
  // tell whether the participant clicked Skip or hit Submit empty.
  // rt is now always populated (was: null for Skip).
  function renderBulkSynthesis(container) {
    var synName = "se_syn_" + Math.random().toString(36).slice(2, 10);
    container.innerHTML =
      '<div class="se-bulk-synthesis" style="max-width:680px;margin:60px auto;padding:24px;font-family:system-ui,-apple-system,sans-serif;color:#1e293b;">' +
      '<h2 style="margin-top:0;font-weight:500;">Anything you would like to add overall?</h2>' +
      '<p style="line-height:1.7;color:#475569;">' +
      "If anything stood out to you across the games, or there is something " +
      "we missed, you can share it here. This is optional." +
      "</p>" +
      '<textarea class="se-syn-textarea" rows="5" name="' + synName +
      '" autocomplete="new-password" autocorrect="off" spellcheck="false" data-form-type="other" data-lpignore="true" ' +
      'style="display:block;width:100%;padding:14px;font-size:15px;line-height:1.6;border:2px solid #cbd5e1;border-radius:6px;font-family:inherit;color:#1e293b;background:#fff;margin-bottom:16px;"></textarea>' +
      '<div style="display:flex;justify-content:space-between;gap:12px;">' +
      '<button class="se-syn-skip" style="padding:10px 20px;font-size:14px;background:#fff;color:#475569;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;">Skip</button>' +
      '<button class="se-syn-submit" style="padding:10px 24px;font-size:14px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;">Submit</button>' +
      "</div></div>";

    var textarea = container.querySelector(".se-syn-textarea");
    var skipBtn = container.querySelector(".se-syn-skip");
    var submitBtn = container.querySelector(".se-syn-submit");
    var startTime = performance.now();

    return new Promise(function (resolve) {
      skipBtn.addEventListener("click", function () {
        resolve({
          response: null,
          rt: Math.round(performance.now() - startTime),  // R2/2.4 — always set
          timestamp: new Date().toISOString(),
          skipReason: "button",                            // R2/2.4
        });
      });
      submitBtn.addEventListener("click", function () {
        var text = (textarea.value || "").trim();
        resolve({
          response: text || null,
          rt: Math.round(performance.now() - startTime),
          timestamp: new Date().toISOString(),
          skipReason: text ? null : "empty_submit",        // R2/2.4
        });
      });
      setTimeout(function () { textarea.focus(); }, 60);
    });
  }

  // ════════════════════════════════════════════════════
  // Study #2 gallery study screen (Task 7)
  // ════════════════════════════════════════════════════
  //
  // renderStudy2Gallery(hands, container, opts)
  //   hands     : array of hand arrays (6 winning hands)
  //   container : DOM element to render into (caller's job to clear first)
  //   opts      : {
  //     minDwellMs   : ms before Continue enables — defaults to
  //                    SEConfig.galleryMinDwellMs (15 000)
  //     rulePosition : 1-based round index (for the "Game N of M" heading)
  //     totalRules   : total rounds      (for the "Game N of M" heading)
  //   }
  //
  // FIX 4+6: mirrors v2's runGalleryPhase. Adds the `se-fit-viewport` lock
  // on #app, a "Game N of M" heading, a progress bar, a properly styled
  // study prompt, and clears the gallery stack's inline maxHeight so the
  // 6-hand gallery flex-fills the viewport with no scroll.
  //
  // Layout (top to bottom):
  //   progress bar  (renderProgressBar)
  //   game heading  "Game N of M"                     (.se-game-heading)
  //   study prompt  warm, centered                    (.se-study-prompt)
  //   full-size gallery (renderGallery, compact=false) — flex-fills viewport
  //   Continue button (disabled for minDwellMs)
  //
  // Returns a Promise that resolves with the elapsed study time in ms
  // (performance.now() at click − at render start).
  function renderStudy2Gallery(hands, container, opts) {
    opts = opts || {};
    var minDwellMs =
      (typeof opts.minDwellMs === "number")
        ? opts.minDwellMs
        : (window.SEConfig && typeof SEConfig.galleryMinDwellMs === "number"
            ? SEConfig.galleryMinDwellMs
            : 15000);

    var parent = resolveContainer(container);

    // Lock #app to viewport height so the gallery's flex-fill chain can't
    // be inflated by the pre-scaled card markup — same technique as
    // runGalleryPhase. Cleared on Continue (and on any future clearApp).
    var appEl = document.getElementById("app");
    if (appEl) appEl.classList.add("se-fit-viewport");

    // Progress bar — only when caller supplies round position info.
    // The practice round (tutorial) supplies no position info but passes
    // opts.headingText so the heading reads as a practice round, not "Game
    // N of M". A heading is shown whenever either source is present.
    if (typeof opts.rulePosition === "number" &&
        typeof opts.totalRules === "number" && opts.totalRules > 0) {
      renderProgressBar(opts.rulePosition, opts.totalRules, parent);
    }
    if ((typeof opts.rulePosition === "number" &&
         typeof opts.totalRules === "number" && opts.totalRules > 0) ||
        opts.headingText) {
      var heading = makeEl("div", "se-game-heading", parent);
      heading.setAttribute("data-role", "study2-gallery-heading");
      heading.textContent = opts.headingText
        ? opts.headingText
        : ("Game " + opts.rulePosition + " of " + opts.totalRules);
    }

    // Study prompt — warm, centered (.se-study-prompt — same class
    // runGalleryPhase uses). Frames the gallery as something to think with.
    var prompt = makeEl("div", "se-study-prompt", parent);
    prompt.setAttribute("data-role", "study2-gallery-sub");
    prompt.textContent = /* COPY: researcher to confirm */
      "All of these hands are winning hands. Take your time and look at " +
      "what these winning hands have in common to work out the hidden rule.";

    // Full-size gallery (non-compact = study phase). Clear the inline 65vh
    // maxHeight renderGallery hardcodes on the stack so the CSS flex-fill
    // rule for #app.se-fit-viewport can take over.
    var galleryEl = renderGallery(hands, parent, false);
    var stackEl = galleryEl.querySelector(".se-gallery-stack");
    if (stackEl) stackEl.style.maxHeight = "";

    // Continue button — disabled until dwell elapses
    var btn = makeEl("button", "se-btn-continue se-study2-gallery-continue", parent);
    btn.setAttribute("data-role", "study2-gallery-continue");
    btn.textContent = "Take your time…"; /* COPY: researcher to confirm */
    btn.disabled = true;
    btn.style.opacity = "0.4";
    btn.style.cursor = "not-allowed";

    var startTime = performance.now();

    return new Promise(function (resolve) {
      // Enable button after minDwellMs
      var dwellTimer = setTimeout(function () {
        btn.disabled = false;
        btn.textContent = "Continue"; /* COPY: researcher to confirm */
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
      }, minDwellMs);

      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        clearTimeout(dwellTimer);
        if (appEl) appEl.classList.remove("se-fit-viewport");
        resolve(Math.round(performance.now() - startTime));
      });
    });
  }

  // ════════════════════════════════════════════════════
  // Study #2 typed rule-query screen (Task 7)
  // ════════════════════════════════════════════════════
  //
  // renderRuleQuery(galleryHands, container, opts)
  //   galleryHands : the 6 hands shown in the gallery (for compact banner)
  //   container    : DOM element to render into (caller's job to clear first)
  //   opts : {
  //     promptText  : string — the exact heading the caller provides
  //     promptType  : string — echoed in the resolved value (e.g. "post_gallery")
  //     minChars    : int    — minimum trimmed chars (default 10)
  //     minDwellMs  : number — ms before time gate passes (default 5000)
  //   }
  //
  // Layout (top to bottom):
  //   small label  "The winning hands you just studied"   /* COPY */
  //   compact gallery banner (renderGallery, compact=true)
  //   heading = opts.promptText
  //   <textarea>
  //   live gate-hint line
  //   Continue button
  //
  // Gate (mirrors renderBulkArticulation):
  //   Continue enabled only when trimmed length >= minChars AND
  //   elapsed ms >= minDwellMs. Gate stays enabled once it passes.
  //   A setInterval re-checks at 250 ms so the time gate opens even
  //   without further typing. Hint updates live while disabled.
  //
  // Returns a Promise resolving with:
  //   { response, rt, passedGate: true, promptType }
  function renderRuleQuery(galleryHands, container, opts) {
    opts = opts || {};
    var minChars   = (typeof opts.minChars   === "number") ? opts.minChars   : 5;
    var minDwellMs = (typeof opts.minDwellMs === "number") ? opts.minDwellMs : 5000;
    var promptText = opts.promptText || "";
    var promptType = opts.promptType || "";

    var parent = resolveContainer(container);

    // Viewport-fit: lock #app so the screen fills the height and the gallery
    // flex-fills the space above the textarea — no dead space at the bottom.
    var appEl = document.getElementById("app");
    if (appEl) appEl.classList.add("se-fit-viewport");

    // Outer screen wrapper — styled via .se-rule-query-screen
    var screen = makeEl("div", "se-rule-query-screen", parent);

    // Gallery banner label
    var bannerLabel = makeEl("div", "se-rule-query-gallery-label", screen);
    bannerLabel.setAttribute("data-role", "rule-query-gallery-label");
    bannerLabel.textContent = "The winning hands you just studied"; /* COPY */

    // Gallery — in a wrapper that flex-fills the viewport so the hands use
    // the room above the textarea (see .se-rule-query-gallery-wrap CSS).
    var galleryWrap = makeEl("div", "se-rule-query-gallery-wrap", screen);
    renderGallery(galleryHands, galleryWrap, true);
    // Clear renderGallery's inline maxHeight cap so the CSS flex-fill applies.
    var rqStack = galleryWrap.querySelector(".se-gallery-stack");
    if (rqStack) rqStack.style.maxHeight = "";

    // Heading (prompt wording from caller)
    var heading = makeEl("div", "se-rule-query-heading", screen);
    heading.setAttribute("data-role", "rule-query-heading");
    heading.textContent = promptText;

    // Textarea — anti-autofill: randomised name
    var taName = "se_rq_" + Math.random().toString(36).slice(2, 10);
    var textarea = makeEl("textarea", "se-rule-query-textarea", screen);
    textarea.setAttribute("data-role", "rule-query-textarea");
    textarea.name = taName;
    textarea.setAttribute("autocomplete", "new-password");
    textarea.setAttribute("autocorrect", "off");
    textarea.setAttribute("autocapitalize", "off");
    textarea.setAttribute("spellcheck", "false");
    textarea.setAttribute("data-form-type", "other");
    textarea.setAttribute("data-lpignore", "true");
    textarea.rows = 4;

    // Gate hint — always present in DOM so screen readers / tests can find it
    var hint = makeEl("div", "se-rule-query-gate-hint", screen);
    hint.setAttribute("data-role", "rule-query-gate-hint");

    // Continue button — terracotta pill via .se-btn-continue, starts disabled
    var btn = makeEl("button", "se-btn-continue", screen);
    btn.setAttribute("data-role", "rule-query-continue");
    btn.textContent = "Continue"; /* COPY: researcher to confirm */
    btn.disabled = true;

    var startTime = performance.now();
    var gatePassed = false;  // once true, never re-closes

    return new Promise(function (resolve) {
      function checkGate() {
        if (gatePassed) return;   // gate stays open once passed
        var dwellMs = performance.now() - startTime;
        var trimmed = (textarea.value || "").trim();
        var passedChars = trimmed.length >= minChars;
        var passedTime  = dwellMs >= minDwellMs;
        var passed = passedChars && passedTime;

        if (passed) {
          gatePassed = true;
          btn.disabled = false;
          hint.textContent = "";
        } else {
          hint.textContent = "Type an answer above."; /* COPY */
        }
      }

      var gateInterval = setInterval(checkGate, 250);
      textarea.addEventListener("input", checkGate);

      function onContinue() {
        if (btn.disabled) return;
        clearInterval(gateInterval);
        if (appEl) appEl.classList.remove("se-fit-viewport");
        var rt = Math.round(performance.now() - startTime);
        resolve({
          response:    (textarea.value || "").trim(),
          rt:          rt,
          passedGate:  true,
          promptType:  promptType,
        });
      }

      btn.addEventListener("click", onContinue);

      // Keyboard shortcut: Cmd/Ctrl + Enter
      textarea.addEventListener("keydown", function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !btn.disabled) {
          e.preventDefault();
          onContinue();
        }
      });

      // Auto-focus so participant can start typing
      setTimeout(function () { textarea.focus(); }, 60);

      // Initial gate check
      checkGate();
    });
  }

  // ════════════════════════════════════════════════════
  // Loading screen (Task 8)
  // ════════════════════════════════════════════════════
  //
  // renderLoadingScreen(container, opts)
  //   container : DOM element to render into.
  //   opts.slow : boolean — if true, show an additional "Still loading" line.
  //
  // Renders a centred "Loading the study…" message. Uses the existing
  // showMessage-style centering via makeEl + .se-message class. Returns
  // nothing (just renders — callers replace this screen when loading completes).
  function renderLoadingScreen(container, opts) {
    opts = opts || {};
    var parent = resolveContainer(container);

    var wrapper = makeEl("div", "se-message se-animate-in", parent);

    var primary = makeEl("p", "", wrapper);
    primary.textContent = "Loading the study…"; /* COPY: researcher to confirm */

    if (opts.slow) {
      var slow = makeEl("p", "", wrapper);
      slow.style.cssText = "font-size:14px;color:#64748b;margin-top:8px;";
      slow.textContent = /* COPY: researcher to confirm */
        "Still loading — please wait, do not refresh.";
    }
    // Returns nothing intentionally.
  }

  // ════════════════════════════════════════════════════
  // Block-rest screen (Task 8)
  // ════════════════════════════════════════════════════
  //
  // renderBlockRest(container, opts)
  //   container : DOM element to render into (caller clears first if needed).
  //   opts      : reserved for future use (e.g. custom heading copy).
  //
  // Renders a mid-session break boundary for the all-10-rules mode. Shows a
  // "Halfway there" message and a participant-driven Continue button. Modelled
  // on renderRuleTransitionBuffer but resolves on click rather than auto-advance.
  //
  // Returns a Promise that resolves (with undefined) when Continue is clicked.
  function renderBlockRest(container, opts) {
    opts = opts || {};
    var parent = resolveContainer(container);

    var wrapper = makeEl("div", "se-rule-buffer se-animate-in", parent);
    wrapper.style.cssText =
      "max-width:480px;margin:120px auto;text-align:center;color:#475569;" +
      "font-family:system-ui,-apple-system,sans-serif;";

    var heading = makeEl("h2", "", wrapper);
    heading.style.cssText = "margin:0 0 16px 0;font-weight:500;color:#1e293b;";
    heading.textContent = /* COPY: researcher to confirm */
      "Halfway there. Take a breather, then continue when you’re ready.";

    var btn = makeEl("button", "se-btn-continue", wrapper);
    btn.setAttribute("data-role", "block-rest-continue");
    btn.textContent = "Continue"; /* COPY: researcher to confirm */
    btn.style.marginTop = "24px";

    return new Promise(function (resolve) {
      btn.addEventListener("click", function () {
        resolve();
      });
    });
  }

  // ── Public API ──
  return {
    // Header
    renderHeader: renderHeader,
    updateHeader: updateHeader,

    // Gallery
    renderGallery: renderGallery,

    // Classification layout
    renderClassificationLayout: renderClassificationLayout,
    addToHistoryColumn: addToHistoryColumn,

    // Focal hand
    renderFocalHand: renderFocalHand,

    // Peer classification banner
    renderPeerBanner: renderPeerBanner,

    // Integrated prompt + recording
    renderPromptRecordingBox: renderPromptRecordingBox,
    updatePromptRecordingBox: updatePromptRecordingBox,
    showRecordedSegment: showRecordedSegment,

    // Prompts (standalone)
    renderPrompt: renderPrompt,

    // Recording (standalone)
    renderRecordingIndicator: renderRecordingIndicator,
    updateRecordingIndicator: updateRecordingIndicator,

    // Buttons
    renderButtons: renderButtons,
    setButtonsEnabled: setButtonsEnabled,

    // History (legacy strip)
    renderHistory: renderHistory,
    addToHistory: addToHistory,

    // Feedback
    showFeedback: showFeedback,

    // Checkpoint
    renderCheckpointPrompt: renderCheckpointPrompt,

    // Tutorial
    renderTutorialStep: renderTutorialStep,

    // Screen management
    clearApp: clearApp,
    showMessage: showMessage,
    renderContinueButton: renderContinueButton,

    // Progress
    renderProgressBar: renderProgressBar,

    // End-of-round writeup (Phase 4 chunk 7) — DEPRECATED in v2
    renderEndOfRoundWriteup: renderEndOfRoundWriteup,

    // v2 mature design articulation screens
    renderRuleTransitionBuffer: renderRuleTransitionBuffer,  // C2
    renderBulkArticulation: renderBulkArticulation,          // C3
    renderBulkSynthesis: renderBulkSynthesis,                // C4

    // study #2 screens (Task 7)
    renderStudy2Gallery: renderStudy2Gallery,
    renderRuleQuery: renderRuleQuery,

    // participant-facing state screens (Task 8)
    renderLoadingScreen: renderLoadingScreen,
    renderBlockRest: renderBlockRest,
  };
})();
