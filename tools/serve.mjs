import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
const root = resolve('.');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const port = Number(process.env.TRAVEL_PORT || 4173);
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    // Test project-page hosting under a repository path, without rewriting app URLs.
    const relative = path.startsWith('/travel/') ? path.slice('/travel/'.length) : path.slice(1);
    const file = resolve(root, relative || 'index.html');
    if (!file.startsWith(root + sep) || relative.split('/').some(part => part.startsWith('.'))) { res.writeHead(403); res.end(); return; }
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}/travel/`));
