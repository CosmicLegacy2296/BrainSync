chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.brainsyncActiveSession) {
    const s = changes.brainsyncActiveSession.newValue;
    if (s && s.isActive) {
      chrome.alarms.create("sessionEnd", { when: s.endTime });
    } else {
      chrome.alarms.clear("sessionEnd");
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
