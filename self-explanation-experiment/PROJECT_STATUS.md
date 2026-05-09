# Self-Explanation Experiment — Project Status

**Snapshot date:** 2026-05-09
**Last commit at snapshot:** `feature/model-compare` HEAD — *v2.1 pilot-stimuli integration landed (4 lanes complete)*

This document is the project's single-page status reference. Read this first when coming back to the experiment after a break.

## v2.1 (2026-05-09): pilot stimuli integration

Schema_v2 snapshots from real LLM-pilot stimuli are the only path. The
hollow placeholder is gone. Per-trial save schema gets a `stimulusMetadata`
block; legacy `strategyScore` / `strategyMethod` / `strategyVariant`
removed. cyborg-hunter wired as a passive integrity monitor. Demo.html
extended with rules-in-snapshot panel, visualizer link block, and a
strategy radio (default B_misclass).

- **10-rule curriculum.** Group X: `left_red_right_black, colors_palindrome,
  two_pairs_ranks, halves_copy_ranks, ranks_palindrome`. Group Y:
  `ap_step1_len3_adj, blacks_then_reds_start_black,
  immediate_bracket_closure, all_odd, all_even`. Each group has 3
  high-spread + 2 ceiling rules.
- **Strategy enum.** `A_entropy / B_misclass / C_flip_from_random_winning /
  D_flip_from_exemplars`. No `hybrid`, no `mixed`. `strategyVariant` URL
  param retired (kept as `""` placeholder in `computeTrialPoolId` for hash
  continuity per Issue 3).
- **Default strategy** is `B_misclass` (most adversarial in pilot:
  Pro 0.79 / Flash 0.56 across the 10 rules).
- **Schema_v2 snapshot** at `output_se_snapshots/se_2026_05_09_1dcc7741/`.
  Top-level `schema_version: 2` (int). Top-level structure preserved:
  `selected_rules` list + `exemplars` map + `trial_pools` map + new
  top-level `group_assignment` (Issue 5: also redundantly written into
  per-rule `group` field).
- **Per-trial saved data.** New `stimulusMetadata` block with strategy +
  per-strategy fields (entropy_bits / misclass_score / edit_depth /
  source_exemplar_idx / source_hand / score_basis). `samplingScheme`
  bumped from `fixed_pool_v1` to `fixed_pool_v2`.
- **cyborg-hunter v0.3.0** vendored at `js/cyborg-hunter.js` (matches
  sister redteam project). API: `window.IntegrityMonitor.init(...)` →
  `monitor.startSession()` → `monitor.getSessionReport()` at save.
- **Test count.** 26 pytest + 46 Playwright, all green at commit time.

### Deferred for next round
- llm-guard / plugin-guard-assistance vanilla-JS port + UX design pass.
  Reference jsPsych implementation at
  `presentational-goals-redteam/presentational_goals/docs/index.html`.
- Production Prolific URL setup (demo defaults to `?save=local`).
- Within-subject strategy manipulation (would need schema_v3).
- Cyborg-hunter rollup persistence on fail-closed sessions.

### Predecessor docs
- `docs/plans/2026-05-09-se-pilot-stimuli-integration-design-v2.md` — locked design
- `docs/plans/2026-05-09-se-pilot-stimuli-integration-plan.md` — sequenced plan

**v2 mature design (2026-05-07).** The experiment is now snapshot-driven:
the Python backend at `rule-gallery/analysis/se_compare/` builds an immutable
JSON snapshot per study; the browser loads it via `?seSnapshot=<id>` (fail-
closed) and runs the entire curriculum from that snapshot. The primary typed
DV moves from per-round to a single end-of-curriculum bulk articulation
(per design §3.2). See:

- `docs/plans/2026-05-07-se-mature-experiment-design.md` — locked spec
- `docs/plans/2026-05-07-se-mature-experiment-plan.md` — implementation plan
- `REWORK_BRIEF.md` — pre-mature reference (still valid background; v2
  supersedes its condition-set and DV decisions)
