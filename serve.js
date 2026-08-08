/**
 * Tiny static server for local preview.
 * The page fetches data/site.json, which browsers block over file:// — so
 * open it through here rather than double-clicking index.html.
 *
 *   node serve.js        →  http://localhost:4176
 *   node serve.js 4180   →  http://localhost:4180
 *
 * Takes a port argument as well as $PORT: the sibling sites run at the same
 * time during a comparison, and two of them silently binding one port is a
 * confusing way to find that out.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 4176;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(ROOT, url === '/' ? 'index.html' : url);

    // Never serve outside the project directory.
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    fs.stat(file, (err, stat) => {
      if (err || stat.isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(file).pipe(res);
    });
  })
  .listen(PORT, () => {
    console.log(`\n  \x1b[7m  NCT 127  \x1b[0m  http://localhost:${PORT}\n`);
  });
