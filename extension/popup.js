const app = document.getElementById("app");
const screens = {
  auth: document.getElementById("auth-screen"),
  welcome: document.getElementById("welcome-screen"),
  session: document.getElementById("session-screen"),
  flow: document.getElementById("flow-screen"),
  breathing: document.getElementById("breathing-screen")
};

const settingsPanel = document.getElementById("settings-panel");
const notesPanel = document.getElementById("notes-panel");
const toast = document.getElementById("toast");

const popupSizeSelect = document.getElementById("popup-size");
const alarmSoundSelect = document.getElementById("alarm-sound");
const alarmVolumeInput = document.getElementById("alarm-volume");
const smallTimerSelect = document.getElementById("small-timer");
const quickNotesInput = document.getElementById("quick-notes");

const sessionHeading = document.getElementById("session-heading");
const sessionScreenHeading = "Start Session";
const sessionForm = document.getElementById("session-form");
const sessionTitleInput = document.getElementById("session-title");
const sessionTimeInput = document.getElementById("session-time");
const sessionObjectiveInput = document.getElementById("session-objective");

const activeType = document.getElementById("active-type");
const activeTitle = document.getElementById("active-title");
const countdown = document.getElementById("countdown");
const focusLevelText = document.getElementById("focus-level-text");
const focusRingFill = document.getElementById("focus-ring-fill");
const focusBandLabel = document.getElementById("focus-band-label");
const focusRingContainer = document.getElementById("focus-ring-container");
const popupTabStatusDot = document.getElementById("popup-tab-status-dot");
const popupTabStatusText = document.getElementById("popup-tab-status-text");

const WEBSITE_URL = "https://brainsync.sub-sync.ca"; // Change this if your website runs elsewhere

// FOCUS_BANDS - keep in sync with background.js and content.js
const FOCUS_BANDS = [
  {
    min: 85, max: 100,
    label: "Deep Focus",
    sublabel: "You're in the zone.",
    color: "#52d9a0",
    glowColor: "rgba(82, 217, 160, 0.3)",
    ringColor: "#52d9a0",
    dotClass: "focus-deep"
  },
  {
    min: 65, max: 84,
    label: "On Track",
    sublabel: "Staying focused.",
    color: "#FFD700",
    glowColor: "rgba(255, 215, 0, 0.3)",
    ringColor: "#FFD700",
    dotClass: "focus-good"
  },
  {
    min: 45, max: 64,
    label: "Drifting",
    sublabel: "Pull back to your task.",
    color: "#ffb347",
    glowColor: "rgba(255, 179, 71, 0.3)",
    ringColor: "#ffb347",
    dotClass: "focus-drift"
  },
  {
    min: 20, max: 44,
    label: "Losing Focus",
    sublabel: "Refocus now.",
    color: "#ff7043",
    glowColor: "rgba(255, 112, 67, 0.35)",
    ringColor: "#ff7043",
    dotClass: "focus-low"
  },
  {
    min: 0, max: 19,
    label: "Distracted",
    sublabel: "Breathe and return.",
    color: "#ff4d4d",
    glowColor: "rgba(255, 77, 77, 0.4)",
    ringColor: "#ff4d4d",
    dotClass: "focus-critical"
  }
];

function getFocusBand(score) {
  return FOCUS_BANDS.find(b => score >= b.min && score <= b.max) || FOCUS_BANDS[4];
}

let currentType = "School";
let flowTimer = null;
let endTime = null;
let audioContext = null;
let isPaused = false;
let remainingMs = 0;
let lastFocusBandLabel = "Deep Focus";
let confirmEndArmed = false;

const defaultSettings = {
  popupSize: "large",
  alarmSound: "chime",
  alarmVolume: 0.45,
  smallTimer: "on"
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
    sessionHeading.textContent = sessionScreenHeading;
    showScreen("session");
  }, 250);
}

function formatTime(msLeft) {
  const totalSeconds = Math.max(0, Math.ceil(msLeft / 1000));
  const mins = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const secs = String(totalSeconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function applyPopupSize(size) {
  app.classList.remove("popup-size-small", "popup-size-medium", "popup-size-large", "popup-size-extra-large");
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

async function endFlowSession(completed = false) {
  if (flowTimer) {
    clearInterval(flowTimer);
    flowTimer = null;
  }

  // If the user manually ended early, clear the session from storage
  if (!completed) {
    showToast("Session ended early.");
    await storage.set("brainsyncActiveSession", null);
  }

  sessionHeading.textContent = sessionScreenHeading;
  showScreen("session");
  confirmEndArmed = false;
  const cancelBtn = document.getElementById("cancel-flow");
  if (cancelBtn) cancelBtn.textContent = "End Early";
}

async function startFlowSession(payload) {
  const mins = Number(payload.timeMinutes);
  const durationMs = mins * 60 * 1000;
  endTime = Date.now() + durationMs;

  activeType.textContent = payload.type;
  activeTitle.textContent = payload.title;
  countdown.textContent = formatTime(durationMs);
  showScreen("flow");

  // Save to storage; background worker will pick it up and set an alarm
  const activeSession = {
    ...payload,
    endTime,
    isActive: true
  };
  await storage.set("brainsyncActiveSession", activeSession);

  if (flowTimer) clearInterval(flowTimer);
  flowTimer = setInterval(async () => {
    if (isPaused) {
      countdown.textContent = formatTime(remainingMs);
      return;
    }
    const msLeft = endTime - Date.now();
    countdown.textContent = formatTime(msLeft);
    if (msLeft <= 0) {
      clearInterval(flowTimer);
      flowTimer = null;
      sessionHeading.textContent = sessionScreenHeading;
      showScreen("session");
    }
  }, 250);
}

// Receive messages from background
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "play_alarm") {
      if (flowTimer) {
        clearInterval(flowTimer);
        flowTimer = null;
      }
      playSoftAlarm(alarmSoundSelect.value, alarmVolumeInput.value);
      showToast("Session complete. Great work.");
      sessionHeading.textContent = sessionScreenHeading;
      showScreen("session");
    }
  });
}

