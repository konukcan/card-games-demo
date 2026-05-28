// self-explanation-experiment/sequences-loader.js
// sequences-loader.js — Load + assign per-participant rule-presentation
// sequences for SE Study #2.
//
// Exposes window.SequencesLoader with:
//   - load(): Promise<sequencesData>   — fetch + parse sequences_v1.json
//   - sequenceIndex(pid): Promise<int> — SHA-256(pid) mod 8, returns 0-7
//   - sequenceFor(pid, data): Promise<seqObj> — full sequence for this PID
//
// Why SHA-256: standard browser API (crypto.subtle), uniform distribution
// over output space, deterministic per PID. Reload → same index.
//
// Why first 4 bytes as uint32: SHA-256 returns 32 bytes; we just need
// enough entropy for a mod-8 selection. First 4 bytes are sufficient
// and easy to extract.

(function () {
  "use strict";

  var SEQUENCES_URL = "self-explanation-experiment-study2/sequences_v1.json";

  var _cachedData = null;

  async function _sha256Hex(input) {
    var buf = new TextEncoder().encode(input);
    var hash = await crypto.subtle.digest("SHA-256", buf);
    var arr = new Uint8Array(hash);
    return Array.from(arr).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  // sequenceIndex: returns 0-7 deterministically from PID.
  async function sequenceIndex(prolificPid) {
    var buf = new TextEncoder().encode(prolificPid);
    var hash = await crypto.subtle.digest("SHA-256", buf);
    var view = new DataView(hash);
    var u32 = view.getUint32(0, false);  // big-endian, first 4 bytes
    return u32 % 8;
  }

  async function load() {
    if (_cachedData) return _cachedData;
    var res = await fetch(SEQUENCES_URL);
    if (!res.ok) {
      throw new Error("sequences_v1.json fetch failed: " + res.status);
    }
    // Read raw bytes so we can compute the file SHA-256 — the same hash
    // `shasum -a 256 sequences_v1.json` produces. The pre-reg + payload
    // both reference this value; verifiers can confirm with vanilla shasum.
    var bytes = await res.arrayBuffer();
    var hashBuf = await crypto.subtle.digest("SHA-256", bytes);
    var fileSha256 = Array.from(new Uint8Array(hashBuf))
      .map(function (b) { return b.toString(16).padStart(2, "0"); })
      .join("");
    var data = JSON.parse(new TextDecoder().decode(bytes));
    if (data.version !== "v1") {
      throw new Error("Expected sequences_v1.json version=v1, got " + data.version);
    }
    if (!Array.isArray(data.sequences) || data.sequences.length !== 8) {
      throw new Error("sequences_v1.json must have 8 sequences");
    }
    // Override the embedded compact-canonical self-hash with the file
    // hash so downstream readers (curriculum.js → payload metadata) get
    // the value that matches shasum.
    data.sha256 = fileSha256;
    _cachedData = data;
    return data;
  }

  async function sequenceFor(prolificPid, data) {
    var d = data || await load();
    var idx = await sequenceIndex(prolificPid);
    return d.sequences[idx];
  }

  window.SequencesLoader = {
    load: load,
    sequenceIndex: sequenceIndex,
    sequenceFor: sequenceFor,
    _sha256Hex: _sha256Hex,  // exposed for exemplar-shuffle.js to reuse
  };
})();
