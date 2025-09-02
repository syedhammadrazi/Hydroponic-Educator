// ========================= 0) Config & State ========================= 
const API = {
  START: "start",
  STATUS: "status",
  ACTION: "action",
  RESTART: "restart",
  PAUSE: "pause",
  RESUME: "resume",
  RESUME_SNAPSHOT: "resume_from_snapshot",  // NEW
};

const POLL_MS = 2000;

const STORE = {
  SID: "hydro.sid",
  PARAMS: "hydro.params",
  PAUSED: "hydro.paused",
  SNAPSHOT: "hydro.snapshot",               // NEW
};

const I18N = {
  en: { online: "Online", offline: "Offline" },
  ur: { online: "آن لائن", offline: "آف لائن" },
};

const App = {
  sid: null,
  params: { city: null, month: null, crop: null, language: "en" },
  pollingTimer: null,
  pollingAbort: null,
  online: false,
  paused: false,
};

// ===== Single-prompt timer =====
let promptTimer = null;
let activePromptKey = null;

// ===== Stage images mapping =====
// (No "Harvestable" in these lists)
const STAGE_MAP = {
  "Mint":          ["Seedling", "Vegetative", "Maturity"],
  "Spinach":       ["Seedling", "Vegetative", "Maturity"],
  "Cherry Tomato": ["Seedling", "Vegetative", "Flowering", "Fruiting", "Maturity"],
};

// ===== Feedback queue (auto-clear) =====
const FEEDBACK_TTL_MS = 8000;
let feedbackQueue = []; // [{text, expiresAt}]

function addFeedback(text, ttl = FEEDBACK_TTL_MS) {
  if (!text) return;
  feedbackQueue.push({ text: String(text), expiresAt: Date.now() + ttl });
  pruneAndRenderFeedback();
}

function pruneAndRenderFeedback() {
  const now = Date.now();
  feedbackQueue = feedbackQueue.filter(item => item.expiresAt > now);
  const box = $("#feedbackList"); if (!box) return;
  box.innerHTML = "";
  feedbackQueue.forEach(item => box.appendChild(divWith("feedback-item", item.text)));
}

// ========================= 1) Boot / Page Load =========================
function onPageLoad() {
  bindSetupSubmit();
  bindRestartButton();
  bindPauseButton();
  bindNextButton();
  bindStaticControls();      // map your .control-box items to actions
  ensureDynamicContainers(); // make #feedbackList / #notificationsList under #ActionsRequired
  attachUnloadGuard();
  bindEndModals();           // wire harvest/dead modal buttons

  if (loadSavedPausedSession()) {
    // NEW: reconstruct the engine on the server from local snapshot
    tryAutoResumeFromSnapshot().then(() => {
      setPauseButtonUI(true);
      enableSimButtons(true);
      hideModal();
    });
  } else {
    forceSetupModal();
  }
}

function forceSetupModal() { showModal(); }

// ========================= 2) Setup Submit =============================
function bindSetupSubmit() {
  const form = $("#setupForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const city = $("#citySelect")?.value;
    const month = $("#monthSelect")?.value;
    const crop = $("#cropSelect")?.value;
    const language = $("#langSelect")?.value || "en";

    App.params = { city, month, crop, language };

    try {
      const res = await fetch(API.START, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, month, crop, language }),
      });
      if (!res.ok) throw new Error(`Start failed (${res.status})`);

      const data = await res.json();
      App.sid = data.session_id;
      App.paused = false;
      clearSavedSession();

      hideModal();
      setOnline();
      setPauseButtonUI(false);
      enableSimButtons(true);

      clearBox("#feedbackList");
      clearBox("#notificationsList");
      feedbackQueue = [];
      endShown = false;

      // ✅ Immediately show the Seedling image for the selected crop
      primeStageImageOnStart();

      startPolling();
    } catch (err) {
      console.error(err);
      setOffline();
    }
  });
}

