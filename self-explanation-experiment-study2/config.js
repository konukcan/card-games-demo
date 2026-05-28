// self-explanation-experiment/config.js
// Central configuration module for the self-explanation experiment.
//
// All experiment parameters live here with sensible defaults.
// Every parameter can be overridden via URL query string, e.g.:
//   ?condition=type&nTrials=8&galleryTime=45
//
// Exported as window.SEConfig — a frozen object with the resolved
// parameter values plus helper methods for querying the condition.

window.SEConfig = (function () {
  "use strict";

  // ── URL parameter reader ──
  // Reads a single query-string parameter, returning `fallback` if absent.
  // Automatically casts "true"/"false" to booleans and numeric strings to numbers.
  function param(name, fallback) {
    var url = new URLSearchParams(window.location.search);
    var raw = url.get(name);
    if (raw === null) return fallback;

    // Boolean coercion
    if (raw === "true") return true;
    if (raw === "false") return false;

    // "on"/"off" coercion (matches the style used elsewhere in the project)
    if (raw === "on") return "on";
    if (raw === "off") return "off";

    // Numeric coercion — only if the entire string is a valid number
    if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);

    return raw;
  }

  // ── Parse a JSON array from a URL param (e.g. checkpoints=[0,3,6,10]) ──
  // Falls back to the provided default if the param is missing or malformed.
  function paramJSON(name, fallback) {
    var url = new URLSearchParams(window.location.search);
    var raw = url.get(name);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn("SEConfig: could not parse JSON param '" + name + "', using default.", e);
      return fallback;
    }
  }

  // ── Valid adversarial-strategy values (v2 schema_v2) ──
  //
  // Single source of truth: snapshot-loader.js reads this list (Issue 7).
  // Old enum (bayesian/empirical/edit/hybrid + variant paired/independent/mi)
  // collapsed in v2 — strategies are now flat:
  //   A_entropy                  — was bayesian.entropy
  //   B_misclass                 — was empirical placeholder; now real
  //   C_flip_from_random_winning — was edit.independent
  //   D_flip_from_exemplars      — was edit.paired
  // hybrid + mixed are gone; strategyVariant URL param is retired.
  var VALID_STRATEGIES = [
    "A_entropy",
    "B_misclass",
    "C_flip_from_random_winning",
    "D_flip_from_exemplars",
  ];

  // ── Valid condition values ──
  //
  // v2 (mature design, 2026-05-07): the locked condition set is
  //   silent | describe | type | token
  // (per design §2 + §10.4). `peer` and `token-type` are DEPRECATED but
  // retained in this list to keep their code paths runnable for archival
  // / replication purposes. They are NOT featured in demo presets and
  // should NOT be selected for the next pilot or production runs.
  //
  // Condition descriptions:
  //   silent     — no prompts at all (control)
  //   describe   — open-ended verbal card description after gallery
  //   type       — periodic forced-choice rule articulation at checkpoints
  //   token      — per-trial counterfactual prompt about which cards would
  //                have to change to flip the hand. Counterfactual is now
  //                the only framing (the old token-bf / token-soft split
  //                was collapsed in chunk 9 — soft framing was non-load-bearing).
  //
  //   token-type — DEPRECATED v2 (2026-05-07): token + periodic type
  //                checkpoints. Removed because the v2 design isolates
  //                comparing token vs type rather than combining them.
  //   peer       — DEPRECATED v2 (2026-05-07): Siegler-style peer
  //                classification. Removed because the v2 design's
  //                4-cell × strategy matrix doesn't include peer.
  var VALID_CONDITIONS = [
    "silent",
    "describe",
    "type",
    "token",
    "token-type",  // DEPRECATED v2 — see comment block above
    "peer",        // DEPRECATED v2 — see comment block above
    "explain"      // study #2 self-explanation condition
  ];

  // ── Build the config object ──
  var condition = param("condition", "silent");

  // Warn (but don't crash) if an unknown condition is provided
  if (VALID_CONDITIONS.indexOf(condition) === -1) {
    console.warn(
      "SEConfig: unrecognised condition '" + condition + "'. " +
      "Valid values: " + VALID_CONDITIONS.join(", ")
    );
  }

  var config = {
    // ── Condition ──
    // Determines which self-explanation prompts the participant receives.
    condition: condition,

    // ── Feedback ──
    // Whether correctness feedback is shown after each classification trial.
    // FORCED OFF in v2 per design §2 — feedback would let participants check
    // their hypothesis mid-block, conflating SE with feedback-driven learning.
    feedback: param("feedback", "off") === "on",

    // ── Token card-selection affordance ──
    // Whether the multi-card-selection UI is rendered during token / token-type
    // trials. The flag exists because the selection mechanic is provisional
    // (chunk 9) — it forces participants to commit to which cards drove
    // their judgment before recording, which may or may not survive piloting.
    // Default OFF in v2 per design §2 — the simplified token flow does the
    // recording prompt without forced selection. Set ?tokenSelection=on for
    // legacy A/B comparison.
    tokenSelection: param("tokenSelection", "off") === "on",

    // ── SE snapshot (v2 mature design) ──
    // ID of the immutable snapshot the experiment loads at startup. The
    // browser refuses to start if this is missing or unloadable (fail-closed,
    // §7.3). Snapshot content drives rule selection, exemplar galleries, and
    // adversarial trial pools — no live model calls during a session.
    seSnapshot: param("seSnapshot", null),

    // ── Adversarial sampling strategy (v2 schema_v2) ──
    // Which precomputed pool to draw classification trials from. One of the
    // 4 names in VALID_STRATEGIES (above). The snapshot must contain a pool
    // for the requested strategy or the fail-closed loader refuses to start.
    adversarialStrategy: param("adversarialStrategy", "A_entropy"),

    // strategyVariant URL param REMOVED in v2 (was: paired/independent/mi
    // sub-keys for edit/hybrid). Strategies are now flat — see
    // VALID_STRATEGIES comment above.

    // ── Group X / Y ──
    // 5 of the snapshot's 10 rules go to group X, 5 to group Y. The browser
    // filters `selected_rules` to the participant's group. Dev override via
    // ?group=X|Y; otherwise sessionStorage-persisted (per Prolific PID +
    // snapshot id). null = use sessionStorage / fresh coin flip.
    group: param("group", null),

    // ── Peer-classification rate ──
    // For the `peer` condition only. Each trial draws an i.i.d. Bernoulli
    // sample at this rate to decide whether the fictional peer's claim
    // matches the ground truth. 0.5 means peer is right ~half the time
    // and the realised distribution varies trial-by-trial (so participants
    // can't reason by elimination across a session).
    peerCorrectRate: param("peerCorrectRate", 0.5),

    // ── Trial counts ──
    // nTrials: number of classification trials per rule
    // nExemplars: number of cards shown in the gallery phase
    // nRules: total number of rules in the session (5 per group X/Y in v2)
    nTrials: param("nTrials", 10),
    nExemplars: param("nExemplars", 6),
    nRules: param("nRules", 5),

    // ── Study #2 params ──
    // ruleScope: which rules are eligible for selection in study #2.
    //   "all10" — all 10 rules from the snapshot are candidates
    //   "group" — only the participant's assigned group (X or Y, 5 rules each)
    ruleScope: param("ruleScope", "all10"),          // "all10" | "group"
    // galleryMinDwellMs: minimum time (ms) the gallery must be visible before
    // the participant can advance. Enforces a minimum inspection period.
    galleryMinDwellMs: param("galleryMinDwellMs", 15000),
    // studyMode: set true by the URL param ?study2=1 so the v3 lifecycle starts
    // BEFORE the snapshot loads (the loader also sets it to true on success).
    // When true, v2 type-prompt paths are gated off (hasTypePrompt / isCheckpoint).
    studyMode: param("study2", false),               // set true by ?study2=1 or v3 loader

    // ── Gallery phase ──
    // galleryTime: how long (in seconds) the exemplar gallery is displayed
    galleryTime: param("galleryTime", 30),

    // ── Re-engagement ──
    // If true, the gallery is briefly removed and re-shown during the gallery
    // phase to prompt a more deliberate second viewing pass.
    reEngagement: param("reEngagement", "off") === "on",

    // ── Audio recording ──
    // Minimum duration (seconds) before a verbal recording is accepted.
    // Prevents accidental micro-submissions.
    minRecordingDuration: param("minRecordingDuration", 2.0),

    // ── History accumulation ──
    // If true, previously classified hands accumulate in a visible strip
    // during the classification phase.
    accumulate: param("accumulate", "on") === "on",

    // ── Checkpoints ──
    // Trial indices at which type-classification prompts appear.
    // 0 means "immediately after the gallery, before the first trial".
    checkpoints: paramJSON("checkpoints", [0, 3, 6, 10]),

    // ── Describe prompt ──
    // Minimum number of cards the participant must mention in a "describe"
    // condition response before it is accepted.
    describeMinCards: param("describeMinCards", 3),

    // ── Difficulty source ──
    // Which metric drives difficulty ordering of rules:
    //   'diagnosticity' — based on feature diagnosticity scores
    difficultySource: param("difficultySource", "diagnosticity"),

    // ── Curriculum ──
    // How rules are ordered across the session:
    //   'random'   — shuffled randomly
    //   (future: Latin-square IDs, fixed orders, etc.)
    curriculum: param("curriculum", "random"),

    // ── Prolific integration ──
    // These are populated automatically when the experiment is launched
    // through Prolific's redirect URL.
    PROLIFIC_PID: param("PROLIFIC_PID", ""),
    STUDY_ID: param("STUDY_ID", ""),
    SESSION_ID: param("SESSION_ID", ""),

    // ── Save mode ──
    // 'remote' — save to DataPipe/Cloudflare (production)
    // 'local'  — force a browser download (development)
    save: param("save", "remote"),

    // ────────────────────────────────────────────────────
    // Helper methods
    // ────────────────────────────────────────────────────

    // isSilent() — true when no self-explanation prompts are given (control).
    isSilent: function () {
      return this.condition === "silent";
    },

    // isDescribe() — true when the participant gives an open-ended verbal
    // card-level description in the post-gallery prompt.
    isDescribe: function () {
      return this.condition === "describe";
    },

    // isToken() — true for any condition that fires a per-trial counterfactual
    // recording prompt about which cards would have to change to flip the hand.
    // Covers both `token` (token only) and `token-type` (token + checkpoints).
    isToken: function () {
      return (
        this.condition === "token" ||
        this.condition === "token-type"
      );
    },

    // isPeer() — true for the peer-classification condition. Peer has its
    // own per-trial flow (peer-claim banner → Agree/Disagree → recording
    // about the peer's reasoning), so it lives outside isToken.
    isPeer: function () {
      return this.condition === "peer";
    },

    // hasCardSelection() — true when the trial flow should render the
    // multi-card-selection UI on the focal hand (and gate recording on
    // having selected ≥ 1 card). Only token / token-type conditions are
    // candidates; the tokenSelection flag toggles it for A/B comparisons.
    hasCardSelection: function () {
      return this.isToken() && this.tokenSelection;
    },

    // isExplain() — true for the study #2 self-explanation condition.
    // Participants write or speak an explanation of the rule after each gallery.
    isExplain: function () { return this.condition === "explain"; },

    // isStudy2() — true when ?study2=1 is in the URL (or the v3 loader later
    // sets studyMode=true). Use this to gate study #2-specific UI paths.
    // !!this.studyMode so numeric 1 (from param()) counts as truthy.
    isStudy2: function () { return !!this.studyMode; },

    // hasTypePrompt() — true when the condition involves a forced-choice
    // rule-articulation prompt at designated checkpoints. This is `type`
    // and the combined `token-type` condition.
    // In study #2 (studyMode=true) this always returns false — v2 type paths
    // are not part of the study #2 design.
    hasTypePrompt: function () {
      if (this.studyMode) return false;
      return (
        this.condition === "type" ||
        this.condition === "token-type"
      );
    },

    // isCheckpoint(trialNumber) — true when the current trial index falls on
    // a checkpoint AND the condition includes type prompts. Checkpoints trigger
    // the rule-articulation recording.
    // In study #2 (studyMode=true) this always returns false.
    isCheckpoint: function (trialNumber) {
      if (this.studyMode) return false;
      return this.hasTypePrompt() && this.checkpoints.indexOf(trialNumber) !== -1;
    },

    // VALID_CONDITIONS exposed for snapshot-loader.js and study2 loader.
    VALID_CONDITIONS: VALID_CONDITIONS,

    // VALID_STRATEGIES exposed for snapshot-loader.js (Issue 7).
    VALID_STRATEGIES: VALID_STRATEGIES
  };

  // Warn if URL specified an unrecognised strategy. (Loader will fail-closed
  // anyway, but the early console warn helps developers.)
  if (config.adversarialStrategy &&
      VALID_STRATEGIES.indexOf(config.adversarialStrategy) === -1) {
    console.warn(
      "SEConfig: unrecognised adversarialStrategy '" +
      config.adversarialStrategy + "'. Valid: " + VALID_STRATEGIES.join(", ")
    );
  }

  // Log resolved config so developers can verify URL overrides in the console
  console.log("SEConfig resolved:", config);

  return config;
})();
