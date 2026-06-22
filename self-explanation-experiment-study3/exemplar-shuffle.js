// self-explanation-experiment/exemplar-shuffle.js
// exemplar-shuffle.js — Deterministic per-participant seeded shuffles
// for SE Study #2:
//   * permutationFor(pid, ruleId) — the 6-exemplar gallery permutation
//   * ruleOrderFor(pid, ruleIds)  — the 10-rule presentation order
//
// Both use SHA-256 + mulberry32 + Fisher-Yates with different seed strings,
// so the rule-order shuffle is independent of any per-rule exemplar shuffle.
//
// Pipeline:
//   1. seed = SHA-256(<seed string>)         (32 bytes)
//   2. state = first 4 bytes of seed as uint32
//   3. mulberry32 PRNG seeded with state     (small, fast, well-distributed)
//   4. Fisher-Yates shuffle on the input array using mulberry32 outputs
//
// Why this construction: simple, deterministic, no third-party deps.

(function () {
  "use strict";

  // Mulberry32: a tiny, fast PRNG with good statistical properties for
  // small sample shuffles. Returns a function that yields a float in [0,1).
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  async function _seedFromDigest(input) {
    var buf = new TextEncoder().encode(input);
    var hash = await crypto.subtle.digest("SHA-256", buf);
    var view = new DataView(hash);
    return view.getUint32(0, false);  // big-endian first 4 bytes
  }

  // Fisher-Yates: in-place-on-copy shuffle using a provided RNG function.
  function fisherYates(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  async function permutationFor(prolificPid, ruleId) {
    var seed = await _seedFromDigest(prolificPid + ":" + ruleId);
    var rng = mulberry32(seed);
    return fisherYates([0, 1, 2, 3, 4, 5], rng);
  }

  // ruleOrderFor: shuffle the rule_ids array into a uniformly random
  // presentation order, seeded by `pid + ":rules"`. The ":rules" suffix
  // is deliberately unlike any valid rule_id, so this seed never collides
  // with permutationFor's `pid + ":" + ruleId` seeds.
  //
  // Invariant: rule_ids in this codebase are snake_case slugs (e.g.,
  // "colors_palindrome", "all_odd"); none equals the literal string
  // "rules". If a future rule were ever named "rules", its exemplar-shuffle
  // seed would collide with this rule-order seed for any participant,
  // producing identical RNG state. The snapshot rule_id list is small and
  // human-curated, so this is enforced by review rather than by code.
  async function ruleOrderFor(prolificPid, ruleIds) {
    var seed = await _seedFromDigest(prolificPid + ":rules");
    var rng = mulberry32(seed);
    return fisherYates(ruleIds, rng);
  }

  // ── Study #3: per-rule winning/losing split ──
  // Truncated-binomial weights ∝ C(6,k) over k in [lo,hi]. C(6,·)=[1,6,15,20,15,6,1].
  function _binomWeights(lo, hi) {
    var C = [1, 6, 15, 20, 15, 6, 1];
    var w = [], total = 0;
    for (var k = lo; k <= hi; k++) { w.push(C[k]); total += C[k]; }
    return { w: w, total: total, lo: lo };
  }
  function _sampleK(rng, bw) {
    var r = rng() * bw.total, acc = 0;
    for (var i = 0; i < bw.w.length; i++) { acc += bw.w[i]; if (r < acc) return bw.lo + i; }
    return bw.lo + bw.w.length - 1;
  }

  // trialCountsFor(pid, ruleIds, lo, hi) — per-rule WINNING counts, aligned to
  // ruleIds, each in [lo,hi], summing to exactly target = round(N*(lo+hi)/2)
  // (= 30 for 10 rules; losing counts = 6-k therefore also sum to 30). Seeded
  // by pid+":trialcounts". Rejection-sample i.i.d. truncated-binomials until
  // the sum hits target; cap at 5000 tries, then a seeded sum-preserving
  // random walk from [3]*N (3 is in-range for both 1-5 and 2-4).
  async function trialCountsFor(prolificPid, ruleIds, lo, hi) {
    var seed = await _seedFromDigest(prolificPid + ":trialcounts");
    var rng = mulberry32(seed);
    var N = ruleIds.length;
    var bw = _binomWeights(lo, hi);
    var target = Math.round(N * (lo + hi) / 2);
    var counts = null;
    for (var attempt = 0; attempt < 5000 && counts === null; attempt++) {
      var v = [], s = 0;
      for (var i = 0; i < N; i++) { var k = _sampleK(rng, bw); v.push(k); s += k; }
      if (s === target) counts = v;
    }
    if (counts === null) {
      counts = [];
      for (var n = 0; n < N; n++) counts.push(3);   // sum = 3N = target
      for (var step = 0; step < 2000; step++) {
        var a = Math.floor(rng() * N), b = Math.floor(rng() * N);
        if (a !== b && counts[a] < hi && counts[b] > lo) { counts[a]++; counts[b]--; }
      }
    }
    return counts;
  }

  // trialSampleFor(pid, ruleId, winningPool, losingPool, k) — sample k winning
  // + (6-k) losing items (without replacement) from the rule's 6+6 pool and
  // shuffle the 6 into presentation order. Seeded by pid+":trialdraw:"+ruleId.
  // Returns the chosen pool items unchanged (caller maps to RuleData shape).
  async function trialSampleFor(prolificPid, ruleId, winningPool, losingPool, k) {
    var seed = await _seedFromDigest(prolificPid + ":trialdraw:" + ruleId);
    var rng = mulberry32(seed);
    function idxs(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
    var wPick = fisherYates(idxs(winningPool.length), rng).slice(0, k);
    var lPick = fisherYates(idxs(losingPool.length), rng).slice(0, 6 - k);
    var items = [];
    for (var i = 0; i < wPick.length; i++) items.push(winningPool[wPick[i]]);
    for (var j = 0; j < lPick.length; j++) items.push(losingPool[lPick[j]]);
    return fisherYates(items, rng);
  }

  window.ExemplarShuffle = {
    permutationFor: permutationFor,
    ruleOrderFor: ruleOrderFor,
    trialCountsFor: trialCountsFor,
    trialSampleFor: trialSampleFor,
    _mulberry32: mulberry32,
  };
})();
