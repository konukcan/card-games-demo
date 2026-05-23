# card-games-demo

Deployable subset of [konukcan/card-games](https://github.com/konukcan/card-games) for collaborator demos of the **self-explanation × program induction** experiment.

**Live URL:** https://konukcan.github.io/card-games-demo/

## What's here

| Path | Purpose |
|---|---|
| `index.html` | Landing page with links |
| `self-explanation-experiment/demo.html` | Experiment launcher (pick condition + strategy + run) |
| `self-explanation-experiment/index.html` | Experiment entry point |
| `rule-gallery/analysis/selection/` | Rule Slate Walkthrough — interactive 10-rule explorer with diagnostic hands |
| `rule-gallery/analysis/selection/vendor/plotly-2.35.2.min.js` | Vendored Plotly (no CDN dependency) |
| `rule-gallery/analysis/output_se_snapshots/se_2026_05_09_1dcc7741/` | The schema_v2 snapshot (10 rules × 4 strategies × 10 hands) |
| `js/` | Shared dependencies (CardEx, cyborg-hunter, error-handler) |
| `stim/` | Card images |

## Data saving

The experiment posts saved results through the Cloudflare Worker at `data-collector.vqzxjs6dcp.workers.dev/ingest`, which writes them to `konukcan/card-games-staging/results_gallery/se_<sessionId>_<timestamp>.json`. CORS already allows `https://konukcan.github.io`.

## Refresh procedure (when upstream changes)

This is a downstream **copy**, not a submodule. To refresh, mirror only the
files this repo carries — do **not** copy `build_*.py` regeneration scripts,
`__pycache__/`, `.pytest_cache/`, or tests. Those exist upstream but are
out of scope for the demo.

Assume `$SRC = ~/Documents/self-explanations-project/card-games` and
`$DST = ~/Documents/self-explanations-project/card-games-demo` (or whatever
your local paths are).

### When only the **Rule Slate Walkthrough** changed (`selection/`)

```bash
# 5 files. Always copy these as a set.
for f in index.html selection.css selection.js \
         output/selection_data.json \
         vendor/plotly-2.35.2.min.js; do
  cp -v "$SRC/rule-gallery/analysis/selection/$f" \
        "$DST/rule-gallery/analysis/selection/$f"
done
# Conditionally copy these only if they changed upstream:
#   output/diagnostic_hands.json (~7 MB; LLM-pilot driven)
#   output/selection_table.csv   (regenerable from selection_data.json)
#   README.md, rule_kinds.yaml, shortlist_final_10.json (rare changes)
```

### When the **SE experiment** code changed

Re-copy `self-explanation-experiment/` (drop `tests/`) and `js/` files
that the demo uses.

### When the **snapshot** changed (rare — only on new pilot rebuilds)

Rebuild via:

```bash
cd $SRC
python -m se_compare.build_snapshot_from_pilot \
  --shortlist  rule-gallery/analysis/llm_pilot/shortlist_final_10.json \
  --stimuli    rule-gallery/analysis/llm_pilot/output/llm_pilot_stimuli.json \
  --groups     rule-gallery/analysis/se_compare/groups_v1.json \
  --output-dir rule-gallery/analysis/output_se_snapshots/
```

Then copy the new `output_se_snapshots/<snapshot-id>/` directory to
`$DST/rule-gallery/analysis/output_se_snapshots/`.

### Always, at the end

```bash
cd $DST
git status                       # confirm only the expected files changed
git add -A
git diff --cached --stat         # sanity-check the file set
git commit -m "viewer: sync from upstream <upstream-commit-sha>"
git push origin main             # GH Pages redeploys on every push to main
```

### What to deliberately exclude

A naive `rsync` would sweep in things the demo shouldn't carry:

- `build_selection_table.py` + `build_diagnostic_hands_data.py` — the
  regeneration pipeline. Demo carries the pre-built outputs only.
- `__pycache__/`, `*.pyc` — gitignored both ends.
- `output/.gitkeep` — unnecessary; `output/` already has tracked files.
- Anything under `tests/`.
- The upstream `.claude/`, `.gitignore` rules specific to the source repo,
  or `docs/plans/`.

## Why a separate repo

The upstream `card-games` repo has analysis tooling, tests, model-compare code, etc. that don't belong on a public demo. This subset deploys cleanly to GH Pages and gives collaborators a single shareable URL.

## License & access

This repo mirrors public artifacts of the research. The Cloudflare Worker token used for data saving is server-side only and not exposed in the deployed site.

## Study #2 (rework, April 2026)

Self-explanation pilot — Spec A frontend rework. Lives at
`self-explanation-experiment-study2/` and `rule-gallery/gallery-save.js`
(shared with study #1, additive change).

**Live URLs (study #2):**

- Explain condition: <https://konukcan.github.io/card-games-demo/self-explanation-experiment-study2/index.html?study2=1&seSnapshot=se2_2026_05_21_57bc357a&condition=explain&ruleScope=all10>
- Silent condition:  <https://konukcan.github.io/card-games-demo/self-explanation-experiment-study2/index.html?study2=1&seSnapshot=se2_2026_05_21_57bc357a&condition=silent&ruleScope=all10>

**Data flow:** Same two-target cascade as study #1 (DataPipe → OSF +
Cloudflare Worker → card-games-staging GitHub). Study #2 writes to a
namespaced subdir to avoid mixing with study #1:

| Target | Study #1 path | Study #2 path |
|---|---|---|
| OSF (via DataPipe) | experiment `RWyWRsZqLgFu` | experiment `RWyWRsZqLgFu` (shared) |
| card-games-staging | `results_gallery/se_*.json` | `results_gallery/study2/se2_*.json` |

The `se_*` vs `se2_*` filename prefix, the dedicated `study2/` subdir,
and the `experiment: "se_study2"` tag inside each payload combine to
guarantee study #2 saves cannot collide with or overwrite study #1 saves.
