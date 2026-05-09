# Self-Explanation Experiment — Rework Brief

**Status:** Phase 3 (`/design-shotgun`) **complete** — visual direction locked in. Phase 1 (office hours), Phase 2 (substantive design levers), and Phase 3 (visual mockups) all approved. Next: **Phase 4 — surgical implementation** of the approved direction in `card-games/self-explanation-experiment/` source.

**Phase 3 outcome (visual direction locked):**
- **Variant C v3 — Warm Workshop with real /stim/ PNG cards.** Mockup at `~/.gstack/projects/konukcan-card-games/designs/se-classification-20260424-154924/variant-C-v3.html` (and PNG).
- Aesthetic: warm off-white background (`#FAF7F2`), cream panels (`#FDFBF7`), terracotta accent (`#D97757`), sage secondary (`#7FA67D`), rounded sans-serif typography (Recursive / Söhne family), subtle drop shadows.
- Cards: existing `stim/*.png` images via `CardEx.renderHandHTML` — single big rank + single big suit + colored border matching suit.
- Selected-card affordance: terracotta lift (translateY -3px) + 3px terracotta border + soft glow.
- Recording-active state: sage border + sage "Recording" pill badge + live mic waveform (Web Audio AnalyserNode reading `MediaStream`, drawn at ~30fps).
- Countdown (gallery study phase): circular ring in terracotta around the numeric countdown.
- End-of-round writeup: column-stack gallery (full-size hands, matches rule-gallery pilot format) above a typed text input.
- Sub-decision A1 (reading-priority compact gallery) + 3c (tightened other-element padding) yield ~86px compact gallery cards (vs. ~68px in the original).
- Optional 3a (hover-to-enlarge) and 3b (toggle expand) deferred — not adopted, not needed.
- All other variants (A Clinical Notebook, B Swiss Signal, D Editorial Quiet) explored and rejected; rationale in board.

**Approval artifact:** `~/.gstack/projects/konukcan-card-games/designs/se-classification-20260424-154924/approved.json`

**Purpose of this document:** single source of truth for the paradigm's intent, what the current code does, what's load-bearing vs. fair game, and the rework goals. Designed to survive context compaction and orient any future session on this codebase.

**Scope:** `card-games/self-explanation-experiment/` only. Other subprojects referenced for cross-cutting assets.

---

## PART I — Parsed mapping of user answers to my clarifying questions

Ordered by my question numbering from Phase 0. Inline terms in square brackets are my charitable reinterpretations of likely dictation transcription errors.

### A. Pilot data context

**Q1 — Which conditions ran in the pilot?**
The pilot was **not** for this experiment. It was for the `card-games/rule-gallery/` experiment: participants saw 60 sets of six winning exemplars and directly wrote what they thought the hidden rule was — no recording, no feedback, no self-explanation. That was the entire task.

**Q2 — What did you see in the data that prompted this rework?**
The pilot gives us per-rule difficulty calibration (how hard the underlying rule is to guess from six exemplars alone). That difficulty signal drives rule selection in the reworked self-explanation experiment.

**Q3 — Strategy-report flags?**
N/A for this question (different study). Actionable output: **select rules spanning the full observed difficulty spectrum — one rule per decile (1–10), or potentially finer (1–50), from the pilot distribution.**

**Q4 — Is the "SE without feedback" claim supported, weak, or mixed?**
N/A directly — the pilot had no SE manipulation. The pilot is the *no-SE, no-feedback, no-classification-phase* baseline against which the reworked experiment's conditions will be compared.

### B. Each condition's current role

**Q5 — `silent` pure control or comparison baseline?**
**Pure control, kept.** Participants see 6 exemplars → do ~6–10 classifications without feedback → produce a rule judgment at the end. Comparison question: how much better do they guess the rule than in the rule-gallery pilot, where there was no classification phase at all? (i.e. does classification alone, without articulation, improve rule inference?)

**Q6 — Is `describe` still theoretically important?**
Intended as an **attention-control confound check**. Concern: self-explanation effects might be driven by increased attention to the cards, not by articulation-of-reasoning per se. Describing card features forces attention without inferential content. **User is not confident describe is the best implementation of this control** — explicitly asks for help thinking through alternatives in Phase 2.

**Q7 — `postFeedbackExplain` live or vestigial?**
**Vestigial.** Drop from further consideration.

**Q8 — Is `feedback=off` the default for the final design?**
Yes — articulation-without-feedback is the clearest test of the central claim (more knowledge of the rule without any new information). **But** a second comparison is wanted: feedback × SE. Specifically: `feedback=on, SE=on` vs. `feedback=on, SE=off` — i.e. does forcing articulation add anything *on top of* feedback alone? Both arms live in the final design.

### C. Load-bearing vs. fair-game elements

**Q9 — Voice-only, spacebar-hold, min-duration: which are theoretically load-bearing?**
- **Voice-only recording: important, not fully fixed.** Typing would be too costly and would disrupt thinking flow. Keep voice.
- **Spacebar hold-to-record: mechanism is a convenience, not load-bearing.** A press-to-start / press-to-stop toggle is acceptable. **Purpose that IS load-bearing:** preventing accidental release, forcing clear articulation, avoiding one-word answers, pushing full sentences.
- **Minimum duration threshold: kept in spirit** — whatever gate we use must force articulation depth.

**Q10 — 6-exemplar gallery count fixed by theory?**
Not by theory, but **kept for continuity with the rule-gallery pilot** (the difficulty calibrations are based on six-exemplar exposure).

**Q11 — Win/Lose binary load-bearing?**
**Yes — the binary is load-bearing.** No 3-way "maybe winning," no gradient. What matters: does this new hand obey the same rule as the exemplars? Win/Lose is one framing; the *binary* is the fixed requirement, the *labels* are fair game.

**Q12 — Pre-classification prompt timing load-bearing?**
Not theoretically fixed. Pre-classification framing is a practical choice to force engagement; post-classification is acceptable if participants do it diligently.

