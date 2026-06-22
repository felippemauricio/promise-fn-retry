// Zero-dependency static server for the browser demo.
// Serves demo/browser/, and maps /promise-fn-retry.js to the built ESM bundle
// so the page imports the real library you just built.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, 'browser');
const libBundle = join(here, '..', 'dist', 'index.js');
const port = Number(process.env.PORT) || 8080;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = (req.url || '/').split('?')[0];
    const file =
      url === '/promise-fn-retry.js'
        ? libBundle
        : join(root, normalize(url === '/' ? '/index.html' : url));

    if (!file.startsWith(root) && file !== libBundle) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.listen(port, () => {
  console.log(`\n  promise-fn-retry demo → http://localhost:${port}\n  (Ctrl+C to stop)\n`);
});
