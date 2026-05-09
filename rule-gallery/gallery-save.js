// rule-gallery/gallery-save.js
// Standalone save cascade for the Rule Gallery calibration study.
// No jsPsych dependency — uses raw fetch calls to save JSON results.
//
// Save order (first success wins, but tries all remote targets):
//   1. DataPipe → OSF   (experiment ID: RWyWRsZqLgFu)
//   2. Cloudflare Worker → GitHub  (card-games-staging repo)
//   3. Browser download  (final fallback, always succeeds)
//
// Usage:
//   GallerySave.saveResults(filename, jsonString)
//   GallerySave.saveResults(filename, jsonString, { forceLocal: true })

(function () {
  "use strict";

  // ── Configuration ──
  // DataPipe experiment ID (shared with the main card-games experiment on OSF)
  const DATAPIPE_EXPERIMENT_ID = "RWyWRsZqLgFu";
  const DATAPIPE_URL = "https://pipe.jspsych.org/api/data/";

  // Cloudflare Worker that commits files to GitHub
  const WORKER_URL = "https://data-collector.vqzxjs6dcp.workers.dev/ingest";
  const GITHUB_OWNER = "konukcan";
  const GITHUB_REPO = "card-games-staging";
  const GITHUB_BRANCH = "main";
  const GITHUB_DIR = "results_gallery";

  // ── Helpers ──

  // Base64-encode a string (handles Unicode via encodeURIComponent trick)
  function b64(text) {
    return btoa(unescape(encodeURIComponent(text)));
  }

  // Trigger a browser download of a JSON string as a file
  function downloadBlob(filename, jsonString) {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Save targets ──

  // 1. DataPipe → OSF: POST the JSON data to the DataPipe API
  async function saveToDataPipe(filename, jsonString) {
    const res = await fetch(DATAPIPE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experimentID: DATAPIPE_EXPERIMENT_ID,
        filename: filename,
        data: jsonString
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`DataPipe ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = await res.json().catch(() => ({}));
    if (json.error) throw new Error("DataPipe: " + json.error);
    console.log("[GallerySave] DataPipe save OK");
    return true;
  }

  // 2. Cloudflare Worker → GitHub: POST base64-encoded content
  async function saveToWorker(filename, jsonString) {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        branch: GITHUB_BRANCH,
        dir: GITHUB_DIR,
        fileName: filename,
        content: b64(jsonString)
      })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Worker ${res.status}: ${text.slice(0, 200)}`);
    }
    console.log("[GallerySave] Cloudflare Worker save OK");
    return true;
  }

  // ── Main save function ──
  // Attempts all remote targets, falls back to download.
  // Options:
  //   forceLocal: true  — skip remote saves, go straight to download
  async function saveResults(filename, jsonString, options = {}) {
    const forceLocal = options.forceLocal || false;

    if (!forceLocal) {
      let dataPipeOk = false;
      let workerOk = false;

      // Try DataPipe
      try {
        await saveToDataPipe(filename, jsonString);
        dataPipeOk = true;
      } catch (e) {
        console.warn("[GallerySave] DataPipe failed:", e.message);
      }

      // Try Cloudflare Worker (always attempted, independent of DataPipe)
      try {
        await saveToWorker(filename, jsonString);
        workerOk = true;
      } catch (e) {
        console.warn("[GallerySave] Worker failed:", e.message);
      }

      if (dataPipeOk || workerOk) {
        return { dataPipe: dataPipeOk, worker: workerOk, download: false };
      }
    }

    // Final fallback: browser download
    downloadBlob(filename, jsonString);
    console.log("[GallerySave] Browser download triggered");
    return { dataPipe: false, worker: false, download: true };
  }

  // ── Export ──
  window.GallerySave = { saveResults };

})();
