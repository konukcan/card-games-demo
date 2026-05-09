# card-games-demo

Deployable subset of [konukcan/card-games](https://github.com/konukcan/card-games) for collaborator demos of the **self-explanation × program induction** experiment.

**Live URL:** https://konukcan.github.io/card-games-demo/

## What's here

| Path | Purpose |
|---|---|
| `index.html` | Landing page with links |
| `self-explanation-experiment/demo.html` | Experiment launcher (pick condition + strategy + run) |
| `self-explanation-experiment/index.html` | Experiment entry point |
| `rule-gallery/analysis/selection/` | Rule Explorer — per-rule diagnostic-hands viewer |
| `rule-gallery/analysis/output_se_snapshots/se_2026_05_09_1dcc7741/` | The schema_v2 snapshot (10 rules × 4 strategies × 10 hands) |
| `js/` | Shared dependencies (CardEx, cyborg-hunter, error-handler) |
| `stim/` | Card images |

## Data saving

The experiment posts saved results through the Cloudflare Worker at `data-collector.vqzxjs6dcp.workers.dev/ingest`, which writes them to `konukcan/card-games-staging/results_gallery/se_<sessionId>_<timestamp>.json`. CORS already allows `https://konukcan.github.io`.

## Refresh procedure (when stimuli or experiment code changes)

This is a downstream copy. To refresh:

1. Pull the latest from upstream `card-games`.
2. Rebuild the snapshot if needed:
   ```
   python -m se_compare.build_snapshot_from_pilot \
     --shortlist  rule-gallery/analysis/llm_pilot/shortlist_final_10.json \
     --stimuli    rule-gallery/analysis/llm_pilot/output/llm_pilot_stimuli.json \
     --groups     rule-gallery/analysis/se_compare/groups_v1.json \
     --output-dir rule-gallery/analysis/output_se_snapshots/
   ```
3. Re-copy the changed files into this repo's working tree (mirror the layout above).
4. `git push`. GH Pages redeploys on every push to `main`.

## Why a separate repo

The upstream `card-games` repo has analysis tooling, tests, model-compare code, etc. that don't belong on a public demo. This subset deploys cleanly to GH Pages and gives collaborators a single shareable URL.

## License & access

This repo mirrors public artifacts of the research. The Cloudflare Worker token used for data saving is server-side only and not exposed in the deployed site.
