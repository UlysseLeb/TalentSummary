const API_URL = "https://talentsummary-production.up.railway.app";

let mediaRecorder = null;
let audioChunks = [];
let recordingBlob = null;
let timerInterval = null;
let secondsElapsed = 0;

const stateUpload     = document.getElementById("state-upload");
const stateProcessing = document.getElementById("state-processing");
const stateResult     = document.getElementById("state-result");
const btnRecord       = document.getElementById("btn-record");
const btnStop         = document.getElementById("btn-stop");
const btnAnalyze      = document.getElementById("btn-analyze");
const uploadError     = document.getElementById("upload-error");
const recordIcon      = document.getElementById("record-icon");
const recordLabel     = document.getElementById("record-label");
const recordTimer     = document.getElementById("record-timer");
const processingMsg   = document.getElementById("processing-msg");
const stepTranscript  = document.getElementById("step-transcription");
const stepAnalysis    = document.getElementById("step-analysis");
const stepReport      = document.getElementById("step-report");
const btnReset        = document.getElementById("btn-reset");

function showState(name) {
  stateUpload.classList.toggle("hidden", name !== "upload");
  stateProcessing.classList.toggle("hidden", name !== "processing");
  stateResult.classList.toggle("hidden", name !== "result");
}

function showError(msg) {
  uploadError.textContent = msg;
  uploadError.classList.remove("hidden");
}

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function startTimer() {
  secondsElapsed = 0;
  recordTimer.textContent = "00:00";
  recordTimer.classList.remove("hidden");
  timerInterval = setInterval(() => {
    secondsElapsed++;
    recordTimer.textContent = formatTime(secondsElapsed);
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}

btnRecord.addEventListener("click", async () => {
  uploadError.classList.add("hidden");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      recordingBlob = new Blob(audioChunks, { type: "audio/webm" });
      recordIcon.textContent = "✅";
      recordIcon.classList.remove("recording");
      recordLabel.textContent = `Enregistrement terminé (${formatTime(secondsElapsed)})`;
      btnAnalyze.classList.remove("hidden");
      btnAnalyze.disabled = false;
      stopTimer();
    };

    mediaRecorder.start();
    startTimer();
    recordIcon.textContent = "🔴";
    recordIcon.classList.add("recording");
    recordLabel.textContent = "Enregistrement en cours...";
    btnRecord.classList.add("hidden");
    btnStop.classList.remove("hidden");
  } catch (err) {
    showError("Accès au micro refusé. Vérifiez les permissions dans Préférences Système → Micro.");
  }
});

btnStop.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    btnStop.classList.add("hidden");
    btnRecord.classList.remove("hidden");
  }
});

btnAnalyze.addEventListener("click", async () => {
  if (!recordingBlob) return;
  showState("processing");
  setStep(1);

  const formData = new FormData();
  formData.append("audio", recordingBlob, "entretien.webm");
  const jobDescription = document.getElementById("job-description").value.trim();
  if (jobDescription) formData.append("job_description", jobDescription);

  try {
    const response = await fetch(`${API_URL}/process`, { method: "POST", body: formData });
    setStep(2);

    if (!response.ok) {
      let detail = "Erreur serveur";
      try { detail = (await response.json()).detail || detail; } catch (_) {}
      throw new Error(`${response.status} — ${detail}`);
    }

    const data = await response.json();
    setStep(3);
    await new Promise((r) => setTimeout(r, 400));
    renderReport(data.rapport, data.transcription);
    showState("result");
  } catch (err) {
    showState("upload");
    showError(err.message);
  }
});

