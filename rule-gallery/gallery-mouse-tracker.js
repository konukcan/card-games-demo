// rule-gallery/gallery-mouse-tracker.js
// Lightweight mouse event tracker for the Rule Gallery calibration study.
// Not dependent on jsPsych — standalone IIFE.
//
// Usage:
//   GalleryMouseTracker.start(ruleId)   — begin recording events
//   GalleryMouseTracker.stop()          — stop recording, return event buffer
//
// Events captured: mousemove (throttled to 20 Hz), click, mousedown, mouseup
// Each event: { x, y, t, type }
//   x, y  — page coordinates (integers)
//   t     — milliseconds since start() was called (via performance.now())
//   type  — "move", "click", "down", "up"
//
// Safety valve: max 2000 events per rule to cap memory usage.

(function () {
  "use strict";

  const MAX_EVENTS = 2000;
  const THROTTLE_MS = 50; // 20 Hz for mousemove

  let buffer = [];
  let startTime = 0;
  let active = false;
  let lastMoveTime = 0;

  // ── Event handlers ──

  function onMouseMove(e) {
    if (!active || buffer.length >= MAX_EVENTS) return;
    const now = performance.now();
    // Throttle: skip if less than THROTTLE_MS since last recorded move
    if (now - lastMoveTime < THROTTLE_MS) return;
    lastMoveTime = now;
    buffer.push({
      x: Math.round(e.pageX),
      y: Math.round(e.pageY),
      t: Math.round(now - startTime),
      type: "move"
    });
  }

  function onMouseEvent(type) {
    return function (e) {
      if (!active || buffer.length >= MAX_EVENTS) return;
      buffer.push({
        x: Math.round(e.pageX),
        y: Math.round(e.pageY),
        t: Math.round(performance.now() - startTime),
        type: type
      });
    };
  }

  const onClick = onMouseEvent("click");
  const onMouseDown = onMouseEvent("down");
  const onMouseUp = onMouseEvent("up");

  // ── Public API ──

  // Start tracking. Clears any previous buffer.
  function start(ruleId) {
    buffer = [];
    startTime = performance.now();
    lastMoveTime = 0;
    active = true;
    document.addEventListener("mousemove", onMouseMove, { passive: true });
    document.addEventListener("click", onClick, { passive: true });
    document.addEventListener("mousedown", onMouseDown, { passive: true });
    document.addEventListener("mouseup", onMouseUp, { passive: true });
  }

  // Stop tracking. Returns the event buffer and detaches listeners.
  function stop() {
    active = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("click", onClick);
    document.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("mouseup", onMouseUp);
    const result = buffer;
    buffer = [];
    return result;
  }

  // ── Export ──
  window.GalleryMouseTracker = { start, stop };

})();