// ========================= 3) Start/Stop Polling =======================
function startPolling() {
  stopPolling();
  App.pollingAbort = new AbortController();

  App.pollingTimer = setInterval(async () => {
    if (!App.sid || App.paused) return;

    try {
      const res = await fetch(`${API.STATUS}?sid=${encodeURIComponent(App.sid)}`, {
        signal: App.pollingAbort.signal,
      });
      if (!res.ok) throw new Error(`Status failed (${res.status})`);

      const data = await res.json();
      setOnline();
      renderStatus(data);
    } catch (err) {
      console.warn(err);
      setOffline();
    }
  }, POLL_MS);
}

function stopPolling() {
  if (App.pollingTimer) clearInterval(App.pollingTimer);
  if (App.pollingAbort) App.pollingAbort.abort();
  App.pollingTimer = null;
  App.pollingAbort = null;
}

// ========================= 4) Render Status ============================
function renderStatus(data) {
  // “Actions:” strip shows the ONE required action
  const at = document.querySelector('#MiddlePanel .action-strip .action-text');
  if (at) {
    at.textContent = data.required_action?.label || 'No action required.';
  }

  // 🔆 keep the Light toggle label in sync (use backend's flat keys)
  const lightBox = document.querySelector('.control-box[data-action="toggle_light"]');
  if (lightBox) {
    const on = !!data.light_on;              // educator.py → get_status() returns `light_on`
    //lightBox.textContent = `Light: ${on ? 'On' : 'Off'}`;

    // Optional: visually nudge the user when a light prompt is active
    const pk = data.active_prompt?.key;      // educator.py → get_status() returns `active_prompt`
    const needsLightToggle = pk === 'light_on' || pk === 'light_off';
    lightBox.classList.toggle('attention', !!needsLightToggle);
  }

  // schedule prompt expiry (on timeout we add a single, auto-clearing feedback chip)
  schedulePromptTimeout(data.required_action);

  // Stage image
  updatePlantImage(data);

  // End-of-sim modal
  handleEndStates(data);

  // Dashboard numbers
  updateDashboardFromLayout(data);

  // ✅ Track current stage/crop so we can flip image instantly on "Next"
  App.lastStage = data?.plant?.stage || "Seedling";
  App.currentCrop = data?.crop || App?.params?.crop || "Cherry Tomato";

  // FEEDBACK: we DO NOT dump server feedback list to the bar.
  // We only show local, auto-clearing feedback when a user acts (see runAction/prependFeedback)
  pruneAndRenderFeedback();

  // WARNINGS LIST: hide/clear — warnings only live in “Actions:” now.
  renderNotifications([]); // always empty
}

function updateDashboardFromLayout(data) {
  const top = document.querySelectorAll('#top .updates');
  const bottom = document.querySelectorAll('#bottom .updates');

  if (top[0]) top[0].textContent = `Day: ${data.time?.day ?? '—'}`;
  if (top[1]) top[1].textContent = `EC: ${data.env?.ec ?? '—'} mS/cm`;
  if (top[2]) top[2].textContent = `Humidity: ${data.env?.humidity ?? '—'}%`;
  if (top[3]) top[3].textContent = `Temperature: ${toFixedOrDash(data.env?.temp,1)} °C`;
  if (top[4]) top[4].textContent = `Yield: ${toFixedOrDash(data.plant?.yield,2) ?? '—'} kg`;

  if (bottom[0]) bottom[0].textContent = `Hour: ${data.time?.hour ?? '—'}`;
  if (bottom[1]) bottom[1].textContent = `pH: ${data.env?.ph ?? '—'}`;
  if (bottom[2]) bottom[2].textContent = `Water: ${data.env?.water ?? '—'}%`;
  if (bottom[3]) bottom[3].textContent = `Status: ${data.plant?.stage ?? '—'}`;
  if (bottom[4]) bottom[4].textContent = `Health: ${Math.round(data.plant?.health ?? 0)}%`;
}

function renderFeedback(list) {
  // UNUSED now: we manage feedback locally with auto-clear.
  // Keeping the function for compatibility if called elsewhere.
  const box = $("#feedbackList"); if (!box) return;
  box.innerHTML = "";
  (list || []).forEach((msg) => box.appendChild(divWith("feedback-item", msg)));
}

