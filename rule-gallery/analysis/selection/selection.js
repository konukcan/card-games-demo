// Rule-selection picker — vanilla JS, no framework.
//
// Loads selection_data.json + shortlist_final_10.json, renders a sortable
// read-only table with a default filter showing only the 10 selected rules,
// plus a static slate-at-a-glance panel and Plotly density/3D plots.
//
// Design choices that may not be obvious:
// - The 10 picks are static, loaded from shortlist_final_10.json into
//   SHORTLIST.ids. Rows in that set render a green ✓ pill in column 1.
//   togglePick is a no-op stub kept for back-compat with stale callers.
// - localStorage is no longer written for picks/rationales; legacy keys
//   are cleared on boot.
// - Decomposability column header has a `title` tooltip explaining the
//   exploratory-and-biased nature of those tags.

// ---------------------------------------------------------------------------
// Column registry
// ---------------------------------------------------------------------------
//
// [field, header, default-shown, formatter, optional-tooltip]
//
// Order is left-to-right table order. Default-shown columns appear unless
// the user toggles them off. Tooltip (5th element) becomes the `title` on
// the <th>. Formatter is called per cell value; null means "use plain text".

const COLUMNS = [
  ["selected",      "✓",         true,
    (_, row) => SHORTLIST.ids.has(row.rule_id)
      ? `<span class="selected-pill" title="In the final 10-rule slate">✓</span>`
      : ``,
    "Marks rules in the final 10-rule slate selected for the SE study. Read-only."],
  ["diag",          "👁",        true,  null,
    "Click to toggle the per-rule diagnostic-hands panel (top hands the empirical posterior is most split on, with optional model-side comparison)."],
  ["rule_id",       "rule_id",   true,
    v => `<a href="../atlas/output/rule/${v}.html" target="_blank"><code>${v}</code></a>`],
  ["rule_answer",   "answer",    true,
    v => v?.length > 60 ? v.slice(0, 60) + "…" : (v ?? "—")],
  ["rb_ii_class",   "RB/II",     false,
    fmtRbIi,
    "Empirical classification from rb_vs_ii_classification.csv. RB_CLEAR = participants articulated AND classified correctly. MIXED = partial articulation. II_CANDIDATE = correct classification but couldn't say why (Ashby's information-integration signature). TOO_HARD = neither signal."],
  ["difficulty",    "D",         false, v => v ?? "—",
    "Pre-assigned difficulty tier 1-4 from gallery_rules.py."],
  ["mcc_mean",      "mcc_mean",  true,  v => v == null ? "—" : v.toFixed(2),
    "Mean Matthews correlation across included responses on this rule. 0 = chance, 1 = perfect."],
  ["mcc_decile",    "mcc D",     true,  fmtDecile,
    "Decile (1-10) of this rule's mcc_mean within the 60-rule distribution. D10 = top decile."],
  ["mcc_std",       "mcc_std",   false, v => v == null ? "—" : v.toFixed(2),
    "Population std-dev of MCC across responses. Higher = more between-participant variance = more room for a manipulation to move the needle."],
  ["base_rate",     "base_rate", true,  v => v == null ? "—" : v.toFixed(4),
    "Probability that a uniformly-random hand satisfies the rule. Extreme base rates (very low or very high) make the rule harder by themselves."],
  ["base_rate_decile", "br D",   true,  fmtDecile,
    "Decile (1-10) of this rule's base_rate within the 60-rule distribution. D10 = highest base rate."],
  ["ast_complexity","AST",       false, v => v ?? "—",
    "AST node count of the ground-truth lambda (with referenced helpers spliced in). Higher = more structurally complex rule."],
  ["n_features",    "n_feat",    false, v => v ?? "—",
    "Number of distinct feature dimensions the rule uses (rank, suit, color, position, count, ...)."],
  ["features",      "features",  false, v => v ?? "—"],
  ["entropy_norm",  "H_norm",    true,  v => v == null ? "—" : v.toFixed(2),
    "Normalized Shannon entropy of participant-equivalence-class sizes (Method A). 0 = everyone gave the same answer; 1 = every response is its own class. Higher = more answer diversity."],
  ["H_decile",      "H D",       true,  fmtDecile,
    "Decile (1-10) of this rule's entropy_norm within the 60-rule distribution. D10 = most diverse answers."],
  ["eff_n_classes", "eff_N",     false, v => v == null ? "—" : v.toFixed(1),
    "Effective number of equivalence classes (exp of Shannon entropy)."],
  ["failure_dir",   "fail_dir",  false, fmtFailDir,
    "Direction of failures on this rule. mostly_overfit = lambdas too narrow. mostly_undergen = lambdas too broad. balanced = mixed. near_ceiling = rule is easy, few fails. low_signal = can't tell direction (< 5 directionally-classified fails)."],
  ["time_s_mean",   "time_s",    false, v => v == null ? "—" : v.toFixed(1),
    "Mean response time per gallery response, in seconds. (Pilot was rule-writeup only; this is an upper bound for SE-study trial pacing.)"],
  ["decomposable",  "decomp(?)", false, fmtDecomposable,
    "EXPLORATORY. YES for 4 rules confirmed in the judge-disagreement fairness review (straight5_same_suit, four_of_a_kind_adjacent, ap_step1_len3_adj_ordered, some_half_red_other_black). The rest are unmarked ('?'). Detection method is biased toward harder strata (II_CANDIDATE / TOO_HARD) because it requires partial articulation + low MCC. Don't sort or filter on this for primary selection decisions."],
  ["nearest_conf",  "near_conf", false, v => v == null ? "—" : `<code>${v}</code>`,
    "Top-1 nearest confusable rule from the cross-rule classification confusion matrix. Useful for spotting potential cluster overlaps in your slate."],
  ["n_eff",         "n_eff",     false, v => v ?? "—",
    "Number of included responses on this rule (post-exclusion)."],
  ["rationale",     "rationale", false,
    (_, row) => {
      const r = SHORTLIST.rationales[row.rule_id];
      return r ? `<em>${escapeHtml(r)}</em>` : `<span style="color:#999">—</span>`;
    },
    "Rationale recorded at slate-export time. Read-only; from shortlist_final_10.json."],
];

