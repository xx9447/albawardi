// Al-Bawardi progress + game server — serves progress.html, status.json,
// and the built apps (/client, /sensor-lab) from this directory, safely.
const http = require('http');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const PORT = 8788;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

http.createServer((req, res) => {
  let urlPath = (req.url || '/').split('?')[0];
  try {
    urlPath = decodeURIComponent(urlPath);
  } catch {
    res.writeHead(400);
    res.end('bad request');
    return;
  }
  if (urlPath === '/' || urlPath === '') urlPath = '/progress.html';
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  // Resolve strictly inside DIR (no traversal).
  const full = path.normalize(path.join(DIR, urlPath));
  if (!full.startsWith(DIR + path.sep) && full !== DIR) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found: ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => console.log(`serving: progress + client + sensor-lab on :${PORT}`));