function updateFocusMeter(level) {
  const safeLevel = Math.max(0, Math.min(100, Math.round(level)));
  const band = getFocusBand(safeLevel);
  const circumference = 326.7;
  const dashOffset = circumference - (safeLevel / 100) * circumference;
  if (focusRingFill) {
    focusRingFill.style.strokeDashoffset = dashOffset;
    focusRingFill.style.stroke = band.ringColor;
  }
  if (focusLevelText) focusLevelText.textContent = `${safeLevel}%`;
  if (focusBandLabel) {
    focusBandLabel.textContent = band.label;
    focusBandLabel.style.color = band.color;
  }
  if (focusRingContainer) {
    focusRingContainer.style.setProperty("--bs-glow", band.glowColor);
    if (band.label !== lastFocusBandLabel) {
      focusRingContainer.classList.remove("bs-band-change");
      void focusRingContainer.offsetWidth;
      focusRingContainer.classList.add("bs-band-change");
      lastFocusBandLabel = band.label;
    }
  }
}

function updateTabStatus(type = "neutral") {
  if (popupTabStatusDot) popupTabStatusDot.className = `flow-status-dot ${type}`;
  if (popupTabStatusText) {
    popupTabStatusText.textContent = type === "relevant"
      ? "Currently browsing: on task"
      : type === "high_distraction"
        ? "Currently browsing: distraction"
        : type === "pending"
          ? "Currently browsing: analyzing"
          : "Currently browsing: off task";
  }
}

function handleBreathingState(data) {
  if (data && data.isActive) {
    showScreen("breathing");
    const container = document.querySelector(".breathing-circle-container");
    const circle = document.getElementById("breathing-circle");
    const text = document.getElementById("breathing-text");
    const proceedBtn = document.getElementById("breathing-proceed-btn");
    const circleWrap = document.getElementById("breathing-circle-wrap");

    if (data.state === "message_prompt" || data.state === "message") {
      proceedBtn.style.display = "block";
      circleWrap.style.display = "none";
      circle.className = "breathing-circle";
      text.textContent = "";
      text.style.opacity = "0";
      container.classList.remove("animating");
    } else {
      proceedBtn.style.display = "none";
      circleWrap.style.display = "flex";
      container.classList.add("animating");

      if (data.state === "breathe_in") {
        circle.className = "breathing-circle breathe-in";
        text.textContent = "Breathe In";
        text.style.opacity = "1";
      } else if (data.state === "breathe_out") {
        circle.className = "breathing-circle breathe-out";
        text.textContent = "Breathe Out";
        text.style.opacity = "1";
      }
    }
  } else {
    const container = document.querySelector(".breathing-circle-container");
    if (container) container.classList.remove("animating");
    if (screens.breathing && screens.breathing.classList.contains("active")) {
      showScreen("flow");
    }
  }
}

if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.brainsyncUser) {
        init();
      }
      if (changes.brainsyncFocusLevel) {
        updateFocusMeter(changes.brainsyncFocusLevel.newValue);
      }
      if (changes.brainsyncBreathing) {
        handleBreathingState(changes.brainsyncBreathing.newValue);
      }
      if (changes.brainsyncCurrentTabType) {
        updateTabStatus(changes.brainsyncCurrentTabType.newValue || "neutral");
      }
      if (changes.brainsyncActiveSession) {
        const s = changes.brainsyncActiveSession.newValue;
        if (s && s.isActive) {
          isPaused = !!s.isPaused;
          if (isPaused) {
            remainingMs = s.remainingMs;
          } else {
            endTime = s.endTime;
          }
        }
      }
    }
  });
}

