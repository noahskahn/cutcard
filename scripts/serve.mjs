// Zero-dependency static file server for local use: `npm start` then open http://localhost:8080
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(fileURLToPath(import.meta.url), '..', '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/plain' };
const port = +process.env.PORT || 8080;
http.createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (p.endsWith('/')) p += 'index.html';
    const data = await readFile(join(root, p));
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(port, () => console.log(`Cutcard running at http://localhost:${port}`));
