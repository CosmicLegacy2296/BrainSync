let focusLevel = 100;
let maxPossibleFocus = 100;
let lastTabSwitchTime = Date.now();
let focusInterval = null;
let currentObjectiveKeywords = [];
let activeSessionActive = false;
let isBreathingSequenceActive = false;

const BAD_DOMAINS = ["youtube.com", "facebook.com", "instagram.com", "reddit.com", "netflix.com", "tiktok.com", "twitter.com", "x.com", "pinterest.com", "twitch.tv"];

function extractKeywords(text) {
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const stopWords = ["this", "that", "with", "from", "your", "have", "complete", "finish", "start", "doing", "some", "work", "session"];
  return words.filter(w => !stopWords.includes(w));
}

async function fetchSemanticKeywords(objective) {
  let words = extractKeywords(objective);
  try {
     const res = await fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(objective)}&max=15`);
     if (res.ok) {
        const data = await res.json();
        const related = data.map(item => item.word);
        words = [...new Set([...words, ...related])];
     }
  } catch(e) {}
  return words.filter(w => w.length > 3);
}

function startFocusTracking() {
  if (focusInterval) clearInterval(focusInterval);
  focusInterval = setInterval(() => {
    if (!activeSessionActive) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) return;
      const tab = tabs[0];
      if (!tab.url || tab.url.startsWith("chrome")) return;

      try {
        const urlObj = new URL(tab.url);
        const isBad = BAD_DOMAINS.some(d => urlObj.hostname.includes(d));

        if (isBad) {
           updateFocus(-2);
        } else {
           const timeOnTab = Date.now() - lastTabSwitchTime;
           if (timeOnTab > 20000) {
              updateFocus(2);
           }
        }
      } catch(e) {}
    });
  }, 5000);
}

async function updateFocus(delta) {
  if (delta < 0 && delta <= -5) {
     maxPossibleFocus = Math.max(50, maxPossibleFocus - Math.floor(Math.abs(delta) / 2));
  }
  focusLevel = Math.max(0, Math.min(maxPossibleFocus, focusLevel + delta));
  chrome.storage.local.set({ brainsyncFocusLevel: focusLevel });

  if (focusLevel < 20 && activeSessionActive) {
     const res = await chrome.storage.local.get(["brainsyncActiveSession"]);
     const session = res.brainsyncActiveSession;
     if (session && session.isActive && !session.hasBreathed) {
        triggerBreathingExercise(session);
     }
  }
}

chrome.tabs.onActivated.addListener(activeInfo => {
  if (!activeSessionActive) return;
  const now = Date.now();
  const timeSinceLast = now - lastTabSwitchTime;
  
  if (timeSinceLast < 10000) {
    updateFocus(-5);
  } else {
    updateFocus(-1);
  }
  lastTabSwitchTime = now;
  
  chrome.tabs.get(activeInfo.tabId, (tab) => {
     checkTabContent(tab);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!activeSessionActive) return;
  if (changeInfo.status === "complete") {
     checkTabContent(tab);
  }
});

function checkTabContent(tab) {
  if (!tab || !tab.url || tab.url.startsWith("chrome")) return;

  try {
    const urlObj = new URL(tab.url);
    const isBad = BAD_DOMAINS.some(d => urlObj.hostname.includes(d));
    if (isBad) {
      updateFocus(-15);
      return;
    }
  } catch (e) {}

  if (currentObjectiveKeywords.length === 0) return;

  chrome.tabs.sendMessage(tab.id, {
    action: "scan_keywords",
    keywords: currentObjectiveKeywords
  }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response && response.match === false) {
       updateFocus(-5);
    }
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.brainsyncActiveSession) {
    const s = changes.brainsyncActiveSession.newValue;
    if (s && s.isActive) {
      if (!activeSessionActive) {
        activeSessionActive = true;
        focusLevel = 100;
        maxPossibleFocus = 100;
        // isBreathingSequenceActive does not restart the tracking logically, it is local.
        lastTabSwitchTime = Date.now();
        chrome.storage.local.set({ brainsyncFocusLevel: focusLevel });
        currentObjectiveKeywords = extractKeywords(s.objective || "");
        fetchSemanticKeywords(s.objective || "").then(kw => {
           currentObjectiveKeywords = kw;
        });
        chrome.alarms.create("sessionEnd", { when: s.endTime });
        startFocusTracking();
      } else {
        if (!s.isPaused) {
           chrome.alarms.create("sessionEnd", { when: s.endTime });
           startFocusTracking();
        } else {
           chrome.alarms.clear("sessionEnd");
           if (focusInterval) {
             clearInterval(focusInterval);
             focusInterval = null;
           }
        }
      }
    } else {
      activeSessionActive = false;
      chrome.alarms.clear("sessionEnd");
      if (focusInterval) {
         clearInterval(focusInterval);
         focusInterval = null;
      }
      isBreathingSequenceActive = false;
      chrome.storage.local.set({ brainsyncBreathing: { isActive: false } });
    }
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("chrome-extension://")) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        }).catch(() => {});
        chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ["content.css"]
        }).catch(() => {});
      }
    }
  });
});

async function playAudioOffscreen(settings) {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play focus session completion alarm'
    });
  }

  chrome.runtime.sendMessage({
    action: "play_offscreen_audio",
    soundType: settings.alarmSound || "chime",
    volume: settings.alarmVolume || 0.45
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "sessionEnd") {
    const data = await chrome.storage.local.get(["brainsyncActiveSession", "brainsyncSettings", "brainsyncSessions"]);
    if (!data.brainsyncActiveSession || !data.brainsyncActiveSession.isActive) return;

    // Save completed session
    const sessions = data.brainsyncSessions || [];
    const completedSession = { ...data.brainsyncActiveSession, completedAt: new Date().toISOString() };
    delete completedSession.isActive;
    sessions.push(completedSession);
    
    // Clear active session
    activeSessionActive = false;
    if (focusInterval) {
       clearInterval(focusInterval);
       focusInterval = null;
    }
    await chrome.storage.local.set({
       brainsyncSessions: sessions,
       brainsyncActiveSession: null
    });

    // Trigger Chrome Notification
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon.png", // Fails gracefully to default icon if missing
      title: "BrainSync Timer Done",
       message: "Your focus session has finished! Complete your flow."
    });

    // Notify the popup (if it's currently open) so it shows the "done" toast
    chrome.runtime.sendMessage({ action: "play_alarm" }).catch(() => {});

    // Guaranteed way to play sound in Manifest V3 (Bypasses tab limitations)
    playAudioOffscreen(data.brainsyncSettings || {});
  }
});

async function playDirectOffscreenSound(action, soundType) {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length === 0) {
    if (action === "stop_music") return;
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play focus session sounds'
    });
  }

  chrome.runtime.sendMessage({
    action: action,
    soundType: soundType,
    volume: 0.5
  }).catch(() => {});
}

async function triggerBreathingExercise(session) {
  const remainingMs = session.endTime - Date.now();
  if (remainingMs <= 0) return;

  chrome.alarms.clear("sessionEnd");
  
  session.isPaused = true;
  session.remainingMs = remainingMs;
  session.hasBreathed = true;
  await chrome.storage.local.set({ 
    brainsyncActiveSession: session,
    brainsyncBreathing: { isActive: true, state: "message_prompt" }
  });

  playDirectOffscreenSound("play_offscreen_audio", "buzz");
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "start_breathing_sequence") {
    runBreathingSequence();
  }
});

async function runBreathingSequence() {
  if (isBreathingSequenceActive) return;
  isBreathingSequenceActive = true;

  await chrome.storage.local.set({ brainsyncBreathing: { isActive: true, state: "breathe_in" } });
  playDirectOffscreenSound("play_offscreen_audio", "calming_music");
  playDirectOffscreenSound("play_offscreen_audio", "breathe_in");

  let cycle = 0;
  const interval = setInterval(async () => {
    cycle++;
    if (cycle >= 4) {
      clearInterval(interval);
      playDirectOffscreenSound("stop_music");
      playDirectOffscreenSound("play_offscreen_audio", "resume_sound");
      
      const freshData = await chrome.storage.local.get(["brainsyncActiveSession"]);
      if (freshData.brainsyncActiveSession && freshData.brainsyncActiveSession.isActive) {
        const activeData = freshData.brainsyncActiveSession;
        activeData.isPaused = false;
        activeData.endTime = Date.now() + activeData.remainingMs;
        delete activeData.remainingMs;
        
        await chrome.storage.local.set({
          brainsyncActiveSession: activeData,
          brainsyncBreathing: { isActive: false }
        });
      } else {
        await chrome.storage.local.set({ brainsyncBreathing: { isActive: false } });
      }
      isBreathingSequenceActive = false;
    } else {
      if (cycle % 2 === 1) {
        await chrome.storage.local.set({ brainsyncBreathing: { isActive: true, state: "breathe_out" } });
        playDirectOffscreenSound("play_offscreen_audio", "breathe_out");
      } else {
        await chrome.storage.local.set({ brainsyncBreathing: { isActive: true, state: "breathe_in" } });
        playDirectOffscreenSound("play_offscreen_audio", "breathe_in");
      }
    }
  }, 6250);
}
