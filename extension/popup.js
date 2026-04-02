const app = document.getElementById("app");
const screens = {
  welcome: document.getElementById("welcome-screen"),
  type: document.getElementById("type-screen"),
  session: document.getElementById("session-screen"),
  flow: document.getElementById("flow-screen")
};

const settingsPanel = document.getElementById("settings-panel");
const notesPanel = document.getElementById("notes-panel");
const toast = document.getElementById("toast");

const popupSizeSelect = document.getElementById("popup-size");
const alarmSoundSelect = document.getElementById("alarm-sound");
const alarmVolumeInput = document.getElementById("alarm-volume");
const autoHomeSelect = document.getElementById("auto-home");
const quickNotesInput = document.getElementById("quick-notes");

const sessionHeading = document.getElementById("session-heading");
const sessionForm = document.getElementById("session-form");
const sessionTitleInput = document.getElementById("session-title");
const sessionTimeInput = document.getElementById("session-time");
const sessionObjectiveInput = document.getElementById("session-objective");

const activeType = document.getElementById("active-type");
const activeTitle = document.getElementById("active-title");
const countdown = document.getElementById("countdown");

let currentType = "School";
let flowTimer = null;
let endTime = null;
let audioContext = null;

const defaultSettings = {
  popupSize: "large",
  alarmSound: "chime",
  alarmVolume: 0.45,
  autoHome: "on"
};

const storage = {
  async get(key, fallback) {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const data = await chrome.storage.local.get(key);
      return data[key] ?? fallback;
    }
    const local = localStorage.getItem(key);
    return local ? JSON.parse(local) : fallback;
  },
  async set(key, value) {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ [key]: value });
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  }
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 1800);
}

function openPanel(panel) {
  panel.classList.remove("hidden");
}

function closePanel(panel) {
  panel.classList.add("hidden");
}

function closeAllPanels() {
  closePanel(settingsPanel);
  closePanel(notesPanel);
}

function showScreen(name) {
  Object.values(screens).forEach((screen) => {
    screen.classList.remove("active");
  });
  screens[name].classList.add("active");
}

function transitionFromWelcome() {
  screens.welcome.classList.add("fading");
  setTimeout(() => {
    screens.welcome.classList.remove("fading");
    showScreen("type");
  }, 250);
}

