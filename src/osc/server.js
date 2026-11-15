/**
 * OSC UDP server/client in the Electron main process.
 * Incoming → IPC 'osc:message' to renderer.
 * Outgoing ← IPC 'osc:send' from renderer.
 */

const { Server, Client } = require('node-osc');

let server = null;
let client = null;
let lastConfig = { host: '0.0.0.0', port: 9000 };
let sendConfig = { host: '127.0.0.1', port: 9001, enabled: false };
let getWindow = () => null;

function forwardToRenderer(address, args, rinfo) {
  const win = getWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send('osc:message', {
    address,
    args: Array.isArray(args) ? args : [],
    from: rinfo ? { address: rinfo.address, port: rinfo.port } : null,
    at: Date.now(),
  });
}

function stopServer() {
  if (server) {
    try {
      server.close();
    } catch {
      // ignore
    }
    server = null;
  }
}

function stopClient() {
  if (client) {
    try {
      client.close();
    } catch {
      // ignore
    }
    client = null;
  }
}

/**
 * @param {{ enabled: boolean, host?: string, port?: number, sendEnabled?: boolean, sendHost?: string, sendPort?: number }} cfg
 */
async function applyConfig(cfg) {
  const host = (cfg.host || '0.0.0.0').trim() || '0.0.0.0';
  const port = Number(cfg.port) || 9000;
  sendConfig = {
    enabled: Boolean(cfg.sendEnabled),
    host: (cfg.sendHost || '127.0.0.1').trim() || '127.0.0.1',
    port: Number(cfg.sendPort) || 9001,
  };

  if (!cfg.enabled) {
    stopServer();
    stopClient();
    return { ok: true, running: false };
  }

  const needRestart =
    !server || lastConfig.host !== host || lastConfig.port !== port;

  if (needRestart) {
    stopServer();
    lastConfig = { host, port };
    try {
      server = new Server(port, host);
      server.on('message', (msg, rinfo) => {
        // msg = [address, ...args]
        if (!Array.isArray(msg) || !msg.length) return;
        const [address, ...args] = msg;
        forwardToRenderer(String(address), args, rinfo);
      });
      server.on('error', (err) => {
        const win = getWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('osc:error', {
            message: err && err.message ? err.message : String(err),
          });
        }
      });
    } catch (err) {
      server = null;
      return {
        ok: false,
        running: false,
        error: err && err.message ? err.message : String(err),
      };
    }
  }

  // Refresh outbound client target
  stopClient();
  if (sendConfig.enabled) {
    try {
      client = new Client(sendConfig.host, sendConfig.port);
    } catch {
      client = null;
    }
  }

  return {
    ok: true,
    running: Boolean(server),
    host,
    port,
    sendEnabled: sendConfig.enabled,
    sendHost: sendConfig.host,
    sendPort: sendConfig.port,
  };
}

function send(address, args = []) {
  if (!client || !sendConfig.enabled) return false;
  const payload = [address, ...(Array.isArray(args) ? args : [args])];
  try {
    client.send(payload);
    return true;
  } catch {
    return false;
  }
}

function getStatus() {
  return {
    running: Boolean(server),
    host: lastConfig.host,
    port: lastConfig.port,
    sendEnabled: sendConfig.enabled,
    sendHost: sendConfig.host,
    sendPort: sendConfig.port,
  };
}

function initOscMain(ipcMain, windowGetter) {
  getWindow = windowGetter;

  ipcMain.handle('osc:apply-config', async (_e, cfg) => applyConfig(cfg || {}));
  ipcMain.handle('osc:status', () => getStatus());
  ipcMain.handle('osc:send', (_e, address, args) => send(address, args));
  ipcMain.handle('osc:stop', async () => {
    stopServer();
    stopClient();
    return { ok: true, running: false };
  });
}

function shutdownOsc() {
  stopServer();
  stopClient();
}

module.exports = {
  initOscMain,
  shutdownOsc,
  applyConfig,
  send,
  getStatus,
};