function renderNotifications(list) {
  const box = $("#notificationsList"); if (!box) return;
  box.innerHTML = ""; // keep area clean; warnings shown only in “Actions:” strip
}

// ========================= 5) Run Action ===============================
async function runAction(action_id) {
  if (!App.sid || App.paused) return;
  try {
    // cancel any pending "missed" timeout immediately
    if (promptTimer) { clearTimeout(promptTimer); promptTimer = null; }
    activePromptKey = null; // prevent the timeout handler from posting a "missed"

    const res = await fetch(API.ACTION, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sid: App.sid, action_id }),
    });
    if (!res.ok) throw new Error(`Action failed (${res.status})`);

    const data = await res.json();
    if (data?.feedback) prependFeedback(Array.isArray(data.feedback) ? data.feedback.join(" • ") : String(data.feedback));

    // optional: also clear the “Actions:” strip instantly; it’ll repopulate on next /status
    const at = document.querySelector('#MiddlePanel .action-strip .action-text');
    if (at) at.textContent = 'All good — no action required.';

    // ✅ If this was "next_stage", flip the image right away (no waiting for poll)
    if (action_id === "next_stage") {
      setImageToNextStage();
    }
  } catch (err) {
    console.warn(err);
  }
}

function prependFeedback(text) {
  addFeedback(text); // auto-clearing queue
}

// ========================= 6) Pause/Resume Flow ========================
function bindPauseButton() {
  const btn = $("#btnPause"); if (!btn) return;

  btn.addEventListener("click", async () => {
    if (!App.sid) return;

    if (!App.paused) {
      try {
        const res = await fetch(API.PAUSE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sid: App.sid }),
        });
        // NEW: capture snapshot for browser persistence
        if (res.ok) {
          const data = await res.json();
          if (data?.snapshot) {
            localStorage.setItem(STORE.SNAPSHOT, JSON.stringify(data.snapshot));
          }
        }
      } catch (_) {}
      stopPolling();
      App.paused = true;
      savePausedSession();
      setPauseButtonUI(true);
    } else {
      try {
        await fetch(API.RESUME, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sid: App.sid }),
        });
      } catch (_) {}
      App.paused = false;
      startPolling();
      setPauseButtonUI(false);
      clearSavedPausedFlagOnly();   // also clears snapshot
    }
  });
}

function setPauseButtonUI(paused) {
  const btn = $("#btnPause");
  if (btn) btn.textContent = paused ? "Play" : "Pause";
  const next = $("#btnNext");
  if (next) next.disabled = !!paused; // lock Next while paused
}

function savePausedSession() {
  if (!App.sid) return;
  localStorage.setItem(STORE.SID, App.sid);
  localStorage.setItem(STORE.PARAMS, JSON.stringify(App.params));
  localStorage.setItem(STORE.PAUSED, "1");
}

function clearSavedSession() {
  localStorage.removeItem(STORE.SID);
  localStorage.removeItem(STORE.PARAMS);
  localStorage.removeItem(STORE.PAUSED);
  localStorage.removeItem(STORE.SNAPSHOT);   // NEW
}

function clearSavedPausedFlagOnly() {
  localStorage.removeItem(STORE.PAUSED);
  localStorage.removeItem(STORE.SNAPSHOT);   // NEW
}

function loadSavedPausedSession() {
  const paused = localStorage.getItem(STORE.PAUSED) === "1";
  const sid = localStorage.getItem(STORE.SID);
  const paramsJson = localStorage.getItem(STORE.PARAMS);
  if (paused && sid) {
    App.sid = sid;
    try { App.params = JSON.parse(paramsJson) || App.params; } catch (_) {}
    App.paused = true;
    return true;
  }
  return false;
}

