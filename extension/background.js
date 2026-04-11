let currentObjectiveKeywords = [];
let activeSessionActive = false;
let isBreathingSequenceActive = false;
let engine = null;

const UTILITY_DOMAINS = ["google.com", "docs.google.com", "stackoverflow.com", "calculator.net", "wikipedia.org"];
const BAD_DOMAINS = ["youtube.com", "facebook.com", "instagram.com", "reddit.com", "netflix.com", "tiktok.com", "twitter.com", "x.com", "pinterest.com", "twitch.tv", "spotify.com"];

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

class FocusEngine {
  constructor(session) {
    this.session = session;
    this.active = true;
    
    this.actualFocus = 100;
    this.displayedFocus = 100;
    this.actualRisk = 0;
    this.displayedRisk = 0;
    
    this.focusStreakTime = 0;
    this.peekCount = 0;
    this.recentBadEvents = 0;
    this.nearDistractions = 0;
    this.recoveryAttempts = 0;
    this.longestStreak = 0;
    this.lastTabWasHighDopamine = false;
    
    this.reward30 = false;
    this.reward60 = false;
    this.reward120 = false;
    this.wasHighRisk = false;
    this.resetApplied = false;

    this.lastTickTime = Date.now();
    this.lastTabSwitchTime = Date.now();
    
    this.intervalId = setInterval(() => this.tick(), 2000); 

    this.maxSessionTime = 120 * 60 * 1000;
    this.T_total_expected = 30 * 60 * 1000;
    
    let nTime = this.T_total_expected / this.maxSessionTime;
    this.normalizedTime = Math.min(1, Math.max(0, nTime));
    
    this.syncStorage();
  }
  
  stop() {
    this.active = false;
    clearInterval(this.intervalId);
  }

  lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
  }

  syncStorage() {
    chrome.storage.local.set({ 
      brainsyncFocusLevel: this.displayedFocus,
      brainsyncDistractionRisk: this.displayedRisk
    });
  }

  getMultiplier() {
    return Math.min(2.5, 1 + this.recentBadEvents * 0.3);
  }

  applyReward(baseReward) {
    const factor = this.lerp(1.5, 0.7, this.normalizedTime);
    this.actualFocus = Math.min(100, this.actualFocus + baseReward * factor);
  }

  applyPenalty(basePenalty) {
    const factor = this.lerp(0.8, 1.5, this.normalizedTime);
    this.actualFocus = Math.max(0, this.actualFocus - basePenalty * factor * this.getMultiplier());
  }

  addRisk(amount) {
    const factor = this.lerp(0.8, 1.5, this.normalizedTime);
    const finalAmt = amount * factor * this.getMultiplier();
    this.actualRisk = Math.min(100, this.actualRisk + finalAmt);

    if (this.actualRisk > 70 && !this.wasHighRisk) {
         this.nearDistractions++;
         this.wasHighRisk = true;
    }
    
    this.recentBadEvents++;
    setTimeout(() => { if(this.recentBadEvents > 0) this.recentBadEvents--; }, 60000);
  }

  decayRisk(deltaTime) {
    if (this.wasHighRisk && this.actualRisk < 40) {
       this.recoveryAttempts++;
       this.wasHighRisk = false;
    }

    let decayRate = 1; 
    if (this.focusStreakTime > 120000) {
      decayRate *= 1.5;
    }
    this.actualRisk = Math.max(0, this.actualRisk - (decayRate * (deltaTime / 1000)));

    if (this.focusStreakTime > 180000) {
      if (!this.resetApplied) {
         this.actualRisk *= 0.5;
         this.resetApplied = true;
      }
    } else {
      this.resetApplied = false;
    }
  }

  tick() {
    if (!this.active) return;
    const now = Date.now();
    const deltaTime = now - this.lastTickTime;
    this.lastTickTime = now;

    this.focusStreakTime += deltaTime;
    this.longestStreak = Math.max(this.longestStreak, this.focusStreakTime);

    if (this.focusStreakTime > 30000 && !this.reward30) { this.applyReward(2); this.reward30 = true; }
    if (this.focusStreakTime > 60000 && !this.reward60) { this.applyReward(5); this.reward60 = true; }
    if (this.focusStreakTime > 120000 && !this.reward120) { this.applyReward(10); this.reward120 = true; }

    let sessionRemaining = this.session.endTime - now;
    if (this.session.isPaused) sessionRemaining = this.session.remainingMs;
    let totalAssumed = 30 * 60 * 1000;
    let elapsed = totalAssumed - sessionRemaining;
    if (elapsed > 0 && elapsed / totalAssumed > 0.8) {
       this.actualRisk = Math.min(100, this.actualRisk + (0.5 * (deltaTime/1000)));
    }

    this.decayRisk(deltaTime);

    this.displayedFocus = this.lerp(this.displayedFocus, this.actualFocus, 0.2);
    this.displayedRisk = this.lerp(this.displayedRisk, this.actualRisk, 0.2);
    
    this.syncStorage();

    if (this.actualFocus < 20 && this.session && !this.session.hasBreathed) {
       triggerBreathingExercise(this.session);
    }
  }

  onTabSwitch(tab, isCompleteUpdate = false) {
    if (!this.active) return;
    const now = Date.now();
    const timeOnTab = now - this.lastTabSwitchTime;
    
    const wasQuickSwitch = timeOnTab < 5000 && !isCompleteUpdate;
    if (!isCompleteUpdate) {
      this.lastTabSwitchTime = now;
      this.focusStreakTime = 0;
      this.reward30 = false;
      this.reward60 = false;
      this.reward120 = false;
    }

    if (!tab || !tab.url || tab.url.startsWith("chrome")) {
      this.applyPenalty(wasQuickSwitch ? 5 : 1);
      this.addRisk(wasQuickSwitch ? 10 : 2);
      return;
    }

    let isHighDopamine = false;
    let isUtility = false;
    try {
      const urlObj = new URL(tab.url);
      isHighDopamine = BAD_DOMAINS.some(d => urlObj.hostname.includes(d));
      isUtility = UTILITY_DOMAINS.some(d => urlObj.hostname.includes(d));
    } catch(e) {}

    if (!isCompleteUpdate) {
       if (this.lastTabWasHighDopamine && timeOnTab < 10000) {
          this.actualFocus = Math.min(100, this.actualFocus + 5);
          this.actualRisk = Math.max(0, this.actualRisk - 10);
       }
       this.lastTabWasHighDopamine = isHighDopamine;
    }

    if (currentObjectiveKeywords.length === 0) {
      this.applyClassification(wasQuickSwitch, isHighDopamine, isUtility, false);
      return;
    }

    chrome.tabs.sendMessage(tab.id, {
      action: "scan_keywords",
      keywords: currentObjectiveKeywords
    }, (response) => {
      if (chrome.runtime.lastError) {
         this.applyClassification(wasQuickSwitch, isHighDopamine, isUtility, false);
         return;
      }
      this.applyClassification(wasQuickSwitch, isHighDopamine, isUtility, response && response.match === true);
    });
  }

  applyClassification(wasQuickSwitch, isHighDopamine, isUtility, isMatch) {
    let type = "irrelevant";
    let conf = 0.7;

    if (isMatch) { type = "relevant"; conf = 1.0; }
    else if (isHighDopamine) { type = "high_distraction"; conf = 0.9; }
    else if (isUtility) { type = "neutral"; conf = 0.6; }

    if (type === "relevant") {
       // do nothing
    } else if (type === "neutral") {
       if (wasQuickSwitch) {
         this.peekCount++;
         this.addRisk(5 * conf);
         this.applyPenalty(2 * conf);
       }
    } else if (type === "irrelevant") {
       this.applyPenalty((wasQuickSwitch ? 5 : 2) * conf);
       this.addRisk((wasQuickSwitch ? 10 : 5) * conf);
       if (wasQuickSwitch) this.peekCount++;
    } else if (type === "high_distraction") {
       this.applyPenalty(15 * conf);
       this.addRisk(20 * conf);
       if (wasQuickSwitch) this.peekCount++;
    }
  }

  getEfficiency() {
    return {
       focusEfficiency: Math.round(this.actualFocus),
       nearDistractions: this.nearDistractions,
       recoveryAttempts: this.recoveryAttempts,
       longestStreak: Math.round(this.longestStreak / 1000) 
    };
  }
}

