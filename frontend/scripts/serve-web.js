// Serves the static web export (dist/) like production will: existing files as-is, and every path without a file
// extension (client-side routes such as /orders/7) as index.html. Missing assets stay 404.
// The same rule belongs in a CloudFront Function on the S3 behaviour only, so /api/* is never rewritten.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** Maps a request path to the file to serve, or null when it must be 404. */
function resolveFile(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  const rewritten = /\.[^/]+$/.test(decoded) ? decoded : '/index.html';
  const file = path.resolve(root, '.' + path.posix.normalize(rewritten));
  if (!file.startsWith(root + path.sep)) return null;
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

function createServer(root) {
  const absoluteRoot = path.resolve(root);
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const file = resolveFile(absoluteRoot, req.url ?? '/');
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
  });
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..', 'dist');
  const port = Number(process.env.PORT ?? 8081);
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    console.error('dist/index.html not found; run "npm run export:web" first.');
    process.exit(1);
  }
  createServer(root).listen(port, 'localhost', () => {
    console.log(`Serving ${root} on http://localhost:${port}`);
  });
}

module.exports = { resolveFile, createServer };