function fmtRbIi(v) {
  if (v == null) return "—";
  const cls = v.toLowerCase().replace(/_/g, "-");
  return `<span class="rb-pill ${cls}">${v}</span>`;
}

function fmtFailDir(v) {
  if (v == null) return "—";
  const cls = v.replace(/_/g, "-");
  return `<span class="fail-pill ${cls}">${v}</span>`;
}

function fmtDecomposable(v) {
  if (v === true)  return `<span title="Confirmed multi-component-failure pattern in pilot judge-disagreement review">Y</span>`;
  if (v === false) return `<span title="Manually tagged as not decomposable">N</span>`;
  return `<span style="color:#999" title="Not yet annotated. Detection method biased toward harder strata.">?</span>`;
}

function fmtDecile(v) {
  if (v == null) return "—";
  return `<span class="decile-pill d-${v}">D${v}</span>`;
}

// ---------------------------------------------------------------------------
// Diagnostic-hands strategy registry (flat 5-button strip)
// ---------------------------------------------------------------------------
//
// Short URL keys (C_flip_random, D_flip_exemplar) are exposed in the URL and
// button labels for ergonomics. They map to the long sub_condition keys used
// in diagnostic_hands.json via the `jsonKey` field. The 5th strategy ("model")
// maps to the top-level model_random strategy, not a sub_condition; its
// jsonKey is null and it carries the under-developed flag.
//
// One row per strategy. Adding a new strategy = add one row here; the derived
// constants (VALID_STRATEGIES, URL_STRATEGY_DEFAULT) and the consumers
// (buildStrategyStrip, buildLlmPilotSummary) read from this single source.

const STRATEGIES = [
  { key: "A_entropy",       label: "A · entropy",            jsonKey: "A_entropy",                  underDeveloped: false },
  { key: "B_misclass",      label: "B · misclass",           jsonKey: "B_misclass",                 underDeveloped: false },
  { key: "C_flip_random",   label: "C · flip-from-random",   jsonKey: "C_flip_from_random_winning", underDeveloped: false },
  { key: "D_flip_exemplar", label: "D · flip-from-exemplar", jsonKey: "D_flip_from_exemplars",      underDeveloped: false },
  { key: "model",           label: "model",                  jsonKey: null,                         underDeveloped: true  },
];
const DEFAULT_STRATEGY = "B_misclass";
const VALID_STRATEGIES = new Set(STRATEGIES.map(s => s.key));
const URL_STRATEGY_DEFAULT = (() => {
  const p = new URLSearchParams(window.location.search).get("strategy");
  return (p && VALID_STRATEGIES.has(p)) ? p : DEFAULT_STRATEGY;
})();

// ---------------------------------------------------------------------------
// Module state — kept module-level for simplicity (no framework, no router)
// ---------------------------------------------------------------------------

let DATA = null;                                                          // loaded JSON
let DIAG_DATA = null;                                                     // diagnostic_hands.json
let SHORTLIST = { ids: new Set(), rationales: {}, exportedAt: null };     // shortlist_final_10.json
let SORT = { field: "rule_id", asc: true };
let SHOW_ONLY_SELECTED = true;   // default-on: collaborators see the 10 picks first
let PICKS = new Set();          // legacy state, no longer mutated
let RATIONALES = {};             // legacy state, no longer mutated
let HIDDEN_COLS = new Set(JSON.parse(localStorage.getItem("rule_hidden_cols") || "[]"));

// Picker-mode keys are no longer written but may exist from old sessions.
// Clean them so collaborators have a fresh page.
try {
  localStorage.removeItem("rule_picks");
  localStorage.removeItem("rule_rationales");
} catch (_) { /* localStorage unavailable */ }

// One-time migration: clear stale hidden-cols / shown-cols prefs from
// picker-mode sessions, so collaborators see the walkthrough defaults
// rather than whatever they last toggled in the picker.
const VIEWER_VERSION = "v2-walkthrough-2026-05-09";
if (localStorage.getItem("viewer_version") !== VIEWER_VERSION) {
  localStorage.removeItem("rule_hidden_cols");
  localStorage.removeItem("rule_shown_cols");
  localStorage.setItem("viewer_version", VIEWER_VERSION);
  HIDDEN_COLS = new Set();
}
let DIAG_OPEN = new Set();                                                 // rule_ids currently expanded
let DIAG_STRATEGY_BY_RID = {};                                             // rid → strategy_key (one of VALID_STRATEGIES)

const RANK_TO_NAME = {
  "2": "TWO", "3": "THREE", "4": "FOUR", "5": "FIVE", "6": "SIX",
  "7": "SEVEN", "8": "EIGHT", "9": "NINE", "10": "TEN",
  "J": "JACK", "Q": "QUEEN", "K": "KING", "A": "ACE",
};
function cardImagePath(rank, suit) {
  return `cards/${RANK_TO_NAME[rank]}_OF_${suit}.png`;
}

// Columns that are user-toggleable. The selected column is fixed (always
// visible); the rationale column is default-off but user-revealable.
function isToggleable(field) { return field !== "selected"; }

