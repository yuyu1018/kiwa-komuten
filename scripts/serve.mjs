import { createServer } from 'node:http';
import { createReadStream, readFileSync, statSync, watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const port = Number(process.env.PORT || 4173);
const live = process.argv.includes('--live');
const clients = new Set();
const instance = randomUUID();
let revision = 0;
const liveClient = new URL('./live-client.js', import.meta.url);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (live && url.pathname === '/__dev/events') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive'
    });
    response.write(`event: ready\ndata: ${JSON.stringify({ instance, revision })}\n\n`);
    clients.add(response);
    request.on('close', () => clients.delete(response));
    return;
  }
  if (live && url.pathname === '/__dev/client.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    createReadStream(liveClient).pipe(response);
    return;
  }
  let filename;
  try {
    filename = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!filename.startsWith(root + path.sep)) throw new Error('Invalid path');
    if (!statSync(filename).isFile()) throw new Error('Not a file');
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
    ...(live ? { 'Cache-Control': 'no-store' } : {})
  });
  if (live && path.extname(filename) === '.html') {
    const html = readFileSync(filename, 'utf8');
    const script = '<script src="/__dev/client.js" defer></script>';
    response.end(/<\/body>/i.test(html) ? html.replace(/<\/body>/i, script + '</body>') : html + script);
    return;
  }
  createReadStream(filename).pipe(response);
});

if (live) {
  let timer;
  let cssOnly = true;
  watch(root, { recursive: true }, (_event, filename) => {
    cssOnly = cssOnly && !!filename && filename.toString().endsWith('.css');
    clearTimeout(timer);
    timer = setTimeout(() => {
      const data = JSON.stringify({ instance, revision: ++revision, cssOnly });
      for (const client of clients) client.write(`event: change\ndata: ${data}\n\n`);
      cssOnly = true;
    }, 120);
  });
  setInterval(() => {
    for (const client of clients) client.write(': keep-alive\n\n');
  }, 20000).unref();
}

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${port} is in use. Stop the existing server or run with a different PORT.`
    : error.message);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Local: http://127.0.0.1:${port}`);
  if (live) console.log('Live reload enabled: save files in dist/ to update the browser.');
});
