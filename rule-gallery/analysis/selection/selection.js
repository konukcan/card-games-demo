// Rule-selection picker — vanilla JS, no framework.
//
// Loads selection_data.json (built by build_selection_table.py), renders
// a sortable filterable table, tracks picks + rationales in localStorage,
// shows a live tiered coverage panel, exports the slate with a metric
// snapshot for replay-ability.
//
// Design choices that may not be obvious:
// - togglePick mutates DOM surgically (toggle one row's class) instead of
//   full re-render, so checkbox focus survives clicks. Full render runs
//   only on sort change or filter change.
// - localStorage holds two keys: rule_picks (Set as JSON array) and
//   rule_rationales (object keyed by rule_id). Cleared together via the
//   "Clear all" button (with confirm).
// - Picked rows hidden by the band filter still render (with .picked-but-hidden
//   class) so you can uncheck them without disabling the filter first.
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
  ["pick",          "✓",         true,  null],
  ["diag",          "👁",        true,  null,
    "Click to toggle the per-rule diagnostic-hands panel (top hands the empirical posterior is most split on, with optional model-side comparison)."],
  ["rule_id",       "rule_id",   true,
    v => `<a href="../atlas/output/rule/${v}.html" target="_blank"><code>${v}</code></a>`],
  ["rule_answer",   "answer",    true,
    v => v?.length > 60 ? v.slice(0, 60) + "…" : (v ?? "—")],
  ["rb_ii_class",   "RB/II",     true,
    fmtRbIi,
    "Empirical classification from rb_vs_ii_classification.csv. RB_CLEAR = participants articulated AND classified correctly. MIXED = partial articulation. II_CANDIDATE = correct classification but couldn't say why (Ashby's information-integration signature). TOO_HARD = neither signal."],
  ["difficulty",    "D",         true,  v => v ?? "—",
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
  ["failure_dir",   "fail_dir",  true,  fmtFailDir,
    "Direction of failures on this rule. mostly_overfit = lambdas too narrow. mostly_undergen = lambdas too broad. balanced = mixed. near_ceiling = rule is easy, few fails. low_signal = can't tell direction (< 5 directionally-classified fails)."],
  ["time_s_mean",   "time_s",    true,  v => v == null ? "—" : v.toFixed(1),
    "Mean response time per gallery response, in seconds. (Pilot was rule-writeup only; this is an upper bound for SE-study trial pacing.)"],
  ["decomposable",  "decomp(?)", true,  fmtDecomposable,
    "EXPLORATORY. YES for 4 rules confirmed in the judge-disagreement fairness review (straight5_same_suit, four_of_a_kind_adjacent, ap_step1_len3_adj_ordered, some_half_red_other_black). The rest are unmarked ('?'). Detection method is biased toward harder strata (II_CANDIDATE / TOO_HARD) because it requires partial articulation + low MCC. Don't sort or filter on this for primary selection decisions."],
  ["nearest_conf",  "near_conf", false, v => v == null ? "—" : `<code>${v}</code>`,
    "Top-1 nearest confusable rule from the cross-rule classification confusion matrix. Useful for spotting potential cluster overlaps in your slate."],
  ["n_eff",         "n_eff",     false, v => v ?? "—",
    "Number of included responses on this rule (post-exclusion)."],
  ["rationale",     "rationale", true,  null,
    "Free-text reason this rule is in your slate. Persisted across reloads. Exported with the slate."],
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
// Module state — kept module-level for simplicity (no framework, no router)
// ---------------------------------------------------------------------------

let DATA = null;                                                          // loaded JSON
let DIAG_DATA = null;                                                     // diagnostic_hands.json
let SORT = { field: "rule_id", asc: true };
let HIDE_OUT_OF_BAND = false;
let PICKS = new Set(JSON.parse(localStorage.getItem("rule_picks") || "[]"));
let RATIONALES = JSON.parse(localStorage.getItem("rule_rationales") || "{}");
let HIDDEN_COLS = new Set(JSON.parse(localStorage.getItem("rule_hidden_cols") || "[]"));
let DIAG_OPEN = new Set();                                                 // rule_ids currently expanded
let DIAG_STRATEGY_BY_RID = {};                                             // rid → strategy_key
let DIAG_SUBCOND_BY_RID = {};                                              // rid → sub_condition_key (for llm_pilot)

const RANK_TO_NAME = {
  "2": "TWO", "3": "THREE", "4": "FOUR", "5": "FIVE", "6": "SIX",
  "7": "SEVEN", "8": "EIGHT", "9": "NINE", "10": "TEN",
  "J": "JACK", "Q": "QUEEN", "K": "KING", "A": "ACE",
};
function cardImagePath(rank, suit) {
  return `cards/${RANK_TO_NAME[rank]}_OF_${suit}.png`;
}

// Columns that are user-toggleable (everything except pick + rationale,
// which are core to the picker's job).
function isToggleable(field) { return field !== "pick" && field !== "rationale"; }

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

async function load() {
  const status = document.getElementById("data-status");
  try {
    const r = await fetch("output/selection_data.json");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    DATA = await r.json();
    await loadDiagnosticHands();

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
  renderCoverage();
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
      // Don't sort on pick or rationale columns — neither has meaningful order
      if (field === "pick" || field === "rationale") return;
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
    const isPicked = PICKS.has(row.rule_id);
    const inBand = row.mcc_mean != null && row.mcc_mean >= 0.2 && row.mcc_mean <= 0.8;
    const hiddenByFilter = HIDE_OUT_OF_BAND && !inBand;

    // Picked rows always render, but with a "picked-but-hidden" class if
    // the band filter would normally hide them. Unpicked + hidden rows skip.
    if (hiddenByFilter && !isPicked) continue;

    const tr = document.createElement("tr");
    tr.dataset.rid = row.rule_id;
    if (isPicked) tr.classList.add("picked");
    if (hiddenByFilter && isPicked) tr.classList.add("picked-but-hidden");

    for (const [field, , defaultShown, formatter] of COLUMNS) {
      if (!isColumnVisible(field, defaultShown)) continue;
      const td = document.createElement("td");

      if (field === "pick") {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = isPicked;
        cb.onchange = () => togglePick(row.rule_id);
        td.appendChild(cb);
      } else if (field === "diag") {
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
      } else if (field === "rationale") {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "rationale-input";
        input.value = RATIONALES[row.rule_id] || "";
        input.placeholder = "why this rule…";
        input.onchange = e => setRationale(row.rule_id, e.target.value);
        td.appendChild(input);
      } else {
        td.innerHTML = formatter ? formatter(row[field]) : (row[field] ?? "—");
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

function setDiagSubCond(rid, key) {
  DIAG_SUBCOND_BY_RID[rid] = key;
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
  const strategies = ruleEntry.strategies || {};
  const strategyKeys = Object.keys(strategies);
  if (strategyKeys.length === 0) {
    td.innerHTML = `<div class="diag-panel"><em>No diagnostic-hands data available for ${rid}.</em></div>`;
    tr.appendChild(td);
    return tr;
  }

  // Default to "empirical" if available, else first available, else first.
  const defaultKey = strategies.empirical?.available
    ? "empirical"
    : (strategyKeys.find(k => strategies[k]?.available) || strategyKeys[0]);
  const currentKey = DIAG_STRATEGY_BY_RID[rid] || defaultKey;
  const current = strategies[currentKey] || {};

  // ---- Header / tab strip ----
  const panel = document.createElement("div");
  panel.className = "diag-panel";

  // Source gallery — the 6 winning hands the participant saw.
  // Renders at the top so the inspector can simulate the participant's view
  // before drilling into the diagnostic-hand strategies.
  if (Array.isArray(ruleEntry.exemplars) && ruleEntry.exemplars.length) {
    panel.appendChild(buildExemplarGallery(rid, ruleEntry.exemplars));
  }

  const tabBar = document.createElement("div");
  tabBar.className = "diag-tabs";
  for (const key of strategyKeys) {
    const s = strategies[key];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "diag-tab" + (key === currentKey ? " active" : "")
                  + (s?.available ? "" : " unavailable");
    let label = s?.label || key;
    if (s?.available) {
      label += ` · ${s.top_hands?.length || 0} hands`;
      if (key === "empirical" && s.n_classes != null) {
        label += ` · ${s.n_classes} classes / ${s.n_participants_used || "?"} participants`;
      }
    } else {
      label += " · unavailable";
    }
    btn.textContent = label;
    btn.onclick = () => setDiagStrategy(rid, key);
    tabBar.appendChild(btn);
  }
  panel.appendChild(tabBar);

  // ---- Strategy meta line / unavailability note ----
  const meta = document.createElement("div");
  meta.className = "diag-meta";
  if (!current.available && current.note) {
    meta.innerHTML = `<em>${escapeHtml(current.note)}</em>`;
    panel.appendChild(meta);
    td.appendChild(panel);
    tr.appendChild(td);
    return tr;
  }
  const metaParts = [];
  if (current.yield_rate != null) {
    metaParts.push(`yield_rate=${current.yield_rate.toFixed(3)}`);
  }
  if (current.fraction_ambiguous != null) {
    metaParts.push(`fraction_ambiguous=${current.fraction_ambiguous.toFixed(3)}`);
  }
  if (current.fraction_high_confidence != null) {
    metaParts.push(`fraction_high_conf=${current.fraction_high_confidence.toFixed(3)}`);
  }
  if (current.strategy_internal) {
    metaParts.push(`router→${current.strategy_internal}`);
  }
  if (metaParts.length) {
    meta.textContent = metaParts.join(" · ");
    panel.appendChild(meta);
  }

  // ---- llm_pilot path: nested sub-condition selector + per-condition hands ----
  if (current.sub_conditions) {
    panel.appendChild(buildLlmPilotPanel(rid, current));
    td.appendChild(panel);
    tr.appendChild(td);
    return tr;
  }

  // ---- Default path: flat hands grid ----
  const grid = document.createElement("div");
  grid.className = "diag-hands-grid";
  for (const h of (current.top_hands || [])) {
    grid.appendChild(buildDiagHand(h));
  }
  panel.appendChild(grid);

  td.appendChild(panel);
  tr.appendChild(td);
  return tr;
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

function buildLlmPilotPanel(rid, strategy) {
  const wrap = document.createElement("div");
  wrap.className = "diag-llm-pilot";

  const subKeys = Object.keys(strategy.sub_conditions);
  const defaultSub = subKeys.includes("B_misclass") ? "B_misclass" : subKeys[0];
  const currentSub = DIAG_SUBCOND_BY_RID[rid] || defaultSub;

  // Summary row across sub-conditions (Pro/Flash accuracy per condition)
  const summary = document.createElement("div");
  summary.className = "diag-llm-summary";
  const summTable = document.createElement("table");
  summTable.className = "diag-llm-summary-table";
  const headRow = document.createElement("tr");
  headRow.innerHTML = `<th></th><th>Pro acc</th><th>Flash acc</th>`;
  summTable.appendChild(headRow);
  for (const sk of subKeys) {
    const sc = strategy.sub_conditions[sk];
    const proAcc = sc.summary_by_model?.pro?.accuracy;
    const flAcc = sc.summary_by_model?.flash?.accuracy;
    const tr = document.createElement("tr");
    tr.className = (sk === currentSub ? "active-sub" : "");
    tr.onclick = () => setDiagSubCond(rid, sk);
    tr.innerHTML =
      `<td><strong>${escapeHtml(sc.label || sk)}</strong></td>` +
      `<td>${proAcc != null ? proAcc.toFixed(2) : "—"}</td>` +
      `<td>${flAcc != null ? flAcc.toFixed(2) : "—"}</td>`;
    summTable.appendChild(tr);
  }
  summary.appendChild(summTable);
  wrap.appendChild(summary);

  // Sub-condition tab strip
  const subTabs = document.createElement("div");
  subTabs.className = "diag-subtabs";
  for (const sk of subKeys) {
    const sc = strategy.sub_conditions[sk];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "diag-subtab" + (sk === currentSub ? " active" : "");
    btn.textContent = (sc.label || sk);
    btn.onclick = () => setDiagSubCond(rid, sk);
    subTabs.appendChild(btn);
  }
  wrap.appendChild(subTabs);

  // Active sub-condition: hands grid with LLM responses
  const sc = strategy.sub_conditions[currentSub];
  const grid = document.createElement("div");
  grid.className = "diag-hands-grid";
  for (const h of (sc.hands || [])) {
    grid.appendChild(buildLlmPilotHand(h));
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
// Coverage panel — tiered (4 glance + 5 details-on-demand)
// ---------------------------------------------------------------------------

function renderCoverage() {
  const panel = document.getElementById("coverage-panel");
  if (!DATA) return;
  const picked = DATA.rows.filter(r => PICKS.has(r.rule_id));
  const target = 10;

  // ---- Glance tier (always visible) ----

  const nRationaled = picked.filter(r => RATIONALES[r.rule_id]?.trim()).length;
  const countLine =
    `<strong>${picked.length} / ${target} picked` +
    (picked.length ? ` · ${nRationaled} / ${picked.length} with rationale` : "") +
    `</strong>`;

  const dHist = {1: 0, 2: 0, 3: 0, 4: 0};
  picked.forEach(r => { if (r.difficulty in dHist) dHist[r.difficulty]++; });
  const allD = Object.values(dHist).every(c => c > 0);
  const dStr = `D: {${Object.entries(dHist).map(([d, c]) => `${d}:${c}`).join(", ")}}` +
               (allD ? ` <span class="coverage-ok">✓</span>` : "");

  const rbHist = {RB_CLEAR: 0, MIXED: 0, II_CANDIDATE: 0, TOO_HARD: 0};
  picked.forEach(r => { if (r.rb_ii_class && r.rb_ii_class in rbHist) rbHist[r.rb_ii_class]++; });
  const rbStr =
    `RB:${rbHist.RB_CLEAR} · MIX:${rbHist.MIXED} · ` +
    `II:${rbHist.II_CANDIDATE} · HARD:${rbHist.TOO_HARD}`;

  const mccs = picked.map(r => r.mcc_mean).filter(v => v != null);
  const mccRange = mccs.length
    ? `MCC: [${Math.min(...mccs).toFixed(2)}, ${Math.max(...mccs).toFixed(2)}]`
    : "MCC: —";
  const outside = mccs.filter(v => v < 0.2 || v > 0.8).length;
  const mccWarn = outside ? ` <span class="coverage-warn">⚠ ${outside} outside [0.2, 0.8]</span>` : "";

  // ---- Details tier (collapsed by default) ----

  const allFeatures = new Set();
  DATA.rows.forEach(r =>
    (r.features || "").split(",").map(s => s.trim()).filter(Boolean)
      .forEach(f => allFeatures.add(f)));
  const pickedFeatures = new Set();
  picked.forEach(r =>
    (r.features || "").split(",").map(s => s.trim()).filter(Boolean)
      .forEach(f => pickedFeatures.add(f)));
  const featPills = [...allFeatures].sort()
    .map(f => `<span class="pill${pickedFeatures.has(f) ? " lit" : ""}">${f}</span>`)
    .join("");

  const fHist = {};
  picked.forEach(r => { if (r.failure_dir) fHist[r.failure_dir] = (fHist[r.failure_dir] || 0) + 1; });
  const fStr = `failure: {${Object.entries(fHist).map(([k, v]) => `${k}:${v}`).join(", ") || "—"}}`;

  const timeSum = picked.reduce((s, r) => s + (r.time_s_mean || 0) * 6, 0);
  const timeStr = `est. total: ${(timeSum / 60).toFixed(1)} min ` +
                  `<span style="color:#999">(× 6 trials/rule, gallery-pilot timing — upper bound)</span>`;

  const decompYes = picked.filter(r => r.decomposable === true).length;
  const decompUnknown = picked.filter(r => r.decomposable == null).length;
  const decompStr = `decomposable (exploratory): ${decompYes} Y · ${decompUnknown} ?`;

  // Mutual confusable pairs (both rules pick each other as nearest)
  const pickedIds = new Set(picked.map(r => r.rule_id));
  const mutualPairs = [];
  for (const r of picked) {
    if (r.nearest_conf && pickedIds.has(r.nearest_conf)) {
      const other = DATA.rows.find(x => x.rule_id === r.nearest_conf);
      if (other && other.nearest_conf === r.rule_id && r.rule_id < other.rule_id) {
        mutualPairs.push([r.rule_id, other.rule_id]);
      }
    }
  }
  const confStr = mutualPairs.length
    ? `<span class="coverage-warn">mutual confusables: ${mutualPairs.map(p => p.join("↔")).join(", ")}</span>`
    : `mutual confusables: none`;

  panel.innerHTML = `
    <div class="glance-tier">
      <div>${countLine}</div>
      <div>${dStr} · ${rbStr} · ${mccRange}${mccWarn}</div>
    </div>
    <details class="details-tier">
      <summary>more details (features, failure modes, time, decomposable, confusables)</summary>
      <div>features: ${featPills || "—"}</div>
      <div>${fStr}</div>
      <div>${timeStr}</div>
      <div>${decompStr}</div>
      <div>${confStr}</div>
    </details>
  `;
}

// ---------------------------------------------------------------------------
// Mutations + persistence
// ---------------------------------------------------------------------------

function togglePick(rid) {
  if (PICKS.has(rid)) PICKS.delete(rid); else PICKS.add(rid);
  localStorage.setItem("rule_picks", JSON.stringify([...PICKS]));
  // Targeted DOM update — full re-render loses checkbox focus on shift-click etc.
  // Coverage panel always recomputes since pick set changed.
  const tr = document.querySelector(`tr[data-rid="${rid}"]`);
  if (tr) {
    tr.classList.toggle("picked");
    // If the band filter is on AND this is now an out-of-band picked row,
    // it needs the picked-but-hidden marker.
    if (HIDE_OUT_OF_BAND) {
      const row = DATA.rows.find(r => r.rule_id === rid);
      const inBand = row?.mcc_mean != null && row.mcc_mean >= 0.2 && row.mcc_mean <= 0.8;
      if (PICKS.has(rid) && !inBand) tr.classList.add("picked-but-hidden");
      else tr.classList.remove("picked-but-hidden");
    }
  }
  renderCoverage();
}

function setRationale(rid, text) {
  if (text.trim()) RATIONALES[rid] = text;
  else delete RATIONALES[rid];
  localStorage.setItem("rule_rationales", JSON.stringify(RATIONALES));
  renderCoverage();  // updates the "X with rationale" counter
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

document.getElementById("clear-picks").onclick = () => {
  if (!confirm("Clear all picks AND rationales? This cannot be undone.")) return;
  PICKS = new Set();
  RATIONALES = {};
  localStorage.removeItem("rule_picks");
  localStorage.removeItem("rule_rationales");
  render();
};

document.getElementById("export-picks").onclick = () => {
  const picked = DATA.rows.filter(r => PICKS.has(r.rule_id));
  const exported = {
    exported_at: new Date().toISOString(),
    snapshot: DATA._snapshot,  // metric snapshot at selection time
    n_picked: picked.length,
    target: 10,
    picks: picked.map(r => ({
      rule_id: r.rule_id,
      rationale: RATIONALES[r.rule_id] || "",
      metrics: { ...r },  // full row embedded for replay
    })),
  };
  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `rule_picks_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
};

document.getElementById("toggle-band-filter").onclick = () => {
  HIDE_OUT_OF_BAND = !HIDE_OUT_OF_BAND;
  document.getElementById("toggle-band-filter").textContent =
    HIDE_OUT_OF_BAND ? "Show all rules" : "Hide rules outside [0.2, 0.8] mcc band";
  renderBody();
};

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
  const sizes  = valid.map(r => MARKER_SIZE_DEFAULT);
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
    marker: { color: colors, size: sizes, line: { color: "#fff", width: 0.5 } },
    hovertemplate:
      "<b>%{customdata.rule_id}</b><br>" +
      "RB/II: %{customdata.rb_ii}<br>" +
      "mcc: %{customdata.mcc:.2f} (D%{customdata.mcc_d}) · " +
      "H: %{customdata.H:.2f} (D%{customdata.H_d}) · " +
      "br: %{customdata.br:.4f} (D%{customdata.br_d})" +
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
      })),
      marker: {
        color: RB_COLORS[cls],
        size: rows.map(_ => MARKER_SIZE_DEFAULT),
        line: { color: "#fff", width: 0.5 },
      },
      hovertemplate:
        "<b>%{customdata.rule_id}</b><br>" +
        "RB/II: %{customdata.rb_ii} · D%{customdata.diff}<br>" +
        "mcc: %{customdata.mcc:.2f} (D%{customdata.mcc_d}) · " +
        "H: %{customdata.H:.2f} (D%{customdata.H_d})<br>" +
        "base_rate: %{customdata.br:.4f} (D%{customdata.br_d})" +
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
        cd.rule_id === rid ? MARKER_SIZE_HIGHLIGHT : MARKER_SIZE_DEFAULT);
      Plotly.restyle(id, { "marker.size": [sizes] }, [i]);
    });
  }

  // Clear the emphasis after the table-row flash animation finishes,
  // so the page returns to a "no rule emphasized" steady state.
  HIGHLIGHT_TIMEOUT = setTimeout(() => {
    HIGHLIGHTED_RID = null;
    for (const id of PLOT_IDS) {
      const div = document.getElementById(id);
      if (!div || !div.data) continue;
      div.data.forEach((trace, i) => {
        if (trace.type === "histogram") return;
        if (!trace.customdata) return;
        const sizes = trace.customdata.map(_ => MARKER_SIZE_DEFAULT);
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
