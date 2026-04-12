let activeSession = null;
let settings = null;
let timerInterval = null;
let container = null;
let audioContext = null;
let currentFocusLevel = 100;
let previousFocusLevel = 100;
let focusTrendDecreasing = false;
let currentDistractionRisk = 0;
let lastOverlayWarningTime = 0;
let breathingState = null;
let breathingHideTimeout = null;

function makeDraggable(elmnt) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  elmnt.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e = e || window.event;
    if (e.target && e.target.classList && e.target.classList.contains('bs-mini-close')) return;
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
  const result = await chrome.storage.local.get([
    "brainsyncActiveSession", "brainsyncSettings", "brainsyncSessions", 
    "brainsyncFocusLevel", "brainsyncDistractionRisk", "brainsyncBreathing"
  ]);
  activeSession = result.brainsyncActiveSession;
  currentFocusLevel = result.brainsyncFocusLevel ?? 100;
  previousFocusLevel = Math.max(0, Math.min(100, Math.round(Number(currentFocusLevel) || 100)));
  focusTrendDecreasing = false;
  currentDistractionRisk = result.brainsyncDistractionRisk || 0;
  breathingState = result.brainsyncBreathing || null;
  settings = result.brainsyncSettings || { smallTimer: "on" };
  if (result.brainsyncSessions) {
    window.postMessage({ type: "FROM_BRAINSYNC_EXT_SYNC", sessions: result.brainsyncSessions }, "*");
  }
  updateUI();
  handleMiniBreathing(breathingState);
  handleRiskWarning();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.brainsyncBreathing) {
       breathingState = changes.brainsyncBreathing.newValue;
       handleMiniBreathing(breathingState);
    }
    if (changes.brainsyncActiveSession) {
       activeSession = changes.brainsyncActiveSession.newValue;
       updateUI();
    }
    if (changes.brainsyncSettings) {
       settings = changes.brainsyncSettings.newValue;
       updateUI();
    }
    if (changes.brainsyncFocusLevel) {
       const raw = changes.brainsyncFocusLevel.newValue ?? 100;
       currentFocusLevel = raw;
       const safeNew = Math.max(0, Math.min(100, Math.round(Number(raw))));
       if (safeNew < previousFocusLevel) {
         focusTrendDecreasing = true;
       } else if (safeNew > previousFocusLevel) {
         focusTrendDecreasing = false;
       }
       previousFocusLevel = safeNew;
       updateFocusBar();
       handleRiskWarning();
    }
    if (changes.brainsyncDistractionRisk) {
       currentDistractionRisk = changes.brainsyncDistractionRisk.newValue || 0;
       handleRiskWarning();
    }
    if (changes.brainsyncSessions) {
       window.postMessage({ type: "FROM_BRAINSYNC_EXT_SYNC", sessions: changes.brainsyncSessions.newValue }, "*");
    }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "play_alarm") {
     const s = msg.settings || settings || {};
     playSoftAlarm(s.alarmSound || "chime", s.alarmVolume || 0.45);
  }
  if (msg.action === "scan_keywords") {
    const text = document.body.innerText.toLowerCase();
    const keywords = msg.keywords || [];
    let matchFound = false;
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) {
        matchFound = true;
        break;
      }
    }
    sendResponse({ match: matchFound });
  }
});

