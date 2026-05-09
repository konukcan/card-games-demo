// js/error-handler.js — Global error handler for experiment pages
// Catches uncaught exceptions and unhandled promise rejections.
// If jsPsych data exists, attempts to save it via browser download.
// Shows a user-friendly message so participants know what to do.
(function () {
  'use strict';

  // Track whether we've already shown the error overlay (prevent duplicates)
  var errorShown = false;

  /**
   * Attempt to download whatever jsPsych data has been collected so far.
   * This is a best-effort rescue — the data may be incomplete.
   */
  function rescueData() {
    try {
      // jsPsych may not be initialized yet; bail if so
      if (typeof jsPsych === 'undefined' || !jsPsych.data) return;

      var csv = jsPsych.data.get().csv();
      if (!csv || csv.split('\n').length <= 1) return; // header-only = no data

      var blob = new Blob([csv], { type: 'text/csv' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'cards_rescue_' + Date.now() + '.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) {
      console.warn('[ErrorHandler] Could not rescue data:', e);
    }
  }

  /**
   * Display a full-screen error overlay with instructions for the participant.
   * Includes a rescue-data button in case the automatic download didn't fire.
   */
  function showErrorOverlay(errorMsg) {
    if (errorShown) return;
    errorShown = true;

    var overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(255,255,255,0.97);z-index:999999;font-family:system-ui,sans-serif;';

    overlay.innerHTML =
      '<div style="max-width:600px;padding:32px;text-align:center;">' +
        '<h2 style="color:#8C1515;margin-bottom:16px;">Something went wrong</h2>' +
        '<p style="color:#555;line-height:1.6;margin-bottom:24px;">' +
          'The experiment encountered a technical error. ' +
          'Your partial data has been saved automatically if possible.' +
        '</p>' +
        '<p style="color:#555;line-height:1.6;margin-bottom:24px;">' +
          'Please return this study on Prolific using the code:<br>' +
          '<strong style="font-size:1.2em;color:#333;">TECHNICAL_ERROR</strong>' +
        '</p>' +
        '<button id="err-rescue-btn" style="' +
          'padding:10px 24px;font-size:1em;border:1px solid #ccc;border-radius:6px;' +
          'background:#f5f5f5;cursor:pointer;margin-bottom:16px;' +
        '">Download partial data</button>' +
        '<p style="font-size:0.8em;color:#999;margin-top:16px;">' +
          'Error: ' + (errorMsg || 'Unknown') +
        '</p>' +
      '</div>';

    document.body.appendChild(overlay);

    // Wire up the rescue button
    var btn = document.getElementById('err-rescue-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        rescueData();
        btn.textContent = 'Downloaded';
        btn.disabled = true;
      });
    }
  }

  // --- Global listeners ---

  // Catches synchronous errors (throw, TypeError, ReferenceError, etc.)
  window.addEventListener('error', function (event) {
    console.error('[ErrorHandler] Uncaught error:', event.error || event.message);
    rescueData();
    showErrorOverlay(event.message || String(event.error));
  });

  // Catches unhandled promise rejections (e.g., failed fetch, async errors)
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var msg = reason instanceof Error ? reason.message : String(reason);
    console.error('[ErrorHandler] Unhandled rejection:', reason);
    rescueData();
    showErrorOverlay(msg);
  });

})();
