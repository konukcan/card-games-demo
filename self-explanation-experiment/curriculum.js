// self-explanation-experiment/curriculum.js
// v2 mature design: snapshot-driven curriculum.
//
// Loads an immutable SE snapshot via SESnapshotLoader (fail-closed),
// resolves the participant's group X/Y assignment, filters the snapshot's
// 10 selected_rules to the 5 in that group, randomizes per-participant
// order, and builds RuleData (with `fixedTrialPool` instead of winStack/
// loseStack) for each rule.
//
// Depends on:
//   window.SEConfig          — adversarialStrategy, strategyVariant, group
//   window.SESnapshotLoader  — fetch + validate the snapshot
//   window.GalleryRules      — rule object lookup by id (.eval, .name, .answer)
//
// Legacy helpers (tierDistribution, selectRules, fetchFrozenExemplars,
// buildStacksFromDiagnosticity, etc.) are retained below the v2 build()
// because the catalog browser and other tooling still call them. D2 will
// audit and remove dead paths once the v2 flow is stable.
//
// Exported as window.SECurriculum.

window.SECurriculum = (function () {
  "use strict";

  // ════════════════════════════════════════════════════
  // Utility helpers
  // ════════════════════════════════════════════════════

  // shuffle(arr) — Fisher-Yates in-place shuffle, returns the array.
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  // pickRandom(arr, n) — Pick n random elements from arr without replacement.
  // Returns a new array of length min(n, arr.length).
  function pickRandom(arr, n) {
    var copy = arr.slice();
    shuffle(copy);
    return copy.slice(0, n);
  }

  // ════════════════════════════════════════════════════
  // Tier distribution
  // ════════════════════════════════════════════════════

  // tierDistribution(nRules) — Determines how many rules come from each
  // difficulty tier [tier1, tier2, tier3].
  //
  // Strategy: at least 1 easy rule (tier 1), distribute the rest across
  // tiers 2 and 3 with a bias toward harder rules.
  //   4 rules → [1, 1, 2]
  //   5 rules → [1, 2, 2]
  //   6 rules → [2, 2, 2]
  //   3 rules → [1, 1, 1]
  //   Generic: 1 from tier 1, split remainder between tiers 2 and 3.
  function tierDistribution(nRules) {
    if (nRules <= 0) return [0, 0, 0];
    if (nRules === 1) return [1, 0, 0];
    if (nRules === 2) return [1, 0, 1];
    if (nRules === 3) return [1, 1, 1];

    // For 4+: 1 from tier 1, split the rest between tiers 2 and 3.
    // Give the extra to tier 3 when the remainder is odd.
    var remaining = nRules - 1;
    var t2 = Math.floor(remaining / 2);
    var t3 = remaining - t2;
    return [1, t2, t3];
  }

  // ════════════════════════════════════════════════════
  // Rejection-sampling fallback for hand generation
  // ════════════════════════════════════════════════════

  // rejectionSample(evalFn, wantWin, count, maxAttempts) — Generate hands
  // that either satisfy (wantWin=true) or violate (wantWin=false) the rule.
  // Returns an array of { hand, difficultyScore } objects.
  //
  // Uses CardEx.sampleHand(6) to draw random 6-card hands, then tests them
  // with evalFn. The difficultyScore is a simple index-based proxy:
  // earlier-found hands get lower scores (assumed "easier" since they're
  // more common in random sampling).
  function rejectionSample(evalFn, wantWin, count, maxAttempts) {
    var results = [];
    var attempts = 0;

    while (results.length < count && attempts < maxAttempts) {
      attempts++;
      var hand = CardEx.sampleHand(6);
      var passes = evalFn(hand);

      if ((wantWin && passes) || (!wantWin && !passes)) {
        results.push({
          hand: hand,
          // Lower index = found earlier in sampling = higher base rate = "easier"
          difficultyScore: results.length / count
        });
      }
    }

    if (results.length < count) {
      console.warn(
        "SECurriculum: rejection sampling only found " + results.length +
        "/" + count + " hands after " + maxAttempts + " attempts" +
        " (wantWin=" + wantWin + ")"
      );
    }

    return results;
  }

  // ════════════════════════════════════════════════════
  // Stack builders
  // ════════════════════════════════════════════════════

  // buildStacksFromDiagnosticity(diagData, nTrials) — Build win and lose
  // stacks from pre-scored diagnosticity test_hands.
  //
  // Each test_hand has { hand, ground_truth, p_accept, confidence }.
  // - Separate into winning (ground_truth=true) and losing (ground_truth=false).
  // - Sort by confidence descending: highest confidence = easiest to classify,
  //   so the stack goes easy-to-hard.
  // - Take the first nTrials items from each stack.
  function buildStacksFromDiagnosticity(diagData, nTrials) {
    var testHands = diagData.test_hands || [];

    var winHands = [];
    var loseHands = [];

    for (var i = 0; i < testHands.length; i++) {
      var th = testHands[i];
      var item = {
        hand: th.hand,
        difficultyScore: 1 - th.confidence // higher confidence = lower difficulty
      };
      if (th.ground_truth) {
        winHands.push(item);
      } else {
        loseHands.push(item);
      }
    }

    // Sort by confidence descending (easiest first) — that means sort by
    // difficultyScore ascending (lowest difficulty first).
    function byDifficulty(a, b) { return a.difficultyScore - b.difficultyScore; }
    winHands.sort(byDifficulty);
    loseHands.sort(byDifficulty);

    return {
      winStack: winHands.slice(0, nTrials),
      loseStack: loseHands.slice(0, nTrials)
    };
  }

  // buildStacksByRejection(evalFn, nTrials) — Fallback stack builder using
  // rejection sampling when diagnosticity data is unavailable.
  function buildStacksByRejection(evalFn, nTrials) {
    var MAX_ATTEMPTS = 50000;
    return {
      winStack: rejectionSample(evalFn, true, nTrials, MAX_ATTEMPTS),
      loseStack: rejectionSample(evalFn, false, nTrials, MAX_ATTEMPTS)
    };
  }

  // ════════════════════════════════════════════════════
  // Data fetchers
  // ════════════════════════════════════════════════════

  // fetchFrozenExemplars() — Fetch and parse frozen-exemplars.json.
  // Returns a Map from rule ID to the frozen catalogue entry.
  function fetchFrozenExemplars() {
    return fetch("rule-gallery/frozen-exemplars.json")
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to fetch frozen-exemplars.json: " + res.status);
        return res.json();
      })
      .then(function (data) {
        // Build a lookup map: ruleId → catalogue entry
        var map = {};
        var catalogue = data.catalogue || [];
        for (var i = 0; i < catalogue.length; i++) {
          map[catalogue[i].id] = catalogue[i];
        }
        console.log("SECurriculum: loaded " + catalogue.length + " frozen exemplar sets");
        return map;
      });
  }

  // fetchDiagnosticity() — Fetch and parse diagnosticity_results.json.
  // Returns the rules object (ruleId → { difficulty, test_hands }) or null
  // if the fetch fails (this data is optional).
  function fetchDiagnosticity() {
    return fetch("rule-gallery/diagnosticity_results.json")
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to fetch diagnosticity_results.json: " + res.status);
        return res.json();
      })
      .then(function (data) {
        console.log("SECurriculum: loaded diagnosticity data");
        return data.rules || {};
      })
      .catch(function (err) {
        // Diagnosticity data is optional — log and continue without it.
        console.warn("SECurriculum: diagnosticity data unavailable, using fallback.", err);
        return null;
      });
  }

  // ════════════════════════════════════════════════════
  // Rule selection
  // ════════════════════════════════════════════════════

  // hasSufficientStacks(ruleId, diagMap, nTrials) — Returns true if this rule
  // can support `nTrials` classification trials given the available data.
  //
  // Three cases:
  //   1. Rule has no entry in diagMap (or diagMap is null): we'll fall back
  //      to rejection sampling, which generates fresh hands → eligible.
  //   2. Rule has a diagMap entry: it must contain at least nTrials winning
  //      AND at least nTrials losing test_hands. Otherwise the dual-stack
  //      selector hits maxPosition early and throws (see hand-selector.js).
  //   3. Rule has an entry but with insufficient hands → ineligible. Better
  //      to skip the rule than to crash mid-trial.
  function hasSufficientStacks(ruleId, diagMap, nTrials) {
    if (!diagMap || !diagMap[ruleId]) return true;
    var th = diagMap[ruleId].test_hands || [];
    var wins = 0, loses = 0;
    for (var i = 0; i < th.length; i++) {
      if (th[i].ground_truth) wins++;
      else loses++;
    }
    return wins >= nTrials && loses >= nTrials;
  }

  // selectRules(frozenMap, diagMap, nRules, nTrials) — Select rules from
  // GalleryRules, filtered to those present in the frozen exemplars map AND
  // backed by enough diagnosticity data (or no diagnosticity entry, in which
  // case rejection sampling fills in).
  //
  // Returns an array of GalleryRules rule objects, sorted by tier
  // (easy-to-hard) for the fixed curriculum progression.
  function selectRules(frozenMap, diagMap, nRules, nTrials) {
    // GalleryRules.groups is [group1[], group2[], group3[]] where each group
    // is an array of rule objects with .id, .group, .eval, etc.
    var groups = GalleryRules.groups;

    // Filter each tier: must have frozen exemplars AND enough diagnosticity
    // hands (when diagnosticity data covers the rule).
    function eligible(r) {
      return frozenMap[r.id] && hasSufficientStacks(r.id, diagMap, nTrials);
    }
    var tier1 = groups[0].filter(eligible);
    var tier2 = groups[1].filter(eligible);
    var tier3 = groups[2].filter(eligible);

    var dist = tierDistribution(nRules);
    console.log(
      "SECurriculum: tier distribution [" + dist.join(", ") +
      "] from available [" + tier1.length + ", " + tier2.length + ", " + tier3.length + "]"
    );

    // Randomly pick the required number from each tier
    var selected = []
      .concat(pickRandom(tier1, dist[0]))
      .concat(pickRandom(tier2, dist[1]))
      .concat(pickRandom(tier3, dist[2]));

    // Sort by tier (group) so the session progresses easy → hard
    selected.sort(function (a, b) { return a.group - b.group; });

    return selected;
  }

  // selectPracticeRule was removed in v2 (D2): tutorial.run() ignores its
  // argument and the v2 snapshot doesn't carry a separate practice-rule
  // entry. If a future variant wants a practice round, it should use a
  // hard-coded tutorial rule (e.g., all_red) rather than re-introducing
  // the diagnosticity-based selection.

  // ════════════════════════════════════════════════════
  // RuleData builder
  // ════════════════════════════════════════════════════

  // buildRuleData(rule, frozenMap, diagMap) — Assemble the full RuleData
  // object for a single rule, including exemplar hands and classification
  // stacks.
  //
  // RuleData structure:
  //   ruleId: string
  //   rule: GalleryRules rule object (has .eval, .id, .group, .name, .answer)
  //   difficulty: 1|2|3 (from rule.group)
  //   exemplarHands: Card[][] (sliced to SEConfig.nExemplars from hands_primary)
  //   winStack: [{ hand, difficultyScore }] ordered easy→hard
  //   loseStack: [{ hand, difficultyScore }] ordered easy→hard
  function buildRuleData(rule, frozenMap, diagMap) {
    var frozen = frozenMap[rule.id];

    // Exemplar hands: take the first nExemplars from frozen hands_primary
    var exemplarHands = (frozen.hands_primary || []).slice(0, SEConfig.nExemplars);

    // Build classification stacks (win and lose)
    var stacks;
    if (diagMap && diagMap[rule.id] && diagMap[rule.id].test_hands &&
        diagMap[rule.id].test_hands.length > 0) {
      // Primary path: use pre-scored diagnosticity hands
      stacks = buildStacksFromDiagnosticity(diagMap[rule.id], SEConfig.nTrials);
    } else {
      // Fallback: generate hands via rejection sampling
      console.warn(
        "SECurriculum: no diagnosticity data for '" + rule.id +
        "', falling back to rejection sampling."
      );
      stacks = buildStacksByRejection(rule.eval, SEConfig.nTrials);
    }

    return {
      ruleId: rule.id,
      rule: rule,
      difficulty: rule.group,
      exemplarHands: exemplarHands,
      winStack: stacks.winStack,
      loseStack: stacks.loseStack
    };
  }

  // ════════════════════════════════════════════════════
  // Public API
  // ════════════════════════════════════════════════════

  // ════════════════════════════════════════════════════
  // v2 mature design: snapshot-driven build
  // ════════════════════════════════════════════════════

  // resolveGroupAssignment(snapshotId) — Resolve the participant's group
  // X/Y assignment.
  //
  // Priority:
  //   1. SEConfig.group (URL-param override, dev only)
  //   2. sessionStorage (per (PROLIFIC_PID, snapshot_id)) — survives reloads
  //      but isolated to this browser session
  //   3. Fresh fair coin flip → persisted to sessionStorage
  //
  // Per design §9.5 — keyed by Prolific PID + snapshot id so a participant
  // who reopens the same study URL doesn't accidentally land in the other
  // group, but a different study (different snapshot) gets a fresh roll.
  // _hashKey(s) — djb2 → hex. Keeps the storage key deterministic for
  // returning participants without exposing the raw PROLIFIC_PID in client
  // storage (R3/5.3). djb2 is non-cryptographic; the goal is obfuscation
  // of PII at-rest in client storage, not authentication. Two distinct
  // PIDs colliding to the same key would only mean those participants
  // share a group-assignment slot — same risk as the snapshot's bucket.
  function _hashKey(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) + h) + s.charCodeAt(i);
      h = h & 0xFFFFFFFF;
    }
    return (h >>> 0).toString(16);
  }

  // _groupStore(pid) — pick the right Storage backend for the PID type.
  //
  // R4/4.1: real Prolific PIDs need localStorage so a tab-close-and-reopen
  // doesn't re-roll group X/Y (which would produce two saved sessions
  // under one PID with mismatched groupAssignment fields). For dev/test
  // ("anon"), keep sessionStorage so each fresh tab gets a fresh roll.
  function _groupStore(pid) {
    return pid === "anon" ? sessionStorage : localStorage;
  }

  function resolveGroupAssignment(snapshotId) {
    if (SEConfig.group === "X" || SEConfig.group === "Y") {
      console.log("SECurriculum: group override —", SEConfig.group);
      return SEConfig.group;
    }
    var pid = SEConfig.PROLIFIC_PID || "anon";
    // R3/5.3: hash the PID before storing it in client storage.
    var key = "se_group_" + _hashKey(pid) + "_" + snapshotId;
    var store = _groupStore(pid);
    var existing = store.getItem(key);
    if (existing === "X" || existing === "Y") {
      console.log(
        "SECurriculum: group from " +
        (store === localStorage ? "localStorage" : "sessionStorage") +
        " —", existing
      );
      return existing;
    }
    var fresh = Math.random() < 0.5 ? "X" : "Y";
    store.setItem(key, fresh);
    console.log("SECurriculum: fresh group roll —", fresh);
    return fresh;
  }

  // resolvePoolKey(strategy) — v2: all strategies are flat
  // (snapshot.trial_pools[rule_id][strategy] = { winning, losing }).
  // Throws on unknown strategy. Returns null because there's no leaf-key
  // sub-path in v2 (kept null for callers that still pass the result to
  // flattenPool's poolKey arg, which now ignores it).
  function resolvePoolKey(strategy) {
    var resolved = SESnapshotLoader._resolveLeafKey(strategy);
    if (resolved.kind === "unsupported") {
      throw new Error("STRATEGY_UNKNOWN: " + resolved.reason);
    }
    return null;
  }

  // flattenPool(pool, _poolKeyUnused, ruleId) — Convert a strategy's leaf
  // into a flat array of trial items the hand-selector will shuffle. v2:
  // the leaf is always {winning, losing} (paired/independent collapsed in
  // B3). _poolKeyUnused arg retained so existing callers don't break.
  //
  // Throws SNAPSHOT_POOL_EMPTY:<ruleId> if the leaf is missing or empty.
  function flattenPool(pool, _poolKeyUnused, ruleId) {
    if (!pool) {
      throw new Error("SNAPSHOT_POOL_EMPTY:" + ruleId + " (no pool object)");
    }
    if (typeof pool !== "object" ||
        !Array.isArray(pool.winning) || !Array.isArray(pool.losing)) {
      throw new Error("SNAPSHOT_POOL_EMPTY:" + ruleId +
        " (pool is not {winning[], losing[]})");
    }
    var items = [];
    for (var j = 0; j < pool.winning.length; j++) {
      items.push(Object.assign({}, pool.winning[j], {
        ground_truth: true, hand_role: "winning",
      }));
    }
    for (var k = 0; k < pool.losing.length; k++) {
      items.push(Object.assign({}, pool.losing[k], {
        ground_truth: false, hand_role: "losing",
      }));
    }
    if (items.length === 0) {
      throw new Error("SNAPSHOT_POOL_EMPTY:" + ruleId + " (yielded 0 items)");
    }
    return items;
  }

  // computeTrialPoolId(snapshotId, ruleId, strategy, variant) — Stable hash
  // for joining trial records to pool definitions across participants. Uses
  // a simple djb2 hash; collisions are not a concern for the small space
  // (10 rules × 4 strategies × ~4 variants × N snapshots).
  function computeTrialPoolId(snapshotId, ruleId, strategy, variant) {
    var s = snapshotId + "|" + ruleId + "|" + strategy + "|" + (variant || "default");
    var h = 5381;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) + h) + s.charCodeAt(i);
      h = h & 0xFFFFFFFF;
    }
    return "tp_" + (h >>> 0).toString(16);
  }

  // buildRuleDataFromSnapshot(rule, snapshot) — Assemble RuleData for one
  // rule from the snapshot.
  //
  // v2 changes (Issue 3 + 4):
  //   - strategyVariant retired; computeTrialPoolId still receives "" so
  //     hash continuity is preserved across schema versions.
  //   - difficulty now reads from ruleEntry.difficulty (D1/D2/D3 int from
  //     v2 selected_rules), not the legacy quadrant label.
  function buildRuleDataFromSnapshot(ruleEntry, snapshot) {
    var ruleId = ruleEntry.rule_id;
    var strategy = SEConfig.adversarialStrategy;
    var pool = snapshot.trial_pools[ruleId][strategy];
    resolvePoolKey(strategy);                  // throws on unknown
    var fixedPool = flattenPool(pool, null, ruleId);

    // GalleryRules provides .eval (tutorial / catalog) + .name / .answer
    // (recap). Optional — a rule_id not in GalleryRules still runs if
    // the snapshot is valid.
    var galleryRule = null;
    if (window.GalleryRules && Array.isArray(GalleryRules.all)) {
      for (var gi = 0; gi < GalleryRules.all.length; gi++) {
        if (GalleryRules.all[gi].id === ruleId) {
          galleryRule = GalleryRules.all[gi];
          break;
        }
      }
    }

    return {
      ruleId: ruleId,
      rule: galleryRule,
      difficulty: ruleEntry.difficulty,        // v2: D1/D2/D3 int
      exemplarHands: snapshot.exemplars[ruleId] || [],
      fixedTrialPool: fixedPool,
      adversarialStrategy: strategy,
      strategyVariant: "",                     // Issue 3 — preserve hash continuity
      strategyMethod: null,                    // legacy field, retained at null
      trialPoolId: computeTrialPoolId(
        snapshot.snapshot_id, ruleId, strategy, ""
      ),
      fallbackUsed: null,
      groupAssignment: ruleEntry.group,
      // v1 fields retained as null for backward-compat with logging code
      winStack: null,
      loseStack: null,
    };
  }

  // build() — v2 entry point. Loads the snapshot, resolves group, picks
  // rules for that group, builds RuleData for each. Returns:
  //   {
  //     rules: RuleData[],            // v2 with fixedTrialPool
  //     practiceRule: null,           // v1 path; D2 resolves
  //     seSnapshotId, analysisSnapshotId, groupAssignment,
  //     adversarialStrategy, strategyVariant
  //   }
  function build() {
    return SESnapshotLoader.load().then(function (snapshot) {
      var groupAssignment = resolveGroupAssignment(snapshot.snapshot_id);
      var rulesForGroup = snapshot.selected_rules.filter(function (r) {
        return r.group === groupAssignment;
      });

      if (rulesForGroup.length === 0) {
        var available = Array.from(new Set(
          snapshot.selected_rules.map(function (r) { return r.group; })
        ));
        console.error(
          "SECurriculum: SNAPSHOT_GROUP_EMPTY — group", groupAssignment,
          "available groups:", available
        );
        // Use the loader's dedicated fail screen so all SNAPSHOT_*
        // surfaces share the same DOM shape (.se-fail-screen) and the
        // same XSS-safe rendering path.
        SESnapshotLoader.showFailScreen(
          "SNAPSHOT_GROUP_EMPTY",
          "This snapshot has no rules for the assigned participant group."
        );
        throw new Error("SNAPSHOT_GROUP_EMPTY");
      }

      shuffle(rulesForGroup); // per-participant order randomization

      // Respect ?nRules slicing for dev/test convenience. In production the
      // snapshot's group size IS the curriculum length (typically 5); the
      // URL param only kicks in if it's smaller, in which case we trim the
      // already-shuffled array. Logged so the resulting CSV's `nRules`
      // metadata reflects what actually ran.
      if (typeof SEConfig.nRules === "number" && SEConfig.nRules > 0 &&
          SEConfig.nRules < rulesForGroup.length) {
        console.log(
          "SECurriculum: trimming to ?nRules=" + SEConfig.nRules +
          " (snapshot group size was " + rulesForGroup.length + ")"
        );
        rulesForGroup = rulesForGroup.slice(0, SEConfig.nRules);
      }

      // buildRuleDataFromSnapshot may throw SNAPSHOT_POOL_EMPTY:<rule_id>
      // or STRATEGY_UNKNOWN. Surface those via the loader's dedicated fail
      // screen so the participant sees a consistent SNAPSHOT_* code instead
      // of the generic "Something went wrong" from app.js's outer catch.
      var rules;
      try {
        rules = rulesForGroup.map(function (r) {
          return buildRuleDataFromSnapshot(r, snapshot);
        });
      } catch (err) {
        var emsg = err && err.message ? err.message : String(err);
        console.error("SECurriculum: rule build failed —", emsg);
        // Render a fail screen if the loader's contract is broken late
        var code = emsg.split(":")[0] || "SNAPSHOT_POOL_INVALID";
        SESnapshotLoader.showFailScreen(code, emsg);
        throw err;
      }

      console.log(
        "SECurriculum: v2 build complete — group " + groupAssignment + ", " +
        rules.length + " rules: " +
        rules.map(function (rd) { return rd.ruleId; }).join(", ")
      );

      return {
        rules: rules,
        practiceRule: null,                       // tutorial.run() ignores it
        seSnapshotId: snapshot.snapshot_id,
        analysisSnapshotId: snapshot.analysis_snapshot_id || null,
        groupAssignment: groupAssignment,
        adversarialStrategy: SEConfig.adversarialStrategy,
        strategyVariant: "",                      // v2: variant retired (Issue 3)
      };
    });
  }

  // ── Export public API ──
  return {
    build: build,
    // exported for unit testing / D2 cleanup audits
    _resolveGroupAssignment: resolveGroupAssignment,
    _resolvePoolKey: resolvePoolKey,
    _flattenPool: flattenPool,
    _computeTrialPoolId: computeTrialPoolId,
  };

})();