async function init() {
  const currentUser = await storage.get("brainsyncUser", null);
  if (flowTimer) {
    clearInterval(flowTimer);
    flowTimer = null;
  }
  if (!currentUser) {
    showScreen("auth");
    document.getElementById("session-settings-toggle").style.display = "none";
    document.getElementById("session-notes-toggle").style.display = "none";
    return;
  }

  document.getElementById("session-settings-toggle").style.display = "block";
  document.getElementById("session-notes-toggle").style.display = "block";

  const settings = await storage.get("brainsyncSettings", defaultSettings);
  const notes = await storage.get(`brainsyncQuickNotes_${currentUser}`, "");

  popupSizeSelect.value = settings.popupSize || defaultSettings.popupSize;
  alarmSoundSelect.value = settings.alarmSound || defaultSettings.alarmSound;
  alarmVolumeInput.value = settings.alarmVolume || defaultSettings.alarmVolume;
  smallTimerSelect.value = settings.smallTimer || defaultSettings.smallTimer;
  quickNotesInput.value = notes;

  applyPopupSize(popupSizeSelect.value);

  const initialFocus = await storage.get("brainsyncFocusLevel", 100);
  updateFocusMeter(initialFocus);
  updateTabStatus(await storage.get("brainsyncCurrentTabType", "neutral"));

  // Resume active session if exists
  const breathingState = await storage.get("brainsyncBreathing", null);
  const activeSession = await storage.get("brainsyncActiveSession", null);
  if (activeSession && activeSession.isActive) {
    if (activeSession.isPaused || activeSession.endTime > Date.now()) {
      currentType = activeSession.type;
      endTime = activeSession.endTime;
      isPaused = !!activeSession.isPaused;
      remainingMs = activeSession.remainingMs || 0;
      activeType.textContent = activeSession.type;
      activeTitle.textContent = activeSession.title;
      countdown.textContent = formatTime(isPaused ? remainingMs : (endTime - Date.now()));
      showScreen("flow");

      flowTimer = setInterval(() => {
        if (isPaused) {
          countdown.textContent = formatTime(remainingMs);
          return;
        }
        const msLeft = endTime - Date.now();
        countdown.textContent = formatTime(msLeft);
        if (msLeft <= 0) {
          clearInterval(flowTimer);
          flowTimer = null;
          sessionHeading.textContent = sessionScreenHeading;
          showScreen("session");
        }
      }, 250);

      if (breathingState) handleBreathingState(breathingState);
    } else {
      // Session expired while popup closed
      await storage.set("brainsyncActiveSession", null);
    }
  }
}

document.getElementById("welcome-screen").addEventListener("click", transitionFromWelcome);
document.body.addEventListener("click", () => {
  ensureAudioReady();
}, { once: true });

const proceedBreathingBtn = document.getElementById("breathing-proceed-btn");
if (proceedBreathingBtn) {
  proceedBreathingBtn.addEventListener("click", () => {
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage({ action: "start_breathing_sequence" });
    }
  });
}

document.getElementById("home-btn").addEventListener("click", () => {
  sessionHeading.textContent = sessionScreenHeading;
  showScreen("session");
});
document.getElementById("flow-home").addEventListener("click", () => {
  sessionHeading.textContent = sessionScreenHeading;
  showScreen("session");
});
document.getElementById("cancel-flow").addEventListener("click", () => {
  const cancelBtn = document.getElementById("cancel-flow");
  if (!confirmEndArmed) {
    confirmEndArmed = true;
    cancelBtn.textContent = "Confirm end?";
    setTimeout(() => {
      confirmEndArmed = false;
      if (cancelBtn) cancelBtn.textContent = "End Early";
    }, 3000);
    return;
  }
  endFlowSession(false);
});

document.getElementById("session-notes-toggle").addEventListener("click", () => openPanel(notesPanel));
document.getElementById("session-settings-toggle").addEventListener("click", () => openPanel(settingsPanel));
document.getElementById("close-settings").addEventListener("click", () => closePanel(settingsPanel));
document.getElementById("close-notes").addEventListener("click", () => closePanel(notesPanel));

document.getElementById("save-notes").addEventListener("click", async () => {
  const currentUser = await storage.get("brainsyncUser", null);
  if (currentUser) {
    await storage.set(`brainsyncQuickNotes_${currentUser}`, quickNotesInput.value);
    showToast("Notes saved.");
  }
});

[popupSizeSelect, alarmSoundSelect, alarmVolumeInput, smallTimerSelect].forEach((input) => {
  input.addEventListener("change", async () => {
    const nextSettings = {
      popupSize: popupSizeSelect.value,
      alarmSound: alarmSoundSelect.value,
      alarmVolume: Number(alarmVolumeInput.value),
      smallTimer: smallTimerSelect.value
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
    objective: sessionObjectiveInput.value.trim(),
    intent: sessionObjectiveInput.value.trim()
  });
  await storage.set("brainsyncFocusLevel", 100);
  updateFocusMeter(100);
});

document.querySelectorAll(".dur-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    sessionTimeInput.value = btn.dataset.mins;
    document.querySelectorAll(".dur-btn").forEach(el => el.classList.remove("active"));
    btn.classList.add("active");
  });
});

const openWebsiteLoginBtn = document.getElementById("openWebsiteLogin");
if (openWebsiteLoginBtn) {
  openWebsiteLoginBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.create({ url: `${WEBSITE_URL}/#home` });
    } else {
      window.open(`${WEBSITE_URL}/#home`, "_blank");
    }
  });
}

const refreshAuthBtn = document.getElementById("refresh-auth");
if (refreshAuthBtn) {
  refreshAuthBtn.addEventListener("click", () => {
    init();
  });
}

init();