function isColumnVisible(field, defaultShown) {
  if (HIDDEN_COLS.has(field)) return false;
  if (isToggleable(field)) {
    // localStorage may also explicitly INCLUDE a column the user enabled.
    const explicitlyShown = JSON.parse(localStorage.getItem("rule_shown_cols") || "[]");
    if (explicitlyShown.includes(field)) return true;
  }
  return defaultShown;
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

async function loadDiagnosticHands() {
  // Best-effort: don't fail the whole page if the diag file is missing.
  try {
    const r = await fetch("output/diagnostic_hands.json");
    if (!r.ok) {
      console.warn(`diagnostic_hands.json HTTP ${r.status} — diag toggle will be disabled`);
      return;
    }
    DIAG_DATA = await r.json();
  } catch (e) {
    console.warn("Failed to load diagnostic_hands.json", e);
  }
}

async function loadShortlist() {
  // Best-effort: don't fail the whole page if the shortlist file is missing.
  // Sibling of index.html (not under output/) — it's a curated artefact, not a build product.
  try {
    const r = await fetch("shortlist_final_10.json");
    if (!r.ok) {
      console.warn(`shortlist_final_10.json HTTP ${r.status} — selected-rules filter will be empty`);
      return;
    }
    const j = await r.json();
    const picks = Array.isArray(j.picks) ? j.picks : [];
    SHORTLIST.ids = new Set(picks.map(p => p.rule_id));
    SHORTLIST.rationales = Object.fromEntries(picks.map(p => [p.rule_id, p.rationale || ""]));
    SHORTLIST.exportedAt = j.exported_at || null;
    console.assert(SHORTLIST.ids.size === 10,
      `Expected 10 shortlisted rules, got ${SHORTLIST.ids.size}`);
  } catch (e) {
    console.warn("Failed to load shortlist_final_10.json", e);
  }
}

async function load() {
  const status = document.getElementById("data-status");
  try {
    const r = await fetch("output/selection_data.json");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    DATA = await r.json();
    await loadDiagnosticHands();
    await loadShortlist();

    const snap = DATA._snapshot || {};
    document.getElementById("snapshot-line").textContent =
      `Snapshot: generated ${snap.generated_at?.slice(0,19) || "?"} from commit ${snap.git_commit || "?"} · ` +
      `${snap.n_rb_clear || 0} RB_CLEAR · ${snap.n_mixed || 0} MIXED · ` +
      `${snap.n_ii_candidate || 0} II_CANDIDATE · ${snap.n_too_hard || 0} TOO_HARD · ` +
      `${snap.n_decomposable || 0} decomposable-tagged`;

    const total = (snap.n_rb_clear || 0) + (snap.n_mixed || 0) +
                  (snap.n_ii_candidate || 0) + (snap.n_too_hard || 0);
    if (snap.n_rows && total < snap.n_rows) {
      status.className = "warn";
      status.innerHTML = `Loaded ${snap.n_rows} rules. RB/II classification missing for ${snap.n_rows - total} rules.`;
    } else {
      status.className = "ok";
    }

    renderColumnToggles();
    render();
  } catch (e) {
    status.className = "error";
    status.innerHTML = `Failed to load <code>output/selection_data.json</code>: ${e.message}.<br>` +
      `Run <code>python -m selection.build_selection_table</code> from <code>rule-gallery/analysis/</code>, ` +
      `then serve via HTTP (file:// is blocked by modern browsers).`;
  }
}

// ---------------------------------------------------------------------------
// Render — full pass (header + body + coverage)
// ---------------------------------------------------------------------------

function render() {
  renderHeader();
  renderBody();
  renderSlateGlance();
}

function renderHeader() {
  const tr = document.getElementById("rule-thead-row");
  tr.innerHTML = "";
  for (const [field, header, defaultShown, , tooltip] of COLUMNS) {
    if (!isColumnVisible(field, defaultShown)) continue;
    const th = document.createElement("th");
    th.dataset.field = field;
    if (tooltip) th.title = tooltip;
    const arrow = SORT.field === field ? (SORT.asc ? " ▲" : " ▼") : "";
    th.textContent = header + arrow;
    th.onclick = () => {
      // Don't sort on selected or rationale columns — neither has meaningful order
      if (field === "selected" || field === "rationale") return;
      SORT = { field, asc: SORT.field === field ? !SORT.asc : true };
      render();
    };
    tr.appendChild(th);
  }
}

function renderBody() {
  const tbody = document.getElementById("rule-tbody");
  tbody.innerHTML = "";

  // Sort first, then filter — so the picked-but-hidden recovery rows appear
  // in their natural sort position rather than at the bottom.
  const sorted = [...DATA.rows].sort((a, b) => {
    const av = a[SORT.field], bv = b[SORT.field];
    // Nulls sort to the bottom in either direction
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av === bv) return 0;
    return SORT.asc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  for (const row of sorted) {
    if (SHOW_ONLY_SELECTED && !SHORTLIST.ids.has(row.rule_id)) {
      continue;
    }

    const tr = document.createElement("tr");
    tr.dataset.rid = row.rule_id;
    if (SHORTLIST.ids.has(row.rule_id)) {
      tr.classList.add("selected-row");
    }

    for (const [field, , defaultShown, formatter] of COLUMNS) {
      if (!isColumnVisible(field, defaultShown)) continue;
      const td = document.createElement("td");

      if (field === "diag") {
        const btn = document.createElement("button");
        btn.className = "diag-toggle" + (DIAG_OPEN.has(row.rule_id) ? " open" : "");
        btn.type = "button";
        btn.title = "Show top diagnostic hands for this rule";
        btn.textContent = DIAG_OPEN.has(row.rule_id) ? "▼" : "👁";
        btn.onclick = (e) => { e.stopPropagation(); toggleDiagPanel(row.rule_id); };
        // If diag data unavailable for this rule, dim the button.
        if (!DIAG_DATA || !DIAG_DATA.rules?.[row.rule_id]) {
          btn.disabled = true;
          btn.title = "No diagnostic-hands data for this rule";
        }
        td.appendChild(btn);
      } else {
        td.innerHTML = formatter ? formatter(row[field], row) : (row[field] ?? "—");
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);

    // Insert the diagnostic-hands expansion row beneath if open.
    if (DIAG_OPEN.has(row.rule_id) && DIAG_DATA?.rules?.[row.rule_id]) {
      tbody.appendChild(buildDiagRow(row.rule_id));
    }
  }
}

// ---------------------------------------------------------------------------
// Diagnostic-hands expansion panel
// ---------------------------------------------------------------------------

function toggleDiagPanel(rid) {
  if (DIAG_OPEN.has(rid)) {
    DIAG_OPEN.delete(rid);
  } else {
    DIAG_OPEN.add(rid);
  }
  renderBody();
}

function setDiagStrategy(rid, key) {
  DIAG_STRATEGY_BY_RID[rid] = key;
  renderBody();
}

function _visibleColumnCount() {
  return COLUMNS.filter(([f, , dShown]) => isColumnVisible(f, dShown)).length;
}

function buildDiagRow(rid) {
  const tr = document.createElement("tr");
  tr.className = "diag-detail";
  tr.dataset.rid = rid;
  const td = document.createElement("td");
  td.colSpan = _visibleColumnCount();

  const ruleEntry = DIAG_DATA.rules[rid] || {};
  const llmStrat = ruleEntry.strategies?.llm_pilot;
  const modelStrat = ruleEntry.strategies?.model_random;

  // Bail out only if neither LLM-pilot nor model-random data is present;
  // empirical is intentionally dropped from the UI.
  if (!llmStrat && !modelStrat) {
    td.innerHTML = `<div class="diag-panel"><em>No diagnostic-hands data available for ${rid}.</em></div>`;
    tr.appendChild(td);
    return tr;
  }

  const panel = document.createElement("div");
  panel.className = "diag-panel";

  // Source gallery — the 6 winning hands the participant saw.
  // Renders at the top so the inspector can simulate the participant's view
  // before drilling into the diagnostic-hand strategies.
  if (Array.isArray(ruleEntry.exemplars) && ruleEntry.exemplars.length) {
    panel.appendChild(buildExemplarGallery(rid, ruleEntry.exemplars));
  }

  panel.appendChild(buildStrategyStrip(rid, ruleEntry));

  td.appendChild(panel);
  tr.appendChild(td);
  return tr;
}

function buildLlmPilotSummary(rid, llmStrat, currentKey) {
  // Compact 4-row Pro/Flash accuracy table; clicking a row also switches
  // the strategy strip below to that strategy. Only LLM-pilot strategies
  // (jsonKey non-null) appear here — the model strategy is excluded.
  const tbl = document.createElement("table");
  tbl.className = "diag-llm-summary-table";
  tbl.innerHTML = `<tr><th></th><th>Pro acc</th><th>Flash acc</th></tr>`;
  for (const strat of STRATEGIES.filter(s => s.jsonKey)) {
    const sc = llmStrat.sub_conditions?.[strat.jsonKey];
    if (!sc) continue;
    const proAcc = sc.summary_by_model?.pro?.accuracy;
    const flAcc = sc.summary_by_model?.flash?.accuracy;
    const tr = document.createElement("tr");
    tr.className = (strat.key === currentKey ? "active-sub" : "");
    tr.onclick = () => setDiagStrategy(rid, strat.key);
    tr.innerHTML =
      `<td><strong>${strat.label}</strong></td>` +
      `<td>${proAcc != null ? proAcc.toFixed(2) : "—"}</td>` +
      `<td>${flAcc != null ? flAcc.toFixed(2) : "—"}</td>`;
    tbl.appendChild(tr);
  }
  return tbl;
}

function buildStrategyStrip(rid, ruleEntry) {
  const wrap = document.createElement("div");
  wrap.className = "diag-strategy-flat";

  const llmStrat = ruleEntry.strategies?.llm_pilot;
  const modelStrat = ruleEntry.strategies?.model_random;
  const subs = llmStrat?.sub_conditions || {};

  // Resolve which sub-condition data each strategy maps to.
  // For LLM-pilot strategies, look up by jsonKey in llm_pilot.sub_conditions.
  // For the model strategy (jsonKey=null), use the top-level model_random
  // entry only if it's marked available. Sub-conditions can be missing for
  // individual rules (e.g., D_flip_exemplar can fail to generate edits);
  // those buttons get disabled.
  function dataFor(strat) {
    if (strat.jsonKey) return subs[strat.jsonKey];
    return modelStrat?.available ? modelStrat : null;
  }

  // Per-rule active strategy. URL_STRATEGY_DEFAULT is the global default
  // unless the collaborator has clicked a strategy on this row.
  const currentKey = DIAG_STRATEGY_BY_RID[rid] || URL_STRATEGY_DEFAULT;

  // Optional Pro/Flash accuracy summary across the four LLM-pilot strategies.
  if (llmStrat) {
    wrap.appendChild(buildLlmPilotSummary(rid, llmStrat, currentKey));
  }

  // Strategy strip — 5 buttons.
  const strip = document.createElement("div");
  strip.className = "diag-strategy-buttons";
  let activeStrat = null;
  for (const strat of STRATEGIES) {
    const sc = dataFor(strat);
    if (strat.key === currentKey) activeStrat = strat;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "diag-strategy"
      + (strat.key === currentKey ? " active" : "")
      + (sc ? "" : " unavailable")
      + (strat.underDeveloped ? " under-developed" : "");
    btn.textContent = strat.label;
    if (strat.underDeveloped) {
      btn.title = "Model-based adversarial-hand picker. Under-developed; "
                + "not used in the final experiment.";
    }
    if (!sc) btn.disabled = true;
    btn.onclick = () => setDiagStrategy(rid, strat.key);
    strip.appendChild(btn);
  }
  wrap.appendChild(strip);

  // Active strategy's hands grid.
  const sc = activeStrat ? dataFor(activeStrat) : null;
  const hands = document.createElement("div");
  hands.className = "diag-hands-grid";
  if (!sc) {
    hands.innerHTML = `<div class="diag-meta"><em>Strategy "${currentKey}" `
      + `is not available for this rule.</em></div>`;
  } else if (currentKey === "model") {
    for (const h of (sc.top_hands || [])) hands.appendChild(buildDiagHand(h));
  } else {
    for (const h of (sc.hands || [])) hands.appendChild(buildLlmPilotHand(h));
  }
  wrap.appendChild(hands);

  return wrap;
}

function buildExemplarGallery(rid, exemplars) {
  const wrap = document.createElement("details");
  wrap.className = "diag-exemplar-gallery";
  wrap.open = true;
  const summary = document.createElement("summary");
  summary.innerHTML = `<strong>Source gallery</strong> — `
    + `the ${exemplars.length} winning hands the participant saw `
    + `(click to collapse)`;
  wrap.appendChild(summary);

  const grid = document.createElement("div");
  grid.className = "diag-exemplar-grid";
  for (let i = 0; i < exemplars.length; i++) {
    const row = document.createElement("div");
    row.className = "diag-exemplar-row";
    const lbl = document.createElement("div");
    lbl.className = "diag-exemplar-label";
    lbl.textContent = `Winning hand ${i + 1}`;
    row.appendChild(lbl);
    const cards = document.createElement("div");
    cards.className = "diag-hand-cards";
    for (const c of exemplars[i]) {
      const img = document.createElement("img");
      img.src = cardImagePath(c.rank, c.suit);
      img.alt = `${c.rank} of ${c.suit}`;
      img.title = img.alt;
      cards.appendChild(img);
    }
    row.appendChild(cards);
    grid.appendChild(row);
  }
  wrap.appendChild(grid);
  return wrap;
}

function buildLlmPilotHand(h) {
  const card = document.createElement("div");
  card.className = "diag-hand diag-pilot-hand";

  // Cards row
  const cardsRow = document.createElement("div");
  cardsRow.className = "diag-hand-cards";
  for (const c of (h.hand || [])) {
    const img = document.createElement("img");
    img.src = cardImagePath(c.rank, c.suit);
    img.alt = `${c.rank} of ${c.suit}`;
    img.title = img.alt;
    cardsRow.appendChild(img);
  }
  card.appendChild(cardsRow);

  // GT + LLM responses pill row
  const respRow = document.createElement("div");
  respRow.className = "diag-pilot-responses";
  const gtSpan = document.createElement("span");
  gtSpan.className = "pilot-pill pilot-gt pilot-" + h.ground_truth.toLowerCase();
  gtSpan.textContent = `GT: ${h.ground_truth}`;
  respRow.appendChild(gtSpan);
  for (const model of ["pro", "flash"]) {
    const r = (h.llm_responses || {})[model];
    const span = document.createElement("span");
    if (!r) {
      span.className = "pilot-pill pilot-empty";
      span.textContent = `${model}: —`;
    } else {
      const correct = r.correct;
      span.className = "pilot-pill pilot-" + r.label.toLowerCase()
                     + (correct ? " correct" : " wrong");
      span.textContent = `${model}: ${r.label}` + (correct ? " ✓" : " ✗");
    }
    respRow.appendChild(span);
  }
  card.appendChild(respRow);

  // Meta line
  const meta = document.createElement("div");
  meta.className = "diag-hand-meta";
  const parts = [];
  if (h.p_accept_emp != null) parts.push(`p_emp=${h.p_accept_emp.toFixed(3)}`);
  if (h.entropy_bits != null) parts.push(`H=${h.entropy_bits.toFixed(3)}`);
  if (h.misclass_score != null) parts.push(`misclass=${h.misclass_score.toFixed(3)}`);
  if (h.edit_depth != null) parts.push(`edit_depth=${h.edit_depth}`);
  if (h.edit_description) parts.push(escapeHtml(h.edit_description));
  meta.textContent = parts.join(" · ");
  card.appendChild(meta);

  // Optional source-hand reveal for C/D
  if (h.source_hand) {
    const det = document.createElement("details");
    det.className = "diag-pilot-source";
    const sum = document.createElement("summary");
    sum.textContent = "source hand (before flip)";
    det.appendChild(sum);
    const srcRow = document.createElement("div");
    srcRow.className = "diag-hand-cards";
    for (const c of h.source_hand) {
      const img = document.createElement("img");
      img.src = cardImagePath(c.rank, c.suit);
      img.alt = `${c.rank} of ${c.suit}`;
      srcRow.appendChild(img);
    }
    det.appendChild(srcRow);
    card.appendChild(det);
  }

  return card;
}

function buildDiagHand(h) {
  const card = document.createElement("div");
  card.className = "diag-hand";

  // Cards row
  const cardsRow = document.createElement("div");
  cardsRow.className = "diag-hand-cards";
  for (const c of (h.hand || [])) {
    const img = document.createElement("img");
    img.src = cardImagePath(c.rank, c.suit);
    img.alt = `${c.rank} of ${c.suit}`;
    img.title = img.alt;
    cardsRow.appendChild(img);
  }
  card.appendChild(cardsRow);

  // Meta line
  const meta = document.createElement("div");
  meta.className = "diag-hand-meta";
  const parts = [];
  if (h.p_accept != null) parts.push(`p_accept=${h.p_accept.toFixed(3)}`);
  if (h.entropy_bits != null) parts.push(`H=${h.entropy_bits.toFixed(3)} bits`);
  if (h.ground_truth != null) parts.push(`gt=${h.ground_truth ? "Y" : "N"}`);
  meta.textContent = parts.join(" · ");
  card.appendChild(meta);

  // Splitters (collapsed by default)
  if ((h.splitting_minority?.length || 0) || (h.splitting_majority?.length || 0)
      || (h.top_hypotheses_votes?.length || 0)) {
    const det = document.createElement("details");
    det.className = "diag-hand-splitters";
    const summary = document.createElement("summary");
    summary.textContent = "splitting hypotheses";
    det.appendChild(summary);

    if (h.splitting_majority?.length) {
      const sec = document.createElement("div");
      sec.className = "splitters-section";
      sec.innerHTML = "<strong>majority side</strong>";
      for (const v of h.splitting_majority) {
        const li = document.createElement("div");
        li.className = "splitter-row";
        li.innerHTML = `<span class="splitter-prob">p=${(v.probability ?? 0).toFixed(3)}</span> ` +
                       `<span class="splitter-n">(n=${v.n_participants ?? "?"})</span> ` +
                       `<code>${escapeHtml(v.canonical_program || "")}</code>`;
        sec.appendChild(li);
      }
      det.appendChild(sec);
    }
    if (h.splitting_minority?.length) {
      const sec = document.createElement("div");
      sec.className = "splitters-section";
      sec.innerHTML = "<strong>minority side</strong>";
      for (const v of h.splitting_minority) {
        const li = document.createElement("div");
        li.className = "splitter-row";
        li.innerHTML = `<span class="splitter-prob">p=${(v.probability ?? 0).toFixed(3)}</span> ` +
                       `<span class="splitter-n">(n=${v.n_participants ?? "?"})</span> ` +
                       `<code>${escapeHtml(v.canonical_program || "")}</code>`;
        sec.appendChild(li);
      }
      det.appendChild(sec);
    }
    if (h.top_hypotheses_votes?.length) {
      const sec = document.createElement("div");
      sec.className = "splitters-section";
      sec.innerHTML = "<strong>model voters</strong>";
      for (const v of h.top_hypotheses_votes) {
        const li = document.createElement("div");
        li.className = "splitter-row";
        const acc = v.accepts_hand ? "✓" : "✗";
        li.innerHTML = `<span class="splitter-prob">p=${(v.prob ?? 0).toFixed(3)}</span> ` +
                       `<span class="splitter-n">${acc}</span> ` +
                       `<code>${escapeHtml(v.program || "")}</code>`;
        sec.appendChild(li);
      }
      det.appendChild(sec);
    }
    card.appendChild(det);
  }
  return card;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Slate-at-a-glance panel — static summary of the 10 picks.
// ---------------------------------------------------------------------------

function renderSlateGlance() {
  const panel = document.getElementById("slate-glance-panel");
  if (!panel || !DATA) return;
  const picks = DATA.rows.filter(r => SHORTLIST.ids.has(r.rule_id));
  if (picks.length === 0) {
    panel.innerHTML = "";
    return;
  }

  // Difficulty mix
  const diffCounts = {};
  for (const r of picks) {
    const d = r.difficulty ?? "?";
    diffCounts[d] = (diffCounts[d] || 0) + 1;
  }
  const diffStr = Object.entries(diffCounts)
    .sort()
    .map(([d, n]) => `D${d}×${n}`)
    .join(" · ");

  // RB/II distribution
  const rbCounts = {};
  for (const r of picks) {
    const c = r.rb_ii_class || "—";
    rbCounts[c] = (rbCounts[c] || 0) + 1;
  }
  const rbStr = Object.entries(rbCounts)
    .map(([c, n]) => `${c}×${n}`)
    .join(" · ");

  // Feature coverage
  const featSet = new Set();
  for (const r of picks) {
    for (const f of (r.features || "").split(",").map(s => s.trim()).filter(Boolean)) {
      featSet.add(f);
    }
  }
  const featStr = [...featSet].sort().join(" · ") || "—";

  // MCC range across picks
  const mccs = picks.map(r => r.mcc_mean).filter(v => v != null);
  const mccStr = mccs.length
    ? `${Math.min(...mccs).toFixed(2)} – ${Math.max(...mccs).toFixed(2)}`
    : "—";

  // Mean response time per gallery response (upper bound for trial pacing)
  const times = picks.map(r => r.time_s_mean).filter(v => v != null);
  const timeStr = times.length
    ? `${(times.reduce((a, b) => a + b) / times.length).toFixed(1)}s mean`
    : "—";

  panel.innerHTML = `
    <div class="slate-glance">
      <h2>Selected slate at a glance — ${picks.length} rules</h2>
      <div class="glance-row"><strong>Difficulty:</strong> ${diffStr}</div>
      <div class="glance-row"><strong>RB / II class:</strong> ${rbStr}</div>
      <div class="glance-row"><strong>Features used:</strong> ${featStr}</div>
      <div class="glance-row"><strong>MCC range:</strong> ${mccStr}</div>
      <div class="glance-row"><strong>Mean response time (gallery pilot):</strong> ${timeStr}</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Mutations + persistence
// ---------------------------------------------------------------------------

function togglePick(_rid) {
  // no-op: picks are now read-only from shortlist_final_10.json
}

// ---------------------------------------------------------------------------
// Column toggle UI
// ---------------------------------------------------------------------------

function renderColumnToggles() {
  const list = document.getElementById("column-toggle-list");
  list.innerHTML = "";
  for (const [field, header, defaultShown] of COLUMNS) {
    if (!isToggleable(field)) continue;
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = isColumnVisible(field, defaultShown);
    cb.onchange = () => toggleColumn(field, cb.checked, defaultShown);
    label.appendChild(cb);
    label.appendChild(document.createTextNode(` ${header}`));
    list.appendChild(label);
  }
}

function toggleColumn(field, shown, defaultShown) {
  // Two persisted sets: hidden-cols (overrides default-shown=true to off)
  // and shown-cols (overrides default-shown=false to on). Either gets
  // pruned when the user puts the column back to its default state.
  const hiddenSet = new Set(JSON.parse(localStorage.getItem("rule_hidden_cols") || "[]"));
  const shownSet = new Set(JSON.parse(localStorage.getItem("rule_shown_cols") || "[]"));
  if (shown) {
    hiddenSet.delete(field);
    if (!defaultShown) shownSet.add(field);
  } else {
    shownSet.delete(field);
    if (defaultShown) hiddenSet.add(field);
  }
  localStorage.setItem("rule_hidden_cols", JSON.stringify([...hiddenSet]));
  localStorage.setItem("rule_shown_cols", JSON.stringify([...shownSet]));
  HIDDEN_COLS = hiddenSet;
  render();
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

const filterBtn = document.getElementById("toggle-selected-filter");
if (filterBtn) {
  filterBtn.textContent = SHOW_ONLY_SELECTED
    ? "Show all 60 rules"
    : "Show only the 10 selected rules";
  filterBtn.onclick = () => {
    SHOW_ONLY_SELECTED = !SHOW_ONLY_SELECTED;
    filterBtn.textContent = SHOW_ONLY_SELECTED
      ? "Show all 60 rules"
      : "Show only the 10 selected rules";
    renderBody();
  };
}

// ---------------------------------------------------------------------------
// Plots — Plotly density panel + 3D scatter
// ---------------------------------------------------------------------------
//
// Three small density plots show the marginal distribution of each metric
// across the 60 rules, with each rule rendered as a hoverable dot at its
// own value (jittered vertically to avoid stacking). A 3D scatter shows
// the same 60 rules in joint (mcc × H × log10 base_rate) space.
//
// Click handlers in any plot scroll the table to the corresponding row
// and apply a flash-highlight CSS animation. The table row's rule_id
// link triggers the reverse: highlights the dot across all four plots
// via Plotly.restyle of marker color/size arrays.

// Color palette matching the .rb-pill CSS classes — keeps the legend
// consistent across HTML and Plotly. Order matches plotly default
// scale-position so the legend pill colors and the dot colors agree.
const RB_COLORS = {
  RB_CLEAR:     "#14532d",  // matches .rb-pill.rb-clear text color
  MIXED:        "#78350f",
  II_CANDIDATE: "#7c2d12",
  TOO_HARD:     "#525252",
};

// Default marker size; bumped to highlight a single rule across all plots.
const MARKER_SIZE_DEFAULT = 8;
// Size for the 10 shortlisted picks — sits between DEFAULT and HIGHLIGHT so
// click-to-flash still produces a visible bump on selected dots.
const MARKER_SIZE_SELECTED = 12;
const MARKER_SIZE_HIGHLIGHT = 14;

// Module state for cross-plot highlight: which rule_id is currently
// emphasized everywhere. Reset on a 2-second timer matching the table-row
// flash animation, so the picker doesn't drift into a "stuck-highlighted"
// state on repeated clicks.
let HIGHLIGHTED_RID = null;
let HIGHLIGHT_TIMEOUT = null;

// Plot div IDs. Kept as constants so highlightInPlots() can iterate.
const PLOT_IDS = ["density-mcc", "density-H", "density-br", "scatter-3d"];

function plotsAvailable() {
  return typeof Plotly !== "undefined" && DATA && DATA.rows && DATA.rows.length;
}

function buildDensityTraces(rows, valueField, jitterSeed) {
  // Two traces: a histogram bar (the density backdrop) and a scatter of
  // dot-per-rule (the interactive identifier).
  const valid = rows.filter(r => r[valueField] != null && !Number.isNaN(r[valueField]));
  const xs = valid.map(r => r[valueField]);
  const colors = valid.map(r => RB_COLORS[r.rb_ii_class] || "#999");
  // Per-point size and symbol so the 10 shortlisted picks stand out as
  // larger stars while the rest stay as default-size circles.
  const sizes   = valid.map(r =>
    SHORTLIST.ids.has(r.rule_id) ? MARKER_SIZE_SELECTED : MARKER_SIZE_DEFAULT);
  const symbols = valid.map(r =>
    SHORTLIST.ids.has(r.rule_id) ? "star" : "circle");
  // Deterministic jitter based on rule_id hash so re-renders don't shuffle dots.
  const ys = valid.map((r, i) =>
    1 + 0.7 * (Math.sin((jitterSeed + i * 12.9898 + r.rule_id.length) * 78.233) * 0.5));

  const customdata = valid.map(r => ({
    rule_id: r.rule_id,
    answer: r.rule_answer,
    rb_ii: r.rb_ii_class,
    mcc: r.mcc_mean,
    H: r.entropy_norm,
    br: r.base_rate,
    mcc_d: r.mcc_decile,
    H_d: r.H_decile,
    br_d: r.base_rate_decile,
    // Pre-computed string so the hovertemplate can splice it in without
    // needing if/else (which Plotly's template syntax doesn't support).
    selectedTag: SHORTLIST.ids.has(r.rule_id) ? "<br>✓ selected" : "",
  }));

  const histogram = {
    type: "histogram",
    x: xs,
    nbinsx: 15,
    marker: { color: "#cbd5e1", line: { color: "#94a3b8", width: 0.5 } },
    yaxis: "y2",
    opacity: 0.5,
    hoverinfo: "skip",
    showlegend: false,
  };

  const scatter = {
    type: "scatter",
    mode: "markers",
    x: xs,
    y: ys,
    customdata,
    marker: { color: colors, size: sizes, symbol: symbols, line: { color: "#fff", width: 0.5 } },
    hovertemplate:
      "<b>%{customdata.rule_id}</b><br>" +
      "RB/II: %{customdata.rb_ii}<br>" +
      "mcc: %{customdata.mcc:.2f} (D%{customdata.mcc_d}) · " +
      "H: %{customdata.H:.2f} (D%{customdata.H_d}) · " +
      "br: %{customdata.br:.4f} (D%{customdata.br_d})" +
      "%{customdata.selectedTag}" +
      "<extra></extra>",
    showlegend: false,
  };

  return { histogram, scatter, ruleIds: valid.map(r => r.rule_id) };
}

function renderDensityPlot(divId, valueField, title, xAxisType = "linear", xRange = null) {
  const { histogram, scatter, ruleIds } =
    buildDensityTraces(DATA.rows, valueField, divId.length);

  const layout = {
    title: { text: title, font: { size: 13 } },
    margin: { l: 30, r: 10, t: 30, b: 30 },
    xaxis: { title: "", type: xAxisType, range: xRange },
    yaxis: { showticklabels: false, range: [0.5, 2], zeroline: false },
    yaxis2: {
      overlaying: "y", side: "right", showticklabels: false,
      showgrid: false, zeroline: false,
    },
    bargap: 0.1,
    hovermode: "closest",
    plot_bgcolor: "#fafafa",
  };

  Plotly.newPlot(divId, [histogram, scatter], layout,
    { responsive: true, displayModeBar: false });

  // Wire click on the dot trace (trace index 1, since histogram is 0).
  document.getElementById(divId).on("plotly_click", (event) => {
    const pt = event.points[0];
    if (!pt || !pt.customdata) return;
    handlePlotClick(pt.customdata.rule_id);
  });

  return ruleIds;
}

function render3DScatter() {
  const valid = DATA.rows.filter(r =>
    r.mcc_mean != null && r.entropy_norm != null && r.base_rate > 0);
  const customdata = valid.map(r => ({
    rule_id: r.rule_id,
    rb_ii: r.rb_ii_class,
    mcc: r.mcc_mean,
    H: r.entropy_norm,
    br: r.base_rate,
    diff: r.difficulty,
  }));

  // Group rules by RB/II class so the 3D scatter has a real legend (one
  // trace per class). makes color-by-class readable + clickable in legend.
  const classes = ["RB_CLEAR", "MIXED", "II_CANDIDATE", "TOO_HARD"];
  const traces = classes.map(cls => {
    const rows = valid.filter(r => r.rb_ii_class === cls);
    return {
      type: "scatter3d",
      mode: "markers",
      name: cls,
      x: rows.map(r => r.mcc_mean),
      y: rows.map(r => r.entropy_norm),
      z: rows.map(r => Math.log10(r.base_rate)),
      customdata: rows.map(r => ({
        rule_id: r.rule_id, rb_ii: r.rb_ii_class,
        mcc: r.mcc_mean, H: r.entropy_norm, br: r.base_rate, diff: r.difficulty,
        mcc_d: r.mcc_decile, H_d: r.H_decile, br_d: r.base_rate_decile,
        // Pre-computed string for the hovertemplate (Plotly templates have no
        // if/else). Empty string for non-picks renders nothing.
        selectedTag: SHORTLIST.ids.has(r.rule_id) ? "<br>✓ selected" : "",
      })),
      marker: {
        color: RB_COLORS[cls],
        // Bigger marker for the 10 picks. Plotly's 3D scatter does NOT
        // support "star"; "diamond" is the closest visually-distinct option.
        size: rows.map(r =>
          SHORTLIST.ids.has(r.rule_id) ? MARKER_SIZE_SELECTED : MARKER_SIZE_DEFAULT),
        symbol: rows.map(r =>
          SHORTLIST.ids.has(r.rule_id) ? "diamond" : "circle"),
        line: { color: "#fff", width: 0.5 },
      },
      hovertemplate:
        "<b>%{customdata.rule_id}</b><br>" +
        "RB/II: %{customdata.rb_ii} · D%{customdata.diff}<br>" +
        "mcc: %{customdata.mcc:.2f} (D%{customdata.mcc_d}) · " +
        "H: %{customdata.H:.2f} (D%{customdata.H_d})<br>" +
        "base_rate: %{customdata.br:.4f} (D%{customdata.br_d})" +
        "%{customdata.selectedTag}" +
        "<extra></extra>",
    };
  });

  const layout = {
    margin: { l: 0, r: 0, t: 0, b: 0 },
    scene: {
      xaxis: { title: "mcc_mean", range: [0, 1] },
      yaxis: { title: "entropy_norm (H)", range: [0, 1] },
      zaxis: { title: "log10(base_rate)" },
      // Default camera angle that puts the "high on all 3" corner up-and-right
      camera: { eye: { x: 1.6, y: 1.4, z: 0.9 } },
    },
    legend: { orientation: "h", y: -0.05 },
    hovermode: "closest",
  };

  Plotly.newPlot("scatter-3d", traces, layout,
    { responsive: true, displayModeBar: true });

  document.getElementById("scatter-3d").on("plotly_click", (event) => {
    const pt = event.points[0];
    if (!pt || !pt.customdata) return;
    handlePlotClick(pt.customdata.rule_id);
  });
}

function renderAllPlots() {
  if (!plotsAvailable()) return;
  // x ranges chosen by the data: mcc/H bounded [0,1]; base_rate log scale
  // from min to max of nonzero values.
  renderDensityPlot("density-mcc", "mcc_mean", "mcc_mean (linear)", "linear", [0, 1]);
  renderDensityPlot("density-H",   "entropy_norm", "H_norm (linear)", "linear", [0, 1]);

  // base_rate gets log scale because values span 4 orders of magnitude
  // (0.0001 to 0.6). Linear would compress 90% of rules into a tiny strip
  // at the left edge.
  renderDensityPlot("density-br",  "base_rate", "base_rate (log10)", "log");

  render3DScatter();
}

// ---------------------------------------------------------------------------
// Cross-plot click sync
// ---------------------------------------------------------------------------

function handlePlotClick(rid) {
  // Click came from a plot. Scroll the table to the corresponding row,
  // flash-highlight it, and emphasize the dot across all plots too.
  const tr = document.querySelector(`tr[data-rid="${rid}"]`);
  if (tr) {
    tr.scrollIntoView({ behavior: "smooth", block: "center" });
    tr.classList.remove("flash-from-plot");
    void tr.offsetWidth;  // force restart of CSS animation
    tr.classList.add("flash-from-plot");
  }
  highlightInPlots(rid);
}

function highlightInPlots(rid) {
  // For every plot, set the marker.size array so the highlighted rule has
  // a bigger dot than everything else. Plotly.restyle is the lightweight
  // way to update marker arrays without re-rendering the whole plot.
  HIGHLIGHTED_RID = rid;
  if (HIGHLIGHT_TIMEOUT) clearTimeout(HIGHLIGHT_TIMEOUT);

  for (const id of PLOT_IDS) {
    const div = document.getElementById(id);
    if (!div || !div.data) continue;

    // Density plots: trace 0 = histogram (skip), trace 1 = scatter dots.
    // 3D scatter: 4 traces, one per RB/II class.
    div.data.forEach((trace, i) => {
      if (trace.type === "histogram") return;  // skip backdrop
      if (!trace.customdata) return;
      const sizes = trace.customdata.map(cd =>
        cd.rule_id === rid ? MARKER_SIZE_HIGHLIGHT
        : SHORTLIST.ids.has(cd.rule_id) ? MARKER_SIZE_SELECTED
        : MARKER_SIZE_DEFAULT);
      Plotly.restyle(id, { "marker.size": [sizes] }, [i]);
    });
  }

  // Clear the emphasis after the table-row flash animation finishes,
  // so the page returns to its baseline (with selected rules still
  // rendered larger than the rest).
  HIGHLIGHT_TIMEOUT = setTimeout(() => {
    HIGHLIGHTED_RID = null;
    for (const id of PLOT_IDS) {
      const div = document.getElementById(id);
      if (!div || !div.data) continue;
      div.data.forEach((trace, i) => {
        if (trace.type === "histogram") return;
        if (!trace.customdata) return;
        const sizes = trace.customdata.map(cd =>
          SHORTLIST.ids.has(cd.rule_id) ? MARKER_SIZE_SELECTED : MARKER_SIZE_DEFAULT);
        Plotly.restyle(id, { "marker.size": [sizes] }, [i]);
      });
    }
  }, 1800);
}

// Wire click on the table's rule_id <a> tags to highlight in plots.
// Uses event delegation since rows are re-rendered on sort/filter changes.
document.getElementById("rule-table").addEventListener("click", (e) => {
  // Only a pure click on the rule_id link triggers highlight; cmd/ctrl-click
  // (open in new tab) should not. The link's default behavior to open the
  // atlas page in a new tab still fires.
  const a = e.target.closest("a[href*='atlas/output/rule/']");
  if (!a || e.metaKey || e.ctrlKey) return;
  const tr = a.closest("tr");
  if (tr && tr.dataset.rid) highlightInPlots(tr.dataset.rid);
});

// ---------------------------------------------------------------------------
// Hook plots into the load() flow
// ---------------------------------------------------------------------------
//
// load() is already defined above and runs render() once the JSON arrives.
// We extend the boot sequence with one extra call that renders the plots
// AFTER the table is drawn, so the user sees the table immediately and
// the plots populate as Plotly initializes.

const _origLoad = load;
load = async function patchedLoad() {
  await _origLoad();
  // Defer to next tick so the DOM has the table painted before Plotly
  // measures container sizes.
  setTimeout(() => {
    if (plotsAvailable()) renderAllPlots();
  }, 0);
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

load();