window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data) return;
  if (event.data.type === "FROM_BRAINSYNC_WEB") {
    if (event.data.action === "START_SESSION") {
      chrome.storage.local.set({ 
        brainsyncActiveSession: event.data.sessionData
      });
    } else if (event.data.action === "CLEAR_DATA") {
      chrome.storage.local.set({ 
        brainsyncSessions: [],
        brainsyncActiveSession: null
      });
    }
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

  if (!container) {
     container = document.createElement("div");
     container.id = "brainsync-mini-timer-container";
     container.innerHTML = `
        <div class="bs-mini-glow"></div>
        <div class="bs-mini-close">&times;</div>
        <div class="bs-mini-content">
          <div class="bs-mini-header">BrainSync Focus</div>
          <div class="bs-mini-title"></div>
          <div class="bs-mini-countdown"></div>
          <div class="bs-mini-focus">Focus: <span class="bs-mini-focus-text">100%</span></div>
          <div class="bs-mini-focus-bar-bg"><div class="bs-mini-focus-bar-fill"></div></div>
          <div class="bs-mini-risk-warning" style="display:none; color:#ffb347; font-size:10px; margin-top:6px; text-align:center; font-weight:bold; transition:all 0.3s ease;"></div>
        </div>
        <div class="bs-mini-risk-overlay" style="display:none; opacity:0; position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(255,50,50,0.95); color:white; flex-direction:column; align-items:center; justify-content:center; border-radius:inherit; transition:opacity 0.2s ease; z-index:10; pointer-events:none;">
          <div class="bs-mini-risk-overlay-line1" style="font-weight:900; font-size:12px; text-align:center; margin-bottom:4px; letter-spacing:0.5px;">Low focus detected.</div>
          <div class="bs-mini-risk-overlay-line2" style="font-size:10px; text-align:center; padding:0 8px;">Focus on task.</div>
        </div>
        <div class="bs-mini-breathing-overlay" style="display: none; opacity: 0; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
          <div class="bs-mini-pause-text" style="color: #ffeb3b; font-size: 11px; text-align: center; margin-bottom: 6px; font-weight: 600;">Your Losing Focus. Breathe To Re-Sync Your Brain</div>
          <button class="bs-mini-proceed-btn" style="background:#ffd24a; color:#111; border:none; padding:4px 8px; border-radius:4px; font-size:10px; font-weight:bold; cursor:pointer; margin-bottom: 8px;">Proceed</button>
          <div class="bs-mini-breathe-circle-container" style="display: none;">
            <div class="bs-mini-breathe-ripple"></div>
            <div class="bs-mini-breathe-circle"></div>
          </div>
          <div class="bs-mini-breathe-text" style="color: white; font-size: 11px; font-weight: bold; margin-top: 8px; display: none;"></div>
        </div>
     `;
     document.body.appendChild(container);
     
     const closeBtn = container.querySelector(".bs-mini-close");
     closeBtn.addEventListener("click", () => {
        container.style.opacity = "0";
        setTimeout(() => {
          if (container) container.remove();
          container = null;
        }, 300);
        if (timerInterval) {
           clearInterval(timerInterval);
           timerInterval = null;
        }
     });

     const proceedBtn = container.querySelector(".bs-mini-proceed-btn");
     proceedBtn.addEventListener("click", () => {
         chrome.runtime.sendMessage({ action: "start_breathing_sequence" });
     });
     
     container.offsetHeight;
     container.style.opacity = "1";

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
        const countdownEl = container.querySelector(".bs-mini-countdown");
        if (activeSession.isPaused) {
           if (countdownEl) countdownEl.textContent = formatTime(activeSession.remainingMs);
           return;
        }
        const msLeft = activeSession.endTime - Date.now();
        if (countdownEl) {
           countdownEl.textContent = formatTime(msLeft);
        }
        if (msLeft <= 0) {
           updateUI(); 
        }
     }, 1000);
  }

  container.querySelector(".bs-mini-title").textContent = activeSession.title;
  const initialMsLeft = activeSession.isPaused ? activeSession.remainingMs : (activeSession.endTime - Date.now());
  container.querySelector(".bs-mini-countdown").textContent = formatTime(initialMsLeft);
  updateFocusBar();

  if (breathingState) handleMiniBreathing(breathingState);
  handleRiskWarning();
}