async function tryAutoResumeFromSnapshot() {        // NEW
  const snapRaw = localStorage.getItem(STORE.SNAPSHOT);
  if (!App.sid || !snapRaw) return false;

  let language = "en";
  try { language = (JSON.parse(localStorage.getItem(STORE.PARAMS)) || {}).language || "en"; } catch (_){}

  try {
    const res = await fetch(API.RESUME_SNAPSHOT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sid: App.sid,
        snapshot: JSON.parse(snapRaw),
        language,
      }),
    });
    const data = await res.json();
    return !!data.ok;
  } catch (_) {
    return false;
  }
}

function attachUnloadGuard() {
  window.addEventListener("beforeunload", () => {
    if (!App.paused) clearSavedSession();
  });
}

// ========================= 7) Next Stage Action ========================
function bindNextButton() {
  const btn = $("#btnNext"); if (!btn) return;

  btn.addEventListener("click", async () => {
    if (!App.sid || App.paused) return;
    try {
      const res = await fetch(API.ACTION, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sid: App.sid, action_id: "next_stage" }),
      });
      if (!res.ok) throw new Error(`Next failed (${res.status})`);
      const data = await res.json();
      if (data?.feedback) prependFeedback(Array.isArray(data.feedback) ? data.feedback.join(" • ") : String(data.feedback));

      // ✅ Also update image instantly here (in case this path is used elsewhere)
      setImageToNextStage();
    } catch (err) {
      console.warn(err);
    }
  });
}

// ========================= 8) Restart Flow =============================
function bindRestartButton() {
  const btn = $("#btnRestart"); if (!btn) return;

  btn.addEventListener("click", async () => {
    try {
      if (App.sid) {
        await fetch(API.RESTART, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sid: App.sid }),
        });
      }
    } catch (_) { /* non-fatal */ }

    stopPolling();
    App.sid = null;
    App.paused = false;
    clearSavedSession();
    clearBox("#feedbackList");
    clearBox("#notificationsList");
    feedbackQueue = [];
    enableSimButtons(false);
    endShown = false;
    forceSetupModal();
  });
}

// ========================= 9) Helpers ==================================
function $(sel) { return document.querySelector(sel); }
function clearBox(sel) { const el = $(sel); if (el) el.innerHTML = ""; }
function divWith(cls, text) { const d = document.createElement('div'); d.className = cls; d.textContent = text; return d; }
function toFixedOrDash(n, k) { return (typeof n === "number" && !Number.isNaN(n)) ? n.toFixed(k ?? 0) : "—"; }

function setOnline()  { App.online = true;  setBadge(true); }
function setOffline() { App.online = false; setBadge(false); }
function setBadge(isOnline) {
  const el = $("#connectionBadge"); if (!el) return;
  const t = I18N[App.params.language] || I18N.en;
  el.textContent = isOnline ? t.online : t.offline;
  el.classList.toggle("online", isOnline);
  el.classList.toggle("offline", !isOnline);
}

function showModal() { const m = $("#setupModal"); if (m) m.style.display = "block"; }
function hideModal() { const m = $("#setupModal"); if (m) m.style.display = "none"; }

function enableSimButtons(on) {
  ["btnPause","btnRestart","btnNext"].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.disabled = !on;
  });
}

// Map your left/right control boxes to actions
function bindStaticControls() {
  document.querySelectorAll('.control-box[data-action]').forEach(box => {
    box.addEventListener('click', () => {
      animateControlBox(box);
      const actionId = box.getAttribute('data-action');
      runAction(actionId);
    });
  });
}

// Your 3s green transition on click
function animateControlBox(box) {
  if (!box) return;
  box.classList.add('clicked');
  setTimeout(() => box.classList.remove('clicked'), 3000);
}

// ========================= Prompt expiry ===============================
function schedulePromptTimeout(pa) {
  // clear previous
  if (!pa) {
    if (promptTimer) { clearTimeout(promptTimer); promptTimer = null; }
    activePromptKey = null;
    return;
  }
  if (activePromptKey === pa.key) return;

  activePromptKey = pa.key;
  if (promptTimer) { clearTimeout(promptTimer); promptTimer = null; }

  const msLeft = Math.max(0, (pa.expires_at || 0) - Date.now());
  promptTimer = setTimeout(async () => {
    try {
      if (App.sid) {
        await fetch("prompt_result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sid: App.sid }),
        });
      }
    } catch (_) { /* ignore */ }
    // Add a small, auto-clearing feedback chip locally
    addFeedback(`⏳ Missed: ${pa.label}`);
  }, msLeft);
}

