// Custom prod server: wraps the Astro node handler and forces long cache headers
// on fingerprinted static assets. The standalone node adapter serves /_astro/*
// without immutable caching; this script fills that gap.
//
// Container start: `node server.mjs` (see package.json "start" + Dockerfile).
import { handler as astroHandler } from './dist/server/entry.mjs';
import http from 'node:http';

const PORT = Number(process.env.PORT) || 4321;
const HOST = process.env.HOST || '0.0.0.0';

const IMMUTABLE = 'public, max-age=31536000, immutable';

const server = http.createServer((req, res) => {
  // Fingerprinted Astro assets + fonts get immutable caching.
  const url = req.url || '';
  if (url.startsWith('/_astro/') || /\.(woff2?|ttf|otf)(\?|$)/.test(url)) {
    res.setHeader('Cache-Control', IMMUTABLE);
  }
  astroHandler(req, res, (err) => {
    if (err) {
      res.statusCode = 500;
      res.end('Internal Server Error');
      return;
    }
    res.statusCode = 404;
    res.end('Not found');
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT}`);
});
