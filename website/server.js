const http = require("http");
const fs = require("fs");
const path = require("path");
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createAccount, loginWithPassword, AuthInputError, AuthConflictError } = require('./lib/server/auth-db');

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

  const defaultPresets = [
    { id: "preset_1", title: "Deep Meditation", duration: 5, intent: "Relax and rejuvenate", stats: "Quick Start Preset", type: "preset" },
    { id: "preset_2", title: "Deep Focus Work", duration: 25, intent: "Maximum productivity and flow state", stats: "Quick Start Preset", type: "preset" },
    { id: "preset_3", title: "Light Reading", duration: 15, intent: "Read an article or a chapter", stats: "Quick Start Preset", type: "preset" }
  ];

  if (req.url === "/api/startup-id") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ id: serverId }));
  }

  if (req.url === "/api/login" && req.method === "POST") {
    try {
      const { username, password } = await getBody(req);
      const account = await loginWithPassword({ username, password });
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, username: account.username }));
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
      const { username, email, password } = await getBody(req);
      const account = await createAccount({ username, email, password });
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, username: account.username }));
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
    const username = urlObj.searchParams.get("username");

    if (req.method === "GET") {
      if (!username) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Missing username parameter" }));
      }
      const presetsPath = path.join(dbDir, `${username}_presets.json`);
      if (fs.existsSync(presetsPath)) {
        const data = fs.readFileSync(presetsPath, "utf-8");
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(data);
      } else {
        fs.writeFileSync(presetsPath, JSON.stringify(defaultPresets, null, 2));
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(defaultPresets));
      }
    }

    if (req.method === "POST") {
      const { username: postUsername, presets } = await getBody(req);
      if (!postUsername || !presets) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Missing username or presets" }));
      }
      const presetsPath = path.join(dbDir, `${postUsername}_presets.json`);
      fs.writeFileSync(presetsPath, JSON.stringify(presets, null, 2));
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true }));
    }
  }

  if (req.url.startsWith("/api/insights")) {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const username = urlObj.searchParams.get("username");

    if (req.method === "GET") {
      if (!username) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Missing username parameter" }));
      }
      const insightsPath = path.join(dbDir, `${username}_insights.json`);
      if (fs.existsSync(insightsPath)) {
        const data = fs.readFileSync(insightsPath, "utf-8");
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(data);
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify([]));
      }
    }

    if (req.method === "POST") {
      const { username: postUsername, session } = await getBody(req);
      if (!postUsername || !session) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Missing username or session data" }));
      }
      const insightsPath = path.join(dbDir, `${postUsername}_insights.json`);
      let insights = [];
      if (fs.existsSync(insightsPath)) {
        insights = JSON.parse(fs.readFileSync(insightsPath, "utf-8") || "[]");
      }
      insights.push(session);
      fs.writeFileSync(insightsPath, JSON.stringify(insights, null, 2));
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true }));
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
    const { dbQuery } = require('./lib/server/db');
    await dbQuery('SELECT 1');
    console.log('Database connected');

    server.listen(PORT, () => {
      console.log(`BrainSync website running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();

