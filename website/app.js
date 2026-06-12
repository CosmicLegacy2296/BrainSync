// FOCUS_BANDS - keep in sync with background.js, popup.js, and content.js
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

const app = {
  views: {
    home: `
      <div class="hero-container">
        <h1 class="hero-title">Enter a <span class="accent">Flow State</span><br>with BrainSync.</h1>
        <p class="hero-subtitle">The premium focus timer that syncs your brain to deep work seamlessly. Stay undistracted, achieve your goals.</p>
        <button class="btn-primary" onclick="app.navigate('quickstart')">Get Started</button>
      </div>
    `,
    quickstart: `
      <div class="sessions-header preset-header">
        <h2>Quick Start</h2>
        <div class="header-actions">
          <button class="action-btn" onclick="app.openPresetModal()">➕ Add Preset</button>
          <button class="action-btn outline-btn" id="toggle-edit-btn" onclick="app.toggleEditMode()">✏️ Edit Presets</button>
        </div>
      </div>
      <p class="view-subtitle">Jump into a pre-configured flow state session.</p>
      <div class="onboarding-callout hidden" id="preset-onboarding">Your default presets are ready! Click any to start a session.</div>
      <div class="sessions-list" id="quickstart-list-container">
        <!-- Injected via JS -->
      </div>
    `,
    insights: `
      <div class="sessions-header">
        <h2>Insights</h2>
      </div>
      <p class="view-subtitle">View your completed sessions and focus history.</p>
      <div class="sessions-list" id="insights-list-container">
        <!-- Injected via JS -->
      </div>
    `
  },

  currentUser: null,
  isEditingPresets: false,
  mockSessions: [],

  showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.add("hidden"), 3000);
  },

  async loadPresets() {
    if (!this.currentUser) return;
    try {
      const res = await fetch(`/api/presets?username=${encodeURIComponent(this.currentUser)}`);
      if (res.ok) {
        const data = await res.json();
        this.mockSessions = this.mockSessions.filter(s => s.type !== "preset");
        this.mockSessions.push(...data);
      }
    } catch (e) {
      console.error("Failed to load presets from server", e);
    }
  },

  async loadInsights() {
    if (!this.currentUser) return;
    try {
      const res = await fetch(`/api/insights?username=${encodeURIComponent(this.currentUser)}`);
      if (res.ok) {
        const data = await res.json();
        const extSessions = data.map((s, index) => ({
          id: "ext_" + index,
          title: s.title,
          duration: s.duration || s.timeMinutes || Math.round((s.endTime - s.startTime) / 60000) || 0,
          intent: s.intent || s.objective || "Self-guided session",
          stats: "Completed " + new Date(s.completedAt).toLocaleTimeString(),
          type: "history",
          analytics: s.analytics || null
        }));
        this.mockSessions = this.mockSessions.filter(s => s.type !== "history");
        this.mockSessions.push(...extSessions);
      }
    } catch (e) {
      console.error("Failed to load insights from server", e);
    }
  },

  renderAuthUI() {
    const authContainer = document.getElementById("authContainer");
    const loginWall = document.getElementById("loginWall");
    const contentArea = document.getElementById("app-content");

    if (this.currentUser) {
      if (loginWall) loginWall.style.display = "none";
      if (contentArea) contentArea.style.display = "flex";
      if (authContainer) {
        authContainer.innerHTML = `
          <span class="logged-in-label">Logged in as ${this.currentUser}</span>
          <button class="action-btn outline-btn compact-btn" id="logoutBtn">Logout</button>
        `;
        document.getElementById("logoutBtn").addEventListener("click", () => this.logout());
      }
    } else {
      if (loginWall) loginWall.style.display = "grid";
      if (contentArea) contentArea.style.display = "none";
      if (authContainer) authContainer.innerHTML = "";
    }
  },

  logout() {
    this.currentUser = null;
    localStorage.removeItem("brainsyncUser");
    window.postMessage({
      type: "FROM_BRAINSYNC_WEB",
      action: "LOGOUT"
    }, "*");
    this.renderAuthUI();
    this.navigate("home");
  },

  async init() {
    this.contentArea = document.getElementById("app-content");
    this.navLinks = document.querySelectorAll(".nav-link");
    this.navBrand = document.querySelector(".nav-brand");

    this.currentUser = localStorage.getItem("brainsyncUser");
    this.renderAuthUI();

    if (this.currentUser) {
      window.postMessage({
        type: "FROM_BRAINSYNC_WEB",
        action: "LOGIN",
        userId: this.currentUser
      }, "*");
    }

    // Auth Logic - matching SteadySync
    const loginForm = document.getElementById("loginForm");
    const loginError = document.getElementById("loginError");
    const emailInput = document.getElementById("emailInput");
    const identityInput = document.getElementById("identityInput");
    const loginSubmitBtn = document.getElementById("loginSubmitBtn");
    const toggleCreateAccountBtn = document.getElementById("toggleCreateAccountBtn");

    let isCreateAccountMode = false;

    function setAuthMode(createMode) {
      isCreateAccountMode = !!createMode;
      if (!emailInput || !identityInput || !loginSubmitBtn || !toggleCreateAccountBtn) return;

      emailInput.style.display = isCreateAccountMode ? 'block' : 'none';
      emailInput.required = isCreateAccountMode;
      identityInput.placeholder = isCreateAccountMode ? 'Username' : 'Username or Email';
      loginSubmitBtn.textContent = isCreateAccountMode ? 'Create Account' : 'Login';
      toggleCreateAccountBtn.textContent = isCreateAccountMode ? 'Back to login' : 'Create an account';
      loginError.style.display = 'none';
    }

    if (toggleCreateAccountBtn) {
      toggleCreateAccountBtn.addEventListener("click", () => {
        setAuthMode(!isCreateAccountMode);
      });
    }

    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const identity = identityInput ? identityInput.value.trim() : '';
        const pass = document.getElementById("passwordInput").value;
        const email = emailInput ? emailInput.value.trim() : '';

        loginError.style.display = 'none';

        if (isCreateAccountMode && !email) {
          loginError.textContent = 'Email is required to create an account.';
          loginError.style.display = 'block';
          return;
        }

        try {
          const endpoint = isCreateAccountMode ? '/api/signup' : '/api/login';
          const payload = isCreateAccountMode
            ? { username: identity, email, password: pass }
            : { identity, password: pass };

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const data = await response.json();

          if (!response.ok) {
            loginError.textContent = data.error || 'Authentication failed.';
            loginError.style.display = 'block';
            return;
          }

          const loggedInUser = data.user?.username || data.user?.email || identity;
          this.currentUser = loggedInUser;
          localStorage.setItem("brainsyncUser", loggedInUser);
          this.renderAuthUI();

          window.postMessage({
            type: "FROM_BRAINSYNC_WEB",
            action: "LOGIN",
            userId: loggedInUser
          }, "*");

          if (isCreateAccountMode && emailInput) {
            emailInput.value = '';
          }
          setAuthMode(false);
          await this.loadPresets();
          this.navigate("home");
        } catch (err) {
          loginError.textContent = 'Server error. Please try again.';
          loginError.style.display = 'block';
        }
      });
    }

    setAuthMode(false);

    this.navLinks.forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const route = e.target.getAttribute("data-route");
        this.navigate(route);
      });
    });

    this.navBrand.addEventListener("click", () => this.navigate('home'));

    const initialRoute = window.location.hash.replace('#', '') || 'home';
    this.navigate(initialRoute);
  },

  async navigate(route) {
    if (!this.views[route]) route = 'home';

    window.location.hash = route;

    this.navLinks.forEach(link => {
      if (link.getAttribute("data-route") === route) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });

    if (route === 'quickstart') {
      await this.loadPresets();
      this.contentArea.innerHTML =
        `<div class="view active-view" id="view-${route}">${this.views[route]}</div>`;
      this.renderList('quickstart');
    } else if (route === 'insights') {
      await this.loadInsights();
      await this.loadPresets();
      this.contentArea.innerHTML =
        `<div class="view active-view" id="view-${route}">${this.views[route]}</div>`;
      this.renderList('insights');
    } else {
      this.contentArea.innerHTML =
        `<div class="view active-view" id="view-${route}">${this.views[route]}</div>`;
    }
  },

  renderList(routeType) {
    const isQuickStart = routeType === 'quickstart';
    const containerId = isQuickStart ? "quickstart-list-container" : "insights-list-container";
    const listContainer = document.getElementById(containerId);
    if (!listContainer) return;

    listContainer.innerHTML = '';

    const filterType = isQuickStart ? "preset" : "history";
    const filteredSessions = this.mockSessions.filter(s => s.type === filterType);

    const onboarding = document.getElementById("preset-onboarding");
    if (onboarding) {
      const hasDefaults = filteredSessions.some(s => s.stats === "Default Preset");
      onboarding.classList.toggle("hidden", !(isQuickStart && hasDefaults));
    }

    if (filteredSessions.length === 0) {
      listContainer.innerHTML = `<div class="empty-state">${isQuickStart ? "No presets yet. Add one above!" : "No completed sessions yet."}</div>`;
      return;
    }

    const defaultIcons = {
      "Deep Work Sprint": "◆",
      "Pomodoro Focus": "◷",
      "Study Session": "◎",
      "Writing Block": "✎",
      "Quick Review": "✓",
      "Creative Flow": "✦"
    };

    filteredSessions.forEach(session => {
      const card = document.createElement("div");
      card.className = "session-card";

      const isPreset = session.type === "preset";
      const isHistory = session.type === "history";
      const icon = isPreset ? (defaultIcons[session.title] || "✦") : "▣";
      let actionButtonHTML = '';
      if (isPreset) {
        actionButtonHTML = `
          <button class="session-action" onclick="app.startSessionClick('${session.id}', event)">▶ Start Session</button>
          <div class="edit-action-row">
            <button class="btn-edit" onclick="app.openPresetModal('${session.id}', event)" title="Edit preset">✎ Edit</button>
            ${app.isEditingPresets ? `<button class="btn-danger" onclick="app.deletePreset('${session.id}', event)">Delete</button>` : ""}
          </div>
        `;
      } else if (isHistory && session.analytics) {
        actionButtonHTML = `<button class="btn-show-more" onclick="app.openInsightModal('${session.id}', event)">Show Detailed Insights</button>`;
      }

      const score = Math.max(0, Math.min(100, Math.round(session.analytics?.focusEfficiency || 0)));
      const band = getFocusBand(score);
      const historyBar = isHistory && session.analytics
        ? `<div class="history-score-bar"><span style="width:${score}%; background:${band.color};"></span></div>`
        : "";

      card.innerHTML = `
        <div class="session-main">
          <div class="session-title">
            <span class="preset-icon">${icon}</span>${session.title}
          </div>
          <div class="session-time">${session.duration} min</div>
        </div>
        <div class="session-intent">${session.intent}</div>
        ${historyBar}
        <div class="session-details">
          <div class="session-stats">${session.stats}</div>
        </div>
        ${isPreset ? actionButtonHTML.replace('<div class="edit-action-row">', '<div class="edit-action-row preset-actions">') : actionButtonHTML}
      `;

      card.addEventListener("click", () => {
        card.classList.toggle("expanded");
      });

      listContainer.appendChild(card);
    });
  },

  startSessionClick(sessionId, event) {
    event.stopPropagation();

    const session = this.mockSessions.find(s => s.id === sessionId);
    if (!session) return;

    const durationMs = session.duration * 60 * 1000;
    const sessionData = {
      title: session.title,
      intent: session.intent,
      objective: session.intent,
      duration: session.duration,
      timeMinutes: session.duration,
      startTime: Date.now(),
      endTime: Date.now() + durationMs,
      isActive: true,
      presetId: session.preset_id || null
    };

    window.postMessage({
      type: "FROM_BRAINSYNC_WEB",
      action: "START_SESSION",
      sessionData: sessionData
    }, "*");

    this.showToast(`Session started: ${session.title}. Check your BrainSync popup or keep working.`);
  },

  openInsightModal(sessionId, event) {
    if (event) event.stopPropagation();
    const session = this.mockSessions.find(s => s.id === sessionId);
    if (!session || !session.analytics) return;

    const modal = document.getElementById("insight-modal-overlay");
    if (!modal) return;

    const eff = session.analytics.focusEfficiency || 0;
    const band = getFocusBand(eff);
    const peakTimeMs = session.analytics.mostDistractingTimeElapsedMs || 0;
    const peakMins = Math.max(1, Math.round(peakTimeMs / 60000));
    const peakText = peakTimeMs > 0 ? `${peakMins} mins into session` : 'Stayed Focused';

    modal.innerHTML = `
      <div class="insight-modal">
        <div class="insight-modal-header">
          <h2>${session.title} Insights</h2>
          <button class="modal-close-btn" onclick="document.getElementById('insight-modal-overlay').classList.remove('show')">&times;</button>
        </div>
        <div class="insight-grid">
          <div class="donut-chart-container">
            <div class="donut-chart" style="background: conic-gradient(${band.color} 0% ${eff}%, #171728 ${eff}% 100%)">
              <div class="donut-hole">
                <div class="donut-hole-text">${eff}%</div>
                <div class="donut-hole-label">Overall Focus Score</div>
                <div class="donut-band-label" style="color:${band.color};">${band.label}</div>
                <div class="donut-band-subtitle">${band.sublabel}</div>
              </div>
            </div>
          </div>
          <div>
            <div class="insight-stat-grid">
              <div class="insight-stat"><span>Session Time</span><strong>${session.duration} min</strong></div>
              <div class="insight-stat"><span>Tab Switches</span><strong>${session.analytics.totalTabSwitches || 0}</strong></div>
              <div class="insight-stat"><span>Most Distracting Time</span><strong>${peakText}</strong></div>
              <div class="insight-stat"><span>Longest Focus Streak</span><strong>${Math.round((session.analytics.longestStreak || 0) / 60)} min</strong></div>
            </div>
            <div class="insight-objective"><span>Session Objective</span><p>${session.intent}</p></div>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => modal.classList.add("show"), 10);
  },

  toggleEditMode() {
    this.isEditingPresets = !this.isEditingPresets;
    const btn = document.getElementById("toggle-edit-btn");
    if (btn) btn.classList.toggle("active-mode", this.isEditingPresets);
    this.renderList("quickstart");
  },

  openPresetModal(id = null, event = null) {
    if (event) event.stopPropagation();
    let editingSession = null;
    if (id) {
       editingSession = this.mockSessions.find(s => s.id === id);
    }

    const modal = document.getElementById("preset-modal-overlay");
    if (!modal) return;

    modal.innerHTML = `
      <div class="insight-modal form-modal">
        <div class="insight-modal-header">
          <h2>${id ? "Edit Preset" : "Create New Preset"}</h2>
          <button class="modal-close-btn" onclick="document.getElementById('preset-modal-overlay').classList.remove('show')">&times;</button>
        </div>
        <form id="preset-form" class="form-container" onsubmit="app.savePreset(event, '${id || ''}')">
           <div class="form-group">
             <label>Session Name</label>
             <input type="text" id="p-title" value="${id ? editingSession.title : ''}" placeholder="e.g. Science Homework" required />
           </div>
           <div class="form-group">
             <label>Session Objective</label>
             <input type="text" id="p-intent" value="${id ? editingSession.intent : ''}" placeholder="e.g. Finish chemistry chapter 5" required />
           </div>
           <div class="form-group">
             <label>Session Time (Minutes)</label>
             <input type="number" id="p-time" min="1" max="180" value="${id ? editingSession.duration : '25'}" required />
           </div>
           <button type="submit" class="btn-primary" style="width:100%; margin-top:2rem;">Save Preset</button>
        </form>
      </div>
    `;

    setTimeout(() => modal.classList.add("show"), 10);
  },

  async savePreset(event, id) {
    event.preventDefault();
    const title = document.getElementById("p-title").value.trim();
    const intent = document.getElementById("p-intent").value.trim();
    const duration = parseInt(document.getElementById("p-time").value);

    let saved = [];
    try {
      const res = await fetch(`/api/presets?username=${encodeURIComponent(this.currentUser)}`);
      if (res.ok) {
        saved = await res.json();
      }
    } catch (e) {
      console.error("Failed to fetch presets for saving", e);
    }

    if (id) {
      const index = saved.findIndex(s => s.id === id);
      if (index !== -1) {
        saved[index] = {
          ...saved[index],
          title,
          intent,
          duration,
          stats: saved[index].stats || "Custom Preset",
          type: "preset"
        };
      }
    } else {
      saved.push({
        title,
        intent,
        duration,
        stats: "Custom Preset",
        type: "preset"
      });
    }

    try {
      await fetch(`/api/presets?username=${encodeURIComponent(this.currentUser)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: this.currentUser, presets: saved })
      });
    } catch (e) {
      console.error("Failed to save presets to server", e);
      this.showToast("Preset could not be saved.");
    }

    document.getElementById('preset-modal-overlay').classList.remove('show');
    
    await this.loadPresets();
    this.renderList("quickstart");
    this.showToast(id ? "Preset updated." : "Preset created.");
  },

  async deletePreset(id, event) {
    if (event) event.stopPropagation();
    if (!confirm("Are you sure you want to delete this preset?")) return;

    let saved = [];
    try {
      const res = await fetch(`/api/presets?username=${encodeURIComponent(this.currentUser)}`);
      if (res.ok) {
        saved = await res.json();
      }
    } catch (e) {
      console.error("Failed to fetch presets for deletion", e);
    }

    saved = saved.filter(s => s.id !== id);

    try {
      await fetch(`/api/presets?username=${encodeURIComponent(this.currentUser)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: this.currentUser, presets: saved })
      });
    } catch (e) {
      console.error("Failed to delete preset from server", e);
    }

    await this.loadPresets();
    this.renderList("quickstart");
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    app.init();
    window.addEventListener("hashchange", () => {
      const route = window.location.hash.replace('#', '') || 'home';
      const activeView = document.querySelector(".view.active-view");
      if (!activeView || activeView.id !== `view-${route}`) {
        app.navigate(route);
      }
    });
  });
} else {
  app.init();
  window.addEventListener("hashchange", () => {
    const route = window.location.hash.replace('#', '') || 'home';
    const activeView = document.querySelector(".view.active-view");
    if (!activeView || activeView.id !== `view-${route}`) {
      app.navigate(route);
    }
  });
}

window.addEventListener("message", async (event) => {
  if (event.data && event.data.type === "FROM_BRAINSYNC_EXT_SYNC") {
    await app.loadPresets();
    await app.loadInsights();

    if (window.location.hash === "#insights") {
      app.renderList('insights');
    } else if (window.location.hash === "#quickstart") {
      app.renderList('quickstart');
    }
  }
});
