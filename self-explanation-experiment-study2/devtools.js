// self-explanation-experiment/devtools.js
// Console DevTools for rapid experiment exploration during development.
//
// Usage (in browser console):
//   DevTools.skip()           — Skip current trial (auto-classify as "winning")
//   DevTools.skipAll(N)       — Click skip every 300ms, up to N times
//   DevTools.skipTutorial()   — Skip the tutorial entirely
//   DevTools.skipGallery()    — Skip the gallery countdown
//   DevTools.info()           — Show current experiment state
//   DevTools.setCondition(c)  — Reload with a different condition
//   DevTools.fastMode()       — Set galleryTime=3, nTrials=3, nRules=2
//
//   v2 mature design helpers:
//   DevTools.revealRule()     — Show current rule id, name, answer, group
//   DevTools.revealUpcoming() — Show ground-truth labels of upcoming trials
//                               (does NOT advance position)
//
// Exported as window.DevTools.

window.DevTools = (function () {
  "use strict";

  // ── Current-rule registry (v2) ──
  // game.js calls DevTools._setCurrent(ruleData, selector) at the start
  // of each rule's classification phase. revealRule() and revealUpcoming()
  // read from here so the helpers don't need access to game.js's closures.
  var _currentRuleData = null;
  var _currentSelector = null;
  function _setCurrent(ruleData, selector) {
    _currentRuleData = ruleData;
    _currentSelector = selector;
  }

  // ── Internal event bus ──
  // The game module and other modules listen for these custom events
  // to implement skip behaviour.
  function emit(eventName, detail) {
    document.dispatchEvent(new CustomEvent("se-devtools", {
      detail: Object.assign({ action: eventName }, detail || {})
    }));
    console.log("DevTools: " + eventName, detail || "");
  }

  // skip() — Skip the current trial by auto-classifying as "winning".
  // Works by programmatically clicking the Winning button.
  function skip() {
    var winBtn = document.querySelector(".se-btn-win");
    if (winBtn) {
      // If button is disabled (waiting for recording), enable it first
      winBtn.disabled = false;
      winBtn.click();
      console.log("DevTools: skipped trial (auto-classified as winning)");
    } else {
      // Maybe we're on a Continue screen
      var contBtn = document.querySelector(".se-btn-continue");
      if (contBtn) {
        contBtn.disabled = false;
        contBtn.click();
        console.log("DevTools: clicked Continue");
      } else {
        // Try tutorial Next button
        var nextBtn = document.querySelector("[data-role='next-btn']");
        if (nextBtn) {
          nextBtn.disabled = false;
          nextBtn.click();
          console.log("DevTools: clicked Next (tutorial)");
        } else {
          console.log("DevTools: no skippable element found");
        }
      }
    }
  }

  // skipAll() — Repeatedly skip until the experiment advances.
  // Useful for blasting through multiple screens.
  function skipAll(count) {
    count = count || 50;
    var interval = setInterval(function () {
      skip();
      count--;
      if (count <= 0) {
        clearInterval(interval);
        console.log("DevTools: skipAll finished");
      }
    }, 300);
    return "Skipping " + count + " times (every 300ms)...";
  }

  // skipTutorial() — Marks tutorial as done in localStorage and reloads.
  function skipTutorial() {
    localStorage.setItem("se_tutorial_done", "true");
    console.log("DevTools: tutorial marked as done. Reloading...");
    location.reload();
  }

  // skipGallery() — Clicks the Continue button if gallery timer is active.
  // Also clears any running timer interval.
  function skipGallery() {
    // Find and enable Continue button
    var contBtn = document.querySelector(".se-btn-continue");
    if (contBtn) {
      contBtn.disabled = false;
      contBtn.click();
      console.log("DevTools: gallery skipped");
    } else {
      console.log("DevTools: no Continue button found (not in gallery phase?)");
    }
  }

  // info() — Show current experiment state.
  function info() {
    console.log("=== DevTools Info ===");
    console.log("Condition:", window.SEConfig ? SEConfig.condition : "unknown");
    console.log("Feedback:", window.SEConfig ? SEConfig.feedback : "unknown");
    console.log("nTrials:", window.SEConfig ? SEConfig.nTrials : "unknown");
    console.log("nRules:", window.SEConfig ? SEConfig.nRules : "unknown");
    console.log("Gallery time:", window.SEConfig ? SEConfig.galleryTime : "unknown");
    console.log("Min recording:", window.SEConfig ? SEConfig.minRecordingDuration : "unknown");
    console.log("Audio segments:", window.SEAudio ? SEAudio.getSegments().length : "N/A");
    console.log("Tutorial done:", localStorage.getItem("se_tutorial_done"));

    // Check what's on screen
    var gallery = document.querySelector(".se-gallery");
    var focal = document.querySelector(".se-focal");
    var tutorial = document.querySelector(".se-tutorial-slide");
    var checkpoint = document.querySelector(".se-checkpoint");
    if (tutorial) console.log("Phase: TUTORIAL");
    else if (gallery && !focal) console.log("Phase: GALLERY STUDY");
    else if (focal) console.log("Phase: CLASSIFICATION TRIAL");
    else if (checkpoint) console.log("Phase: CHECKPOINT");
    else console.log("Phase: unknown");

    console.log("====================");
  }

  // setCondition(c) — Reload with a different condition.
  function setCondition(condition) {
    var url = new URL(window.location);
    url.searchParams.set("condition", condition);
    url.searchParams.set("clear", "1");
    console.log("DevTools: reloading with condition=" + condition);
    window.location = url.toString();
  }

  // fastMode() — Reload with minimal parameters for quick testing.
  function fastMode() {
    var url = new URL(window.location);
    url.searchParams.set("galleryTime", "3");
    url.searchParams.set("nTrials", "3");
    url.searchParams.set("nRules", "2");
    url.searchParams.set("save", "local");
    url.searchParams.set("clear", "1");
    console.log("DevTools: reloading in fast mode");
    window.location = url.toString();
  }

  // ── _isDebugEnabled() — guard for cheating helpers ──
  // R3/5.4: revealRule() and revealUpcoming() expose ground-truth labels
  // and the rule's name. In production these are participant-accessible
  // via the browser console — anyone reading research-software blogs can
  // find them. Gate behind ?debug=1 in the URL so they're explicit-opt-in
  // for development and test users only. Researcher-launched debug URLs
  // include &debug=1; Prolific-distributed URLs do not.
  function _isDebugEnabled() {
    try {
      return new URLSearchParams(window.location.search).get("debug") === "1";
    } catch (e) {
      return false;
    }
  }

  function _gateMsg(name) {
    return "DevTools." + name + " is gated behind ?debug=1. " +
      "Add &debug=1 to the URL to enable cheating-helpers in development.";
  }

  // ── revealRule() — print the current rule (id / name / answer / group) ──
  // Use during testing to remember which rule the participant is being
  // shown. Reads from the current-rule registry populated by game.js via
  // DevTools._setCurrent(ruleData, selector).
  function revealRule() {
    if (!_isDebugEnabled()) {
      console.log(_gateMsg("revealRule"));
      return null;
    }
    if (!_currentRuleData) {
      console.log(
        "DevTools.revealRule: no current rule registered. " +
        "Are we mid-classification? (Tutorial / gallery / bulk screens are not registered.)"
      );
      return null;
    }
    var rd = _currentRuleData;
    var rule = rd.rule || {};
    var info = {
      ruleId: rd.ruleId,
      name: rule.name || "(no name)",
      answer: rule.answer || "(no answer field)",
      group: rd.groupAssignment,
      quadrant: rd.difficulty,
      adversarialStrategy: rd.adversarialStrategy,
      strategyVariant: rd.strategyVariant,
      poolSize: (rd.fixedTrialPool || []).length,
    };
    console.table(info);
    return info;
  }

  // ── revealUpcoming() — print ground-truth labels of remaining trials ──
  // Without advancing the selector. Returns the upcoming sequence so it
  // can also be used programmatically (e.g., to assert in console).
  // Each entry: { trialIndex, poolOrder, groundTruth, handRole, handId }.
  function revealUpcoming() {
    if (!_isDebugEnabled()) {
      console.log(_gateMsg("revealUpcoming"));
      return null;
    }
    if (!_currentSelector || typeof _currentSelector.getUpcoming !== "function") {
      console.log(
        "DevTools.revealUpcoming: no selector with getUpcoming() available. " +
        "(Either we're not mid-classification, or the legacy v1 selector is in use.)"
      );
      return null;
    }
    var upcoming = _currentSelector.getUpcoming();
    if (upcoming.length === 0) {
      console.log("DevTools.revealUpcoming: pool exhausted (no trials left).");
      return upcoming;
    }
    // Compact summary for console.table
    var rows = upcoming.map(function (u) {
      return {
        trialIndex: u.trialIndex,
        groundTruth: u.handRole,           // 'winning' | 'losing'
        poolOrder: u.poolOrder,            // index in the fixed pool
        handSummary: u.hand.map(function (c) {
          var suit = (c.suit || "?").charAt(0);
          return c.rank + suit;
        }).join(" "),
      };
    });
    console.table(rows);
    return upcoming;
  }

  // Log availability on load
  console.log(
    "%cDevTools available: skip(), skipAll(N), skipTutorial(), skipGallery(), info(), setCondition(c), fastMode(), revealRule(), revealUpcoming()",
    "color: #0a66c2; font-weight: bold;"
  );

  return {
    skip: skip,
    skipAll: skipAll,
    skipTutorial: skipTutorial,
    skipGallery: skipGallery,
    info: info,
    setCondition: setCondition,
    fastMode: fastMode,

    // v2 reveal helpers
    revealRule: revealRule,
    revealUpcoming: revealUpcoming,
    // Internal — game.js registers (ruleData, selector) at the start of
    // each rule's classification phase.
    _setCurrent: _setCurrent,
  };
})();