function handleRiskWarning() {
  if (!container) return;
  const warningText = container.querySelector(".bs-mini-risk-warning");
  const riskOverlay = container.querySelector(".bs-mini-risk-overlay");
  if (!warningText || !riskOverlay) return;

  const safeFocus = Math.max(0, Math.min(100, Math.round(Number(currentFocusLevel) || 0)));
  const focusLowAndDrifting = focusTrendDecreasing && safeFocus < 50;
  const focusMidDrifting =
    focusTrendDecreasing && safeFocus >= 50 && safeFocus < 70;

  if (focusLowAndDrifting) {
    warningText.style.display = "block";
    warningText.style.color = "#ff4d4d";
    warningText.textContent = "Low focus detected. Focus on task.";
    container.style.boxShadow = "0 0 20px rgba(255, 0, 0, 0.8)";

    const now = Date.now();
    if (now - lastOverlayWarningTime > 45000) {
       lastOverlayWarningTime = now;
       riskOverlay.style.display = "flex";
       setTimeout(() => riskOverlay.style.opacity = "1", 10);
       setTimeout(() => {
          riskOverlay.style.opacity = "0";
          setTimeout(() => {
            if (riskOverlay) riskOverlay.style.display = "none";
          }, 200);
       }, 2000);
    }
    return;
  }

  riskOverlay.style.opacity = "0";
  riskOverlay.style.display = "none";

  if (focusMidDrifting) {
    warningText.style.display = "block";
    warningText.style.color = "#ffb347";
    warningText.textContent = "Losing focus";
    container.style.boxShadow = "0 0 15px rgba(255, 179, 71, 0.55)";
    return;
  }

  warningText.style.display = "none";
  container.style.boxShadow = "";
}

function handleMiniBreathing(data) {
  if (!container) return;
  const contentEl = container.querySelector(".bs-mini-content");
  const overlayEl = container.querySelector(".bs-mini-breathing-overlay");
  if (!contentEl || !overlayEl) return;

  if (data && data.isActive) {
    if (breathingHideTimeout) {
      clearTimeout(breathingHideTimeout);
      breathingHideTimeout = null;
    }
    contentEl.style.display = "none";
    overlayEl.style.display = "flex";
    setTimeout(() => overlayEl.style.opacity = "1", 10);
    
    const circle = overlayEl.querySelector(".bs-mini-breathe-circle");
    const containerInner = overlayEl.querySelector(".bs-mini-breathe-circle-container");
    const text = overlayEl.querySelector(".bs-mini-breathe-text");
    const proceedBtn = overlayEl.querySelector(".bs-mini-proceed-btn");
    
    if (data.state === "message_prompt" || data.state === "message") {
      proceedBtn.style.display = "block";
      containerInner.style.display = "none";
      text.style.display = "none";
      circle.className = "bs-mini-breathe-circle";
      text.textContent = "";
      text.style.opacity = "0";
      containerInner.classList.remove("animating");
    } else {
      proceedBtn.style.display = "none";
      containerInner.style.display = "flex";
      text.style.display = "block";
      containerInner.classList.add("animating");
      
      if (data.state === "breathe_in") {
        circle.className = "bs-mini-breathe-circle breathe-in";
        text.textContent = "Breathe In";
        text.style.opacity = "1";
      } else if (data.state === "breathe_out") {
        circle.className = "bs-mini-breathe-circle breathe-out";
        text.textContent = "Breathe Out";
        text.style.opacity = "1";
      }
    }
  } else {
    overlayEl.style.opacity = "0";
    if (breathingHideTimeout) {
      clearTimeout(breathingHideTimeout);
    }
    breathingHideTimeout = setTimeout(() => {
      overlayEl.style.display = "none";
      contentEl.style.display = "block";
      const containerInner = overlayEl.querySelector(".bs-mini-breathe-circle-container");
      if (containerInner) containerInner.classList.remove("animating");
    }, 300);
  }
}

function updateFocusBar() {
  if (!container) return;
  const levelText = container.querySelector(".bs-mini-focus-text");
  const barFill = container.querySelector(".bs-mini-focus-bar-fill");
  if (levelText && barFill) {
    const safeLevel = Math.max(0, Math.min(100, Math.round(currentFocusLevel)));
    levelText.textContent = `${safeLevel}%`;
    barFill.style.width = `${safeLevel}%`;
    const lowAndDrifting = focusTrendDecreasing && safeLevel < 50;
    if (lowAndDrifting) {
      barFill.style.background = "linear-gradient(90deg, #ff4d4d, #ff8080)";
    } else if (safeLevel < 70) {
      barFill.style.background = "linear-gradient(90deg, #ffb347, #ffcc33)";
    } else {
      barFill.style.background = "linear-gradient(90deg, #18c2ff, #7cf8e3)";
    }
  }
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
