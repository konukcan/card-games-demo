// rule-gallery/gallery-focus-tracker.js
// Tracks tab/window focus events per rule.
// GalleryFocusTracker.start(ruleId) — begin tracking
// GalleryFocusTracker.stop()        — return events array and reset
(function () {
  "use strict";

  let events = [];
  let leftAt = null;
  let active = false;
  let nudgeShown = false;

  function onHidden() {
    if (!active) return;
    leftAt = new Date().toISOString();
  }

  function onVisible() {
    if (!active || !leftAt) return;
    var returnedAt = new Date().toISOString();
    var duration_ms = new Date(returnedAt).getTime() - new Date(leftAt).getTime();
    events.push({ leftAt: leftAt, returnedAt: returnedAt, duration_ms: duration_ms });
    leftAt = null;
    showNudge();
  }

  function showNudge() {
    if (nudgeShown) return;
    nudgeShown = true;
    var el = document.createElement("div");
    el.style.cssText = "position:fixed;top:60px;left:50%;transform:translateX(-50%);background:#fef3c7;color:#92400e;padding:12px 24px;border-radius:8px;font-size:15px;z-index:999;box-shadow:0 2px 8px rgba(0,0,0,0.15);transition:opacity 0.5s;";
    el.textContent = "Welcome back \u2014 please keep this tab focused during the study.";
    document.body.appendChild(el);
    setTimeout(function() { el.style.opacity = "0"; }, 3000);
    setTimeout(function() { el.remove(); }, 3500);
  }

  document.addEventListener("visibilitychange", function() {
    if (document.hidden) onHidden(); else onVisible();
  });
  window.addEventListener("blur", onHidden);
  window.addEventListener("focus", function() {
    if (!document.hidden) onVisible();
  });

  function start(ruleId) {
    events = [];
    leftAt = null;
    active = true;
    nudgeShown = false;
  }

  function stop() {
    active = false;
    var result = events;
    events = [];
    leftAt = null;
    return result;
  }

  window.GalleryFocusTracker = { start: start, stop: stop };
})();
