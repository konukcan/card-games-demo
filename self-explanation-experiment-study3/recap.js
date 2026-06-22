// self-explanation-experiment/recap.js
// Post-experiment recap module: rule articulation and demographics.
//
// After the main curriculum, this module:
//   1. Re-shows each gallery and collects a rule articulation audio recording
//   2. Collects demographics, including a strategy report (free text)
//
// Depends on:
//   window.SEConfig  — experiment parameters (minRecordingDuration)
//   window.SEUI      — all rendering functions
//   window.SEAudio   — hold-to-record audio recording
//
// Exported as window.SERecap.

window.SERecap = (function () {
  "use strict";

  // ════════════════════════════════════════════════════
  // Spacebar hold-to-record helper
  // ════════════════════════════════════════════════════

  // waitForRecording(promptText, meta, container) — Renders a prompt and
  // recording indicator, then waits for the participant to hold Space to
  // record. Returns a Promise that resolves to the audio segment object
  // once a valid recording is completed and Continue is clicked.
  //
  // This is a simplified version of the same pattern in game.js, extracted
  // here so recap.js is self-contained. The flow:
  //   1. Render prompt text and recording indicator
  //   2. keydown Space → start recording, run animation loop
  //   3. keyup Space → stop recording; if minimum duration met, enable Continue
  //   4. Continue click → clean up listeners, resolve with segment
  function waitForRecording(promptText, meta, container) {
    return new Promise(function (resolve) {
      // Render prompt and indicator into the provided container
      SEUI.renderPrompt(promptText, container);
      var indicator = SEUI.renderRecordingIndicator(container);
      var continueBtn = SEUI.renderContinueButton(onContinue, container);

      // Whether a valid recording (meeting minimum duration) has been completed.
      var recordingComplete = false;

      // The audio segment returned by SEAudio.stopRecording.
      var segment = null;

      // Animation frame ID for the real-time indicator update loop.
      var rafId = null;

      // ── Animation frame loop ──
      // Polls SEAudio for elapsed time and updates the indicator each frame.
      function updateLoop() {
        if (SEAudio.isRecording()) {
          SEUI.updateRecordingIndicator(
            indicator,
            true,
            SEAudio.getElapsedMs(),
            SEAudio.meetsMinDuration()
          );
          rafId = requestAnimationFrame(updateLoop);
        }
      }

      // ── Keydown handler ──
      // Starts recording when Space is pressed (ignores key repeats).
      function onKeyDown(e) {
        if (e.code === "Space" && !e.repeat) {
          e.preventDefault(); // prevent page scroll
          if (!SEAudio.isRecording() && !recordingComplete) {
            SEAudio.startRecording(meta);
            rafId = requestAnimationFrame(updateLoop);
          }
        }
      }

      // ── Keyup handler ──
      // Stops recording when Space is released. If the minimum duration was
      // met, marks the recording complete and enables the Continue button.
      function onKeyUp(e) {
        if (e.code === "Space") {
          e.preventDefault();
          if (SEAudio.isRecording()) {
            var metMin = SEAudio.meetsMinDuration();

            // Cancel the animation loop immediately
            if (rafId) {
              cancelAnimationFrame(rafId);
              rafId = null;
            }

            SEAudio.stopRecording().then(function (seg) {
              // Reset indicator to idle state
              SEUI.updateRecordingIndicator(indicator, false, 0, false);

              if (metMin) {
                // Valid recording — enable Continue
                recordingComplete = true;
                segment = seg;
                continueBtn.disabled = false;
              } else {
                // Too short — participant can try again
                console.log("SERecap: recording too short, try again.");
              }
            });
          }
        }
      }

      // ── Continue button handler ──
      // Cleans up all listeners and resolves the promise with the segment.
      function onContinue() {
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("keyup", onKeyUp);
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        resolve(segment);
      }

      // Attach listeners
      document.addEventListener("keydown", onKeyDown);
      document.addEventListener("keyup", onKeyUp);
    });
  }

  // ════════════════════════════════════════════════════
  // Section 1: Rule articulation recap
  // ════════════════════════════════════════════════════

  // runRuleRecap(rules) — For each rule in the curriculum, re-shows the
  // gallery and collects a verbal articulation of the rule. Returns a
  // Promise that resolves to an array of { ruleId, audioSegment } objects.
  //
  // `rules` — array of RuleData objects from SECurriculum.build(), each
  //   containing at least { ruleId, exemplarHands }.
  async function runRuleRecap(rules) {
    var recapResponses = [];

    for (var i = 0; i < rules.length; i++) {
      var ruleData = rules[i];
      var rulePosition = i + 1;

      SEUI.clearApp();
      var app = document.getElementById("app");

      // ── Heading ──
      var heading = document.createElement("div");
      heading.className = "se-game-heading";
      heading.textContent = "Rule Recap \u2014 Game " + rulePosition + " of " + rules.length;
      app.appendChild(heading);

      // ── Re-render the gallery (6 exemplar hands with green framing) ──
      SEUI.renderGallery(ruleData.exemplarHands, app);

      // ── Prompt area ──
      var promptArea = document.createElement("div");
      promptArea.className = "se-prompt-area";
      app.appendChild(promptArea);

      // ── Spacebar hold-to-record flow ──
      var segment = await waitForRecording(
        "What is your best guess as to what made these hands winning?",
        {
          promptType: "recap",
          ruleId: ruleData.ruleId,
          rulePosition: rulePosition
        },
        promptArea
      );

      recapResponses.push({
        ruleId: ruleData.ruleId,
        audioSegment: segment
      });
    }

    return recapResponses;
  }

  // ════════════════════════════════════════════════════
  // Section 2: Demographics
  // ════════════════════════════════════════════════════

  // runDemographics() — Shows a short demographics form plus a strategy
  // writeup. Continue is enabled once all required fields are complete.
  // Returns a Promise that resolves to
  // { cardExperience, age, gender, race, ethnicity, strategy }.
  function runDemographics() {
    return new Promise(function (resolve) {
      SEUI.clearApp();
      var app = document.getElementById("app");

      // ── Heading ──
      var heading = document.createElement("h2");
      heading.className = "se-game-heading";
      heading.textContent = "A few final questions";
      app.appendChild(heading);

      // ── Form container ──
      var form = document.createElement("div");
      form.className = "se-demographics-form";
      form.style.maxWidth = "500px";
      form.style.margin = "0 auto";
      form.style.textAlign = "left";
      app.appendChild(form);

      // Helper: create a labelled form field row
      function makeField(labelText, inputEl) {
        var row = document.createElement("div");
        row.style.marginBottom = "16px";

        var label = document.createElement("label");
        label.style.display = "block";
        label.style.marginBottom = "4px";
        label.style.fontWeight = "bold";
        label.textContent = labelText;
        row.appendChild(label);

        row.appendChild(inputEl);
        form.appendChild(row);
        return inputEl;
      }

      function makeRadioGroup(name, options) {
        var container = document.createElement("div");

        options.forEach(function (opt) {
          var label = document.createElement("label");
          label.style.display = "block";
          label.style.marginBottom = "8px";
          label.style.fontSize = "15px";

          var radio = document.createElement("input");
          radio.type = "radio";
          radio.name = "demo-" + name;
          radio.value = opt;
          radio.style.marginRight = "8px";

          label.appendChild(radio);
          label.appendChild(document.createTextNode(opt));
          container.appendChild(label);
        });

        return {
          container: container,
          getValue: function () {
            var checked = container.querySelector('input[name="demo-' + name + '"]:checked');
            return checked ? checked.value : "";
          }
        };
      }

      // ── Card game experience ──
      var experienceSelect = document.createElement("select");
      experienceSelect.style.width = "100%";
      experienceSelect.style.padding = "8px";
      experienceSelect.style.fontSize = "15px";
      ["", "None", "A little", "Moderate", "A lot"].forEach(function (opt) {
        var option = document.createElement("option");
        option.value = opt;
        option.textContent = opt || "-- Select --";
        if (opt === "") option.disabled = true;
        if (opt === "") option.selected = true;
        experienceSelect.appendChild(option);
      });
      makeField("How much experience do you have playing card games?", experienceSelect);

      // ── Age ──
      var ageInput = document.createElement("input");
      ageInput.type = "number";
      ageInput.min = "18";
      ageInput.max = "99";
      ageInput.placeholder = "e.g. 25";
      ageInput.style.width = "100%";
      ageInput.style.padding = "8px";
      ageInput.style.fontSize = "15px";
      ageInput.style.boxSizing = "border-box";
      // Hard 2-digit input clamp at keystroke level. HTML max=99 only fires
      // on form submit; the Continue-enabler does the semantic check (18..99).
      // This stops 888 etc. from even rendering in the field — better UX than
      // accepting then complaining.
      ageInput.addEventListener("input", function () {
        if (this.value.length > 2) this.value = this.value.slice(0, 2);
      });
      makeField("Age", ageInput);

      // ── Gender ──
      var genderSelect = document.createElement("select");
      genderSelect.style.width = "100%";
      genderSelect.style.padding = "8px";
      genderSelect.style.fontSize = "15px";
      ["", "Female", "Male", "Non-binary", "Other", "Prefer not to say"].forEach(function (opt) {
        var option = document.createElement("option");
        option.value = opt;
        option.textContent = opt || "-- Select --";
        if (opt === "") option.disabled = true;
        if (opt === "") option.selected = true;
        genderSelect.appendChild(option);
      });
      makeField("Gender", genderSelect);

      // ── Race ──
      var raceGroup = makeRadioGroup("race", [
        "White",
        "Black or African American",
        "American Indian or Alaska Native",
        "Asian",
        "Native Hawaiian or Pacific Islander",
        "Multiracial",
        "Other",
        "Prefer not to say"
      ]);
      makeField("Race", raceGroup.container);

      // ── Ethnicity ──
      var ethnicityGroup = makeRadioGroup("ethnicity", [
        "Hispanic",
        "Non-Hispanic",
        "Prefer not to say"
      ]);
      makeField("Ethnicity", ethnicityGroup.container);

      // ── Strategy ──
      var strategyTextarea = document.createElement("textarea");
      strategyTextarea.className = "se-strategy-textarea";
      strategyTextarea.rows = 6;
      strategyTextarea.placeholder = "Type your response here...";
      strategyTextarea.style.width = "100%";
      strategyTextarea.style.maxWidth = "600px";
      strategyTextarea.style.padding = "10px";
      strategyTextarea.style.fontSize = "15px";
      strategyTextarea.style.fontFamily = "inherit";
      strategyTextarea.style.borderRadius = "6px";
      strategyTextarea.style.border = "1px solid #ccc";
      strategyTextarea.style.resize = "vertical";
      strategyTextarea.style.boxSizing = "border-box";
      makeField(
        "How did you approach figuring out what made hands winning or losing? Did anything about the task help or hinder your thinking?",
        strategyTextarea
      );

      // ── Mind-change report (optional free text) ──
      var mindChangeTextarea = document.createElement("textarea");
      mindChangeTextarea.className = "se-strategy-textarea";
      mindChangeTextarea.rows = 5;
      mindChangeTextarea.placeholder = "Type your response here (leave blank if no)...";
      mindChangeTextarea.style.width = "100%";
      mindChangeTextarea.style.maxWidth = "600px";
      mindChangeTextarea.style.padding = "10px";
      mindChangeTextarea.style.fontSize = "15px";
      mindChangeTextarea.style.fontFamily = "inherit";
      mindChangeTextarea.style.borderRadius = "6px";
      mindChangeTextarea.style.border = "1px solid #ccc";
      mindChangeTextarea.style.resize = "vertical";
      mindChangeTextarea.style.boxSizing = "border-box";
      makeField(
        "From the first moment you saw the six gallery hands at the start of a round, to the end of that round, did you ever change your mind about what the hidden rule was? If so, why and how? Provide an example if you can remember.",
        mindChangeTextarea
      );

      function updateContinueState() {
        var ageValue = Number(ageInput.value);
        var isAgeValid = ageInput.value !== "" && !isNaN(ageValue) && ageValue >= 18 && ageValue <= 99;
        // The strategy + mindChange textareas are now OPTIONAL — required text
        // forces people to type bullshit when they don't have a real answer,
        // which contaminates the free-response data more than it adds. Lab
        // policy 2026-05-26.
        var isComplete =
          experienceSelect.value !== "" &&
          isAgeValid &&
          genderSelect.value !== "" &&
          raceGroup.getValue() !== "" &&
          ethnicityGroup.getValue() !== "";

        continueBtn.disabled = !isComplete;
      }

      var continueBtn = SEUI.renderContinueButton(function () {
        resolve({
          cardExperience: experienceSelect.value,
          age: Number(ageInput.value),
          gender: genderSelect.value,
          race: raceGroup.getValue(),
          ethnicity: ethnicityGroup.getValue(),
          strategy: strategyTextarea.value.trim(),
          mindChange: mindChangeTextarea.value.trim()
        });
      }, app);
      continueBtn.disabled = true;

      experienceSelect.addEventListener("input", updateContinueState);
      experienceSelect.addEventListener("change", updateContinueState);
      experienceSelect.addEventListener("keyup", updateContinueState);
      ageInput.addEventListener("input", updateContinueState);
      ageInput.addEventListener("change", updateContinueState);
      ageInput.addEventListener("keyup", updateContinueState);
      genderSelect.addEventListener("input", updateContinueState);
      genderSelect.addEventListener("change", updateContinueState);
      genderSelect.addEventListener("keyup", updateContinueState);
      strategyTextarea.addEventListener("input", updateContinueState);
      strategyTextarea.addEventListener("change", updateContinueState);
      strategyTextarea.addEventListener("keyup", updateContinueState);

      Array.prototype.forEach.call(
        form.querySelectorAll('input[name="demo-race"], input[name="demo-ethnicity"]'),
        function (radio) {
          radio.addEventListener("input", updateContinueState);
          radio.addEventListener("change", updateContinueState);
          radio.addEventListener("keyup", updateContinueState);
        }
      );

      updateContinueState();

    });
  }

  // ════════════════════════════════════════════════════
  // Main entry point
  // ════════════════════════════════════════════════════

  // run(curriculum) — Runs the post-experiment recap sequence.
  //
  // Phase 4 chunk 7: the per-rule voice articulation recap was REMOVED.
  // It's been replaced by the per-rule typed writeup that fires during
  // each rule's flow (see ui.js renderEndOfRoundWriteup, called from
  // game.js SEGame.start). The captured-fresh typed responses are a
  // primary DV, directly comparable to rule-gallery pilot data.
  //
  // What remains here:
  //   1. Demographics questionnaire
  //   2. Embedded strategy report (free text about overall approach)
  //
  // `curriculum` — { rules: RuleData[] }, kept in the signature for
  //                forwards-compatibility even though it's no longer used.
  //
  // Returns Promise<{ strategy, demographics }>
  async function run(curriculum) {
    console.log("SERecap: starting recap (demographics + strategy).");

    var demographicsResult = await runDemographics();
    var strategy = demographicsResult.strategy;
    var demographics = {
      cardExperience: demographicsResult.cardExperience,
      age: demographicsResult.age,
      gender: demographicsResult.gender,
      race: demographicsResult.race,
      ethnicity: demographicsResult.ethnicity,
      mindChange: demographicsResult.mindChange
    };

    console.log("SERecap: recap complete.", {
      strategyLength: strategy.length,
      demographics: demographics
    });

    return {
      strategy: strategy,
      demographics: demographics
    };
  }

  // ── Public API ──
  return {
    run: run
  };
})();
