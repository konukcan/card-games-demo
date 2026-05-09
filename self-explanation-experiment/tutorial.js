// self-explanation-experiment/tutorial.js
// Step-by-step tutorial module for the self-explanation experiment.
//
// Walks participants through the task with polished two-column slides
// (text on the left, live illustrations on the right), then branches into
// condition-specific screens. Includes a microphone test for audio
// conditions and a full practice round using SEGame.start().
//
// Tutorial steps (chunk 10 + follow-up — practice round removed; total 5
// or 6 depending on the feedback flag):
//   1. Welcome + card notation — text + framed sample-hand illustration
//   2. Gallery explanation — mini-gallery illustration
//   3. Classification explanation — mock focal hand + Win/Lose buttons
//   4. Feedback explanation (only when feedback=on) — mock focal with feedback
//   5. Condition instructions + integrated mic test on a real hand (non-silent only)
//   6. Ready — "Begin Experiment"
// The standalone practice round was dropped — the first real round serves
// the same purpose without doubling the onboarding length.
//
// Depends on:
//   window.SEConfig   — experiment parameters and condition helpers
//   window.SEUI       — rendering functions (gallery, buttons, tutorial slides, etc.)
//   window.SEAudio    — hold-to-record audio recording
//   window.SEGame     — single-rule game orchestrator (for practice)
//   window.CardEx     — card utilities (sampleHand, renderHandHTML)
//
// Exported as window.SETutorial.

