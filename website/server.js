const http = require("http");
const fs = require("fs");
const path = require("path");
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createAccount, loginWithPassword, AuthInputError, AuthConflictError } = require('./lib/server/auth-db');
const { createPreset, getPresetsByUser, getPresetById, updatePreset, deletePreset, PresetError, PresetNotFoundError } = require('./lib/server/presets-db');
const { createInsight, getInsightsByUser, InsightError, InsightNotFoundError } = require('./lib/server/insights-db');
const { dbQuery } = require('./lib/server/db');

const PORT = process.env.PORT || 3000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml; charset=utf-8",
};

const serverId = Date.now().toString();

const server = http.createServer(async (req, res) => {
  // Set CORS headers for all API requests
  if (req.url.startsWith("/api/")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(200);
      return res.end();
    }
  }

  // Ensure database directory exists
  const dbDir = path.join(__dirname, "db");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Parse helper for POST body
  const getBody = (request) => {
    return new Promise((resolve) => {
      let body = "";
      request.on("data", chunk => { body += chunk; });
      request.on("end", () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          resolve({});
        }
      });
    });
  };

  const serverId = Date.now().toString();

  if (req.url === "/api/startup-id") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ id: serverId }));
  }

  if (req.url === "/api/login" && req.method === "POST") {
    try {
      const { username, password } = await getBody(req);
      const account = await loginWithPassword({ username, password });
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, username: account.username, userId: account.id }));
    } catch (err) {
      if (err instanceof AuthInputError) {
        res.writeHead(err.status, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
      console.error('Login error:', err);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: false, error: "Server error" }));
    }
  }

  if (req.url === "/api/signup" && req.method === "POST") {
    try {
      const { username, password } = await getBody(req);
      const account = await createAccount({ username, password });
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, username: account.username, userId: account.id }));
    } catch (err) {
      if (err instanceof AuthInputError || err instanceof AuthConflictError) {
        res.writeHead(err.status, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
      console.error('Signup error details:', err.message, err.code);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: false, error: err.message || "Server error" }));
    }
  }

  if (req.url === "/api/logout" && req.method === "POST") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ success: true }));
  }

  if (req.url.startsWith("/api/presets")) {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const body = req.method === "POST" ? await getBody(req) : {};
    const username = urlObj.searchParams.get("username") || body.username;

    if (!username) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Missing username parameter" }));
    }

    try {
      // Get user_id from username
      const userResult = await dbQuery(
        `SELECT id FROM accounts WHERE LOWER(username) = LOWER($1)`,
        [username]
      );

      if (userResult.rows.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "User not found" }));
      }

      const userId = userResult.rows[0].id;

      if (req.method === "GET") {
        const presets = await getPresetsByUser(userId);
        const formattedPresets = presets.map(p => ({
          id: `preset_${p.preset_id}`,
          preset_id: p.preset_id,
          title: p.title,
          intent: p.intent,
          duration: p.duration,
          stats: p.stats,
          type: "preset",
          created_at: p.created_at
        }));
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(formattedPresets));
      }

      if (req.method === "POST") {
        const presetsArray = body.presets;
        if (!Array.isArray(presetsArray)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Presets must be an array" }));
        }

        // Get current presets from DB
        const currentPresets = await getPresetsByUser(userId);
        const currentPresetIds = new Set(currentPresets.map(p => parseInt(p.preset_id)));
        const incomingPresetIds = new Set();

        // Process incoming presets
        for (const preset of presetsArray) {
          if (preset.id?.startsWith("preset_")) {
            // Existing preset - update
            const presetId = parseInt(preset.id.substring(7));
            incomingPresetIds.add(presetId);
            await updatePreset(presetId, userId, {
              title: preset.title,
              intent: preset.intent,
              duration: preset.duration,
              stats: preset.stats
            });
          } else {
            // New preset - create
            const newPreset = await createPreset(userId, {
              username: username,
              title: preset.title,
              intent: preset.intent,
              duration: preset.duration,
              stats: preset.stats || "Custom Preset"
            });
            incomingPresetIds.add(parseInt(newPreset.preset_id));
          }
        }

        // Delete presets that were removed
        for (const presetId of currentPresetIds) {
          if (!incomingPresetIds.has(presetId)) {
            await deletePreset(presetId, userId);
          }
        }

        // Get updated presets to return
        const updatedPresets = await getPresetsByUser(userId);
        const formattedPresets = updatedPresets.map(p => ({
          id: `preset_${p.preset_id}`,
          preset_id: p.preset_id,
          title: p.title,
          intent: p.intent,
          duration: p.duration,
          stats: p.stats,
          type: "preset",
          created_at: p.created_at
        }));

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, presets: formattedPresets }));
      }
    } catch (err) {
      if (err instanceof PresetError || err instanceof PresetNotFoundError) {
        res.writeHead(err.status || 400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
      console.error('Presets API error:', err);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Server error" }));
    }
  }

  if (req.url.startsWith("/api/insights")) {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const body = req.method === "POST" ? await getBody(req) : {};
    const username = urlObj.searchParams.get("username") || body.username;

    if (!username) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Missing username parameter" }));
    }

    try {
      // Get user_id from username
      const userResult = await dbQuery(
        `SELECT id FROM accounts WHERE LOWER(username) = LOWER($1)`,
        [username]
      );

      if (userResult.rows.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "User not found" }));
      }

      const userId = userResult.rows[0].id;

      if (req.method === "GET") {
        const insights = await getInsightsByUser(userId);
        const formattedInsights = insights.map(row => ({
          title: row.title,
          intent: row.intent,
          duration: row.duration,
          startTime: row.start_time ? parseInt(row.start_time) : null,
          endTime: row.end_time ? parseInt(row.end_time) : null,
          completedAt: row.completed_at,
          analytics: row.analytics
        }));
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(formattedInsights));
      }

      if (req.method === "POST") {
        const session = body.session;
        if (!session) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Missing session data" }));
        }

        let presetId = session.presetId;
        if (presetId) {
          if (typeof presetId === 'string' && presetId.startsWith('preset_')) {
            presetId = parseInt(presetId.substring(7));
          } else {
            presetId = parseInt(presetId);
          }
        }

        const duration = session.duration !== undefined ? parseInt(session.duration) : (session.timeMinutes !== undefined ? parseInt(session.timeMinutes) : 0);
        const startTime = session.startTime || (session.endTime - duration * 60 * 1000);

        await createInsight(userId, {
          title: session.title,
          intent: session.intent || session.objective,
          duration: duration,
          startTime: startTime,
          endTime: session.endTime,
          completedAt: session.completedAt,
          analytics: session.analytics
        });

        if (presetId && !isNaN(presetId)) {
          try {
            await deletePreset(presetId, userId);
          } catch (deleteErr) {
            console.error(`Failed to delete preset ${presetId} on session completion:`, deleteErr);
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true }));
      }
    } catch (err) {
      if (err instanceof InsightError || err instanceof InsightNotFoundError) {
        res.writeHead(err.status || 400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
      console.error('Insights API error:', err);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Server error" }));
    }
  }

  let filePath = path.join(__dirname, req.url === "/" ? "index.html" : req.url);
  const extname = String(path.extname(filePath)).toLowerCase();

  const contentType = mimeTypes[extname] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code == "ENOENT") {
        // Fallback to index.html for SPA routing
        fs.readFile(path.join(__dirname, "index.html"), (err, data) => {
          if (err) {
            res.writeHead(500);
            res.end("Error loading page");
          } else {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(data, "utf-8");
          }
        });
      } else {
        res.writeHead(500);
        res.end("Server Error: " + err.code);
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data, "utf-8");
    }
  });
});

async function start() {
  try {
    const { dbQuery, ensureDatabaseSchema } = require('./lib/server/db');
    await dbQuery('SELECT 1');
    console.log('Database connected');

    await ensureDatabaseSchema();
    console.log('Database schema verified');

    server.listen(PORT, () => {
      console.log(`BrainSync website running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();

