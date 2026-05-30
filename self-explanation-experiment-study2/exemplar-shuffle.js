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

  window.ExemplarShuffle = {
    permutationFor: permutationFor,
    ruleOrderFor: ruleOrderFor,
    _mulberry32: mulberry32,
  };
})();