**Q13 — Dual-stack coin-flip hand selector load-bearing?**
User does not recall the exact mechanism. Two constraints matter:
1. Approximately equal winning/losing counts per rule.
2. Not *exactly* equal — prevent participants adjusting their base-rate expectation perfectly.
3. Want a **tutorial set** plugged in at some point (a known-rule onboarding round).

**New information surfaced here (not in my Q13):** there is a **second hand-sampling contrast to add**:
- **Random mode**: hands that fit the rule (positives) + random non-fitting hands (negatives).
- **Adversarial/calibrated mode**: negatives chosen to be **maximally hard to classify** given the post-hoc hypotheses a reasonable learner would form from the six gallery exemplars.
- The `card-games-modelling/` project has a **[Bayesian] model** that captures this difficulty metric.

### D. Curriculum rework

**Q14 — What does "curriculum" mean?**
The simplest of the three interpretations: **several sequential rounds, each a new rule.** Not literal side-by-side, not interleaved, not contrast-pair structured. "Curriculum" = the sequence of independent rule-rounds, which currently is not fully plumbed through the UI.

**Q15 — Should participants know a curriculum exists?**
**No.** They shouldn't know about the rule list, shouldn't anticipate structure.

**Q16 — Target N rules? Session length?**
Default **4 rules**, adjustable. Target **~20 minutes** total.

**Q17 — Is rule-to-rule transfer a DV?**
**Yes**, but:
- NOT currently optimizing rule selection for transfer.
- Will be analyzed later.
- Because we're only reworking UI right now, **don't bake in transfer assumptions** — keep the design agnostic so transfer analysis remains clean.

**Q18 — Rule catalogue structural annotations?**
Not discussed directly. Actionable: the new rule-selection approach (decile-stratified sampling from the pilot difficulty distribution) replaces the current tier-based selector in `curriculum.js`.

### E. Platform, population, reward

**Q19–21 — Prolific, payment, session length?**
Same as the rule-gallery pilot in general. **Not considering deployment right now — UI only.** Platform/reward concerns are deferred.

### F. Data & analysis dependencies

**Q22 — Analyses relying on trial record shape?**
**No analyses decided yet.** High-level intent: measure how (a) classification performance and (b) the rule guesses themselves change as a function of condition. Plus:
- **New final step:** at the end of each rule, have participants **write the full rule** (typed) as they believe it to be. They should be **reminded of the exemplars first** to refresh memory.
- **Reason articulation of the rule is *not* asked at the beginning or after each hand (except in type-level conditions):** to avoid interference — participants locking in a rule early and sticking to it across classifications, biasing both the learning trajectory and the inferred rule.

