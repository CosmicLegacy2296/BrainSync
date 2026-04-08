const http = require("http");
const fs = require("fs");
const path = require("path");

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

const server = http.createServer((req, res) => {
  if (req.url === "/api/startup-id") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ id: serverId }));
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

server.listen(PORT, () => {
  console.log(`BrainSync website running at http://localhost:${PORT}`);
});