function setStep(n) {
  [stepTranscript, stepAnalysis, stepReport].forEach((el, i) => {
    el.classList.remove("step-active", "step-done");
    if (i + 1 < n) el.classList.add("step-done");
    if (i + 1 === n) el.classList.add("step-active");
  });
  const msgs = ["Transcription en cours...", "Analyse IA en cours...", "Génération du rapport..."];
  processingMsg.textContent = msgs[n - 1] || msgs[0];
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderReport(r, transcription) {
  const score = r.score_global ?? 0;
  const scoreBadge = document.getElementById("score-badge");
  scoreBadge.textContent = `${score}/10`;
  scoreBadge.className = "score-badge " + (score >= 7 ? "score-high" : score >= 4 ? "score-mid" : "score-low");

  document.getElementById("candidate-name").textContent = r.nom_candidat ?? "";
  document.getElementById("candidate-role").textContent = r.poste_vise ?? "";
  document.getElementById("resume").textContent = r.resume_executif ?? "";
  document.getElementById("justification").textContent = r.justification_verdict ?? "";

  const verdictBadge = document.getElementById("verdict-badge");
  verdictBadge.textContent = r.verdict ?? "";
  const verdictKey = (r.verdict ?? "")
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-").replace(/'/g, "-");
  verdictBadge.className = "verdict-badge verdict-" + verdictKey;

  if (r.potentiel) {
    document.getElementById("pot-evolution").textContent = r.potentiel.capacite_evolution ?? "";
    document.getElementById("pot-autonomie").textContent = r.potentiel.autonomie ?? "";
    document.getElementById("pot-adaptabilite").textContent = r.potentiel.adaptabilite ?? "";
  }

  const risquesList = document.getElementById("risques-list");
  risquesList.innerHTML = (r.risques ?? []).map((risque) => {
    const niveau = (risque.niveau ?? "faible").toLowerCase();
    return `
      <div class="risque-item risque-${niveau}">
        <div class="risque-header">
          <span class="risque-titre">${escapeHtml(risque.titre ?? "")}</span>
          <span class="risque-niveau niveau-${niveau}">${escapeHtml(risque.niveau ?? "")}</span>
        </div>
        <p class="risque-desc">${escapeHtml(risque.description ?? "")}</p>
      </div>`;
  }).join("");

  if (r.impact_business) {
    document.getElementById("impact-onboarding").textContent = r.impact_business.temps_onboarding ?? "";
    document.getElementById("impact-formation").textContent = r.impact_business.cout_formation ?? "";
    document.getElementById("impact-valeur").textContent = r.impact_business.valeur_equipe ?? "";
  }

  renderRecoGroup("reco-formations", "Formations", r.recommandations?.formations ?? []);
  renderRecoGroup("reco-mentoring", "Mentoring", r.recommandations?.mentoring ?? []);
  renderRecoGroup("reco-stack", "Stack à renforcer", r.recommandations?.stack_a_renforcer ?? []);

  document.getElementById("transcription-content").textContent = transcription ?? "";
}

function renderRecoGroup(id, label, items) {
  const el = document.getElementById(id);
  if (!items.length) { el.innerHTML = ""; return; }
  el.innerHTML = `
    <p class="reco-group-label">${label}</p>
    <ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

document.querySelectorAll(".collapsible-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = document.getElementById(btn.dataset.target);
    const isOpen = target.classList.contains("expanded");
    target.classList.toggle("expanded", !isOpen);
    btn.classList.toggle("open", !isOpen);
  });
});

btnReset.addEventListener("click", () => {
  recordingBlob = null;
  audioChunks = [];
  recordIcon.textContent = "🎙️";
  recordIcon.classList.remove("recording");
  recordLabel.textContent = "Prêt à enregistrer";
  recordTimer.classList.add("hidden");
  btnStop.classList.add("hidden");
  btnRecord.classList.remove("hidden");
  btnAnalyze.classList.add("hidden");
  btnAnalyze.disabled = true;
  uploadError.classList.add("hidden");
  document.querySelectorAll(".collapsible-content").forEach((el) => el.classList.remove("expanded"));
  document.querySelectorAll(".collapsible-btn").forEach((btn) => btn.classList.remove("open"));
  showState("upload");
});
