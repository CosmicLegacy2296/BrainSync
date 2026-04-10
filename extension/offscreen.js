let activeMusicNodes = [];
let audioContext = null;

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.action === "play_offscreen_audio") {
    await playSoftAlarm(msg.soundType, msg.volume);
  } else if (msg.action === "stop_music") {
    activeMusicNodes.forEach(node => {
      try { node.stop(); } catch(e) {}
    });
    activeMusicNodes = [];
  } else if (msg.action === "close_offscreen") {
    window.close();
  }
});

async function playSoftAlarm(soundType, volume) {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  const now = audioContext.currentTime;
  const outputGain = audioContext.createGain();
  outputGain.connect(audioContext.destination);
  outputGain.gain.value = Math.max(0.05, Math.min(1, Number(volume) || 0.45));

  if (soundType === "buzz") {
    const osc = audioContext.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
    osc.connect(outputGain);
    osc.start(now);
    osc.stop(now + 0.4);
    setTimeout(() => { if (!activeMusicNodes.length) window.close(); }, 1000);
    return;
  }

  if (soundType === "breathe_in") {
    const osc = audioContext.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 6);
    osc.connect(outputGain);
    osc.start(now);
    osc.stop(now + 6.2);
    return;
  }

  if (soundType === "breathe_out") {
    const osc = audioContext.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 6);
    osc.connect(outputGain);
    osc.start(now);
    osc.stop(now + 6.2);
    return;
  }

  if (soundType === "resume_sound") {
    const osc = audioContext.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);
    osc.connect(outputGain);
    osc.start(now);
    osc.stop(now + 0.4);
    setTimeout(() => { if (!activeMusicNodes.length) window.close(); }, 1000);
    return;
  }

  if (soundType === "calming_music") {
    const freqs = [261.63, 329.63, 392.00, 523.25]; // C major 7 chord components
    freqs.forEach((freq, idx) => {
      const osc = audioContext.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      
      const lfo = audioContext.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.1 + (idx * 0.05); // slow throb
      const lfoGain = audioContext.createGain();
      lfoGain.gain.value = 0.5 * outputGain.gain.value;
      lfo.connect(lfoGain.gain);
      lfo.start();

      const mainGain = audioContext.createGain();
      mainGain.gain.value = 0.1 * outputGain.gain.value;
      
      osc.connect(mainGain);
      mainGain.connect(outputGain);
      lfoGain.connect(mainGain.gain);

      osc.start(now);
      activeMusicNodes.push(osc);
    });
    return;
  }

  // Legacy alarm profiles
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

  if (!activeMusicNodes.length && soundType !== "calming_music" && soundType !== "breathe_in" && soundType !== "breathe_out") {
    setTimeout(() => {
      if (!activeMusicNodes.length) window.close();
    }, 4500);
  }
}

