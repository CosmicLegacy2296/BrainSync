const app = {
  views: {
    home: `
      <div class="hero-container">
        <h1 class="hero-title">Enter a <span class="accent">flow state</span><br>with BrainSync.</h1>
        <p class="hero-subtitle">The premium focus timer that synchronizes your deep work seamlessly. Stay undistracted, achieve your goals.</p>
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
      id: "s1",
      title: "Calculus studying",
      duration: 1, 
      intent: "Complete calculus homework",
      stats: "Focus: 95% - Highly Focused",
      type: "history"
    },
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

  init() {
    this.contentArea = document.getElementById("app-content");
    this.navLinks = document.querySelectorAll(".nav-link");
    this.navBrand = document.querySelector(".nav-brand");

    // Bind navigation click events
    this.navLinks.forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const route = e.target.getAttribute("data-route");
        this.navigate(route);
      });
    });

    this.navBrand.addEventListener("click", () => this.navigate('home'));

    // Initialize with home or hash
    const initialRoute = window.location.hash.replace('#', '') || 'home';
    this.navigate(initialRoute);
  },

  navigate(route) {
    if (!this.views[route]) route = 'home';
    
    window.location.hash = route;
    
    // Update active nav state
    this.navLinks.forEach(link => {
      if (link.getAttribute("data-route") === route) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });

    // Render HTML with a brief fade-out/fade-in
    this.contentArea.innerHTML = `<div class="view active-view" id="view-${route}">${this.views[route]}</div>`;

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
      const actionButtonHTML = isPreset 
        ? `<button class="session-action" onclick="app.startSessionClick('${session.id}', event)">▶ Start ${session.duration}m Session</button>`
        : '';

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
    // Prevent the click from collapsing the card immediately
    event.stopPropagation();
    
    const session = this.mockSessions.find(s => s.id === sessionId);
    if (!session) return;
    
    // Calculate end time
    const durationMs = session.duration * 60 * 1000;
    const sessionData = {
      title: session.title,
      intent: session.intent,
      duration: session.duration,
      startTime: Date.now(),
      endTime: Date.now() + durationMs,
      isActive: true
    };

    // Send cross-origin message to Content Script injected by the extension
    window.postMessage({
      type: "FROM_BRAINSYNC_WEB",
      action: "START_SESSION",
      sessionData: sessionData
    }, "*");

    alert(`Session started: ${session.title}! Close the website or check your BrainSync popup.`);
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
      duration: s.duration || Math.round((s.endTime - s.startTime)/60000),
      intent: s.intent || "Self-guided session",
      stats: "Completed " + new Date(s.completedAt).toLocaleTimeString(),
      type: "history"
    }));
    
    app.mockSessions = app.mockSessions.filter(s => !s.id.startsWith("ext_"));
    app.mockSessions.push(...extSessions);
    
    if (window.location.hash === "#insights") app.navigate('insights');
  }
});
