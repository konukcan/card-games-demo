# vendored/

Files that the study #2 experiment ships with its OWN copy of, rather than
sharing the parent-repo's version under `js/`.

## Why vendoring exists

When card-games-demo serves both study #1 and study #2 in parallel, study #1's
`js/cyborg-hunter.js` is a different (older, larger) build of cyborg-hunter
than the slim version study #2 was developed against. Sharing the file would
risk silently regressing study #1's integrity monitor (if we upgraded shared
copy to study #2's version) OR breaking study #2 (if we left card-games-demo's
larger version in place and it had API drift). Vendoring side-steps the issue:
study #2 loads its own copy under `self-explanation-experiment-study2/vendored/`
and study #1 keeps loading the shared `js/cyborg-hunter.js`.

## Files

- `cyborg-hunter.js` — slim build matching study #2's known-good API. Mirror
  of the source repo's `js/cyborg-hunter.js` at the time of deployment. Do not
  edit in place; update by re-copying from the upstream `js/` dir.
