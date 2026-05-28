// self-explanation-experiment/study2-consent.js
// Consent overlay for SE study #2.
//
// Ported from rule-gallery/gallery-consent.js — same CICL/Stanford template
// (Tobi as PI, AI-assistance prohibition), but:
//   - Promise-based API (`Study2Consent.run()`) for SE's awaitable lifecycle
//   - Distinct localStorage key (`se_study2_consent_given`) so consent for
//     rule-gallery doesn't auto-satisfy consent for study #2 — a participant
//     who did rule-gallery must still affirm SE study #2 separately.
//   - Time estimate updated for study #2 (longer than rule-gallery).
//   - Records consent timestamp on the returned object so app.js can write
//     it into payload.metadata.consent.
//
// Usage:
//   await Study2Consent.run();   // resolves on click; rejects only if
//                                 // localStorage is unavailable.

(function () {
  "use strict";

  var STORAGE_KEY = "se_study2_consent_given";
  var TIMESTAMP_KEY = "se_study2_consent_time";

  function getConsentBody() {
    return ''
      + '<div style="text-align:left;background-color:lightblue;padding:20px;">'
      + '<p><b>Description:</b> Welcome! You are invited to participate in a research '
      + 'study in cognitive psychology. You will be asked to perform various tasks on a '
      + 'computer which may include: looking at images or videos, reading scenarios, or '
      + 'playing card-pattern games. You may be asked a number of different questions '
      + 'about making judgments and interpreting patterns. All information collected '
      + 'will remain confidential.</p>'

      + '<p><b>Risks and benefits:</b> Risks involved in this study are the same as '
      + 'those normally associated with using a computer (e.g., mild eye/arm strain). '
      + 'If you have any pre-existing conditions that might make reading and completing '
      + 'a computer-based survey strenuous for you, you should probably elect to not '
      + 'participate in this study. If at any time during the study you feel unable to '
      + 'participate because you are experiencing strain, you may end your participation '
      + 'without penalty. We cannot and do not guarantee or promise that you will '
      + 'receive any benefits from this study. Your decision whether or not to '
      + 'participate in this study will not affect your employment, medical care, '
      + 'and/or grades in school.</p>'

      + '<p><b>Time involvement:</b> Your participation in this experiment will take '
      + 'approximately 35 minutes.</p>'

      + '<p><b>Payment:</b> If recruitment materials indicate payment (e.g., Prolific or '
      + 'other recruitment), you will receive compensation as indicated.</p>'

      + '<p><b>Subject\'s rights:</b> If you have read this notice and have decided to '
      + 'participate in this project, please understand your participation is voluntary '
      + 'and you have the right to withdraw your consent or discontinue participation '
      + 'at any time without penalty or loss of benefits to which you are otherwise '
      + 'entitled. You have the right to refuse to answer particular questions. Your '
      + 'individual privacy will be maintained in all published and written data '
      + 'resulting from the study.</p>'

      + '<p><b>Contact information:</b> If you have any questions, concerns or '
      + 'complaints about this research study, its procedures, or risks and benefits, '
      + 'you should ask the Protocol Director, (Professor Tobias Gerstenberg, Phone: '
      + '(650) 725-2431; Email: gerstenberg@stanford.edu).</p>'

      + '<p><b>Study conditions:</b> This study requires you to formulate responses '
      + 'based solely on your own observation of the cards displayed on screen. The '
      + 'following are prohibited and will result in rejection of your submission:</p>'
      + '<ul style="margin-left:0;padding-left:20px;">'
      + '<li>Using AI assistants, chatbots, or language models</li>'
      + '<li>Copying or transferring card information outside the study page</li>'
      + '<li>Looking up information in external sources</li>'
      + '<li>Using any external tools to help generate responses</li>'
      + '</ul>'
      + '<p>Submissions showing clear signs of external assistance will be rejected. '
      + 'Your interactions are monitored for data quality purposes.</p>'

      + '<p><b>Independent contact:</b> If you are not satisfied with how this study '
      + 'is being conducted, or if you have any concerns, complaints, or general '
      + 'questions about the research or your rights as a participant, please contact '
      + 'the Stanford Institutional Review Board (IRB) to speak to someone independent '
      + 'of the research team via email at irb2-manager@lists.stanford.edu, or via '
      + 'phone at (650) 723-2480 or toll free at 1-866-680-2906. You can also write '
      + 'to the Stanford IRB, Stanford University, 3000 El Camino Real, Five Palo Alto '
      + 'Square, 4th Floor, Palo Alto, CA 94306.</p>'

      + '<p>You may want to print a copy of this consent form to keep. By clicking the '
      + 'button below, you acknowledge that you have read the above information, that '
      + 'you are 18 years of age, or older and give your consent to participate in our '
      + 'internet-based study and consent for us to analyze the resulting data.</p>'
      + '</div>';
  }

  function buildHTML() {
    return ''
      + '<div style="min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;background:#f9fafb;">'
      + '<div style="max-width:800px;width:100%;background:#fff;border-radius:16px;'
      + 'box-shadow:0 4px 20px rgba(0,0,0,0.08);padding:48px;">'

      + '<h1 style="color:#8C1515;border-bottom:2px solid #8C1515;padding-bottom:10px;'
      + 'margin-bottom:8px;font-size:1.4em;text-align:left;">'
      + 'Stanford University Research Information Sheet'
      + '</h1>'
      + '<p style="color:#666;margin:0 0 24px 0;font-size:0.9em;text-align:left;">'
      + 'Department of Psychology'
      + '</p>'

      + getConsentBody()

      + '<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">'

      + '<button id="se-study2-consent-agree-btn" '
      + 'style="display:block;width:100%;padding:14px;font-size:18px;font-weight:600;'
      + 'color:#fff;background:#8C1515;border:none;border-radius:8px;cursor:pointer;'
      + 'transition:opacity 0.2s;">'
      + 'I Agree — Begin Study'
      + '</button>'

      + '</div></div>';
  }

  // Promise-based runner.
  // Renders the consent overlay into #app; resolves with { consentedAt }
  // when the user clicks "I Agree". Returns IMMEDIATELY (resolved) if
  // consent was already given in this browser (localStorage cache).
  function run() {
    return new Promise(function (resolve) {
      // Already consented in this browser?
      var prior;
      try { prior = localStorage.getItem(STORAGE_KEY); } catch (_e) { prior = null; }
      if (prior === "true") {
        var priorTs = null;
        try { priorTs = sessionStorage.getItem(TIMESTAMP_KEY); } catch (_e) {}
        resolve({ consentedAt: priorTs, cached: true });
        return;
      }

      var app = document.getElementById("app");
      app.innerHTML = buildHTML();

      var btn = document.getElementById("se-study2-consent-agree-btn");
      btn.addEventListener("click", function () {
        var ts = new Date().toISOString();
        try { localStorage.setItem(STORAGE_KEY, "true"); } catch (_e) {}
        try { sessionStorage.setItem(TIMESTAMP_KEY, ts); } catch (_e) {}
        resolve({ consentedAt: ts, cached: false });
      });
    });
  }

  function isComplete() {
    try { return localStorage.getItem(STORAGE_KEY) === "true"; }
    catch (_e) { return false; }
  }

  function clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_e) {}
    try { sessionStorage.removeItem(TIMESTAMP_KEY); } catch (_e) {}
  }

  window.Study2Consent = { run: run, isComplete: isComplete, clear: clear };
})();
