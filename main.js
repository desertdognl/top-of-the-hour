const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const pkg = require('./package.json');
const { formatBuildStamp } = require('./scripts/write-build-info');
const { parseSpeakerFile } = require('./src/parser');
const { initOscMain, shutdownOsc } = require('./src/osc/server');
const { initWebMain, shutdownWeb } = require('./src/web/server');

const BUILD_INFO_PATH = path.join(__dirname, 'build-info.json');
const EXAMPLE_PATH = path.join(__dirname, 'examples', '11 FC Utrecht - SC Cambuur 2627.docx');

function readBuildInfo() {
  try {
    const info = JSON.parse(fs.readFileSync(BUILD_INFO_PATH, 'utf8'));
    if (info.version && info.build) return info;
  } catch {
    // fall through
  }
  return {
    version: pkg.version,
    build: formatBuildStamp(),
    builtAt: new Date().toISOString(),
  };
}

let mainWindow = null;

function createWindow() {
  const info = readBuildInfo();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0b0d10',
    title: `Top of the Hour v${info.version}`,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  initOscMain(ipcMain, () => mainWindow);
  initWebMain(ipcMain, () => mainWindow);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  shutdownOsc();
  shutdownWeb();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  shutdownOsc();
  shutdownWeb();
});

ipcMain.handle('get-app-info', () => {
  const info = readBuildInfo();
  return {
    name: 'Top of the Hour',
    version: info.version,
    build: info.build,
    examplePath: EXAMPLE_PATH,
  };
});

ipcMain.handle('dialog:openSpeaker', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open speakerformat',
    properties: ['openFile'],
    filters: [
      { name: 'Speakerformat', extensions: ['docx', 'pdf'] },
      { name: 'Word', extensions: ['docx'] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'Alles', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true };
  }
  return parsePath(result.filePaths[0]);
});

ipcMain.handle('parse:file', async (_event, filePath) => parsePath(filePath));

ipcMain.handle('parse:example', async () => {
  if (!fs.existsSync(EXAMPLE_PATH)) {
    return { ok: false, error: `Voorbeeld niet gevonden: ${EXAMPLE_PATH}` };
  }
  return parsePath(EXAMPLE_PATH);
});

ipcMain.handle('window:toggle-fullscreen', () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});

ipcMain.handle('window:set-fullscreen', (_event, on) => {
  if (!mainWindow) return false;
  mainWindow.setFullScreen(Boolean(on));
  return mainWindow.isFullScreen();
});

ipcMain.handle('window:is-fullscreen', () => Boolean(mainWindow && mainWindow.isFullScreen()));

ipcMain.handle('shell:open-external', async (_event, url) => {
  const href = String(url || '').trim();
  if (!/^https?:\/\//i.test(href)) return { ok: false, error: 'Alleen http(s) URLs' };
  await shell.openExternal(href);
  return { ok: true };
});

ipcMain.handle('dialog:saveText', async (_event, opts = {}) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: opts.title || 'Opslaan',
    defaultPath: opts.defaultPath || 'export.txt',
    filters: opts.filters || [{ name: 'Tekst', extensions: ['txt'] }],
  });
  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true };
  }
  try {
    fs.writeFileSync(result.filePath, String(opts.content ?? ''), 'utf8');
    return { ok: true, path: result.filePath };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err),
    };
  }
});

async function parsePath(filePath) {
  try {
    const result = await parseSpeakerFile(filePath);
    return {
      ok: true,
      path: filePath,
      fileName: path.basename(filePath),
      ...result,
    };
  } catch (err) {
    return {
      ok: false,
      path: filePath,
      error: err && err.message ? err.message : String(err),
    };
  }
}