**Q23 — Audio transcription pipeline?**
**Yes, already exists** in `card-games/` (user called it the "two-category paradigm" project; it's in `card-games/protocol-analysis/` or `card-games/analysis_*` — to be inspected). The new experiment should:
- Wire upstream recording to match the pipeline's expectations.
- Reparametrize downstream for shorter recordings (SE responses will be shorter than the pilot's open-ended rule guesses).

**Q24 — LLM scoring?**
**Yes, planned**, mirroring the rule-gallery analysis LLM-screen step.

### G. UI polish

**Q25 — Specific visual issues in the current implementation?**
- **Gallery rendering:** cards are too small, stuck inside tight rows, not visually clear. Target breathing room **at least as good as the rule-gallery experiment**.
- **Phase transitions:** the two-phase "gallery first, then added elements below" transition is too abrupt. Needs more subtle choreography.
- **Gallery prompts:** need to be more pleasing.
- **Countdown / step-affordance:** each step should have a countdown or clear indicator so participants know what they're doing and how long they have.

**Q26 — Visual identity?**
**"As pleasant and visually pleasing as possible."** The rule-gallery experiment has done substantial work on this — reference it but **don't treat as absolute gold standard**; we can do better.

**Q27 — Mockups / sketches?**
None mentioned.

---

## PART II — Synthesized reference brief

### 1. The paradigm, in one sentence

*The act of articulating one's classification reasoning — especially without corrective feedback — reshapes inference about a hidden rule, above and beyond what exposure to examples alone provides.*

Every design choice should be evaluated against whether it supports or undermines this claim.

### 2. The baseline against which this experiment is compared

The **rule-gallery pilot** (`card-games/rule-gallery/`) is the no-classification-phase, no-articulation, no-feedback baseline. Participants saw six winning exemplars per rule and wrote what they thought the rule was. This pilot:

- Established **per-rule difficulty calibration** across 61 rules.
- Provides **reference rule-guesses** for comparing articulation quality in the new experiment.
- Gives the full-text rule-writing protocol we will reuse at the end of each rule round in the new experiment.

Reworked self-explanation experiment = *rule-gallery pilot* + *classification phase* + *articulation manipulation*.

### 3. Conditions in the final design

Retained:
- **silent** — pure control: classify six–ten hands without prompts, without feedback, then write the rule.
- **describe** — attention-control confound check. Current implementation asks for card description; **this is provisional and up for redesign in Phase 2.** The *purpose* is load-bearing (rule out attention as the driver); the *form* is not.
- **token-bf** — per-hand reasoning + but-for counterfactual.
- **token-soft** — per-hand reasoning without counterfactual (isolates what but-for adds).
- **type** — periodic rule-hypothesis externalization at checkpoints.
- **token-type-bf** / **token-type-soft** — combined, tests compounding.
- **feedback × SE cross** — `feedback=on` arms remain live. Second key comparison: `feedback-only` vs. `feedback + SE`.

Dropped:
- **postFeedbackExplain** — vestigial.

### 4. Load-bearing elements (MUST NOT change without theoretical sign-off)

- **Voice recording for articulation** (typing too costly for in-the-flow reasoning).
- **Articulation-depth gate** (min duration, full-sentence push — the *purpose* of the spacebar hold; implementation fair game).
- **Six-exemplar gallery** (continuity with rule-gallery pilot difficulty calibrations).
- **Binary classification** (Win/Lose or equivalent; no 3-way, no gradient).
- **"Does this new hand obey the same rule as the exemplars?"** is the irreducible judgment.
- **Avoid early rule-commitment interference:** no pre-classification whole-rule articulation except in `type` conditions (which explicitly study this).

### 5. Fair-game elements (open for redesign)

- Recording mechanism (push-to-talk vs. toggle vs. other) — preserve articulation-depth purpose.
- Gallery layout, breathing room, card size, phase choreography.
- Countdown visuals and step-affordance language.
- Classification-phase framing and Win/Lose labels (binary is fixed; phrasing is not).
- Prompt timing (pre/post-classification) — practical choice, not theoretical.
- Typing UI — currently absent from trial flow; explicitly wanted for the **end-of-round full rule articulation** (typed, after reminder of exemplars).
- Rule selection strategy (tier-based → decile-stratified from pilot difficulty).
- Hand sampling (random vs. adversarial) — **new factor to add**.
- Tutorial set with a known rule — to be plumbed in.

### 6. Hand sampling — new factor

Two modes to contrast:
- **Random**: positives drawn from rule-satisfying sampling; negatives drawn from random non-fitting sampling.
- **Adversarial**: negatives calibrated to be maximally confusable with positives, *given the post-hoc hypothesis space a reasonable learner forms from the six gallery exemplars*. Uses the **Bayesian model in `card-games-modelling/`** to compute difficulty.

Design question for Phase 2: is hand-sampling mode a between-subjects factor, within-subjects, or a fixed design choice for all arms?

### 7. Curriculum

- **Shape:** sequential rule-rounds (4 rules default, adjustable). Each round = gallery → classification → end-of-round rule write-up.
- **Rule selection:** decile-stratified from rule-gallery pilot difficulty distribution — one rule per difficulty level, giving a calibrated spectrum. Replaces the current tier-based random selection in `curriculum.js`.
- **Participant awareness:** none. They don't know how many rules, don't anticipate structure.
- **Transfer:** measured but not engineered. **Do not** bake in transfer-maximizing selection logic.
- **Session target:** ~20 minutes.

### 8. End-of-round rule articulation (new step)

After the last classification trial in each rule round:
1. Re-show the six gallery exemplars to refresh memory.
2. Present a typed free-text input.
3. Ask participant to write, in full, what they think the rule is.
4. This response is the primary rule-inference DV — directly comparable to the rule-gallery pilot's responses.

This replaces or augments the current `recap.js` rule-articulation pass (which currently collects a voice recording per rule at the end of the session, not end-of-round).

### 9. Downstream pipeline

- **Audio transcription**: already wired in `card-games/` for the two-category paradigm. Inspect and reparametrize for shorter SE recordings; wire upstream recording to match.
- **LLM scoring**: planned, modeled on the rule-gallery analysis LLM-screen step. Applied to both voice-articulated SE responses and end-of-round typed rule write-ups.
- **Per-trial records** in the JSON payload: current shape (`ruleId`, `trialNumber`, `response`, `correct`, `rt`, `difficultyScore`, etc.) is not yet load-bearing for any analysis — but any reshape should preserve the ability to compare performance across conditions.

### 10. UI polish goals

- **Gallery:** increase card size and breathing room; rule-gallery layout is the floor, not the ceiling.
- **Phase transitions:** subtle choreography between gallery-only and gallery-plus-prompts. Current hard cut is jarring.
- **Prompts & headings:** pleasing rather than functional.
- **Countdowns / step affordances:** clear per-step indicators of what the participant is doing and how much time remains.
- **Overall identity:** clean, pleasant, academic but not sterile.

### 11. Current state of the code (after my Phase 0 read)

| File | Role | Notes for rework |
|------|------|------|
| `config.js` | URL-param config + condition helpers | Will likely gain hand-sampling-mode, end-of-round-writeup, curriculum-spec params. |
| `curriculum.js` | Rule selection + stack building | **Rule-selection logic will be replaced** (decile-stratified from pilot difficulty). Keep diagnosticity + frozen-exemplar plumbing for now. |
| `hand-selector.js` | Dual-stack coin-flip selector | Purpose (~50/50, monotonic difficulty) preserved; consider extending to support adversarial mode. |
| `game.js` | Per-rule flow orchestrator | Structural: gallery → post-gallery prompt → classification loop → (end-of-round write-up — new). |
| `ui.js` | All rendering | Primary surface for UI polish; compact gallery, prompt-recording box, two-column layout all live here. |
| `tutorial.js` | Instructions + practice round | Audio test integrated. Will need tutorial-set support (known-rule onboarding round). |
| `recap.js` | Post-session voice rule recap + strategy + demographics | End-of-round typed rule write-up may partially supersede the per-rule voice recap; revisit. |
| `audio-recorder.js` | Mic + segment capture | Check alignment with downstream transcription pipeline. |
| `app.js` | Top-level orchestrator | Recently fixed to guard against `file://` protocol. |
| `demo.html` | Dev launcher | Recently fixed with `file://` banner. Presets will need refresh after Phase 2 changes. |

Existing demo presets (to be revised): silent, describe, type, token-bf, token-soft, token-type-bf, token-type-soft, token-bf-nofb, token-bf+post-FB-explain.

### 12. Cross-project references

- `card-games/rule-gallery/` — pilot experiment; source of difficulty calibration and rule-writeup format.
- `card-games/rule-gallery/gallery-rules.js` — 61-rule catalogue (shared).
- `card-games/rule-gallery/frozen-exemplars.json` — pre-generated exemplar hands (shared).
- `card-games/rule-gallery/diagnosticity_results.json` — currently drives hand difficulty; may be superseded by new pilot-derived difficulty.
- `card-games/protocol-analysis/` or `card-games/analysis_*` — audio transcription pipeline (to locate and inspect).
- `card-games-modelling/` — Bayesian model for adversarial hand difficulty.

### 13. Execution rules (user preferences, non-negotiable)

- **Present options** for every meaningful decision, wait for selection.
- **Accept modifications** exactly as specified ("Go A but..." → apply exactly).
- **Pacing control:** one design lever at a time. Never batch.
- **Explain as you go:** code changes include what/why — this is a learning context.
- **Spirit matters:** preserve the experiential/rhetorical feel of the paradigm.
- **No speculative features.** Surgical changes only.
- **Stop when confused.** Name what's unclear.
- **Experimental integrity is sacred:** UI changes must not alter trial timing, trial logic, randomization, data logging, or stimulus order without explicit sign-off.

### 14. Outstanding open questions for Phase 2

Not decisions — things that need resolution once we get there:
- Best form for the `describe` attention-control (current wording is provisional).
- Whether hand-sampling mode (random vs. adversarial) is between- or within-subjects.
- Whether `feedback` condition is a separate arm or factorial with SE conditions.
- Concrete curriculum spec: which 4 deciles get sampled, with what randomization, in what order.
- Tutorial-set design: one shared known rule, or a small pool.
- Whether the per-rule voice recap in `recap.js` is replaced or augmented by the end-of-round typed write-up.
- Typing affordance for the end-of-round write-up — single prompt, guided, with example structure?

---

## PART III — Phase 1 (office hours) outcomes

Accumulating as the office-hours session proceeds. Each subsection captures what was resolved by a specific forcing question.

### Q1 — Demand reality: resolved

**Literature references that matter:**
- **Chi et al. (1989, and subsequent work)** — primary reference this experiment aims to go beyond. Chi established the SE effect is real with convincing evidence but did not give a way to probe the *mechanism* by which SE exerts its effect. The card-games universe is the controlled substrate that lets us decompose the mechanism.
- **Gagne & Smith (1962) on Tower of Hanoi** — the template for what we want to replicate in shape. They showed (a) SE produces measurably better performance (fewer extra moves) and (b) **the improvement magnitude correlates with problem complexity** — the largest gap appears at the threshold (4–5 disks) where brute-force simulation becomes intractable and people are forced to build abstract winning recipes. This complexity-gated pattern is a model for what we expect to see in card-games: SE gain should scale with rule complexity.
- **Siegler (2002)** — user didn't know this one well; flagged as theoretically interesting. The "engage with another mind's classification" mechanism (endorsing/refuting a peer's answer) surfaced as a candidate future design variant (see "Candidate new condition" below).
- **Renkl (SE taxonomies)** — candidate framework for classifying the *kinds* of explanations participants produce, as a potential DV refinement (does a certain kind of explanation predict better learning?).

**The heterogeneity-of-domains problem:**
SE is corroborated across biology, math, code learning, logical reasoning, and more. But the variety of task structures makes it impossible to extract a common denominator that tells us *what cognitive gears SE turns*. Card-games is the corrective: a tightly controlled universe with full control over relevant probabilities and full expressive power over the rule space. That control lets us systematically vary factors (difficulty, inference steps needed) and map where SE makes a difference.

**The sharpened central claim:**
SE improves rule inference **without feedback**, above silent classification, and the improvement's shape varies in theoretically informative ways with rule complexity (per Gagne & Smith) and possibly with articulation grain.

### Q1 decisions locked in

These supersede or sharpen the Part II condition roster:

1. **Framing (token-bf vs. token-soft) is INESSENTIAL.** The but-for counterfactual was a way to prevent participants from retreating to type-level rule statements during what was supposed to be a token-level prompt. **Action: collapse to one framing.** In Phase 2 we decide whether that framing retains the explicit counterfactual push or takes a simpler form.
2. **Feedback = OFF is the committed default.** The cleaner case that SE improves rule inference by changing how people *think about the information in front of them* requires holding total information constant. Leaving feedback on opens a different question (graceful hypothesis revision under new data) that, while interesting, strays from the central claim. **Action: drop the `feedback=on` arm from the primary design.** The `feedback=on + SE` vs. `feedback=on - SE` secondary comparison is demoted — may reappear as a follow-up study, not this one.
3. **Token vs. type grain is THE open mechanism question.** This is what the experiment is pinning down.

### The grain debate as the user articulated it

**Type-level articulation** ("state your current best guess at the rule"):
- Forces participants to commit to an explicit model of the rule.
- Potential benefit: shallower implicit classifier replaced with concrete, explicit model → better application, potentially better transfer to new contexts.
- Potential cost: could **entrench a wrong belief** if the explicit model is premature or wrong. Early commitment is hard to undo.
- May put people in a better position to **spot inconsistencies** in their own reasoning when new hands arrive.

**Token-level articulation** ("why is this specific hand winning/losing, and what would change the outcome?"):
- More subtle mechanism. Forces participants to pin down the **but-for conditions** that led to a specific classification choice.
- Can operate on either an implicit feature-recognition substrate or on an explicit rule model — doesn't demand prior commitment.
- Pushes engagement with the **concrete example**, forcing productive application even when a model exists.
- User's hypothesis about how token-level drives mental-model rectification: considering counterfactuals ("with this neighbouring configuration, would the hand belong?") can **activate implicit knowledge** that becomes newly articulable — synthesizing new knowledge about the rule through the process of thinking. For complex rules, this is the mechanism by which the feature-space structure gets built.

**What the experiment delivers by testing this contrast:**
A map of where in the rule-complexity spectrum each grain helps or hurts. Combined with the decile-stratified rule selection from the pilot, this produces the Gagne-&-Smith-style figure — SE gain as a function of rule complexity — but with a grain dimension overlaid.

### Candidate new condition: Siegler-inspired peer-classification

User reacted strongly to the Siegler "engage with an alternative mind's explanation" framing. **Design sketch to consider in Phase 2:** instead of presenting a full alternative theory, present a peer's classification without ground truth — *"Another participant who saw the same gallery said hand H1 is winning/losing. Do you agree? Why? Why do you think they got it right or wrong?"* Forces engagement with an alternative hypothesis without requiring the user to first commit to one. Could substitute for or augment one of the existing token/type conditions.

**Concern user raised:** don't overcomplicate the design. Flag this as a Phase 2 option, not a commitment.

### What Part II section 3 (conditions roster) should now read

Post-Q1, the retained condition set is sharper:

- **silent (no-feedback)** — baseline: classify without prompts, no feedback.
- **describe (no-feedback)** — attention-control confound check (provisional form; under redesign in Phase 2).
- **token (no-feedback)** — per-hand articulation. Framing to be decided in Phase 2 (collapsed from bf/soft split).
- **type (no-feedback)** — periodic rule-hypothesis articulation at checkpoints.
- **token+type (no-feedback)** — combined, tests compounding vs. interference.
- **Candidate: peer-classification (Siegler-inspired)** — pending Phase 2 decision.

Dropped:
- All `feedback=on` arms as primary conditions.
- `postFeedbackExplain` (already dropped in Phase 0).
- `token-bf` vs. `token-soft` split.

### Q2 — Status quo: resolved

**New sharp prediction from user (save for paper):**
SE-gain over rule complexity is predicted to be **inverted-U, not monotone**:
- Simple rules: ceiling effect + possible over-complication of the answer. Little room for SE to help.
- Hardest rules: the rule is unreachable from 6 exemplars alone. No traction. SE can't help.
- Middle rules: maximum SE benefit.

This differentiates from Gagne & Smith (1962), who found *monotone* scaling — but their task (Tower of Hanoi) didn't have an unreachability ceiling the way an underdetermined rule-induction task does. The inverted-U is the card-games-specific prediction and a candidate headline figure.

**Open threat flagged: Ashby's RB/II distinction is not yet handled.**
Not all of the 61 rules in `rule-gallery/gallery-rules.js` are guaranteed to be *rule-based in Ashby's sense* just because a ground-truth rule exists. Some may be **information-integration-like** — learnable from exemplars via implicit/procedural cognition, painful to verbalize.

If such rules are present in the catalogue, forcing SE on them could produce **verbal overshadowing**: SE underperforms silent *not* because the rule is too hard, but because articulation disrupts the learning substrate itself. This is a known effect in the category-learning literature (Ashby/COVIS, Smith & Shapiro 1989) and a threat to the headline claim.

**Diagnostic run — results saved to `rb_vs_ii_classification.md` and `.csv`.**

**CORRECTION notice:** initial analysis used a stale `output/rule_summaries.csv` (April 1 smoke run, n=1–8 per rule, Dice only). The correct source is `output_human/rule_summaries.csv` (April 15, n=15–26 per rule, with MCC). User caught this. MCC is the right metric per `rule-gallery/analysis/score.py:12` — its expected value under statistical independence is 0 regardless of base rate, avoiding Dice's base-rate inflation.

Method (v2): `empirical_accuracy` (exact rule-writeup match) vs `mean_mcc` (Matthews correlation between participant's inferred extension and ground truth).

Results on 60 rules:
- **RB_CLEAR: 12 rules** (acc ≥ 0.50 AND mcc ≥ 0.50). Verbalizable, verbalized, extension matches.
- **MIXED: 10 rules** (0.25 ≤ acc < 0.50). Partial articulation.
- **II_CANDIDATE: 14 rules** (acc < 0.25 AND mcc ≥ 0.25). **Significantly more II-candidates than the stale v1 suggested (5 → 14).** The Ashby/II threat covers ~23% of the catalogue.
- **TOO_HARD: 24 rules** (acc < 0.25 AND mcc < 0.25). Unreachable from 6 exemplars.

**Caveats:**
1. n≈20 per rule — adequate but not large. Borderline classifications could shift with more data.
2. No classification data in pilot (only rule-writeup). The cleanest II test (classification-vs-articulation dissociation) still comes from the new experiment's classification phase.

**Open decision for Phase 2 (curriculum design):**
- **Direction A — STRATIFY:** include 1–2 II_CANDIDATES in the 4-rule curriculum alongside RB and MIXED. RB/II status becomes a pre-registered covariate. Tests SE × representation-type interaction directly.
- **Direction B — EXCLUDE:** restrict to RB_CLEAR and MIXED for a clean baseline test of "SE-without-feedback raises inference above silent." Defer Ashby interaction to a follow-up.

Tradeoff: A gets a richer mechanism story in one run (more interpretation risk); B gets a cleaner headline (narrower claim, cleaner publication). **Decision deferred to Phase 2.**

**On the third push (status-quo cost):** user gave the standard "better pedagogical intervention design" motivation. Noted as soft. Sufficient for a thesis chapter; would need sharpening for a high-impact paper (specific downstream work that's blocked).

### Q3 — Desperate specificity: resolved

**Specific audience (outer ring):** the Tenenbaum / Goodman / Piantadosi LOT-PPL tradition. The card-games universe offers what heterogeneous SE studies can't: tight control over probabilistic quantities (including Bayesian-update likelihood terms via the size principle) and a minimal feature set that allows precise rule-space manipulation.

**Specific audience (in-house consumer):** the `card-games-modelling/` subproject, which is a DreamCoder-inspired Python system modeling rule learning in this same universe. The empirical data from this experiment directly parameterizes that model; the mechanism story becomes a concrete computational claim about which module in the architecture the SE effect corresponds to.

**Specific question:** SE is an operation that modifies one or several components of a multi-component program-induction architecture (program enumeration / recognition model / abstraction / dreaming). Which component(s)?

**User's current prior:** multi-component, with token-SE tentatively mapping to **recognition** and type-SE tentatively mapping to **abstraction**. Not committed as a single prediction.

**Methodological commitment (important — shapes the design):**
Rather than pre-committing to one theoretical mapping, the experiment will **pre-register a theory → behavioral-signature adjudication table**. Each candidate component-mapping comes with specific predicted behavioral patterns; the data adjudicates among them.

**Design implications that follow:**
- **Rule-to-rule transfer measurement is load-bearing.** Distinguishes abstraction/dreaming (predict transfer) from recognition/enumeration (don't). The current curriculum structure supports this; must stay in.
- **Within-rule timecourse is load-bearing.** Distinguishes recognition (gradual amortization, effect fades within-rule) from enumeration (one-shot, effect spikes on novel rule types). Requires trial-by-trial accuracy recording, which already exists in the data pipeline.
- **Axes of rule variation matter.** Decile-stratified difficulty from the pilot gives one axis. May need a second axis (e.g., compressibility / abstraction value) for cleaner component discrimination. Open for Phase 2.

**Cross-reference:** `self-explanation-theories/` contains LaTeX handouts mapping SE to program-induction mechanisms. Claude to consult these when finalizing the pre-registration mapping table.

### Q4 — Narrowest wedge: resolved (pending final confirmation)

**Pilot plan locked (W2-refined, updated post-correction):**
- **Conditions:** describe vs token (2 arms, 25/condition, N=50 total).
- **Rules:** `ranks_palindrome` (MIXED, acc=0.26, mcc=0.37) + `straight5` (RB_CLEAR, acc=0.56, mcc=0.57, AP-family) — chosen for structural orthogonality. User flagged that pairing `ranks_palindrome` with any pair-structured rule (e.g., `two_pairs_ranks`) would be confounded by containment: a palindrome entails position-matched pairs. `straight5` (AP-based, no pairing) is structurally independent. Transfer hypothesis: shared substrate of "parsing rank values as ordered numbers," different attentional templates (sequence vs. symmetry).
- **Design:** within-subjects on rules, order counterbalanced.
- **Headline DV:** rule-writeup quality (LLM-scored, MCC-based) × condition × rule × order.
- **Secondary DV:** classification accuracy over trial × condition × rule.

### Q5 — Observation & surprise: resolved

**Pilot data surprise (from user + quantified):**
Undergeneralization (participant's extension is a strict superset of ground truth — too broad) dominates overfitting (strict subset — too specific) by **4.5:1** across the catalogue (265 vs 59 across 1153 responses on 60 rules). **63% of errors fall in a third category** ("other" — neither subset nor superset), meaning participants picked the wrong feature dimension entirely rather than mis-scoping the right one. These are two different cognitive mechanisms.

**Why this matters for the SE experiment:**
SE gives a precise directional prediction — not "accuracy goes up" but specific shifts in the error distribution. Two predictions to pre-register:
- If SE works by **forcing specificity**: undergen rate drops; residual shifts toward correct.
- If SE works by **reorienting attention** across feature dimensions: "other" rate drops; residual shifts toward correct.
- Different predictions separate different mechanistic claims.

**Tension surfaced with Q1's framing decision:**
Q1 collapsed `token-bf` vs `token-soft` as "inessential framing." The undergen-dominance finding pulls the other way: counterfactual framing ("what would have to change") is a specificity-forcing device, which is exactly the mechanism needed against undergen. **The bf framing may have been load-bearing after all.** Phase 2 prompt design must reconsider:
- (a) Restore bf as the default token prompt.
- (b) Keep the collapse but design a different specificity-forcing mechanism (Siegler peer-classification; structured-field input; "point at the deciding card" interaction).
- (c) Factorial pilot — bf vs non-bf — to catch whether specificity-forcing matters behaviorally.

**Live-participant assignment (not optional before Phase 2 prompt design):**
User has not watched any naïve participant do the SE experiment. The closest observation was a collaborator on a different (two-category) paradigm; main takeaway was *"it's harder than you'd think to push people to think deeper via prompts alone."* This corroborates the undergen finding: default engagement is shallow.

**Assignment:** sit with ≥2 naïve participants doing the current SE experiment end-to-end. Document: where they pause vs speak reflexively; what they actually articulate in token prompts (features/positions/gestalt); whether bf framing produces specific-feature naming or participants glide past it; specific moments the specificity-forcing mechanism fails.

**Key reframing commitment (Bayesian interpretation of "silent"):**
User's argument: from a rational-Bayesian perspective, classification without feedback provides no new information. Therefore silent-classification is not a no-thinking baseline but already inside the class of "thinking effects" to study. The `describe vs token` contrast isolates *kind of prompted thinking*, with both anchored in "not-silent thinking."

**Paper framing shift that follows:**
The headline moves from *"SE works without feedback"* to *"among different forms of prompted articulation, inferential SE outperforms descriptive articulation — both above the pilot no-classification baseline."* Sharper in isolation; narrower in scope. The paper must explicitly own this reframing and argue the Bayesian interpretation in the Methods/Discussion.

**Between-study comparison responsibility:**
The rule-gallery pilot serves as the no-classification anchor. Same rules, same stimulus construction, similar Prolific population — but different sample, different instructions. Must be documented as a methods caveat, not hand-waved.

### Q6 — Future fit: resolved

**3-paper research program (the 10x version):**

1. **Interleaving vs. blocking of rules** — direct sequel. Same infrastructure, transfer effects across rule families as DV. Brings the long-studied spacing/interleaving literature (Bjork) into a controlled program-space for the first time.
2. **Active vs. passive exemplar selection** — participants pick the next hand to see during classification. Opens the information-gain / curiosity literature (Gureckis, Schulz, Coenen) to this substrate. Orthogonal mechanism to SE.
3. **LLM vs. human comparison** — identical rules/stimuli run with and without chain-of-thought on LLMs. Directly addresses the anchor-vs-driver scenario: if CoT-LLMs diverge from humans on specific rules, the card-games universe becomes the calibration benchmark for claims about AI concept learning.

**Novelty claim to state explicitly in the paper:**
The specific combination of (i) a controlled program-space catalogue, (ii) six-exemplar free-text rule induction, (iii) calibrated difficulty from a large pilot, and (iv) LLM-scored rule quality is new. The paradigm is continuous with the long category-learning tradition (Shepard-Hovland-Jenkins 1961, Nosofsky's models, Ashby's COVIS); the combination is what's durable.

**Scenario robustness:**
- If LLM-as-human-proxy becomes mainstream → #5 positions the paradigm as the calibration benchmark.
- If DreamCoder-style architectures mature into a standard cognitive model → this work is the empirical anchor against which the model is validated.
- Paradigm remains essential in both futures. Not just "more data on SE" — a reusable substrate for mechanism-level cognitive science.

---

## Office-hours closing — design doc status

**Status: APPROVED**

This REWORK_BRIEF.md IS the office-hours design document. It contains:
- Problem statement (Parts I + II).
- Demand evidence (Q1 section).
- Status-quo analysis including the RB/II diagnostic (Q2).
- Specific audience and in-house consumer (Q3).
- Pre-registration methodology commitment (Q3).
- Pilot plan (Q4).
- Observation-based design predictions and open tensions (Q5).
- Research program (Q6).

**The assignment (one concrete action before Phase 2 prompt design):**
Sit with ≥2 naïve participants doing the current SE experiment end-to-end. Record screen. Document specificity-forcing moments and failures. Feeds Phase 2 prompt design directly.

**Phase 2 sequence (design levers, in priority order):**
1. ~~Prompt specificity design~~ **RESOLVED — see Lever #1 below.**
2. ~~Curriculum design~~ **DEFERRED for the demo** — main-study curriculum (Package 1 / 2 / 3 + which II candidate if any) will be decided in a later Phase 2 pass, after the collaborator discussion. For the demo and pilot, the curriculum is `ranks_palindrome` + `straight5`, within-subjects, order counterbalanced.
3. ~~Hand sampling (random vs adversarial)~~ **DEFERRED.** Infrastructure-level decision via the `card-games-modelling/` Bayesian model. Return to this after UI polish is locked and the pilot is running. For the demo, the existing dual-stack coin-flip selector (`hand-selector.js`) is retained.
4. ~~Gallery UI polish~~ **RESOLVED — Option A** (row-major stack, single column, enlarged cards, more breathing room). Visual reference: the **rule-gallery pilot** gallery layout (`card-games/rule-gallery/`). Phase 3 visual shotgun will generate variants of typography, spacing, container chrome, countdown style, and phase-transition choreography within this direction.
5. ~~Classification UI~~ **RESOLVED — Option A + sub-decision A1** (reading-priority compact). Two-column layout retained (main col: gallery → focal → prompt → buttons; right sidebar: history). Card-size targets: study mode ~95–100px (slightly above rule-gallery pilot's ~90px), classification compact mode ~65–68px (gallery at ~45vh, focal at ~40vh). Card-selection affordance from Lever #1 lives inside the focal hand panel. Visual treatment for everything (typography, spacing, history-column prominence, click-feedback) is Phase 3.
6. ~~End-of-round typed rule writeup UI~~ **RESOLVED — Option A** (gallery as compact banner above large typed input on a single screen). Inherits **rule-gallery pilot's gating: 5 characters minimum + 5 seconds minimum dwell time** before Continue enables (`gallery-app.js:820-830`). Replaces the per-rule voice recap currently in `recap.js`. Strategy report and demographics in `recap.js` stay. Behavioral instrumentation (tab-away, edit count, etc.) deferred to a later sweep using the **cyborg-hunter** standalone package (`https://github.com/konukcan/cyborg-hunter/`); no need to wire individual signals now. Visual treatment (typography, gallery prominence, input field styling) is Phase 3.
7. ~~Recording mechanism~~ **RESOLVED — Option B with modifications** (toggle: press-to-start / press-to-stop). Min-duration gate retained at 2.0 seconds. **No max duration.** Instead, classification button click (Win/Lose) auto-interrupts recording — natural flow, no runaway concern, the trial advancing IS the safety net. Recording-active visual state must be **conspicuous** (specific treatment is Phase 3 territory): cannot be a small dot in the corner; must be unmissable so participants don't accidentally talk into a non-active recording or vice versa. Spacebar primary; click affordance optional (Phase 3 decision). Affects all recording moments in the experiment except the per-rule voice recap (which Lever #6 dropped).
8. ~~Tutorial + tutorial-set~~ **DEFERRED with inheritance principle:** whatever visual and interaction choices get locked for the main UI elements (gallery, focal hand, prompt box) must propagate into the tutorial's demo renderings of those same components. Tutorial-specific design work is only about the *narrative framing* around the shared components, not a separate visual language.

One lever at a time; each advances only after explicit user selection. No speculative features.

---

## PART IV — Phase 2 design decisions

### Lever #1 — Prompt specificity design: RESOLVED

**Decision:** restore bf-style counterfactual framing as the default token prompt, paired with a multi-card selection UI affordance (Option C + multi-card modification + C2 soft-cap-via-copy).

**Implementation spec:**

| Element | Spec |
|---|---|
| Affordance | Click any number of cards in the focal hand. Clicked cards toggle a visible border/glow highlight. No hard cap. |
| UI copy above hand | "Click the minimal set of cards that matter most to your answer. Then hold space to explain." |
| Voice prompt (token conditions) | "Why did you pick these cards? What would have to change about them for the hand to be the opposite?" |
| Sequencing | Select cards → recording begins on spacebar → clicks lock at recording start → recording + speaking → release → classify |
| Gating | Spacebar-start disabled until ≥1 card is selected |
| Scope | Token conditions only (`token-bf`, `token-soft`, `token-type-*`). Describe condition retains its current attention-only prompt without card selection. Type checkpoints unchanged (they're about the rule, not the hand). |
| Data captured per trial | `selected_card_indices` (array of 0–5), `click_count`, `selection_lock_time_ms`, full voice recording, recording length |

**Rationale:**
- Q5 finding: undergeneralization dominates errors 4.5:1. Shallow processing is the root cause.
- Q1 collapsed bf/soft framing as inessential; Q5 reversed this — bf is THE specificity-forcing mechanism, exactly the lever needed against undergen.
- The click-cards-first affordance adds UI-level specificity pressure on top of prompt-level specificity (bf wording).
- Multi-select fits the rule catalogue: `ranks_palindrome` and `straight5` are inherently multi-card patterns. Single-card would misrepresent them.
- Soft cap via "minimal" copy framing avoids hard-cap rule-mismatch problems while signaling the specificity norm.
- Click count becomes an analytical DV: 1–2 clicks = focused specificity, 5–6 clicks = broad gesturing.

**Experimental-integrity statement:**
- Trial logic DOES change: a card-selection phase is added BEFORE the existing prompt/recording phase (token conditions only).
- Trial timing DOES change: token trials gain a selection-phase duration (variable, participant-paced).
- Data logging ADDS fields (above). No existing fields are removed or renamed.
- Randomization (hand selection, rule assignment, order): UNCHANGED.
- Stimulus presentation order: UNCHANGED.
- Classification buttons and gallery rendering: UNCHANGED.

### Chunk 9 — Condition cleanup, prompt rewording, peer condition: RESOLVED

This chunk consolidated the condition roster, retuned the token prompt, and added a new peer-classification condition. It supersedes the Lever #1 prompt wording above (which was provisional).

**Conditions live after chunk 9** (six total — see `config.js` `VALID_CONDITIONS`):

| Condition | Per-trial verbal prompt | Notes |
|---|---|---|
| `silent` | none | Pure control. |
| `describe` | "Describe at least 3 cards you see (any hands)." | Attention control. Post-gallery, not per-trial. |
| `type` | (checkpoint only) "What is your current best guess as to what makes a hand winning?" | Periodic at trial indices in `checkpoints`. |
| `token` | "Do you think this is a winning or losing hand? Which cards would have to change to make it losing/winning instead?" | Counterfactual framing only — `token-bf` and `token-soft` were collapsed (the bf/soft distinction was found inessential at the wording level). Card-selection affordance toggled by `tokenSelection`. |
| `token-type` | per-trial token prompt + periodic checkpoints | Combined. |
| `peer` | "What do you think led them to this decision?" | Peer-classification flow: a fictional participant has classified the hand; the participant agrees or disagrees, then explains the peer's reasoning. New as of chunk 9. |

**Dropped:**
- `token-bf`, `token-soft`, `token-type-bf`, `token-type-soft` — collapsed to `token` / `token-type` with a single counterfactual prompt.
- `postFeedbackExplain` config field, the `getPostFeedbackPrompt` branch in `game.js`, and the corresponding demo preset. Vestigial per the brief.
- `isButFor()` and `hasTokenPrompt()` config helpers (the latter was never called; the former lost its referent).

**Added config flags:**
- `tokenSelection` (default `on`) — gates the multi-card-selection UI on the focal hand for `token` / `token-type` trials. URL: `?tokenSelection=off` to A/B against a no-selection variant. The prompt wording is identical with or without selection.
- `peerCorrectRate` (default `0.5`) — rate at which the fictional peer's claim matches ground truth. Each trial draws an i.i.d. Bernoulli sample at this rate, so the realised correct/incorrect mix varies trial-by-trial and prevents reasoning-by-elimination.

**Peer-condition trial flow:**
1. Banner above the focal hand: *"Another participant said this hand is **WINNING / LOSING**."*
2. Focal hand renders without selection.
3. Recording prompt below the focal hand: *"What do you think led them to this decision?"*
4. Toggle-record (Space). After a valid recording the buttons enable.
5. **Agree** / **Disagree** buttons (replace Win / Lose for peer only).
6. Trial record adds: `peerClaim` ("winning" / "losing"), `peerCorrect` (boolean), `agreed` (boolean). The participant's belief about the hand is derived as `responseLabel = agreed ? peerClaim : opposite(peerClaim)` so analyses comparing across conditions can use a uniform field.

**Trial-record additions (all conditions):**
- `responseLabel` — derived participant belief about the hand. Equals `response` for non-peer trials; for peer it's the derivation above. Use this in cross-condition analyses; `response` keeps the literal button click for audit purposes.
- `peerClaim`, `peerCorrect`, `agreed` — null for non-peer trials.

**Files touched in chunk 9:**
- `config.js` — VALID_CONDITIONS, helpers (`isToken`, `isPeer`, `hasCardSelection`), new flags.
- `game.js` — `getPreClassificationPrompt` rewritten, `getPeerPrompt` added, `getPostFeedbackPrompt` removed, peer-setup block in `runTrial`, peer-aware `responseLabel` + correctness derivation, peer fields in trial record.
- `ui.js` — `renderButtons` extended with `labels`/`values`/`classes` opts; `renderPeerBanner` added; `setButtonsEnabled` and `waitForClassification` switched to semantic primary/secondary names with legacy `winBtn`/`loseBtn` aliases.
- `styles.css` — `.se-peer-banner`, `.se-peer-claim--{winning,losing}` chips, `.se-btn-agree` / `.se-btn-disagree`.
- `tutorial.js` — bf/soft branches folded into a single token branch with selection-aware copy; new peer branch.
- `app.js` — metadata payload drops `postFeedbackExplain`, adds `tokenSelection` + `peerCorrectRate`.
- `demo.html` — conditions table, dropdown, presets, and the custom builder all rebuilt against the new roster.

**Experimental-integrity statement:**
- Trial logic for `silent`, `describe`, `type`: unchanged.
- Trial logic for token-family: prompt wording changes, the bf/soft split collapses, the optional selection UI is now gated by `tokenSelection`. No change to the load-bearing flow (gallery → classification → end-of-round writeup).
- Trial logic for `peer`: NEW. The classification surface is Agree/Disagree with the fictional peer, and the verbal prompt asks about the peer's reasoning. The participant's belief about the hand is derived for analytical parity.
- Randomisation (hand selection, rule assignment, ordering): UNCHANGED.
- Stimulus presentation order: UNCHANGED.
- Gallery rendering: UNCHANGED.
- Data logging adds `responseLabel`, `peerClaim`, `peerCorrect`, `agreed`. No existing fields removed or renamed.