// ========================= Stage images ================================
function slug(s){ return String(s || "").toLowerCase().replace(/\s+/g,'').replace(/[^a-z0-9_]/g,''); }

function findImagePath(crop, stage) {
  const c = (crop && STAGE_MAP[crop]) ? crop : "Cherry Tomato";
  const order = STAGE_MAP[c];

  // If the engine sends an unknown stage (e.g., "Harvestable"), use the last known stage (Maturity).
  const knownStage = order.includes(stage) ? stage : order[order.length - 1];

  return `img/${slug(c)}_${slug(knownStage)}.png`;
}

function updatePlantImage(data){
  const img = document.getElementById("plantImg");
  if (!img) return;
  const cropName = data?.crop || data?.params?.crop || "Cherry Tomato";
  const stage = data?.plant?.stage || "Seedling";
  const target = findImagePath(cropName, stage);

  // ❗ No fallback: just set the exact image path
  const pathOnly = (p) => p ? p.split("?")[0] : "";
  if (!pathOnly(img.src).endsWith(target)) {
    img.src = target;
  }
}

// ✅ Immediately show the selected crop’s Seedling image after /start
function primeStageImageOnStart() {
  const img = document.getElementById("plantImg");
  if (!img) return;
  const crop = App?.params?.crop || "Cherry Tomato";
  const target = findImagePath(crop, "Seedling");
  img.src = target;
}

// ✅ Flip to next stage image instantly on “Next”
function setImageToNextStage() {
  const img = document.getElementById("plantImg");
  if (!img) return;
  const crop = App.currentCrop || App?.params?.crop || "Cherry Tomato";
  const order = STAGE_MAP[crop] || [];
  if (!order.length) return;

  const cur = (App.lastStage && order.includes(App.lastStage)) ? App.lastStage : "Seedling";
  const idx = order.indexOf(cur);
  const nextIdx = Math.min(order.length - 1, idx + 1);
  const nextStage = order[nextIdx];
  const target = findImagePath(crop, nextStage);
  img.src = target;
}

// ========================= End-of-sim modals ===========================
let endShown = false;

function bindEndModals() {
  const hClose = $("#harvestClose");
  const hRestart = $("#harvestRestart");
  const dClose = $("#deadClose");
  const dRestart = $("#deadRestart");

  if (hClose) hClose.addEventListener("click", () => { const m=$("#harvestModal"); if (m) m.style.display="none"; });
  if (dClose) dClose.addEventListener("click", () => { const m=$("#deadModal"); if (m) m.style.display="none"; });

  const doRestart = async () => {
    try {
      if (App.sid) {
        await fetch(API.RESTART, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sid: App.sid }),
        });
      }
    } catch (_) {}
    stopPolling();
    App.sid = null;
    App.paused = false;
    clearSavedSession();
    clearBox("#feedbackList");
    clearBox("#notificationsList");
    feedbackQueue = [];
    enableSimButtons(false);
    endShown = false;
    forceSetupModal();
    const hm=$("#harvestModal"); if (hm) hm.style.display="none";
    const dm=$("#deadModal"); if (dm) dm.style.display="none";
  };

  if (hRestart) hRestart.addEventListener("click", doRestart);
  if (dRestart) dRestart.addEventListener("click", doRestart);
}

function handleEndStates(data) {
  if (endShown) return;
  const stage = data?.plant?.stage;
  const health = Math.round(data?.plant?.health ?? 0);
  const isDead = (health <= 70) || (data?.status === "❌ Dead");

  if (stage === "Harvestable") {
    endShown = true;
    const y = typeof data?.plant?.yield === "number" ? data.plant.yield : 0;
    const p = $("#harvestSummary");
    if (p) p.textContent = `Crop: ${data?.crop} • Final health: ${health}% • Estimated yield: ${y} kg`;
    const m = $("#harvestModal"); if (m) m.style.display = "flex";
    stopPolling();
    return;
  }

  if (isDead) {
    endShown = true;
    const m = $("#deadModal"); if (m) m.style.display = "flex";
    stopPolling();
  }
}

