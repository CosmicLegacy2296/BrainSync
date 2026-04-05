let activeSession = null;
let settings = null;
let timerInterval = null;
let container = null;
let audioContext = null;

function makeDraggable(elmnt) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  elmnt.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
    elmnt.style.transition = "none";
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
    elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    elmnt.style.bottom = "auto";
    elmnt.style.right = "auto";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
    elmnt.style.transition = "opacity 0.3s ease";
    chrome.storage.local.set({ 
      brainsyncTimerPos: { top: elmnt.style.top, left: elmnt.style.left } 
    });
  }
}

async function init() {
  const result = await chrome.storage.local.get(["brainsyncActiveSession", "brainsyncSettings", "brainsyncSessions"]);
  activeSession = result.brainsyncActiveSession;
  settings = result.brainsyncSettings || { smallTimer: "on" };
  if (result.brainsyncSessions) {
    window.postMessage({ type: "FROM_BRAINSYNC_EXT_SYNC", sessions: result.brainsyncSessions }, "*");
  }
  updateUI();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.brainsyncActiveSession) {
       activeSession = changes.brainsyncActiveSession.newValue;
       updateUI();
    }
    if (changes.brainsyncSettings) {
       settings = changes.brainsyncSettings.newValue;
       updateUI();
    }
    if (changes.brainsyncSessions) {
       window.postMessage({ type: "FROM_BRAINSYNC_EXT_SYNC", sessions: changes.brainsyncSessions.newValue }, "*");
    }
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "play_alarm") {
     const s = msg.settings || settings || {};
     playSoftAlarm(s.alarmSound || "chime", s.alarmVolume || 0.45);
  }
});

window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data) return;
  if (event.data.type === "FROM_BRAINSYNC_WEB" && event.data.action === "START_SESSION") {
    // Forward to extension storage to trigger timer
    chrome.storage.local.set({ 
      brainsyncActiveSession: event.data.sessionData
    });
  }
});

function formatTime(msLeft) {
  const totalSeconds = Math.max(0, Math.ceil(msLeft / 1000));
  const mins = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const secs = String(totalSeconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function updateUI() {
  if (!activeSession || !activeSession.isActive || settings.smallTimer === "off") {
    if (container) {
       container.style.opacity = "0";
       setTimeout(() => {
         if (container) container.remove();
         container = null;
       }, 300);
    }
    if (timerInterval) {
       clearInterval(timerInterval);
       timerInterval = null;
    }
    return;
  }

  // Create UI if not exists
  if (!container) {
     container = document.createElement("div");
     container.id = "brainsync-mini-timer-container";
     container.innerHTML = `
        <div class="bs-mini-glow"></div>
        <div class="bs-mini-content">
          <div class="bs-mini-header">BrainSync Focus</div>
          <div class="bs-mini-title"></div>
          <div class="bs-mini-countdown"></div>
        </div>
     `;
     document.body.appendChild(container);
     
     // Fade in
     container.offsetHeight;
     container.style.opacity = "1";

     // Restore custom position if saved
     chrome.storage.local.get("brainsyncTimerPos", (data) => {
        if (data.brainsyncTimerPos) {
           container.style.top = data.brainsyncTimerPos.top;
           container.style.left = data.brainsyncTimerPos.left;
           container.style.bottom = "auto";
           container.style.right = "auto";
        }
     });

     makeDraggable(container);

     timerInterval = setInterval(() => {
        if (!activeSession) return;
        const msLeft = activeSession.endTime - Date.now();
        const countdownEl = container.querySelector(".bs-mini-countdown");
        if (countdownEl) {
           countdownEl.textContent = formatTime(msLeft);
        }
        if (msLeft <= 0) {
           updateUI(); 
        }
     }, 1000);
  }

  container.querySelector(".bs-mini-title").textContent = activeSession.title;
  const initialMsLeft = activeSession.endTime - Date.now();
  container.querySelector(".bs-mini-countdown").textContent = formatTime(initialMsLeft);
}

async function ensureAudioReady() {
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    audioContext = new Ctx();
  }
  if (audioContext.state === "suspended") {
    try { await audioContext.resume(); } catch(e) { return false; }
  }
  return true;
}

async function playSoftAlarm(soundType, volume) {
  const ready = await ensureAudioReady();
  if (!ready) return;

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

init();