window.SETutorial = (function () {
  "use strict";

  // ── Constants ──
  var STORAGE_KEY = "se_tutorial_done";

  // ════════════════════════════════════════════════════
  // Helper: compute total steps based on condition
  // ════════════════════════════════════════════════════

  function computeTotalSteps() {
    // Steps: welcome+notation, gallery, classification,
    //        [feedback], condition instructions (includes mic test on a hand),
    //        ready.
    // The standalone practice round was removed — the first real round
    // covers the same ground and the tutorial is half as long.
    var count = 5; // welcome+notation + gallery + classification + condition + ready
    if (SEConfig.feedback) count++; // feedback explanation (only when on)
    return count;
  }

  // ════════════════════════════════════════════════════
  // Helper: show a tutorial slide and wait for Next
  // ════════════════════════════════════════════════════

  // showSlide(config) — Clears #app, renders a tutorial slide using
  // SEUI.renderTutorialStep, and returns a Promise that resolves when
  // the participant clicks Next.
  function showSlide(config) {
    return new Promise(function (resolve) {
      SEUI.clearApp();
      config.onNext = resolve;
      SEUI.renderTutorialStep(config);
    });
  }

  // ════════════════════════════════════════════════════
  // Sample data helpers
  // ════════════════════════════════════════════════════

  function generateSampleHands(n) {
    var hands = [];
    for (var i = 0; i < n; i++) {
      hands.push(CardEx.sampleHand(6, 52));
    }
    return hands;
  }

  // ════════════════════════════════════════════════════
  // Tutorial screens
  // ════════════════════════════════════════════════════

  // Screen 1 (merged from Welcome + Card Notation in chunk 10):
  // welcomes the participant and then explains the card notation in the
  // same slide. Two-column layout — text on the left, sample hand on the
  // right — so the welcome paragraph and the notation reference share
  // the participant's first impression.
  async function screenWelcomeAndNotation(stepNum, totalSteps) {
    var sampleHand = [
      { suit: "SPADES",   rank: "5"  },
      { suit: "CLUBS",    rank: "Q"  },
      { suit: "DIAMONDS", rank: "7"  },
      { suit: "HEARTS",   rank: "3"  },
      { suit: "SPADES",   rank: "10" },
      { suit: "DIAMONDS", rank: "K"  }
    ];

    await showSlide({
      stepNumber: stepNum,
      totalSteps: totalSteps,
      centered: false,
      heading: "Welcome",
      eyebrow: "The setup",
      bodyHTML:
        '<p class="lead">In this experiment, you will play several rounds of a card game. ' +
        'In each round, you will see some winning hands, then figure out which new hands ' +
        'are winning and which are losing.</p>' +

        '<p>Hands are drawn from a standard 52-card deck. Each card has a ' +
        '<strong>rank</strong>, a <strong>suit</strong>, and a <strong>position</strong> ' +
        'within the hand (1st, 2nd, 3rd, etc.).</p>' +

        '<p>The four suits are:</p>' +
        '<div class="se-tutorial-suits">' +
          '<div><span class="suit-black">\u2660</span> Spades</div>' +
          '<div><span class="suit-black">\u2663</span> Clubs</div>' +
          '<div><span class="suit-red">\u2666</span> Diamonds</div>' +
          '<div><span class="suit-red">\u2665</span> Hearts</div>' +
        '</div>' +

        '<p>Spades and Clubs are <strong>black</strong>; Diamonds and Hearts are ' +
        '<strong class="suit-red">red</strong>. Ranks run from 2 through 10, ' +
        'then Jack, Queen, King, Ace (in that order).</p>',

      highlightText:
        'The hidden rules can involve any feature of the cards: <strong>ranks</strong>, ' +
        '<strong>suits</strong>, <strong>colours</strong> (red vs. black), ' +
        '<strong>positions</strong> in the hand, or any <strong>combination</strong> of these.',

      illustrationFn: function (el) {
        // Frame the example hand in the same panel chrome the live game
        // uses around its hands (cream warm bg, hairline border, rounded
        // corners, soft shadow). This gives participants a first-look at
        // the visual container they'll meet later in the experiment.
        var frame = document.createElement("div");
        frame.className = "se-tutorial-card-frame";

        var caption = document.createElement("div");
        caption.className = "se-tutorial-illustration-caption";
        caption.textContent = "Example of a six-card hand";
        frame.appendChild(caption);

        var handDiv = document.createElement("div");
        handDiv.innerHTML = CardEx.renderHandHTML(sampleHand, {
          cardHeight: 140,
          gap: "10px",
          justify: "center"
        });
        frame.appendChild(handDiv);

        el.appendChild(frame);
      },
      nextLabel: "Next"
    });
  }

  // Screen 3: Gallery explanation
  async function screenGalleryExplanation(stepNum, totalSteps) {
    var sampleHands = generateSampleHands(6);

    await showSlide({
      stepNumber: stepNum,
      totalSteps: totalSteps,
      centered: false,
      heading: "The Gallery",
      eyebrow: "Phase one",
      bodyHTML:
        '<p class="lead">Each round opens with <strong>6 winning hands</strong> ' +
        'that all share the same hidden rule. Study them carefully \u2014 look ' +
        'for patterns all six share \u2014 and use what you find to classify the ' +
        'hands that follow.</p>',
      illustrationFn: function (el) {
        // Render a mini vertical-stack gallery inside the illustration panel
        var miniWrapper = document.createElement("div");
        miniWrapper.className = "se-tutorial-mini-gallery";
        SEUI.renderGallery(sampleHands, miniWrapper, true);
        el.appendChild(miniWrapper);
      }
    });
  }

  // Screen 4: Classification explanation
  async function screenClassificationExplanation(stepNum, totalSteps) {
    var sampleHand = CardEx.sampleHand(6, 52);

    await showSlide({
      stepNumber: stepNum,
      totalSteps: totalSteps,
      centered: false,
      compact: true,
      heading: "Classifying Hands",
      eyebrow: "Phase two",
      bodyHTML:
        '<p>After studying the winning hands, you will see new hands one at a time.</p>' +
        '<p>For each hand, decide: is it a <strong>Winning</strong> hand ' +
        'or a <strong>Losing</strong> hand?</p>' +
        '<p>Click the <span class="se-tutorial-emph-win">green Winning button</span> ' +
        'or the <span class="se-tutorial-emph-lose">red Losing button</span> ' +
        'to make your choice.</p>',
      illustrationFn: function (el) {
        // Wrap the mock focal hand + Win/Lose buttons in the same outer
        // chrome the live game's .se-focal-prompt-panel uses, so this
        // slide reads as a preview of the real trial surface.
        var frame = document.createElement("div");
        frame.className = "se-tutorial-trial-frame";

        var mockDiv = document.createElement("div");
        mockDiv.className = "se-tutorial-mock-focal";
        SEUI.renderFocalHand(sampleHand, mockDiv);
        frame.appendChild(mockDiv);

        var btnRow = document.createElement("div");
        btnRow.className = "se-buttons";
        btnRow.innerHTML =
          '<button class="se-btn se-btn-win" disabled>Winning</button>' +
          '<button class="se-btn se-btn-lose" disabled>Losing</button>';
        frame.appendChild(btnRow);

        el.appendChild(frame);
      }
    });
  }

  // Screen 5: Feedback explanation (only shown when feedback is enabled)
  async function screenFeedbackExplanation(stepNum, totalSteps) {
    if (!SEConfig.feedback) return;

    var sampleHand = CardEx.sampleHand(6, 52);

    await showSlide({
      stepNumber: stepNum,
      totalSteps: totalSteps,
      centered: false,
      compact: true,
      heading: "Feedback",
      eyebrow: "After each guess",
      bodyHTML:
        '<p>After each classification, you will see whether you were correct.</p>' +
        '<p>Hands will be framed in ' +
        '<span class="se-tutorial-emph-win">green</span> (winning) or ' +
        '<span class="se-tutorial-emph-lose">red</span> (losing) ' +
        'to show you the correct answer.</p>' +
        '<p>A <span class="se-tutorial-check">\u2713</span> means you were right, ' +
        'a <span class="se-tutorial-cross">\u2717</span> means you were wrong.</p>',
      illustrationFn: function (el) {
        // Same outer chrome as the Classifying slide so step 4 reads as
        // a continuation of the same trial surface.
        var frame = document.createElement("div");
        frame.className = "se-tutorial-trial-frame";

        var mockDiv = document.createElement("div");
        mockDiv.className = "se-tutorial-mock-feedback";
        var focalEl = SEUI.renderFocalHand(sampleHand, mockDiv);
        SEUI.showFeedback(focalEl, "winning", true);
        frame.appendChild(mockDiv);

        el.appendChild(frame);
      }
    });
  }

  // Screen 6/7: Condition-specific instructions (with integrated mic test for audio conditions)
  //
  // For non-silent conditions, this screen both explains what the participant
  // will be asked to record AND includes a live mic test in the illustration
  // panel. The Next button is disabled until the mic test passes.
  async function screenConditionInstructions(stepNum, totalSteps) {
    var condition = SEConfig.condition;

    function p(text) { return '<p>' + text + '</p>'; }

    // ── Silent condition — no recording, simple text ──
    if (condition === "silent") {
      await showSlide({
        stepNumber: stepNum,
        totalSteps: totalSteps,
        centered: true,
        heading: "How to Play",
        bodyHTML: p(
          'Study the winning hands carefully and try to classify each new hand ' +
          'as accurately as you can. That\u2019s all there is to it!'
        )
      });
      return;
    }

    // ── Non-silent conditions: init mic first ──
    var micOk = await SEAudio.init();
    if (!micOk) {
      await showSlide({
        stepNumber: stepNum,
        totalSteps: totalSteps,
        centered: true,
        heading: "Microphone Required",
        bodyHTML:
          '<p class="se-tutorial-error-text">This experiment requires microphone access. ' +
          'Please allow microphone access in your browser and click Next to try again.</p>'
      });
      micOk = await SEAudio.init();
      if (!micOk) {
        throw new Error("SETutorial: microphone access denied after retry.");
      }
    }

    // ── Build condition-specific instruction text ──
    var bodyHTML = "";
    var highlightText = "";

    if (condition === "describe") {
      bodyHTML =
        p('Before classifying each hand, you will be asked to <strong>describe</strong> ' +
          'some of the cards you see.') +
        p('For each card, say which hand it is in, its position, and its rank and suit. ' +
          'Describe at least <strong>' + SEConfig.describeMinCards + ' cards</strong> ' +
          'across any hands you like.');
      highlightText =
        'Example: <em>"Hand 3 has an ace of spades in the first position, ' +
        'a ten of clubs in the fourth position."</em>';

    } else if (condition === "token" || condition === "token-type") {
      // Selection-aware copy: when the multi-card affordance is on we
      // mention the selection step; otherwise we just describe the verbal
      // response. Wording stays counterfactual either way (chunk 9
      // collapsed the bf/soft split — only counterfactual remains).
      var selectionLine = SEConfig.hasCardSelection()
        ? p('For each hand you will pick the cards that drove your judgment, ' +
            'then explain why those cards point that way and which would have ' +
            'to change to flip the hand.')
        : p('For each hand you will explain why you think it is winning or losing ' +
            'and which cards would have to change to flip it.');
      bodyHTML = selectionLine;
      highlightText =
        'Example: <em>"I think this hand is winning because of the run of hearts. ' +
        'If two of the hearts were swapped for clubs, I think it would be losing."</em>';

    } else if (condition === "peer") {
      // Peer condition: a fictional participant has already classified the
      // hand. The participant judges the peer's classification and explains
      // what they think led to it.
      bodyHTML =
        p('For each hand, you will be told how a <strong>different participant</strong> ' +
          'classified it. Sometimes they will be right and sometimes they will be wrong.') +
        p('You will <strong>agree or disagree</strong> with their classification, ' +
          'then explain what you think led them to that decision.');
      highlightText =
        'Example: <em>"I disagree \u2014 they probably picked winning because of the face ' +
        'cards, but I think the suit pattern matters more here."</em>';

    } else if (condition === "type") {
      bodyHTML =
        p('At several points during the game, you will be asked: ' +
          '<em>"What is your current best guess as to what makes a hand winning?"</em>') +
        p('Your guess can be tentative or partial \u2014 just put your current thinking into words.');
      highlightText =
        'Example: <em>"I think hands with mostly red cards might be winning."</em>';
    }

    // For combined token+type conditions, add the type-level explanation
    if (SEConfig.hasTypePrompt() && (condition.indexOf("token") !== -1)) {
      bodyHTML +=
        p('<span class="se-tutorial-also">You will also periodically be asked:</span> ' +
          '<em>"What is your current best guess as to what makes a hand winning?"</em>') +
        p('Your guess can be tentative or partial \u2014 just put your current thinking into words.');
    }

    // Add the recording instruction as a styled keyboard-hint callout
    bodyHTML +=
      '<div class="se-tutorial-keyhint">' +
        '<div class="se-tutorial-keyhint-keys">' +
          '<kbd class="se-tutorial-key se-tutorial-key-space">space</kbd>' +
        '</div>' +
        '<div class="se-tutorial-keyhint-text">' +
          '<strong>Press space</strong> to start recording, again to stop. ' +
          'Or click <strong>Winning</strong> or <strong>Losing</strong> ' +
          'to end the recording and move on.' +
        '</div>' +
      '</div>';

    // ── Render the slide with live mic test in illustration panel ──
    await new Promise(function (resolve) {
      SEUI.clearApp();

      var testComplete = false;
      var rafId = null;

      var slideRefs = SEUI.renderTutorialStep({
        stepNumber: stepNum,
        totalSteps: totalSteps,
        centered: false,
        eyebrow: "Your task",
        heading: "How to Play",
        bodyHTML: bodyHTML,
        highlightText: highlightText || null,
        illustrationFn: function (el) {
          // Mic test now mirrors the live trial layout: a real focal hand
          // on top, recording widget below, both wrapped in one panel
          // (mirrors the live game's `.se-focal-prompt-panel` chrome).
          // Participants test the mic by speaking about the hand they
          // see \u2014 a real preview of the recording flow, not a
          // context-free "say something" widget.
          var sampleHand = CardEx.sampleHand(6, 52);

          var frame = document.createElement("div");
          frame.className = "se-tutorial-mic-frame";

          // Focal hand panel \u2014 the .se-tutorial-mock-focal styles
          // pass through the live .se-focal-panel chrome but the mic
          // frame below makes the panel transparent so the outer frame
          // owns the visible chrome (matches the live look).
          var focalDiv = document.createElement("div");
          focalDiv.className = "se-tutorial-mock-focal";
          SEUI.renderFocalHand(sampleHand, focalDiv);
          frame.appendChild(focalDiv);

          // Recording widget below the hand, separated by a hairline,
          // tinted slightly so it reads as the "interactive" half.
          var testDiv = document.createElement("div");
          testDiv.className = "se-tutorial-mic-test";

          var testLabel = document.createElement("div");
          testLabel.className = "se-tutorial-mic-test-label";
          testLabel.textContent =
            "Talk about this hand for a few seconds \u2014 press space to start, again to stop.";
          testDiv.appendChild(testLabel);

          var indicator = SEUI.renderRecordingIndicator(testDiv);

          var statusMsg = document.createElement("div");
          statusMsg.className = "se-tutorial-mic-test-status";
          testDiv.appendChild(statusMsg);

          frame.appendChild(testDiv);

          el.appendChild(frame);
          el._indicator = indicator;
          el._statusMsg = statusMsg;
        },
        onNext: function () {
          document.removeEventListener("keydown", onKeyDown);
          if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
          resolve();
        }
      });

      // Disable Next until mic test passes
      slideRefs.nextBtn.disabled = true;

      var illPanel = document.querySelector(".se-tutorial-illustration");
      var indicator = illPanel ? illPanel._indicator : document.querySelector(".se-recording-indicator");
      var statusMsg = illPanel ? illPanel._statusMsg : null;

      function updateLoop() {
        if (SEAudio.isRecording()) {
          SEUI.updateRecordingIndicator(indicator, true, SEAudio.getElapsedMs(), SEAudio.meetsMinDuration());
          rafId = requestAnimationFrame(updateLoop);
        }
      }

      // Phase 4 chunk 5: toggle mechanism — press Space to start, press
      // Space again to stop. Min-duration gate retained on stop attempts.
      function onKeyDown(e) {
        if (e.code === "Space" && !e.repeat) {
          e.preventDefault();
          if (testComplete) return;
          if (SEAudio.isRecording()) {
            // Toggle off — only if past min duration
            if (!SEAudio.meetsMinDuration()) {
              if (statusMsg) {
                statusMsg.innerHTML = '<span class="se-tutorial-mic-test-warn">Keep going \u2014 record for at least 2 seconds before stopping.</span>';
              }
              return;
            }
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            SEAudio.stopRecording().then(function () {
              SEUI.updateRecordingIndicator(indicator, false, 0, false);
              testComplete = true;
              if (statusMsg) {
                statusMsg.innerHTML = '<span class="se-tutorial-mic-test-success">\u2713 Microphone working! Click Next to continue.</span>';
              }
              slideRefs.nextBtn.disabled = false;
            });
          } else {
            // Start recording
            SEAudio.startRecording({ promptType: "mic-test" });
            rafId = requestAnimationFrame(updateLoop);
          }
        }
      }

      document.addEventListener("keydown", onKeyDown);
    });
  }

  // Screen 10: Ready to begin
  async function screenReady(stepNum, totalSteps) {
    await showSlide({
      stepNumber: stepNum,
      totalSteps: totalSteps,
      centered: true,
      heading: "Ready to Begin!",
      bodyHTML:
        '<div class="se-tutorial-eyebrow">All set</div>' +
        '<p>You are ready to begin. The full experiment runs ' +
        '<strong>' + SEConfig.nRules + ' round' + (SEConfig.nRules === 1 ? '' : 's') +
        '</strong>. Take your time, trust your eye, and good luck.</p>' +
        '<div class="se-tutorial-emblem" aria-hidden="true">' +
          '<span class="se-tutorial-emblem-glyph suit-black">\u2660</span>' +
          '<span class="se-tutorial-emblem-glyph suit-red">\u2665</span>' +
          '<span class="se-tutorial-emblem-glyph suit-red">\u2666</span>' +
          '<span class="se-tutorial-emblem-glyph suit-black">\u2663</span>' +
        '</div>',
      nextLabel: "Begin experiment"
    });
  }

  // ════════════════════════════════════════════════════
  // Main entry point
  // ════════════════════════════════════════════════════

  // run(_legacyPracticeRule)
  //
  // The argument is no longer used (D2 removed practice rounds in v2).
  // Retained as a no-op parameter so existing callers don't break;
  // app.js passes `null` explicitly. Drop the parameter when next
  // editing this file's signature.
  async function run(_legacyPracticeRule) {
    // ── Check for clear param ──
    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("clear") === "1") {
      localStorage.removeItem(STORAGE_KEY);
      console.log("SETutorial: cleared tutorial completion flag (clear=1).");
    }

    // ── Skip if already completed or skipTutorial param is set ──
    if (localStorage.getItem(STORAGE_KEY) === "done") {
      console.log("SETutorial: already completed, skipping.");
      return;
    }

    if (urlParams.get("skipTutorial") === "1") {
      console.log("SETutorial: skipped via skipTutorial=1 URL param.");
      // Still init mic for non-silent conditions so the game works
      if (!SEConfig.isSilent()) {
        await SEAudio.init();
      }
      localStorage.setItem(STORAGE_KEY, "done");
      return;
    }

    console.log("SETutorial: starting tutorial for condition '" + SEConfig.condition + "'.");

    var totalSteps = computeTotalSteps();
    var step = 1;

    // ── Common section ──
    // Chunk 10: welcome + card notation are now one slide.
    await screenWelcomeAndNotation(step++, totalSteps);
    await screenGalleryExplanation(step++, totalSteps);
    await screenClassificationExplanation(step++, totalSteps);

    // Feedback (conditional)
    if (SEConfig.feedback) {
      await screenFeedbackExplanation(step++, totalSteps);
    }

    // Condition-specific instructions (includes mic test on a real hand
    // for non-silent conditions). The mic test now demonstrates the actual
    // trial pattern (cards + recording panel) so participants don't need a
    // separate practice round to feel the flow.
    await screenConditionInstructions(step++, totalSteps);

    // Final transition before the live experiment starts.
    await screenReady(step, totalSteps);

    // ── Mark tutorial as complete ──
    localStorage.setItem(STORAGE_KEY, "done");
    console.log("SETutorial: tutorial complete.");
  }

  // ── Public API ──
  return {
    run: run
  };
})();
