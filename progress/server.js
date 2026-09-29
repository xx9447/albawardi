// Al-Bawardi build progress server — serves progress.html + status.json fresh each request.
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
};

http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  let file = url === '/' ? 'progress.html' : url.replace(/^\//, '');
  file = path.basename(file); // no traversal
  const full = path.join(DIR, file);
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => console.log(`progress page: http://0.0.0.0:${PORT}/`));
