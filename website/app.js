const app = {
  views: {
    home: `
      <div class="hero-container">
        <h1 class="hero-title">Enter a <span class="accent">Flow State</span><br>with BrainSync.</h1>
        <p class="hero-subtitle">The premium focus timer that syncs your brain to deep work seamlessly. Stay undistracted, achieve your goals.</p>
        <button class="btn-primary" onclick="app.navigate('dashboard')">Get Started</button>
      </div>
    `,
    dashboard: `
      <div class="dashboard-header">
        <h2>Your Dashboard</h2>
      </div>
      <div class="dashboard-grid">
        <div class="glass-panel">
          <h3 style="margin-bottom: 0.5rem; font-size: 1.5rem;">Account Details</h3>
          <p style="color: var(--text-muted); margin-bottom: 1.5rem; font-size: 0.9rem;">Fill in your details and create your account for now.</p>
          <form id="account-form" onsubmit="event.preventDefault(); alert('Account details saved!');">
            <div class="form-group">
              <label>Full Name</label>
              <input type="text" placeholder="John Doe" required />
            </div>
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" placeholder="john@example.com" required />
            </div>
            <button type="submit" class="btn-primary" style="width: 100%; margin-top: 1rem;">Save Details</button>
          </form>
        </div>
      </div>
    `,
    quickstart: `
      <div class="sessions-header">
        <h2>Quick Start</h2>
      </div>
      <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Jump into a pre-configured flow state session.</p>
      <div class="sessions-list" id="quickstart-list-container">
        <!-- Injected via JS -->
      </div>
    `,
    insights: `
      <div class="sessions-header">
        <h2>Insights</h2>
      </div>
      <p style="color: var(--text-muted); margin-bottom: 1.5rem;">View your completed sessions and focus history.</p>
      <div class="sessions-list" id="insights-list-container">
        <!-- Injected via JS -->
      </div>
    `
  },

  mockSessions: [
    {
      id: "s2",
      title: "Deep Meditation",
      duration: 5,
      intent: "Relax and rejuvenate",
      stats: "Quick Start Preset",
      type: "preset"
    },
    {
      id: "s3",
      title: "Deep Focus Work",
      duration: 25,
      intent: "Maximum productivity and flow state",
      stats: "Quick Start Preset",
      type: "preset"
    },
    {
      id: "s4",
      title: "Light Reading",
      duration: 15,
      intent: "Read an article or a chapter",
      stats: "Quick Start Preset",
      type: "preset"
    }
  ],

  async init() {
    this.contentArea = document.getElementById("app-content");
    this.navLinks = document.querySelectorAll(".nav-link");
    this.navBrand = document.querySelector(".nav-brand");

    try {
      const res = await fetch("/api/startup-id");
      if (res.ok) {
        const data = await res.json();
        const lastId = localStorage.getItem("brainsync_server_id");
        if (lastId !== data.id) {
          localStorage.setItem("brainsync_server_id", data.id);
          this.mockSessions = this.mockSessions.filter(s => s.type !== "history");
          window.postMessage({
            type: "FROM_BRAINSYNC_WEB",
            action: "CLEAR_DATA"
          }, "*");
        }
      }
    } catch (e) {
      console.error("Failed to fetch startup id", e);
    }

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

  navigate(route) {
    if (!this.views[route]) route = 'home';

    window.location.hash = route;

    this.navLinks.forEach(link => {
      if (link.getAttribute("data-route") === route) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });

    this.contentArea.innerHTML =
      `<div class="view active-view" id="view-${route}">${this.views[route]}</div>`;

    if (route === 'quickstart') {
      this.renderList('quickstart');
    } else if (route === 'insights') {
      this.renderList('insights');
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

    filteredSessions.forEach(session => {
      const card = document.createElement("div");
      card.className = "session-card";

      const isPreset = session.type === "preset";
      const isHistory = session.type === "history";
      let actionButtonHTML = '';
      if (isPreset) {
         actionButtonHTML = `<button class="session-action" onclick="app.startSessionClick('${session.id}', event)">▶ Start ${session.duration}m Session</button>`;
      } else if (isHistory && session.analytics) {
         actionButtonHTML = `<button class="btn-show-more" onclick="app.openInsightModal('${session.id}', event)">📊 Show Detailed Insights</button>`;
      }

      card.innerHTML = `
        <div class="session-main">
          <div class="session-title">
            ${isPreset ? '✨ ' : '📚 '}${session.title}
          </div>
          <div class="session-time">${session.duration} min</div>
        </div>
        <div class="session-details">
          <div class="session-intent"><strong>Intent:</strong> ${session.intent}</div>
          <div class="session-stats">${session.stats}</div>
          ${actionButtonHTML}
        </div>
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
      duration: session.duration,
      startTime: Date.now(),
      endTime: Date.now() + durationMs,
      isActive: true
    };

    window.postMessage({
      type: "FROM_BRAINSYNC_WEB",
      action: "START_SESSION",
      sessionData: sessionData
    }, "*");

    alert(`Session started: ${session.title}! Close the website or check your BrainSync popup.`);
  },

  openInsightModal(sessionId, event) {
    if (event) event.stopPropagation();
    const session = this.mockSessions.find(s => s.id === sessionId);
    if (!session || !session.analytics) return;

    const modal = document.getElementById("insight-modal-overlay");
    if (!modal) return;

    const eff = session.analytics.focusEfficiency || 0;
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
            <div class="donut-chart" style="background: conic-gradient(var(--accent-color) 0% ${eff}%, #111 ${eff}% 100%)">
              <div class="donut-hole">
                <div class="donut-hole-text">${eff}%</div>
                <div class="donut-hole-label">Focus Mastered</div>
              </div>
            </div>
          </div>
          <div>
            <table class="insight-table">
              <tr>
                <td>Session Time</td>
                <td>${session.duration} min</td>
              </tr>
              <tr>
                <td>Session Objective</td>
                <td>${session.intent}</td>
              </tr>
              <tr>
                <td>Tab Switches</td>
                <td>${session.analytics.totalTabSwitches || 0}</td>
              </tr>
              <tr>
                <td>Most Distracting Time</td>
                <td>${peakText}</td>
              </tr>
              <tr>
                <td>Longest Focus Streak</td>
                <td>${Math.round((session.analytics.longestStreak || 0) / 60)} min</td>
              </tr>
            </table>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => modal.classList.add("show"), 10);
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => app.init());
} else {
  app.init();
}

window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "FROM_BRAINSYNC_EXT_SYNC") {
    const extSessions = (event.data.sessions || []).map((s, index) => ({
      id: "ext_" + index,
      title: s.title,
      duration: s.duration || s.timeMinutes || Math.round((s.endTime - s.startTime) / 60000) || 0,
      intent: s.intent || s.objective || "Self-guided session",
      stats: "Completed " + new Date(s.completedAt).toLocaleTimeString(),
      type: "history",
      analytics: s.analytics || null
    }));

    app.mockSessions = app.mockSessions.filter(s => !s.id.startsWith("ext_"));
    app.mockSessions.push(...extSessions);

    if (window.location.hash === "#insights") app.navigate('insights');
  }
});