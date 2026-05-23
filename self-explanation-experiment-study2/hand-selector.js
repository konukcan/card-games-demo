// self-explanation-experiment-study2/hand-selector.js
// Dual-stack coin-flip hand selector for the self-explanation experiment.
//
// Manages two pre-ordered stacks (winning and losing hands), shares a single
// position counter between them, and on each call flips a fair coin to decide
// which stack to draw from.
//
// Design rationale:
//   1. Two stacks of N hands each, ordered by increasing diagnosticity difficulty.
//   2. A shared position counter — both stacks advance together.
//   3. A fair coin flip decides which stack to draw from on each trial.
//   4. This ensures: monotonic difficulty regardless of category sequence;
//      category of each hand is statistically independent; expected 50/50
//      balance but actual proportion varies randomly.
//
// No dependencies on other experiment modules.
// Exported as window.SEHandSelector.

window.SEHandSelector = (function () {
  "use strict";

  // ────────────────────────────────────────────────────
  // create(winningStack, losingStack) — Factory function.
  //
  // Each stack is an array of objects with the shape:
  //   { hand: Card[6], difficultyScore: number }
  //
  // Both stacks should be pre-sorted by increasing difficulty (lowest
  // difficulty first). The selector does NOT re-sort them — it trusts
  // the caller to provide them in the correct order.
  //
  // Returns a selector instance (closure-based, not class-based) with
  // the methods: next(), remaining(), getSelections().
  // ────────────────────────────────────────────────────
  function create(winningStack, losingStack) {
    // ── Validate inputs ──

    if (!Array.isArray(winningStack) || !Array.isArray(losingStack)) {
      throw new Error(
        "SEHandSelector.create: both winningStack and losingStack must be arrays."
      );
    }

    if (winningStack.length === 0 || losingStack.length === 0) {
      throw new Error(
        "SEHandSelector.create: both stacks must contain at least one item."
      );
    }

    // ── Internal state ──

    // Shared position counter. Both stacks are indexed by this same value,
    // so difficulty advances in lockstep regardless of which category the
    // coin flip selects on any given trial.
    var position = 0;

    // Maximum number of draws is limited by the shorter stack. Once the
    // position reaches this limit, no more hands can be drawn from either
    // stack (because the shared counter would exceed the shorter one).
    var maxPosition = Math.min(winningStack.length, losingStack.length);

    // Log of every selection made, in chronological order.
    // Each entry mirrors the object returned by next().
    var selections = [];

    // ────────────────────────────────────────────────────
    // next() — Draw the next hand.
    //
    // Flips a fair coin (Math.random() < 0.5) to choose which stack to
    // draw from, then reads the item at the current shared position,
    // increments the position counter, and returns a selection object:
    //
    //   {
    //     hand:            Card[6],      // the card array from the stack item
    //     category:        'winning' | 'losing',
    //     stackPosition:   number,       // position counter at time of draw
    //     difficultyScore: number,       // from the stack item
    //     stackSource:     'winning' | 'losing'
    //   }
    //
    // Throws an error if no more hands are available.
    // ────────────────────────────────────────────────────
    function next() {
      if (position >= maxPosition) {
        throw new Error(
          "SEHandSelector: no more hands available. " +
          "Position " + position + " has reached the maximum (" + maxPosition + ")."
        );
      }

      // Fair coin flip: 50/50 chance of winning or losing.
      var isWinning = Math.random() < 0.5;
      var source = isWinning ? "winning" : "losing";
      var stack = isWinning ? winningStack : losingStack;

      // Read the item at the current shared position.
      var item = stack[position];

      // Build the selection object.
      var selection = {
        hand: item.hand,
        category: source,
        stackPosition: position,
        difficultyScore: item.difficultyScore,
        stackSource: source
      };

      // Record and advance.
      selections.push(selection);
      position++;

      return selection;
    }

    // ────────────────────────────────────────────────────
    // remaining() — How many hands can still be drawn.
    //
    // Returns maxPosition minus the current position. When this reaches 0,
    // calling next() will throw.
    // ────────────────────────────────────────────────────
    function remaining() {
      return maxPosition - position;
    }

    // ────────────────────────────────────────────────────
    // getSelections() — Return a shallow copy of all selections made so far.
    //
    // Useful for data logging at the end of a block. Returns a copy so
    // external code cannot accidentally mutate the internal log.
    // ────────────────────────────────────────────────────
    function getSelections() {
      return selections.slice();
    }

    // ── Return the selector instance ──
    return {
      next: next,
      remaining: remaining,
      getSelections: getSelections
    };
  }

  // ════════════════════════════════════════════════════
  // v2 — createFromPool(fixedTrialPool, ruleData)
  // ════════════════════════════════════════════════════
  //
  // Per design §5.2 — the trial pool is fixed across participants; what
  // varies is the per-participant order. The pool comes from the SE
  // snapshot pre-computed by build_se_snapshot.py (Task A4+).
  //
  // `fixedTrialPool` is a flat array of items (mixed winning + losing)
  // produced by curriculum.flattenPool(). Each item carries:
  //   { hand, ground_truth, hand_role: 'winning'|'losing',
  //     hand_id, score|null, method|null, pair_id|null }
  //
  // The selector's job: shuffle indices once, then yield items in that
  // order via next().
  //
  // The returned selection object is a superset of v1's shape — old fields
  // (stackPosition, stackSource, difficultyScore) are nulled because the
  // dual-stack semantics don't map onto a single fixed pool. New fields
  // (trialPoolOrder, strategyScore, strategyMethod, pairId) carry the
  // strategy-provenance metadata that game.js logs per trial.
  //
  function createFromPool(fixedTrialPool, ruleData) {
    if (!Array.isArray(fixedTrialPool)) {
      throw new Error(
        "SEHandSelector.createFromPool: fixedTrialPool must be an array."
      );
    }
    if (fixedTrialPool.length === 0) {
      throw new Error(
        "SEHandSelector.createFromPool: pool is empty (snapshot config error)."
      );
    }

    // Per-participant index shuffle — pool order is fixed across
    // participants, but each participant sees a different sequence.
    var indices = fixedTrialPool.map(function (_, i) { return i; });
    for (var s = indices.length - 1; s > 0; s--) {
      var j = Math.floor(Math.random() * (s + 1));
      var tmp = indices[s];
      indices[s] = indices[j];
      indices[j] = tmp;
    }

    var position = 0;
    var selections = [];

    function next() {
      if (position >= indices.length) {
        throw new Error(
          "SEHandSelector.fromPool: pool exhausted at position " + position +
          " (size=" + indices.length + ")"
        );
      }
      var poolIdx = indices[position];
      var item = fixedTrialPool[poolIdx];

      var selection = {
        // ── Core trial fields (mirror v1's shape so game.js can read
        //     selection.hand / selection.category transparently) ──
        hand: item.hand,
        category: item.ground_truth ? "winning" : "losing",

        // ── v2 fixed-pool fields ──
        trialPoolOrder: poolIdx,            // 0..N-1, fixed across participants
        groundTruth: !!item.ground_truth,
        handId: item.hand_id || null,
        pairId: item.pair_id || null,

        // ── v2 per-hand metadata (Issue 4 option C) ──
        // Propagated for game.js _buildStimulusMetadata. Each is null when
        // the strategy doesn't carry that field (e.g. entropyBits is null
        // for B/C/D pools, misclassScore is null for A/C/D pools).
        pAcceptEmp:        item.p_accept_emp == null ? null : item.p_accept_emp,
        entropyBits:       item.entropy_bits == null ? null : item.entropy_bits,
        misclassScore:     item.misclass_score == null ? null : item.misclass_score,
        editDepth:         item.edit_depth == null ? null : item.edit_depth,
        editDescription:   item.edit_description || null,
        sourceHand:        item.source_hand || null,
        sourceExemplarIdx: item.source_exemplar_idx == null ? null : item.source_exemplar_idx,
        scoreBasis:        item.score_basis || null,

        // ── v1 dual-stack fields nulled in v2 ──
        // samplingScheme=fixed_pool_v2 (B5) tells analysis code these are dead.
        stackPosition: null,
        stackSource: null,
        difficultyScore: null,
        // strategyScore + strategyMethod REMOVED entirely (Issue 4) —
        // game.js's per-trial _buildStimulusMetadata now sources from the
        // per-hand metadata fields above.
      };

      selections.push(selection);
      position++;
      return selection;
    }

    function remaining() {
      return indices.length - position;
    }

    function getSelections() {
      return selections.slice();
    }

    // getUpcoming() — DevTools peek. Returns the still-to-be-drawn items
    // in the order next() will yield them, each with hand + ground_truth
    // + pool-index. Read-only; does not advance position.
    function getUpcoming() {
      var out = [];
      for (var k = position; k < indices.length; k++) {
        var poolIdx = indices[k];
        var item = fixedTrialPool[poolIdx];
        out.push({
          trialIndex: k + 1,           // 1-based position in the per-rule sequence
          poolOrder: poolIdx,
          groundTruth: !!item.ground_truth,
          handRole: item.hand_role || (item.ground_truth ? "winning" : "losing"),
          handId: item.hand_id || null,
          hand: item.hand,
          // v2 — surface per-hand metadata for DevTools peek
          entropyBits: item.entropy_bits == null ? null : item.entropy_bits,
          misclassScore: item.misclass_score == null ? null : item.misclass_score,
          editDepth: item.edit_depth == null ? null : item.edit_depth,
        });
      }
      return out;
    }

    return {
      next: next,
      remaining: remaining,
      getSelections: getSelections,
      getUpcoming: getUpcoming,        // DevTools / debugging
    };
  }

  // ── Public API ──
  return {
    create: create,                  // v1 — dual-stack coin flip (legacy)
    createFromPool: createFromPool,  // v2 — fixed-pool shuffle (current)
  };
})();