- `../DEV_CHEATSHEET.md` covers the **legacy** Win/Lose + Two-Category
  paradigms, not this experiment.

---

## 1. What this experiment is

A jsPsych-style web experiment investigating **self-explanation** in rule-based category learning. Participants see six "winning" exemplar hands of cards, then classify novel hands as winning or losing. Different conditions probe whether verbalising during classification (or before, or about a peer's verdict) improves rule inference.

It's the behavioural arm of the larger self-explanations project. The companion arms live in sibling repos:
- `../../self-explanation-theories/` — LaTeX handouts mapping self-explanation theory to program induction.
- `../../card-games-modelling/` — DreamCoder-inspired computational model (out of scope here).

Designed to run on Prolific. ~20 minutes per participant, 5 rules per group X/Y (v2 default).

---

## 2. Architecture at a glance

| File | Role |
|---|---|
| `index.html` | Entry point. Loads modules and mounts `<div id="app">`. Production URL participants land on. |
| `app.js` | Top-level orchestrator. Builds metadata payload, runs tutorial → curriculum loop → recap, saves data. |
| `config.js` | Central configuration. Reads URL params, exposes `SEConfig` object with helper methods (`isToken()`, `isPeer()`, `hasCardSelection()`, `hasTypePrompt()`, etc.). |
| `curriculum.js` | Selects rules from `gallery-rules.js` (decile-stratified by difficulty), builds per-rule data including pre-scored win/lose hand stacks. |
| `hand-selector.js` | Dual-stack coin-flip selector. Each trial draws from the win or lose stack with probability 0.5; both stacks share a position counter for monotonic difficulty. |
| `game.js` | Single-rule trial loop. Gallery study → post-gallery prompt → N classification trials → end-of-round writeup. Handles all per-condition branching. |
| `ui.js` | Shared rendering. Gallery, focal hand, prompt+recording box, tutorial slides, writeup screen, classification layout, peer banner. |
| `tutorial.js` | Step-by-step onboarding. 5-6 slides (depends on `feedback` flag), ends with "Begin Experiment" → live game starts. |
| `audio-recorder.js` | Microphone capture. WebM/Opus, MediaRecorder API, exposes `init/start/stop/segments`. Includes live waveform via Web Audio. |
| `recap.js` | Post-experiment debrief. Strategy free-text + demographics. (Per-rule voice recap was removed in chunk 7 — replaced by per-round typed writeup.) |
| `hand-selector.js` | Per-trial hand draws from win/lose stacks. Throws if either stack runs out. |
| `devtools.js` | Console helpers (`DevTools.skip()`, `skipAll()`, `info()`, etc.) for fast iteration. |
| `demo.html` | Dev launcher. Conditions table, 9 quick-launch presets, parameter builder. **Start here when developing.** |
| `REWORK_BRIEF.md` | Canonical design spec. Q&A, lever decisions, history. Read for deep context. |
| `rb_vs_ii_classification.{csv,md}` | RB/II (rule-based vs information-integration) classification of the 60 rules. Informs curriculum design. |

---

## 3. The four locked conditions (v2)

Configured via `?condition=…`. Default `silent`. v2 design §2 locks the set
to four; `peer` and `token-type` are deprecated but kept in `VALID_CONDITIONS`
for archival replication.

| `condition` | Per-trial verbal prompt | Notes |
|---|---|---|
| `silent` | none | Pure control. |
| `describe` | (per-trial) "Describe at least 3 cards you see (any hands)." | Attention control. Verbalisation without explanation. Recording fires before each classification. |
| `type` | (checkpoints only, recorded vocal) "What is your current best guess as to what makes a hand winning?" | Periodic rule articulation at indices in `checkpoints` (default `[0, 3, 6, 10]`). Vocal Space-toggle. |
| `token` | "Do you think this is a winning or losing hand? Which cards would have to change to make it losing/winning instead?" | Per-trial counterfactual recording. `tokenSelection` is **off** by default in v2 (was on in v1); set `?tokenSelection=on` for legacy A/B. |
| `token-type` | DEPRECATED v2 | retained in `VALID_CONDITIONS`; not in demo presets. |
| `peer` | DEPRECATED v2 | retained in `VALID_CONDITIONS`; not in demo presets. |

**Feedback** (`?feedback=on`) is orthogonal — but **off by default in v2** (would let participants check their hypothesis mid-block, conflating SE with feedback-driven learning). Tutorial's Feedback slide only renders when `feedback=on`.

**Adversarial sampling strategy** (v2-only, no v1 equivalent): `?adversarialStrategy=bayesian|empirical|edit|hybrid|mixed` selects which precomputed pool to draw classification trials from. `bayesian` is the default. See design §6 for the strategy taxonomy.

---

## 4. Configuration reference

All set via URL query params. Defaults in parens.

| Param | Default | Purpose |
|---|---|---|
| `condition` | `silent` | Which condition (see §3). |
| `feedback` | `off` | Show correctness feedback after each trial. |
| `tokenSelection` | `on` | (token / token-type only) Render the multi-card-select affordance on the focal hand. Set `off` to A/B against no-selection. |
| `peerCorrectRate` | `0.5` | (peer only) Per-trial probability that the fictional peer's claim matches ground truth. |
| `nTrials` | `10` | Classification trials per rule. |
| `nExemplars` | `6` | Cards in the gallery (load-bearing — keep at 6 for comparability with the rule-gallery pilot). |
| `nRules` | `5` | Total rules per session (v2: 5 per participant per group X/Y). Snapshot's group size IS the curriculum length; this URL param trims if smaller for dev/test. |
| `galleryTime` | `30` | Seconds for the gallery study screen before Continue enables. |
| `reEngagement` | `off` | If on, gallery briefly removed and re-shown with "Get ready..." interlude. Niche. |
| `minRecordingDuration` | `2.0` | Seconds. Min recording length before stop is accepted. |
| `accumulate` | `on` | Build up the right-column "Your Classifications" history strip. |
| `checkpoints` | `[0,3,6,10]` | (type / token-type) Trial indices that fire the rule-articulation checkpoint. |
| `describeMinCards` | `3` | (describe) Min cards the participant must mention. |
| `difficultySource` | `diagnosticity` | How rule difficulty is computed for selection. |
| `curriculum` | `random` | Rule ordering across the session. |
| `save` | `remote` | `local` to force CSV download (dev); `remote` saves via DataPipe. |
| `clear` | (off) | If `1`, wipes the tutorial-done localStorage flag (lets the tutorial replay). |
| `skipTutorial` | (off) | If `1`, skips the entire tutorial including practice. |
| `PROLIFIC_PID`, `STUDY_ID`, `SESSION_ID` | (empty) | Auto-populated by Prolific's redirect URL. |

---

## 5. Tutorial flow (chunk 10 final state)

| # | Slide | Content | Conditional? |
|---|---|---|---|
| 1 | **Welcome + Card Notation** | Editorial heading "Welcome", drop-cap lead, suit row, pull-quote about hidden rules, framed 6-card example hand at 140px | always |
| 2 | **The Gallery** | Compact lead about studying 6 winning hands, mini-gallery (6 rows × 6 cards) inside a panel matching the live game's `.se-gallery` chrome | always |
| 3 | **Classifying Hands** | Body about Win/Lose decisions, mock focal hand wrapped in `.se-tutorial-trial-frame` (mirrors live `.se-focal-prompt-panel`) with mock Win/Lose buttons | always |
| 4 | **Feedback** | Body about green/red framing + ✓/✗, mock focal with `showFeedback("winning", true)` overlay, same trial-frame chrome | only if `feedback=on` |
| 5 | **How to Play** | Condition-specific body (token, describe, type, peer) + `<kbd>SPACE</kbd>` keyhint callout + example pull-quote + live mic test on a real focal hand inside a unified frame matching the live `.se-focal-prompt-panel`. **Next button gated on a successful mic recording.** | always (silent: no mic test) |
| 6 | **Ready to Begin** | Centered transition. "All set" eyebrow, four-suit emblem, "Begin Experiment" pill | always |

After step 6 → live `SEGame.start()` (gallery study screen for the first rule).

**Practice round was removed** in the chunk 10 final pass — the first real round serves the same purpose without doubling onboarding length.

---

## 6. Per-rule trial flow (live game, v2)

For each rule in the curriculum (5 rules, drawn from the snapshot's group filter):

1. **Gallery study screen** — 6 winning hands (snapshot's frozen exemplars) shown for `galleryTime` seconds.
2. **Post-gallery prompt** — fires for `describe` (per-trial recording infrastructure, fires once after gallery for the post-gallery card description) or `type` at checkpoint 0. Otherwise skipped.
3. **Classification trials** — 10 trials drawn from `SEHandSelector.createFromPool(ruleData.fixedTrialPool)`. The pool is the snapshot's 5 winning + 5 losing items for `(rule_id, adversarialStrategy, strategyVariant)`; index order is shuffled per-participant. Per trial:
   - For `token`: counterfactual recording prompt → Win/Lose. Card selection off by default.
   - For `describe`: recording prompt asks for card description → Win/Lose.
   - For `type` non-checkpoint: just Win/Lose. Vocal recording fires only at indices in `checkpoints`.
   - For `silent`: just Win/Lose. No verbal prompt at all.
   - Feedback after classification (only if `feedback=on`; off by default in v2).
4. **Rule-transition buffer** — ~1.5 s "Game N of M complete / Next game" pause between rules (not after the last).

After the last rule:

5. **End-of-curriculum bulk articulation** (v2; primary typed DV) — for each rule the participant just completed, in chronological order: a screen with that rule's 6-card gallery + a typed prompt "These hands all share a rule. What was it?" Default gate: 10 chars + 5 s dwell. Then an optional "anything to add overall?" synthesis screen.
6. **Recap** — strategy free-text + demographics → save → thank-you screen.

---

## 7. Data schema (v2 — `experimentVersion: 2`)

Per-trial record (built by `runTrial` in `game.js`):

```js
{
  // ── v2 schema versioning ──
  experimentVersion: 2,
  samplingScheme: "fixed_pool_v1",   // or "dual_stack_coinflip_v0" if legacy

  // ── Existing fields ──
  ruleId, rulePosition, ruleDifficulty, trialNumber,
  hand,                     // Card[6]
  handCategory,             // ground truth: "winning" | "losing"
  response, responseLabel, correct, rt,

  // ── v1 dual-stack fields, NULL in v2 fixed_pool_v1 ──
  difficultyScore, stackSource, stackPosition,

  // ── v2 fixed-pool fields ──
  adversarialStrategy,      // bayesian | empirical | edit | hybrid | mixed
  strategyVariant,          // paired | independent | mi | null
  strategyMethod,           // entropy | mi | bayesian_seed_paired | ...
  strategyScore,            // raw score from the strategy; null for placeholder
  pairId,                   // identifies paired (winner, loser) trials, else null
  groupAssignment,          // X | Y
  fallbackUsed,             // strategy name if §6.6 fallback fired, else null
  trialPoolId,              // hash of (rule_id, strategy, variant, snapshot_id)
  trialPoolOrder,           // 0..N-1, fixed across participants
  handId,                   // snapshot's stable hand id

  // ── Other ──
  isCheckpoint,
  selectedCardIndices, selectionCount,
  peerClaim, peerCorrect, agreed,    // legacy peer fields, null in v2
  timestamp
}
```

**Use `responseLabel`** for cross-condition analyses; `response` is the literal click ("agree"/"disagree" in peer trials).

Session payload (built in `app.js`):
```js
{
  experimentVersion: 2,
  samplingScheme: "fixed_pool_v1",
  metadata: { sessionId, participantId, prolificPID, studyId,
              condition, feedback, tokenSelection, peerCorrectRate,
              nTrials, nExemplars, nRules,
              // v2 metadata additions
              seSnapshotId, analysisSnapshotId, groupAssignment,
              adversarialStrategy, strategyVariant, ... },
  trials: [...],
  audioSegments: [...],
  ruleWriteups: [],                  // EMPTY in v2 — per-round writeup dropped
  endOfCurriculumWriteups: [         // v2 sole typed DV
    { ruleId, rulePosition, response, rt,
      minChars, minSec, passedGate, timestamp },
    ...                              // one per rule, in chronological order
  ],
  endOfCurriculumSynthesis: {        // optional final "anything to add" screen
    response, rt, timestamp, skipped
  },
  recap: { strategy, demographics }
}
```

Old data carries `experimentVersion: 1` (legacy); analysis code MUST branch on the version field when joining old + new pilots.

---

## 8. Recent work log

| Date | Chunk | What landed | Commit |
|---|---|---|---|
| 2026-04 | Phase 0 | Code exploration, RB/II classification of 60 rules, `REWORK_BRIEF.md` synthesised | (this commit) |
| 2026-04 | Phase 1 | Office-hours session with the user (Q1-Q6) — design decisions for rework locked in | (this commit) |
| 2026-04 | Phase 2 | Lever resolutions: Lever #1 (multi-card selection), Lever #5 (gallery sizing), etc. | (this commit) |
| 2026-04 | Chunk 4 | Multi-card selection affordance for token conditions | (this commit) |
| 2026-04 | Chunk 5 | Toggle-record (Space to start, Space to stop) + waveform | (this commit) |
| 2026-04 | Chunk 6 | (skipped — folded into 7) | — |
| 2026-04 | Chunk 7 | End-of-round typed writeup, recording playback widget, per-rule recap removal | (this commit) |
| 2026-04 | Chunk 8 | Gallery study screen redesign (countdown Continue, study prompt, viewport lock) | (this commit) |
| 2026-04 | Chunk 9 | Condition cleanup (drop bf/soft split, drop postFeedbackExplain), `tokenSelection` flag, **new peer condition** | (this commit) |
| 2026-04 → 05 | Chunk 10 | Tutorial design overhaul: palette swap to Warm Workshop, Editorial Warm aesthetic, merged Welcome+Notation, removed practice round, mic test on a real hand. **6 + 13 + 6 design-iterator iterations.** | (this commit) |

---

## 9. What's still open

### Blocked on `model_compare/adversarial.py` (Phase A4-A11)

The companion design `2026-05-07-bayesian-pilot-comparison-design.md` defines
the canonical `select_adversarial_hands(generator, ranker)` API. Until that
ships in `rule-gallery/analysis/model_compare/adversarial.py`, the SE
snapshot's Strategy 1 pools are populated by a clearly-flagged
`random_balanced` placeholder (see `se_compare/build_se_snapshot.py
_random_balanced_pool` and `snapshot.config.placeholder_strategy`). When
the helpers ship:

1. **A4** — Strategy 1 (Bayesian-entropy) adapter in `se_compare/strategies.py`.
2. **A6** — Strategies 2/3/4 (empirical / edit / hybrid).
3. **A7** — per-rule fallback chain (build-time, not runtime).
4. **A8** — 2×2 quadrant rule selection + transfer audit + X/Y partition.
5. **A9** — full snapshot build (`--quick` and full modes).
6. **A10** — manifest writer + size/time bounds enforcement.
7. **A11** — `power_simulation.py` (UC-4).

### Phase E + F (after A4 unblocks)

8. **E1** — Playwright integration test (load snapshot + complete 5 rules + 5 bulk articulations).
9. **E2** — Corrupted-snapshot fail-closed test cases.
10. **E3** — Smoke test per `VALID_CONDITIONS` value.
11. **E4** — Run `power_simulation.py`, commit report.
12. **E5** — Draft preregistration for OSF.
13. **F1** — Surprise-leak audit (autofill, screen reader, presets, tutorial, Prolific copy).
14. **F2** — Layout audit at 1280×900 and 1024×768.
15. **F3** — Soft-pilot dry run.

### Future / non-blocking

16. **Tutorial → live-game typographic seam.** Tutorial uses Source Serif Pro; live game uses Inter. Small visible shift at the handoff. Either add the serif to the live game or revert tutorial — half an hour either way; not flagged as urgent.
17. **Gallery card sizing in tutorial step 2** (~78px vs live ~95px). Acceptable as-is; revisit if pilot participants comment.
18. **Microphone test failure path** could link to mic-permission help / offer fallback to `silent`.
19. **Mobile / small-viewport behavior.** All design at 1280×900. Untested below ~1024px. Prolific is mostly desktop but worth an audit.
20. **End-of-curriculum bulk audio toggle** (config-gated `?endOfCurriculumAudio=1`). User flagged interest; not implemented in v2.

### Resolved in v2 (2026-05-07)

- ✅ **Adversarial hand sampling (v1 §9 #1)** — design locked; placeholder shipped; A4-A11 pending model_compare.
- ✅ **practiceRule cleanup (v1 §9 #4 + #5)** — D2 removed `selectPracticeRule()`; tutorial.run takes null.
- ✅ **End-of-round writeup design (v1 §9 #10)** — moved to end-of-curriculum bulk per design §3.2.

### Out of scope

21. **Downstream analysis pipeline.** Audio transcription + LLM scoring pipelines exist in `../rule-gallery/analysis/`. Reparametrize for SE's shorter recordings before running participants.
22. **DataPipe / Cloudflare worker integration.** Save cascade in `../rule-gallery/gallery-save.js` (shared). Verify project ID before Prolific.
23. **Participant payment / Prolific URL setup.** Standard Prolific configuration; not code work.

---

## 10. Quick-launch URLs (dev)

Server: `cd .. && python3 -m http.server 8080`. Then:

| Goal | URL |
|---|---|
| Demo launcher (start here) | <http://localhost:8080/self-explanation-experiment/demo.html> |
| Full token + feedback walkthrough | <http://localhost:8080/self-explanation-experiment/?condition=token&feedback=on&clear=1&save=local> |
| Token without selection (A/B) | append `&tokenSelection=off` |
| Peer condition | `?condition=peer&feedback=on&clear=1&save=local` |
| Skip tutorial, jump to game | append `&skipTutorial=1` |
| Fast walkthrough | append `&nRules=1&nTrials=2&galleryTime=3` |

DevTools (browser console): `DevTools.skip()`, `skipAll(15)`, `skipGallery()`, `skipTutorial()`, `info()`, `setCondition('peer')`, `fastMode()`.

---

## 11. Design artifacts

Two design-shotgun / design-iterator passes happened in chunk 10. Artifacts at `~/.gstack/projects/konukcan-card-games/designs/`:

- `se-tutorial-20260430/` — initial 3 hand-written HTML mockups (Variant A Editorial Warm picked).
- `se-tutorial-iter-20260430/` — first iter pass, 13 iterations on the tutorial.
- `se-tutorial-iter-20260430b/` — second iter pass, 6 iterations focused on per-slide framing (trial-frame on Classifying / Feedback, mic-frame alignment, post-tutorial parity). Includes `ref-live-*.png` reference shots from the live game.

Each iter dir has per-iteration screenshots and a `notes.md` log explaining each change. Useful when revisiting design decisions.

---

## 12. Memory pointers

(For future Claude sessions)

- `~/.claude/projects/.../memory/` — auto-memory entries about this project. Notably `feedback_writeup_typed_default.md`, `project_active_paradigm.md`, `project_se_rework_brief.md`.
- `REWORK_BRIEF.md` is the canonical spec. Read before any design change.
- This file (`PROJECT_STATUS.md`) is the status snapshot. Keep up to date when major work lands.

---

## 13. The smallest set of things to read when coming back

1. This file (you're already here).
2. `REWORK_BRIEF.md` — design context.
3. `git log --oneline -20` — what's happened since the snapshot date.
4. `demo.html` (open in a browser) — see what's live.
5. The "What's still open" section above (§9) — pick a thread.