chrome.tabs.onActivated.addListener(activeInfo => {
  if (!activeSessionActive || !engine) return;
  chrome.tabs.get(activeInfo.tabId, (tab) => {
     engine.onTabSwitch(tab, false);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!activeSessionActive || !engine) return;
  if (changeInfo.status === "complete") {
     engine.onTabSwitch(tab, true);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.brainsyncActiveSession) {
    const s = changes.brainsyncActiveSession.newValue;
    if (s && s.isActive) {
      if (!activeSessionActive) {
        activeSessionActive = true;
        currentObjectiveKeywords = extractKeywords(s.objective || "");
        fetchSemanticKeywords(s.objective || "").then(kw => {
           currentObjectiveKeywords = kw;
        });
        
        if (engine) engine.stop();
        engine = new FocusEngine(s);
        
        chrome.alarms.create("sessionEnd", { when: s.endTime });
      } else {
        if (!s.isPaused) {
           chrome.alarms.create("sessionEnd", { when: s.endTime });
           if (engine) engine.session = s;
        } else {
           chrome.alarms.clear("sessionEnd");
           if (engine) engine.session = s;
        }
      }
    } else {
      activeSessionActive = false;
      chrome.alarms.clear("sessionEnd");
      if (engine) {
          engine.stop();
          engine = null;
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

    const sessions = data.brainsyncSessions || [];
    const completedSession = { 
        ...data.brainsyncActiveSession, 
        completedAt: new Date().toISOString() 
    };
    if (engine) {
        completedSession.analytics = engine.getEfficiency();
    }
    delete completedSession.isActive;
    sessions.push(completedSession);
    
    activeSessionActive = false;
    if (engine) {
        engine.stop();
        engine = null;
    }
    await chrome.storage.local.set({
       brainsyncSessions: sessions,
       brainsyncActiveSession: null
    });

    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon.png",
      title: "BrainSync Timer Done",
      message: "Your focus session has finished! Complete your flow."
    });

    chrome.runtime.sendMessage({ action: "play_alarm" }).catch(() => {});
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
  
  if (engine) engine.session = session;

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
        
        if (engine) engine.session = activeData;

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
