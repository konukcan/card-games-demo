# Rule Selection Cheat Sheet

Internal tool for cherry-picking 10 rules from the 60-rule gallery for
the follow-up self-explanation study.

## Quick start

From `card-games/`:

```bash
# 1. Generate the data feed (re-run any time upstream data changes)
cd rule-gallery/analysis
python -m selection.build_selection_table

# 2. Serve the page (file:// is blocked by browsers; HTTP is required)
cd ../..
python3 -m http.server 8765 --directory rule-gallery/analysis/selection

# 3. Open http://localhost:8765/
```

## What it shows

The page has four parts, top to bottom:

**1. Legend bar** — decodes RB/II classes, failure_dir labels, and the decile color scale (D1=cool to D10=warm). Collapsible; open by default.

**2. Coverage panel (sticky)** — live updates as you tick checkboxes (see "Coverage panel" section below).

**3. Table** — one row per rule with 22 columns (default-shown marked ✓):

| ✓ | column | notes |
|---|---|---|
| ✓ | `pick` | checkbox, persisted across reloads |
| ✓ | `rule_id` | links to the atlas rule page; click to highlight the dot in plots |
| ✓ | `rule_answer` | ground-truth phrasing, truncated |
| ✓ | `rb_ii_class` | RB_CLEAR / MIXED / II_CANDIDATE / TOO_HARD from `rb_vs_ii_classification.csv` |
| ✓ | `difficulty` | tier 1–4 |
| ✓ | `mcc_mean` | post-exclusion mean MCC |
| ✓ | `mcc_decile` | decile 1–10 within the 60-rule mcc distribution |
|   | `mcc_std` | population std-dev of mcc, off by default |
| ✓ | `base_rate` | true rule base rate |
| ✓ | `base_rate_decile` | decile 1–10 within the 60-rule base-rate distribution |
|   | `ast_complexity` | AST node count of the ground-truth lambda |
|   | `n_features`, `features` | rank/suit/color/position/count, off by default |
| ✓ | `entropy_norm` | normalized Shannon entropy of equivalence classes |
| ✓ | `H_decile` | decile 1–10 within the 60-rule entropy distribution |
|   | `eff_n_classes` | exp of entropy |
| ✓ | `failure_dir` | mostly_overfit / mostly_undergen / balanced / near_ceiling / low_signal |
| ✓ | `time_s_mean` | mean response time per gallery response |
| ✓ | `decomposable` (`decomp(?)`) | **EXPLORATORY** — see caveat below |
|   | `nearest_conf` | top-1 nearest confusable rule |
|   | `n_eff` | included responses |
| ✓ | `rationale` | free-text per-pick reason, persisted |

**4. Distribution plots (Plotly)** — three density plots (mcc_mean, H_norm, base_rate-log10) plus a 3D scatter showing all three dimensions at once. Hover any dot to identify the rule; click to scroll the table to that row and highlight it. Click a `rule_id` in the table to highlight its dot across all four plots.

## Coverage panel (live, sticky at top)

**Glance tier (always visible):**
1. `X / 10 picked · Y / X with rationale`
2. Difficulty histogram, ✓ when all 4 levels covered
3. RB/II distribution
4. MCC range + warn if any pick is outside [0.2, 0.8]

**Details tier (click to expand):**
5. Feature coverage pills
6. Failure-mode mix
7. Estimated total time
8. Decomposable count (exploratory)
9. Mutual confusable pairs warning

## Decomposability caveat

The `decomp(?)` column is marked YES for only 4 rules
(`straight5_same_suit`, `four_of_a_kind_adjacent`,
`ap_step1_len3_adj_ordered`, `some_half_red_other_black`). These were
identified opportunistically during the judge-disagreement fairness
review, not via a systematic survey.

**The detection method is biased toward harder strata** (II_CANDIDATE
and TOO_HARD) because it requires partial articulation + low MCC. There
are likely decomposable rules in RB_CLEAR (e.g., `left_red_right_black`
is structurally decomposable into "left half red" + "right half black"
+ "halves boundary") that this method wouldn't find.

**Treat this column as exploratory.** Don't sort or filter on it for
primary selection decisions. If decomposability turns out to matter for
your slate, do a proper rubric-based survey (Task 6 in the plan, or use
an LLM-as-judge with a logged prompt for cheap-and-legible coverage).

## Export

The "Export picks (JSON)" button writes
`rule_picks_YYYY-MM-DD.json` with:

- `exported_at` timestamp
- `snapshot` — generation time + git commit + per-stratum counts (so
  the slate is replayable)
- Per-pick: `rule_id`, `rationale`, full embedded `metrics` row

This is the defensibility artifact: future re-runs of upstream pipelines
won't silently change which rules satisfied which criteria.

## File layout

```
selection/
├── build_selection_table.py    # backend: derives metrics, emits JSON+CSV
├── rule_kinds.yaml             # 4 seeded decomposability tags
├── index.html                  # the picker page
├── selection.css
├── selection.js
└── output/
    ├── selection_data.json     # consumed by selection.js
    └── selection_table.csv     # raw data dump for spreadsheet inspection
```

## When to regenerate

Re-run `python -m selection.build_selection_table` after any change to:
- `rule-gallery/analysis/output_human/stage3_scored_final.csv`
- `rule-gallery/analysis/output_human/rule_summaries.csv`
- `rule-gallery/analysis/atlas/data/cache/equivalence_extension.json`
- `rule-gallery/analysis/atlas/data/cache/rule_pair_confusion.json`
- `card-games/self-explanation-experiment/rb_vs_ii_classification.csv`
- `selection/rule_kinds.yaml`

The page hot-reloads via browser refresh.

## Companion docs

- Design: `docs/plans/2026-05-08-rule-selection-cheatsheet-design.md`
- Implementation plan: `docs/plans/2026-05-08-rule-selection-cheatsheet-plan.md`
- Selection rubric: `docs/plans/2026-05-08-main-study-rule-selection-rubric.md`