function formatTime(msLeft) {
  const totalSeconds = Math.max(0, Math.ceil(msLeft / 1000));
  const mins = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const secs = String(totalSeconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function applyPopupSize(size) {
  app.classList.remove("popup-size-small", "popup-size-medium", "popup-size-large");
  app.classList.add(`popup-size-${size}`);
}

async function ensureAudioReady() {
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    audioContext = new Ctx();
  }
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
  return true;
}

async function playSoftAlarm(soundType, volume) {
  const ready = await ensureAudioReady();
  if (!ready) {
    showToast("Audio is not supported in this browser.");
    return;
  }

  const now = audioContext.currentTime;
  const outputGain = audioContext.createGain();
  outputGain.connect(audioContext.destination);
  outputGain.gain.value = Math.max(0.05, Math.min(1, Number(volume) || 0.45));

  const alarmProfiles = {
    chime: [480, 640, 720],
    bell: [360, 540, 760],
    wave: [420, 520, 610]
  };

  const notes = alarmProfiles[soundType] || alarmProfiles.chime;
  notes.forEach((freq, index) => {
    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    osc.type = soundType === "bell" ? "triangle" : "sine";
    osc.frequency.setValueAtTime(freq, now + index * 0.32);

    osc.connect(gainNode);
    gainNode.connect(outputGain);

    const noteStart = now + index * 0.32;
    const noteEnd = noteStart + 0.58;

    gainNode.gain.setValueAtTime(0.0001, noteStart);
    gainNode.gain.exponentialRampToValueAtTime(0.14, noteStart + 0.06);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

    osc.start(noteStart);
    osc.stop(noteEnd + 0.02);
  });
}

async function saveCompletedSession(session) {
  const existing = await storage.get("brainsyncSessions", []);
  existing.push(session);
  await storage.set("brainsyncSessions", existing);
}

function endFlowSession(completed = false) {
  if (flowTimer) {
    clearInterval(flowTimer);
    flowTimer = null;
  }

  if (completed) {
    playSoftAlarm(alarmSoundSelect.value, alarmVolumeInput.value);
    showToast("Session complete. Great work.");
  } else {
    showToast("Session ended early.");
  }

  if (autoHomeSelect.value === "on") {
    showScreen("type");
  }
}

async function startFlowSession(payload) {
  const mins = Number(payload.timeMinutes);
  const durationMs = mins * 60 * 1000;
  endTime = Date.now() + durationMs;

  activeType.textContent = payload.type;
  activeTitle.textContent = payload.title;
  countdown.textContent = formatTime(durationMs);
  showScreen("flow");

  flowTimer = setInterval(async () => {
    const msLeft = endTime - Date.now();
    countdown.textContent = formatTime(msLeft);

    if (msLeft <= 0) {
      clearInterval(flowTimer);
      flowTimer = null;
      await saveCompletedSession({
        type: payload.type,
        title: payload.title,
        timeMinutes: payload.timeMinutes,
        objective: payload.objective,
        completedAt: new Date().toISOString()
      });
      endFlowSession(true);
    }
  }, 250);
}

async function init() {
  const settings = await storage.get("brainsyncSettings", defaultSettings);
  const notes = await storage.get("brainsyncQuickNotes", "");

  popupSizeSelect.value = settings.popupSize || defaultSettings.popupSize;
  alarmSoundSelect.value = settings.alarmSound || defaultSettings.alarmSound;
  alarmVolumeInput.value = settings.alarmVolume || defaultSettings.alarmVolume;
  autoHomeSelect.value = settings.autoHome || defaultSettings.autoHome;
  quickNotesInput.value = notes;

  applyPopupSize(popupSizeSelect.value);
}

document.getElementById("welcome-screen").addEventListener("click", transitionFromWelcome);
document.body.addEventListener("click", () => {
  ensureAudioReady();
}, { once: true });

document.querySelectorAll(".type-btn").forEach((button) => {
  button.addEventListener("click", () => {
    currentType = button.dataset.type;
    sessionHeading.textContent = `${currentType} Session`;
    showScreen("session");
  });
});

document.getElementById("home-btn").addEventListener("click", () => showScreen("type"));
document.getElementById("flow-home").addEventListener("click", () => showScreen("type"));
document.getElementById("cancel-flow").addEventListener("click", () => endFlowSession(false));

document.getElementById("notes-toggle").addEventListener("click", () => openPanel(notesPanel));
document.getElementById("session-notes-toggle").addEventListener("click", () => openPanel(notesPanel));
document.getElementById("settings-toggle").addEventListener("click", () => openPanel(settingsPanel));
document.getElementById("session-settings-toggle").addEventListener("click", () => openPanel(settingsPanel));
document.getElementById("close-settings").addEventListener("click", () => closePanel(settingsPanel));
document.getElementById("close-notes").addEventListener("click", () => closePanel(notesPanel));

document.getElementById("save-notes").addEventListener("click", async () => {
  await storage.set("brainsyncQuickNotes", quickNotesInput.value);
  showToast("Notes saved.");
});

[popupSizeSelect, alarmSoundSelect, alarmVolumeInput, autoHomeSelect].forEach((input) => {
  input.addEventListener("change", async () => {
    const nextSettings = {
      popupSize: popupSizeSelect.value,
      alarmSound: alarmSoundSelect.value,
      alarmVolume: Number(alarmVolumeInput.value),
      autoHome: autoHomeSelect.value
    };
    await storage.set("brainsyncSettings", nextSettings);
    applyPopupSize(nextSettings.popupSize);
    showToast("Settings updated.");
  });
});

document.getElementById("test-alarm").addEventListener("click", async () => {
  await playSoftAlarm(alarmSoundSelect.value, alarmVolumeInput.value);
  showToast("Alarm test played.");
});

sessionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  closeAllPanels();
  await startFlowSession({
    type: currentType,
    title: sessionTitleInput.value.trim(),
    timeMinutes: sessionTimeInput.value,
    objective: sessionObjectiveInput.value.trim()
  });
});

init();