// ========================= Boot ========================================
window.addEventListener("DOMContentLoaded", onPageLoad);

// Create feedback/notifications containers under #ActionsRequired if missing
function ensureDynamicContainers() {
  const ar = document.getElementById('ActionsRequired');
  if (!ar) return;

  if (!document.getElementById('feedbackList')) {
    const f = document.createElement('div');
    f.id = 'feedbackList';
    ar.appendChild(f);
  }

  if (!document.getElementById('notificationsList')) {
    const n = document.createElement('div');
    n.id = 'notificationsList';
    ar.appendChild(n);
  }
}

/* ======================== AUDIO ADDITIONS (appended) ======================== */

// Grab elements
const ambientEl = document.getElementById('ambientAudio');
const stageEl   = document.getElementById('stageAudio');
const audioToggleBtn = document.getElementById('audioToggle');
const audioVolSlider = document.getElementById('audioVol');

// Persisted prefs
let audioEnabled = JSON.parse(localStorage.getItem('gp_audioEnabled') ?? 'false');
let lastStageAudio = null;

// Volume helpers
function setVolume(v){
  if (!ambientEl || !stageEl) return;
  ambientEl.volume = v;
  stageEl.volume   = Math.min(1, v * 1.2);
  localStorage.setItem('gp_audioVol', String(v));
}

function updateAudioButton(){
  if (!audioToggleBtn) return;
  audioToggleBtn.textContent = audioEnabled ? '🔊 Sound On' : '🔈 Sound Off';
}

// Respect autoplay policies
async function enableAudioIfGesture(){
  if (!ambientEl) return;
  try {
    if (audioEnabled) {
      await ambientEl.play();
    } else {
      ambientEl.pause();
    }
  } catch (_) {
    // wait for first click
    const unlock = async () => {
      if (audioEnabled) {
        try { await ambientEl.play(); } catch(__) {}
      }
      window.removeEventListener('click', unlock, { once:true });
    };
    window.addEventListener('click', unlock, { once:true });
  }
}

// Stage-change chime
function playStageChime(){
  if (!audioEnabled || !stageEl) return;
  try { stageEl.currentTime = 0; stageEl.play(); } catch(_) {}
}

// Init on load
(function initAudio(){
  if (!ambientEl || !stageEl) return;
  const savedVol = parseFloat(localStorage.getItem('gp_audioVol') ?? '0.15');
  if (audioVolSlider) audioVolSlider.value = String(savedVol);
  setVolume(savedVol);
  updateAudioButton();
  enableAudioIfGesture();
})();

// UI events
audioToggleBtn?.addEventListener('click', async () => {
  audioEnabled = !audioEnabled;
  localStorage.setItem('gp_audioEnabled', JSON.stringify(audioEnabled));
  updateAudioButton();
  await enableAudioIfGesture();
  if (!audioEnabled && ambientEl) ambientEl.pause();
});

audioVolSlider?.addEventListener('input', (e) => {
  setVolume(parseFloat(e.target.value));
});

// Hook to status without editing your existing renderStatus body
function handleStatusAudio(status){
  if (!status) return;
  const curStage = status.plant?.stage || status.stage || null;
  if (curStage && lastStageAudio && curStage !== lastStageAudio){
    playStageChime();
  }
  lastStageAudio = curStage ?? lastStageAudio;
}

// Wrap renderStatus so we don't modify its original definition
(function wrapRenderStatus(){
  if (typeof renderStatus === 'function') {
    const _orig = renderStatus;
    renderStatus = function(data){
      _orig.call(this, data);
      try { handleStatusAudio(data); } catch(_) {}
    };
  }
})();
