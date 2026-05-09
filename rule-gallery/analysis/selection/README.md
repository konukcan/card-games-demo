# Rule Slate Walkthrough

Companion view linked from the SE-pilot demo launcher. Shows the 10 rules
selected for the follow-up self-explanation study, side by side with the
five candidate adversarial-hand-selection strategies that were considered.

Originally an internal picker tool; repurposed 2026-05-09 for collaborator
walkthroughs. The picker affordances (checkboxes, free-text rationales,
export, live coverage tracker) have been removed. The slate is now locked
and read from `shortlist_final_10.json`.

## Quick start

From `card-games/`:

```bash
# 1. (One-off) regenerate the data feeds — only needed when upstream data changes.
cd rule-gallery/analysis
python -m selection.build_selection_table
python -m selection.build_diagnostic_hands_data    # optional — diag panel feed

# 2. Serve the page (file:// is blocked by browsers; HTTP is required).
cd ../..
python3 -m http.server 8765 --directory rule-gallery/analysis/selection

# 3. Open http://localhost:8765/
```

GitHub Pages mirror: <https://konukcan.github.io/card-games-demo/rule-gallery/analysis/selection/>.

## URL parameters

The page accepts `?strategy=<key>` where `<key>` is one of:

- `A_entropy` — top-10 hands the empirical posterior is most split on (entropy ≈ 1 bit)
- `B_misclass` — top-10 hands collaborators are most likely to call the wrong way (default)
- `C_flip_random` — minimal-flip 1-edit edits of random non-exemplar winning hands
- `D_flip_exemplar` — minimal-flip edits of the 6 frozen exemplars
- `model` — model-based picker (under-developed; not used in the final experiment)

Sets the default selected strategy across every rule's diagnostic-hands panel.
The demo launcher's strategy toggle is expected to pass this param through.
A bare URL (no query string) defaults to `B_misclass`.

## What it shows

Top to bottom:

**1. Slate-at-a-glance** — static summary of the 10 picks: difficulty mix,
RB/II distribution, feature coverage, MCC range, and mean response time
(from the gallery pilot).

**2. Rule table** — one row per rule. Default-on columns: `selected ✓`,
`👁` (open diagnostic panel), `rule_id`, `answer`, `mcc_mean`, `mcc D`,
`base_rate`, `br D`, `H_norm`, `H D`. Other 14 columns available via
"Toggle columns".

The 10 selected rules are highlighted with a warm cream tint and a 4 px
honey-coloured left border. By default the table shows only those 10 rows;
click "Show all 60 rules" to reveal the rest of the gallery.

**3. Diagnostic-hands panel** (per-rule, opens via 👁) — three sub-blocks:

- The 6 winning **source-gallery** hands collaborators see in the experiment
- A **Pro/Flash accuracy table** for the four LLM-pilot strategies (A–D)
- A flat **5-button strategy strip** (A · entropy, B · misclass,
  C · flip-from-random, D · flip-from-exemplar, model) plus the active
  strategy's 10 hands. The model button is muted/italic with a tooltip
  flagging it as under-developed.

**4. Distribution plots (Plotly)** — three density plots (mcc_mean, H_norm,
base_rate-log10) plus a 3D scatter showing all three at once. The 10 picks
render as larger star/diamond markers; hovering shows a "✓ selected" tag.
Click any rule_id in the table to highlight its dot across all four plots;
click any plot dot to scroll the table to that row.

## Decomposability caveat

The `decomp(?)` column (off by default) is marked YES for only 4 rules.
These were identified opportunistically during the judge-disagreement
fairness review, not via a systematic survey. **Treat this column as
exploratory.**

## File layout

```
selection/
├── build_selection_table.py        # backend: derives metrics, emits JSON+CSV
├── build_diagnostic_hands_data.py  # backend: per-rule strategy → hands
├── rule_kinds.yaml                 # 4 seeded decomposability tags
├── shortlist_final_10.json         # the locked slate (drives 10-rule highlight)
├── index.html                      # the walkthrough page
├── selection.css
├── selection.js
└── output/
    ├── selection_data.json         # consumed by selection.js
    ├── diagnostic_hands.json       # consumed by selection.js (diag panel)
    └── selection_table.csv         # raw data dump for spreadsheet inspection
```

## When to regenerate

Re-run `python -m selection.build_selection_table` after any change to:

- `rule-gallery/analysis/output_human/stage3_scored_final.csv`
- `rule-gallery/analysis/output_human/rule_summaries.csv`
- `rule-gallery/analysis/atlas/data/cache/equivalence_extension.json`
- `rule-gallery/analysis/atlas/data/cache/rule_pair_confusion.json`
- `card-games/self-explanation-experiment/rb_vs_ii_classification.csv`
- `selection/rule_kinds.yaml`

Re-run `python -m selection.build_diagnostic_hands_data` after any change
to the LLM-pilot results (`rule-gallery/analysis/llm_pilot/output/`) or
the frozen exemplars (`rule-gallery/frozen-exemplars.json`).

The page hot-reloads via browser refresh. `localStorage` is cleared once
on load if a `viewer_version` mismatch is detected (so collaborators see
the walkthrough defaults rather than stale picker-mode prefs).

## Companion docs

- Original picker design: `docs/plans/2026-05-08-rule-selection-cheatsheet-design.md`
- Walkthrough redesign (this revision): `docs/plans/2026-05-09-visualizer-collaborator-walkthrough-design.md`
- Walkthrough implementation plan: `docs/plans/2026-05-09-visualizer-collaborator-walkthrough-plan.md`
