// Local dev API server — runs the Vercel serverless functions on port 3000
// Usage: node dev-server.js
// This is NOT used in production — Vercel handles routing there.

import { createServer } from 'http';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
try {
  const envFile = readFileSync(resolve(__dirname, '.env.local'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* no .env.local */ }

// Dynamic import of handler modules
const handlers = {};
async function loadHandler(name) {
  if (!handlers[name]) {
    const mod = await import(`./api/${name}.js`);
    handlers[name] = mod.default;
  }
  return handlers[name];
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

function parseQuery(url) {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  const params = new URLSearchParams(url.slice(idx));
  const obj = {};
  for (const [k, v] of params) obj[k] = v;
  return obj;
}

const server = createServer(async (req, rawRes) => {
  // CORS headers
  rawRes.setHeader('Access-Control-Allow-Origin', '*');
  rawRes.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  rawRes.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    rawRes.writeHead(204);
    rawRes.end();
    return;
  }

  const urlPath = req.url.split('?')[0];

  // Map /api/<name> to api/<name>.js
  const match = urlPath.match(/^\/api\/([a-z-]+)/);
  if (!match) {
    rawRes.writeHead(404, { 'Content-Type': 'application/json' });
    rawRes.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const fnName = match[1];

  try {
    const handler = await loadHandler(fnName);

    // Build mock req/res that match Vercel's serverless interface
    const body = req.method === 'POST' ? await parseBody(req) : undefined;
    const mockReq = {
      method: req.method,
      headers: req.headers,
      query: parseQuery(req.url),
      body,
      url: req.url,
    };

    let statusCode = 200;
    const resHeaders = {};
    const mockRes = {
      status(code) { statusCode = code; return mockRes; },
      setHeader(k, v) { resHeaders[k] = v; return mockRes; },
      json(data) {
        rawRes.writeHead(statusCode, { ...resHeaders, 'Content-Type': 'application/json' });
        rawRes.end(JSON.stringify(data));
      },
      redirect(url) {
        rawRes.writeHead(302, { ...resHeaders, Location: url });
        rawRes.end();
      },
      end(data) {
        rawRes.writeHead(statusCode, resHeaders);
        rawRes.end(data);
      },
    };

    await handler(mockReq, mockRes);
  } catch (err) {
    console.error(`Error in /api/${fnName}:`, err);
    rawRes.writeHead(500, { 'Content-Type': 'application/json' });
    rawRes.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(3000, () => {
  console.log('API dev server running on http://localhost:3000');
  console.log('Routes: /api/generate-loi, /api/edit-loi, /api/send-docusign, etc.');
});
