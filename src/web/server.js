/**
 * Embedded HTTP server for remote browser views (LAN).
 * Serves renderer/remote + shared theme/assets + SSE live state.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const REMOTE_ROOT = path.join(PROJECT_ROOT, 'renderer', 'remote');
const THEME_ROOT = path.join(PROJECT_ROOT, 'src', 'theme');
const ASSETS_ROOT = path.join(PROJECT_ROOT, 'renderer', 'assets');

let server = null;
let lastPort = 8787;
let lastState = {
  ok: true,
  phase: 'pre',
  phaseLabel: 'Voorprogramma',
  matchTitle: 'Top of the Hour',
  matchSub: '',
  nowClock: '',
  currentTitle: '',
  nextTitle: '',
  secondsToNext: null,
  timeshiftLabel: '',
  mode: 'fixed',
  cues: [],
  wheel: null,
  at: Date.now(),
};
const sseClients = new Set();
let getWindow = () => null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function listLanAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const entries of Object.values(nets || {})) {
    for (const net of entries || []) {
      if (!net || net.internal) continue;
      if (net.family !== 'IPv4' && net.family !== 4) continue;
      out.push(net.address);
    }
  }
  if (!out.includes('127.0.0.1')) out.unshift('127.0.0.1');
  return out;
}

function urlsForPort(port) {
  return listLanAddresses().map((ip) => `http://${ip}:${port}`);
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(data);
}

function broadcastState() {
  const payload = `data: ${JSON.stringify(lastState)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

function setState(partial) {
  lastState = {
    ...lastState,
    ...(partial && typeof partial === 'object' ? partial : {}),
    at: Date.now(),
    ok: true,
  };
  broadcastState();
  return lastState;
}

function resolveStatic(reqPath) {
  let rel = reqPath === '/' ? '/index.html' : reqPath;
  rel = decodeURIComponent(rel.split('?')[0]);
  if (rel.includes('..')) return null;

  if (rel.startsWith('/theme/')) {
    return path.join(THEME_ROOT, rel.slice('/theme/'.length));
  }
  if (rel.startsWith('/assets/')) {
    return path.join(ASSETS_ROOT, rel.slice('/assets/'.length));
  }
  return path.join(REMOTE_ROOT, rel.replace(/^\//, ''));
}

function serveStatic(reqPath, res) {
  const filePath = resolveStatic(reqPath);
  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  const allowed =
    filePath.startsWith(REMOTE_ROOT) ||
    filePath.startsWith(THEME_ROOT) ||
    filePath.startsWith(ASSETS_ROOT);
  if (!allowed) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

function handleSse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(`data: ${JSON.stringify(lastState)}\n\n`);
  sseClients.add(res);
  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 15000);
  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
}

function createHandler() {
  return (req, res) => {
    try {
      const host = req.headers.host || `127.0.0.1:${lastPort}`;
      const url = new URL(req.url || '/', `http://${host}`);
      const pathname = url.pathname;

      if (pathname === '/api/state') {
        sendJson(res, 200, lastState);
        return;
      }
      if (pathname === '/api/status') {
        sendJson(res, 200, getStatus());
        return;
      }
      if (pathname === '/events') {
        handleSse(req, res);
        return;
      }
      if (
        pathname === '/view/wheel' ||
        pathname === '/view/list' ||
        pathname === '/view/focus' ||
        pathname === '/view/seconds'
      ) {
        serveStatic('/index.html', res);
        return;
      }
      serveStatic(pathname, res);
    } catch (err) {
      res.writeHead(500);
      res.end(err && err.message ? err.message : 'Server error');
    }
  };
}

function stopServer() {
  for (const res of sseClients) {
    try {
      res.end();
    } catch {
      // ignore
    }
  }
  sseClients.clear();
  if (server) {
    try {
      server.close();
    } catch {
      // ignore
    }
    server = null;
  }
}

/**
 * @param {{ enabled: boolean, port?: number }} cfg
 */
function applyConfig(cfg) {
  const port = Number(cfg.port) || 8787;
  if (!cfg.enabled) {
    stopServer();
    lastPort = port;
    return Promise.resolve({ ok: true, running: false, port, urls: urlsForPort(port) });
  }

  const needRestart = !server || lastPort !== port;
  if (!needRestart) {
    return Promise.resolve({
      ok: true,
      running: true,
      port,
      urls: urlsForPort(port),
      clients: sseClients.size,
    });
  }

  stopServer();
  lastPort = port;

  return new Promise((resolve) => {
    try {
      server = http.createServer(createHandler());
      server.on('error', (err) => {
        server = null;
        const win = getWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('web:error', {
            message: err && err.message ? err.message : String(err),
          });
        }
        resolve({
          ok: false,
          running: false,
          port,
          urls: urlsForPort(port),
          error: err && err.message ? err.message : String(err),
        });
      });
      server.listen(port, '0.0.0.0', () => {
        resolve({
          ok: true,
          running: true,
          port,
          urls: urlsForPort(port),
          clients: sseClients.size,
        });
      });
    } catch (err) {
      server = null;
      resolve({
        ok: false,
        running: false,
        port,
        urls: urlsForPort(port),
        error: err && err.message ? err.message : String(err),
      });
    }
  });
}

function getStatus() {
  return {
    running: Boolean(server),
    port: lastPort,
    urls: urlsForPort(lastPort),
    clients: sseClients.size,
    addresses: listLanAddresses(),
  };
}

function initWebMain(ipcMain, getMainWindow) {
  getWindow = getMainWindow || (() => null);
  ipcMain.handle('web:apply-config', async (_e, cfg) => applyConfig(cfg || {}));
  ipcMain.handle('web:set-state', (_e, state) => setState(state || {}));
  ipcMain.handle('web:status', () => getStatus());
  ipcMain.handle('web:stop', async () => {
    stopServer();
    return getStatus();
  });
}

function shutdownWeb() {
  stopServer();
}

module.exports = {
  initWebMain,
  shutdownWeb,
  applyConfig,
  setState,
  getStatus,
};
