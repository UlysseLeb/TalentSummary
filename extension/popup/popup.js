const API_URL = "http://localhost:8000";
const MAX_SIZE_MB = 25;
const ALLOWED_EXT = [".mp3", ".wav", ".m4a", ".flac", ".ogg"];

let selectedFile = null;

// ── Éléments DOM ──────────────────────────────────────────────────────────────
const stateUpload     = document.getElementById("state-upload");
const stateProcessing = document.getElementById("state-processing");
const stateResult     = document.getElementById("state-result");

const dropZone        = document.getElementById("drop-zone");
const fileInput       = document.getElementById("file-input");
const fileSelected    = document.getElementById("file-selected");
const fileNameEl      = document.getElementById("file-name");
const fileSizeEl      = document.getElementById("file-size");
const btnAnalyze      = document.getElementById("btn-analyze");
const uploadError     = document.getElementById("upload-error");

const processingMsg   = document.getElementById("processing-msg");
const stepTranscript  = document.getElementById("step-transcription");
const stepAnalysis    = document.getElementById("step-analysis");
const stepReport      = document.getElementById("step-report");

const btnReset        = document.getElementById("btn-reset");

// ── Navigation entre états ────────────────────────────────────────────────────
function showState(name) {
  stateUpload.classList.toggle("hidden", name !== "upload");
  stateProcessing.classList.toggle("hidden", name !== "processing");
  stateResult.classList.toggle("hidden", name !== "result");
}

// ── Gestion du fichier ────────────────────────────────────────────────────────
function formatSize(bytes) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file) {
  const ext = "." + file.name.split(".").pop().toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    throw new Error(`Format non supporté (${ext}). Utilisez : ${ALLOWED_EXT.join(", ")}`);
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    throw new Error(`Fichier trop grand (${formatSize(file.size)}). Maximum : ${MAX_SIZE_MB} MB`);
  }
}

function handleFile(file) {
  uploadError.classList.add("hidden");
  try {
    validateFile(file);
    selectedFile = file;
    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = formatSize(file.size);
    fileSelected.classList.remove("hidden");
    btnAnalyze.classList.remove("hidden");
    btnAnalyze.disabled = false;
  } catch (err) {
    selectedFile = null;
    fileSelected.classList.add("hidden");
    btnAnalyze.classList.add("hidden");
    showError(err.message);
  }
}

function showError(msg) {
  uploadError.textContent = msg;
  uploadError.classList.remove("hidden");
}

// ── Drag & drop ───────────────────────────────────────────────────────────────
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

// ── Analyse ───────────────────────────────────────────────────────────────────
btnAnalyze.addEventListener("click", async () => {
  if (!selectedFile) return;

  showState("processing");
  setStep(1);

  const formData = new FormData();
  formData.append("audio", selectedFile);

  try {
    const response = await fetch(`${API_URL}/process`, {
      method: "POST",
      body: formData,
    });

    setStep(2);

    if (!response.ok) {
      let detail = "Erreur serveur";
      try {
        const err = await response.json();
        detail = err.detail || detail;
      } catch (_) {}
      throw new Error(`${response.status} — ${detail}`);
    }

    const data = await response.json();
    setStep(3);

    await sleep(400);
    renderReport(data.rapport, data.transcription);
    showState("result");
  } catch (err) {
    showState("upload");
    showError(err.message);
  }
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function setStep(n) {
  [stepTranscript, stepAnalysis, stepReport].forEach((el, i) => {
    el.classList.remove("step-active", "step-done");
    if (i + 1 < n) el.classList.add("step-done");
    if (i + 1 === n) el.classList.add("step-active");
  });

  const msgs = [
    "Transcription en cours...",
    "Analyse IA en cours...",
    "Génération du rapport...",
  ];
  processingMsg.textContent = msgs[n - 1] || msgs[0];
}

// ── Rendu du rapport ──────────────────────────────────────────────────────────
function renderReport(rapport, transcription) {
  const score = rapport.score_global ?? 0;
  const scoreBadge = document.getElementById("score-badge");
  scoreBadge.textContent = `${score}/10`;
  scoreBadge.className = "score-badge " + (score >= 7 ? "score-high" : score >= 4 ? "score-mid" : "score-low");

  const verdictBadge = document.getElementById("verdict-badge");
  verdictBadge.textContent = rapport.verdict ?? "";
  const verdictKey = (rapport.verdict ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-");
  verdictBadge.className = "verdict-badge verdict-" + verdictKey;

  document.getElementById("candidate-name").textContent = rapport.nom_candidat ?? "";
  document.getElementById("candidate-role").textContent = rapport.poste_vise ?? "";
  document.getElementById("resume").textContent = rapport.resume_executif ?? "";
  document.getElementById("justification").textContent = rapport.justification_verdict ?? "";

  renderList("points-forts-content", rapport.points_forts ?? [], "list-green");
  renderList("points-amelioration-content", rapport.points_amelioration ?? [], "list-orange");
  renderList("questions-content", rapport.questions_recommandees ?? [], "list-blue");

  renderTags("comp-techniques", rapport.competences_techniques ?? [], "tag-tech");
  renderTags("comp-comportementales", rapport.competences_comportementales ?? [], "tag-soft");

  document.getElementById("transcription-content").textContent = transcription ?? "";
}

function renderList(id, items, cssClass) {
  const el = document.getElementById(id);
  el.className = `collapsible-content ${cssClass}`;
  el.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderTags(id, items, cssClass) {
  const el = document.getElementById(id);
  el.innerHTML = items
    .map((item) => `<span class="tag ${cssClass}">${escapeHtml(item)}</span>`)
    .join("");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Collapsibles ──────────────────────────────────────────────────────────────
document.querySelectorAll(".collapsible-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = document.getElementById(btn.dataset.target);
    const isOpen = target.classList.contains("expanded");

    target.classList.toggle("expanded", !isOpen);
    target.classList.toggle("hidden", false);
    btn.classList.toggle("open", !isOpen);
  });
});

// ── Reset ─────────────────────────────────────────────────────────────────────
btnReset.addEventListener("click", () => {
  selectedFile = null;
  fileInput.value = "";
  fileSelected.classList.add("hidden");
  btnAnalyze.classList.add("hidden");
  btnAnalyze.disabled = true;
  uploadError.classList.add("hidden");
  document.querySelectorAll(".collapsible-content").forEach((el) => {
    el.classList.remove("expanded");
  });
  document.querySelectorAll(".collapsible-btn").forEach((btn) => {
    btn.classList.remove("open");
  });
  showState("upload");
});
