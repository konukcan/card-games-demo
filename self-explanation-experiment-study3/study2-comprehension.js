/* Study #2 — comprehension check.
 * Ported from rule-gallery/gallery-comprehension.js: two questions, 2 attempts,
 * fail on the 2nd wrong attempt → onFail (screen-out). Styled to the study #2
 * terracotta/cream palette. Self-contained; no dependencies.
 */
(function () {
  "use strict";

  var CORRECT_Q1 = "b";   // Jack, Queen, King
  var CORRECT_Q2 = "a";   // All 6 example hands satisfy
  var _data = null;

  var TERRACOTTA = "#D97757";
  var TERRACOTTA_STRONG = "#C5613F";
  var PANEL = "#FDFBF7";

  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }

  // Build one question block. opts: {qNum, name, prompt, options:[{value,text}]}
  function buildQuestion(opts) {
    var wrap = el("div", "margin:18px 0;");
    var q = el("div",
      "font-size:15px;font-weight:600;color:#2b2b2b;margin-bottom:10px;line-height:1.5;",
      opts.qNum + ". " + opts.prompt);
    wrap.appendChild(q);
    opts.options.forEach(function (o) {
      var label = el("label",
        "display:block;padding:9px 12px;margin:6px 0;border:1.5px solid #e3ddd2;" +
        "border-radius:10px;cursor:pointer;font-size:14px;color:#2b2b2b;background:#fff;");
      var radio = el("input", "margin-right:9px;vertical-align:middle;");
      radio.type = "radio";
      radio.name = opts.name;
      radio.value = o.value;
      label.appendChild(radio);
      label.appendChild(document.createTextNode(o.text));
      wrap.appendChild(label);
    });
    var fb = el("div",
      "display:none;margin-top:6px;font-size:13px;color:#b91c1c;line-height:1.5;");
    fb.setAttribute("data-role", opts.name + "-feedback");
    wrap.appendChild(fb);
    return { wrap: wrap, feedback: fb };
  }

  function start(onPass, onFail) {
    var attempt = 0;

    // Full-bleed opaque page (NOT a dark-scrim modal) — reads as a normal
    // experiment screen, matching rule-gallery/gallery-comprehension.js.
    // Background is the experiment page colour so nothing shows behind it.
    var overlay = el("div",
      "position:fixed;inset:0;z-index:1001;background:var(--page-bg);" +
      "display:flex;align-items:center;justify-content:center;padding:24px;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;overflow-y:auto;");

    var card = el("div",
      "background:" + PANEL + ";border:1px solid #E8DFD3;border-radius:18px;" +
      "max-width:560px;width:100%;padding:30px 34px;" +
      "box-shadow:0 12px 40px rgba(75,55,35,0.07),0 2px 6px rgba(75,55,35,0.05);");

    card.appendChild(el("div",
      "font-size:12px;letter-spacing:0.09em;text-transform:uppercase;color:" +
      TERRACOTTA_STRONG + ";font-weight:700;margin-bottom:6px;", "Quick Comprehension Check"));
    card.appendChild(el("div",
      "font-size:14px;color:#6b6358;margin-bottom:4px;line-height:1.6;",
      "Before we begin, please answer these two questions to make sure everything is clear."));

    var q1 = buildQuestion({
      qNum: 1, name: "compgate-q1",
      prompt: "In a standard deck of cards, what is the correct order of face cards from lowest to highest?",
      options: [
        { value: "a", text: "King, Queen, Jack" },
        { value: "b", text: "Jack, Queen, King" },
        { value: "c", text: "Queen, Jack, King" },
        { value: "d", text: "Jack, King, Queen" }
      ]
    });
    var q2 = buildQuestion({
      qNum: 2, name: "compgate-q2",
      prompt: "In each round, the hidden rule is a pattern that:",
      options: [
        { value: "a", text: "All 6 example hands satisfy" },
        { value: "b", text: "Only some of the example hands satisfy" },
        { value: "c", text: "No hand satisfies" },
        { value: "d", text: "Distinguishes all 6 hands from each other" }
      ]
    });
    card.appendChild(q1.wrap);
    card.appendChild(q2.wrap);

    var banner = el("div",
      "display:none;margin:12px 0;padding:10px 12px;border-radius:10px;" +
      "background:#fdf3e7;color:#8a5a2b;font-size:13px;line-height:1.5;");
    card.appendChild(banner);

    var submit = el("button",
      "display:block;width:100%;margin-top:18px;padding:12px 0;font-size:15px;" +
      "font-weight:600;border:none;border-radius:100px;background:" + TERRACOTTA +
      ";color:#fff;cursor:pointer;font-family:inherit;", "Submit");
    submit.setAttribute("data-role", "comp-submit");
    card.appendChild(submit);

    submit.addEventListener("click", function () {
      var q1sel = card.querySelector('input[name="compgate-q1"]:checked');
      var q2sel = card.querySelector('input[name="compgate-q2"]:checked');
      if (!q1sel || !q2sel) {
        banner.style.display = "block";
        banner.textContent = "Please answer both questions before continuing.";
        return;
      }
      attempt++;
      var q1ok = q1sel.value === CORRECT_Q1;
      var q2ok = q2sel.value === CORRECT_Q2;
      _data = {
        q1_faceCardOrder: q1sel.value, q1_correct: q1ok,
        q2_ruleProperty: q2sel.value, q2_correct: q2ok,
        firstAttemptPassed: (q1ok && q2ok && attempt === 1)
      };

      if (q1ok && q2ok) { overlay.remove(); onPass(); return; }
      if (attempt >= 2) { overlay.remove(); onFail(); return; }

      if (!q1ok) {
        q1.feedback.style.display = "block";
        q1.feedback.textContent =
          "Incorrect. The correct order from lowest to highest is: Jack, Queen, King.";
      }
      if (!q2ok) {
        q2.feedback.style.display = "block";
        q2.feedback.textContent =
          "Incorrect. In each round, the hidden rule is a pattern that all 6 example hands satisfy.";
      }
      banner.style.display = "block";
      banner.textContent = "Please review the corrections above and try again.";
      submit.textContent = "Try Again";
    });

    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  function getData() { return _data; }

  window.Study2Comprehension = { start: start, getData: getData };
})();
