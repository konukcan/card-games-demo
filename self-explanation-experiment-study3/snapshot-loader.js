// self-explanation-experiment/snapshot-loader.js
// Fail-closed snapshot fetch + validation for the v2 mature design.
//
// Per design §7.3, the experiment refuses to start if any of:
//   - ?seSnapshot=<id> URL param is missing
//   - the snapshot JSON 404s on fetch
//   - JSON parse fails
//   - schema validation fails (top-level keys missing, OR per-rule pool/
//     exemplar/leaf shape malformed — see _validate for the full set)
//   - the requested ?adversarialStrategy is not present in the snapshot,
//     OR is unset, OR is "mixed" (not yet implemented)
//
// On any failure, an error screen is rendered into #app and the returned
// Promise rejects so callers (curriculum.js) bail out before consent.
//
// No silent fallback to live model calls — that was the v1 default and
// it's load-bearing-incorrect: we cannot reproducibility-guarantee a
// study session that swaps to live computation if its precomputed
// snapshot is unavailable.
//
// Depends on:
//   window.SEConfig — for SEConfig.seSnapshot, .adversarialStrategy,
//                     .strategyVariant
//
// Exported as window.SESnapshotLoader.

window.SESnapshotLoader = (function () {
  "use strict";

  // ── Required top-level keys per design v2 §4.1 ──
  // schema_version added in v2. Top-level structure preserved from v1
  // (Issue 2 = option B): selected_rules / exemplars / trial_pools.
  // group_assignment NEW in v2 (Issue 5 — also redundantly written into
  // each selected_rules entry's `group` field).
  var REQUIRED_KEYS = [
    "snapshot_id",
    "schema_version",
    "selected_rules",
    "exemplars",
    "trial_pools",
    "group_assignment",
  ];

  // Strategy enum — single source of truth: SEConfig.VALID_STRATEGIES.
  // Loader reads it dynamically so renames in config.js cascade here.
  function _validStrategies() {
    return (window.SEConfig && SEConfig.VALID_STRATEGIES) ||
      ["A_entropy", "B_misclass",
       "C_flip_from_random_winning", "D_flip_from_exemplars"];
  }

  // Minimum hands per ground-truth label class. v2 ships 5W + 5L per rule.
  var MIN_PER_LABEL = 5;

  // ── Render a fail screen with a reference code ──
  // The reference code lets a researcher diagnose without exposing internal
  // paths or stack traces. Copy is cause-aware: connection errors give the
  // participant a self-help action; our-fault errors reassure them it is not
  // anything they did. Both classes show the reference code and the
  // "you will not be penalised" line so the participant can exit cleanly.
  //
  // SECURITY: dynamic values (`code`, `message`) go through `textContent`,
  // not `innerHTML`, so a malicious URL like
  //   ?adversarialStrategy=<img src=x onerror=alert(1)>
  // can't inject executable script via the message string.
  function showFailScreen(code, message) {
    var app = document.getElementById("app");
    if (!app) return;
    // Clear and rebuild via DOM APIs — no innerHTML for participant-controlled data.
    app.innerHTML = "";
    var card = document.createElement("div");
    card.className = "se-fail-screen";
    card.style.cssText =
      "max-width:560px;margin:80px auto;padding:32px;text-align:center;" +
      "font-family:system-ui,-apple-system,sans-serif;color:#1e293b;" +
      "background:#fff;border:1px solid #e2e8f0;border-radius:8px;";

    // Eyebrow label — kept so existing tests asserting
    // html.toLowerCase().contains("study unavailable") stay green.
    var eyebrow = document.createElement("div");
    eyebrow.style.cssText =
      "font-size:12px;letter-spacing:0.08em;text-transform:uppercase;" +
      "color:#94a3b8;margin-bottom:8px;";
    eyebrow.textContent = "Study unavailable"; /* COPY: researcher to confirm */

    // Primary heading — participant-facing, reassuring.
    var h2 = document.createElement("h2");
    h2.style.cssText = "color:#dc2626;margin-top:0;margin-bottom:16px;";
    h2.textContent = "This study can’t start right now."; /* COPY: researcher to confirm */

    // Cause-appropriate line — distinguishes connection issues from our errors.
    var isConnectionClass = (code === "SNAPSHOT_404" || code === "SNAPSHOT_NETWORK");
    var causeEl = document.createElement("p");
    causeEl.style.cssText = "line-height:1.7;color:#475569;";
    if (isConnectionClass) {
      causeEl.textContent = /* COPY: researcher to confirm */
        "This may be a connection problem on your end. " +
        "Please check your internet and refresh the page once.";
    } else {
      causeEl.textContent = /* COPY: researcher to confirm */
        "This is a configuration problem on our end, not anything you did.";
    }

    // Technical detail line (the original `message` arg — preserved for diagnosis).
    var detailEl = document.createElement("p");
    detailEl.style.cssText = "font-size:13px;color:#94a3b8;line-height:1.6;";
    detailEl.textContent = String(message || "");             // textContent — XSS-safe

    // Reference code line — required by existing tests and for researcher diagnosis.
    var refLine = document.createElement("p");
    refLine.style.cssText = "margin-top:24px;font-size:14px;color:#64748b;";
    refLine.appendChild(document.createTextNode("Reference code: ")); /* COPY */
    var strong = document.createElement("strong");
    strong.textContent = String(code || "UNKNOWN");           // textContent — XSS-safe
    refLine.appendChild(strong);

    // Final reassurance — lets participant exit without anxiety.
    var reassure = document.createElement("p");
    reassure.style.cssText = "margin-top:8px;font-size:14px;color:#64748b;line-height:1.6;";
    reassure.textContent = /* COPY: researcher to confirm */
      "Please return the study on Prolific and message the researcher with " +
      "this reference code. You will not be penalised.";

    card.appendChild(eyebrow);
    card.appendChild(h2);
    card.appendChild(causeEl);
    card.appendChild(detailEl);
    card.appendChild(refLine);
    card.appendChild(reassure);
    app.appendChild(card);
  }

  // ── _resolveLeafKey(strategy) ──
  //
  // v2: all strategies are flat (no leaf-key sub-keys; old paired/
  // independent/mi/seeded variants are gone — see Issue 2 + B3).
  // The `variant` arg from old callers is accepted but ignored, for
  // hash-continuity compatibility (Issue 3).
  //
  // Returns:
  //   { kind: "flat" }                        — pool[strategy] = {winning, losing}
  //   { kind: "unsupported", reason: "..." }  — strategy not in VALID_STRATEGIES
  function _resolveLeafKey(strategy /* , _variantUnused */) {
    if (_validStrategies().indexOf(strategy) === -1) {
      return { kind: "unsupported", reason: "unknown strategy: " + strategy };
    }
    return { kind: "flat" };
  }

  // ── Per-strategy field-presence (Issue 11) ──
  //
  // Catches converter bugs that wrote the wrong fields for a strategy
  // (e.g. entropy_bits attached to a B_misclass hand). Returns a string
  // error message on first violation, or null if everything's clean.
  function _validatePerStrategyFields(strategy, leaf, ruleId) {
    var allHands = leaf.winning.concat(leaf.losing);
    for (var i = 0; i < allHands.length; i++) {
      var h = allHands[i];
      if (strategy === "A_entropy") {
        if (h.entropy_bits == null || h.p_accept_emp == null) {
          return "rule " + ruleId + "/A_entropy/h" + i +
            ": missing entropy_bits or p_accept_emp";
        }
      } else if (strategy === "B_misclass") {
        if (h.misclass_score == null || h.p_accept_emp == null) {
          return "rule " + ruleId + "/B_misclass/h" + i +
            ": missing misclass_score or p_accept_emp";
        }
      } else if (strategy === "C_flip_from_random_winning") {
        // Only losing hands carry flip metadata; winners are bare.
        if (!h.ground_truth) {
          if (h.edit_depth == null || !h.edit_description || !h.source_hand) {
            return "rule " + ruleId + "/C/h" + i +
              ": losing hand missing flip metadata";
          }
        }
      } else if (strategy === "D_flip_from_exemplars") {
        if (h.edit_depth == null || h.source_exemplar_idx == null) {
          return "rule " + ruleId + "/D/h" + i +
            ": missing edit_depth or source_exemplar_idx";
        }
      }
    }
    return null;
  }

  // ── Validate a single rule's trial pool for the given strategy ──
  //
  // v2 schema: pool[strategy] = { winning: [...>=5], losing: [...>=5] }
  // — flat shape always. Old "named" sub-leaves (paired/independent/mi)
  // collapsed in B3.
  //
  // _variantUnused arg kept for backward-compat with existing callers
  // (Issue 3 — variant param retained at call sites for hash continuity
  // but no longer steers leaf resolution).
  function _validateRulePool(rulePool, strategy, _variantUnused, ruleId) {
    if (!rulePool || typeof rulePool !== "object") {
      return { ok: false, reason: "rule " + ruleId + ": missing trial_pool" };
    }
    var leaf = rulePool[strategy];
    if (leaf == null) {
      return { ok: false, reason: "rule " + ruleId + ": no pool for strategy " + strategy };
    }
    if (typeof leaf !== "object" || !Array.isArray(leaf.winning) || !Array.isArray(leaf.losing)) {
      return { ok: false, reason: "rule " + ruleId + ": leaf is not {winning[], losing[]}" };
    }
    if (leaf.winning.length < MIN_PER_LABEL) {
      return {
        ok: false,
        reason: "rule " + ruleId + ": only " + leaf.winning.length +
          " winning hands (need >= " + MIN_PER_LABEL + ")",
      };
    }
    if (leaf.losing.length < MIN_PER_LABEL) {
      return {
        ok: false,
        reason: "rule " + ruleId + ": only " + leaf.losing.length +
          " losing hands (need >= " + MIN_PER_LABEL + ")",
      };
    }
    // Per-strategy field-presence (Issue 11)
    var fieldErr = _validatePerStrategyFields(strategy, leaf, ruleId);
    if (fieldErr) return { ok: false, reason: fieldErr };
    return { ok: true };
  }

  // ── Validate the loaded JSON (v2) ──
  //
  // Returns `{ ok: true }` or `{ ok: false, reason: string, code: string }`.
  // The `code` lets callers render distinct fail screens.
  //
  // _variantUnused kept for backward-compat with existing callers
  // (Issue 3 — variant retired but parameter retained).
  function _validate(snapshot, strategy, _variantUnused) {
    if (typeof snapshot !== "object" || snapshot === null) {
      return { ok: false, code: "SNAPSHOT_SCHEMA", reason: "snapshot is not a JSON object" };
    }

    // Schema version (Issue 1) — top-level int. Anything else fails closed.
    if (snapshot.schema_version !== 2) {
      return {
        ok: false, code: "SNAPSHOT_SCHEMA_OUTDATED",
        reason: "expected schema_version 2, got " +
          JSON.stringify(snapshot.schema_version),
      };
    }

    for (var i = 0; i < REQUIRED_KEYS.length; i++) {
      var k = REQUIRED_KEYS[i];
      if (!(k in snapshot)) {
        return { ok: false, code: "SNAPSHOT_SCHEMA", reason: "missing key: " + k };
      }
    }
    if (!Array.isArray(snapshot.selected_rules) || snapshot.selected_rules.length === 0) {
      return { ok: false, code: "SNAPSHOT_SCHEMA", reason: "selected_rules empty or not an array" };
    }
    if (typeof snapshot.exemplars !== "object" || snapshot.exemplars === null) {
      return { ok: false, code: "SNAPSHOT_SCHEMA", reason: "exemplars not an object" };
    }
    if (typeof snapshot.trial_pools !== "object" || snapshot.trial_pools === null) {
      return { ok: false, code: "SNAPSHOT_SCHEMA", reason: "trial_pools not an object" };
    }

    // Group assignment partition validation (Issue 5 / new SNAPSHOT_GROUP_PARTITION_INVALID)
    var ga = snapshot.group_assignment;
    if (typeof ga !== "object" || ga === null ||
        !Array.isArray(ga.X) || !Array.isArray(ga.Y)) {
      return {
        ok: false, code: "SNAPSHOT_GROUP_PARTITION_INVALID",
        reason: "group_assignment must have X and Y array fields",
      };
    }
    if (ga.X.length !== 5 || ga.Y.length !== 5) {
      return {
        ok: false, code: "SNAPSHOT_GROUP_PARTITION_INVALID",
        reason: "group_assignment X/Y must each be length 5; got " +
          ga.X.length + "/" + ga.Y.length,
      };
    }
    var setX = {};
    for (var ix = 0; ix < ga.X.length; ix++) setX[ga.X[ix]] = true;
    for (var iy = 0; iy < ga.Y.length; iy++) {
      if (setX[ga.Y[iy]]) {
        return {
          ok: false, code: "SNAPSHOT_GROUP_PARTITION_INVALID",
          reason: "group_assignment X intersect Y is non-empty (" +
            ga.Y[iy] + " in both)",
        };
      }
    }

    // Strategy presence — explicit, not optional
    if (!strategy) {
      return {
        ok: false, code: "STRATEGY_REQUIRED",
        reason: "?adversarialStrategy URL parameter is required",
      };
    }
    if (_validStrategies().indexOf(strategy) === -1) {
      return {
        ok: false, code: "STRATEGY_UNKNOWN",
        reason: "Unknown strategy '" + strategy + "' (valid: " +
          _validStrategies().join(", ") + ")",
      };
    }
    // Strategy must actually be present in the snapshot
    var anyHas = snapshot.selected_rules.some(function (r) {
      var pool = (snapshot.trial_pools && snapshot.trial_pools[r.rule_id]) || {};
      return pool[strategy] != null;
    });
    if (!anyHas) {
      return {
        ok: false, code: "STRATEGY_NOT_AVAILABLE_IN_SNAPSHOT",
        reason: "snapshot has no pool for strategy '" + strategy + "'",
      };
    }

    // Per-rule validation: exemplars present + pool leaf shape correct
    for (var j = 0; j < snapshot.selected_rules.length; j++) {
      var entry = snapshot.selected_rules[j];
      var rid = entry && entry.rule_id;
      if (!rid) {
        return { ok: false, code: "SNAPSHOT_SCHEMA", reason: "selected_rules[" + j + "] has no rule_id" };
      }
      var ex = snapshot.exemplars[rid];
      if (!Array.isArray(ex) || ex.length === 0) {
        return {
          ok: false, code: "SNAPSHOT_EXEMPLARS_MISSING",
          reason: "rule " + rid + ": no exemplars in snapshot",
        };
      }
      var poolValidation = _validateRulePool(snapshot.trial_pools[rid], strategy, null, rid);
      if (!poolValidation.ok) {
        return { ok: false, code: "SNAPSHOT_POOL_INVALID", reason: poolValidation.reason };
      }
    }

    return { ok: true };
  }

  // ── Build the schema_v2 snapshot URL from its id ──
  // Path matches the layout the Python builder writes:
  //   rule-gallery/analysis/output_se_snapshots/<id>/se_snapshot_<id>.json
  // index.html uses <base href="../">, which resolves the parent dir to
  // card-games/, so this relative URL is correct.
  function _snapshotUrl(snapshotId) {
    return (
      "rule-gallery/analysis/output_se_snapshots/" +
      snapshotId +
      "/se_snapshot_" + snapshotId + ".json"
    );
  }

  // ── Build the schema_v3 snapshot URL from its id ──
  // Spec-C pipeline writes schema_v3 snapshots to a flat directory:
  //   self-explanation-experiment-study3/snapshots/<id>.json
  // index.html uses <base href="../"> so this resolves to card-games/.
  function _snapshotUrlV3(snapshotId) {
    return "self-explanation-experiment-study3/snapshots/" + snapshotId + ".json";
  }

  // ── _validateV3(snapshot) ──
  // Returns { ok: true } or { ok: false, code: "SNAPSHOT_V3_INVALID", message: "..." }.
  // Called when schema_version === 3 is detected after fetch + parse.
  //
  // Checks:
  //   - snapshot is an object
  //   - schema_version === 3
  //   - required top-level keys present: snapshot_id, group_assignment,
  //     end_requery_rules, rules
  //   - rules is an array of exactly 10 entries
  //   - each rule has: rule_id, rule_answer, difficulty, group, is_end_requery,
  //     gallery (array of 6), test_hands (array of 6 with exactly 3 ground_truth true)
  //   - group_assignment has X and Y array fields
  //   - end_requery_rules is an array of length 2
  function _validateV3(snapshot) {
    var FAIL = function (msg) {
      return { ok: false, code: "SNAPSHOT_V3_INVALID", message: msg };
    };

    if (typeof snapshot !== "object" || snapshot === null) {
      return FAIL("snapshot is not a JSON object");
    }
    if (snapshot.schema_version !== 3) {
      return FAIL("expected schema_version 3, got " + JSON.stringify(snapshot.schema_version));
    }

    var requiredKeys = ["snapshot_id", "group_assignment", "end_requery_rules", "rules"];
    for (var ki = 0; ki < requiredKeys.length; ki++) {
      if (!(requiredKeys[ki] in snapshot)) {
        return FAIL("missing required key: " + requiredKeys[ki]);
      }
    }

    if (!Array.isArray(snapshot.rules) || snapshot.rules.length !== 10) {
      return FAIL("rules must be an array of exactly 10 entries; got " +
        (Array.isArray(snapshot.rules) ? snapshot.rules.length : typeof snapshot.rules));
    }

    // test_hands validated separately (pool schema for study #3, fixed for study #2).
    var ruleRequiredKeys = ["rule_id", "rule_answer", "difficulty", "group", "is_end_requery", "gallery"];
    for (var ri = 0; ri < snapshot.rules.length; ri++) {
      var rule = snapshot.rules[ri];
      if (!rule || typeof rule !== "object") {
        return FAIL("rules[" + ri + "] is not an object");
      }
      for (var rki = 0; rki < ruleRequiredKeys.length; rki++) {
        if (!(ruleRequiredKeys[rki] in rule)) {
          return FAIL("rules[" + ri + "] missing key: " + ruleRequiredKeys[rki]);
        }
      }
      if (!Array.isArray(rule.gallery) || rule.gallery.length !== 6) {
        return FAIL("rules[" + ri + "].gallery must be an array of exactly 6 hands; got " +
          (Array.isArray(rule.gallery) ? rule.gallery.length : typeof rule.gallery));
      }
      // Test hands: study #3 pool schema (winning/losing pools, >=5 each so the
      // 1-5 split always has enough) OR study #2 legacy fixed schema (test_hands
      // = 6 with exactly 3 winning).
      if (rule.test_hand_pool && typeof rule.test_hand_pool === "object") {
        var thp = rule.test_hand_pool;
        if (!Array.isArray(thp.winning) || thp.winning.length < 5 ||
            !Array.isArray(thp.losing) || thp.losing.length < 5) {
          return FAIL("rules[" + ri + "].test_hand_pool must have winning and losing arrays of >=5; got " +
            (Array.isArray(thp.winning) ? thp.winning.length : typeof thp.winning) + "W/" +
            (Array.isArray(thp.losing) ? thp.losing.length : typeof thp.losing) + "L");
        }
      } else if (Array.isArray(rule.test_hands)) {
        if (rule.test_hands.length !== 6) {
          return FAIL("rules[" + ri + "].test_hands must be an array of exactly 6 entries; got " + rule.test_hands.length);
        }
        var trueCount = 0;
        for (var ti = 0; ti < rule.test_hands.length; ti++) {
          if (rule.test_hands[ti] && rule.test_hands[ti].ground_truth === true) {
            trueCount++;
          }
        }
        if (trueCount !== 3) {
          return FAIL("rules[" + ri + "].test_hands must have exactly 3 entries with ground_truth true; got " + trueCount);
        }
      } else {
        return FAIL("rules[" + ri + "] must have test_hand_pool {winning[6],losing[6]} or test_hands[6]");
      }
    }

    var ga = snapshot.group_assignment;
    if (typeof ga !== "object" || ga === null ||
        !Array.isArray(ga.X) || !Array.isArray(ga.Y)) {
      return FAIL("group_assignment must have X and Y array fields");
    }

    if (!Array.isArray(snapshot.end_requery_rules) || snapshot.end_requery_rules.length !== 2) {
      return FAIL("end_requery_rules must be an array of exactly 2 rule_ids; got " +
        (Array.isArray(snapshot.end_requery_rules) ?
          snapshot.end_requery_rules.length : typeof snapshot.end_requery_rules));
    }

    return { ok: true };
  }

  // ── load() — main entry point ──
  // Returns a Promise<snapshot>. On failure, the fail screen is rendered
  // and the Promise rejects. Callers should `.catch(() => {})` to halt
  // their flow without re-rendering on top of the fail screen.
  //
  // Fetch routing strategy (explicit by study mode):
  //   - SEConfig.isStudy2() true  → fetch ONLY the v3 URL and validate v3.
  //   - SEConfig.isStudy2() false → fetch ONLY the v2 URL and validate v2.
  //
  // No cross-probing, no fallback between schemas. A misconfigured URL
  // (v3 session without ?study2=1, or vice versa) fails closed cleanly.
  // The ?study2=1 URL param sets SEConfig.studyMode before load() runs,
  // so the route is known up front.
  function load() {
    var snapshotId = SEConfig.seSnapshot;
    if (!snapshotId) {
      showFailScreen(
        "SNAPSHOT_MISSING",
        "This study requires a snapshot ID but none was provided in the URL."
      );
      return Promise.reject(new Error("SNAPSHOT_MISSING"));
    }

    var isStudy2 = SEConfig.isStudy2();

    if (isStudy2) {
      // ── v3 path ──
      var urlV3 = _snapshotUrlV3(snapshotId);
      console.log("SESnapshotLoader: study2 mode — fetching v3 URL", urlV3);

      return fetch(urlV3)
        .then(function (res) {
          if (!res.ok) {
            showFailScreen(
              "SNAPSHOT_404",
              "The study snapshot file could not be found."
            );
            throw new Error("SNAPSHOT_404 (HTTP " + res.status + ")");
          }
          return res.text().then(function (text) {
            try {
              return JSON.parse(text);
            } catch (e) {
              showFailScreen(
                "SNAPSHOT_PARSE",
                "The study snapshot data could not be read (parse error)."
              );
              throw new Error("SNAPSHOT_PARSE: " + e.message);
            }
          });
        })
        .then(function (snapshot) {
          var v3 = _validateV3(snapshot);
          if (!v3.ok) {
            showFailScreen(v3.code, v3.message);
            console.error("SESnapshotLoader: v3 validation failed —", v3.code, v3.message);
            throw new Error(v3.code + ": " + v3.message);
          }
          // Mutate SEConfig to signal study #2 mode to downstream modules
          SEConfig.studyMode = true;
          SEConfig.nTrials = 6;
          console.log(
            "SESnapshotLoader: loaded schema_v3 snapshot", snapshot.snapshot_id,
            "with", snapshot.rules.length, "rules (studyMode=true, nTrials=6)"
          );
          return snapshot;
        })
        .catch(function (err) {
          var msg = err && err.message ? err.message : "";
          var hasOurCode = (
            msg.indexOf("SNAPSHOT_") === 0 ||
            msg.indexOf("STRATEGY_") === 0
          );
          if (!hasOurCode) {
            showFailScreen(
              "SNAPSHOT_NETWORK",
              "Could not reach the snapshot file. Please check your connection."
            );
          }
          throw err;
        });
    }

    // ── v2 path ──
    var urlV2 = _snapshotUrl(snapshotId);
    console.log("SESnapshotLoader: v2 mode — fetching v2 URL", urlV2);

    return fetch(urlV2)
      .then(function (res) {
        if (!res.ok) {
          showFailScreen(
            "SNAPSHOT_404",
            "The study snapshot file could not be found."
          );
          throw new Error("SNAPSHOT_404 (HTTP " + res.status + ")");
        }
        return res.text().then(function (text) {
          try {
            return JSON.parse(text);
          } catch (e) {
            showFailScreen(
              "SNAPSHOT_PARSE",
              "The study snapshot data could not be read (parse error)."
            );
            throw new Error("SNAPSHOT_PARSE: " + e.message);
          }
        });
      })
      .then(function (snapshot) {
        var strategy = SEConfig.adversarialStrategy;
        var validation = _validate(snapshot, strategy, null);
        if (!validation.ok) {
          showFailScreen(validation.code, validation.reason);
          console.error("SESnapshotLoader: validation failed —", validation.code, validation.reason);
          throw new Error(validation.code + ": " + validation.reason);
        }
        console.log(
          "SESnapshotLoader: loaded", snapshot.snapshot_id,
          "schema_v" + snapshot.schema_version,
          "with", snapshot.selected_rules.length, "rules,",
          "strategy", strategy
        );
        return snapshot;
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : "";
        var hasOurCode = (
          msg.indexOf("SNAPSHOT_") === 0 ||
          msg.indexOf("STRATEGY_") === 0
        );
        if (!hasOurCode) {
          showFailScreen(
            "SNAPSHOT_NETWORK",
            "Could not reach the snapshot file. Please check your connection."
          );
        }
        throw err;
      });
  }

  return {
    load: load,
    showFailScreen: showFailScreen,            // exported for curriculum.js + tests
    _validate: _validate,
    _validateV3: _validateV3,
    _validateRulePool: _validateRulePool,
    _resolveLeafKey: _resolveLeafKey,
    _snapshotUrl: _snapshotUrl,
    _snapshotUrlV3: _snapshotUrlV3,
    MIN_PER_LABEL: MIN_PER_LABEL,
  };
})();
