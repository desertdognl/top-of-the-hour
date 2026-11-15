#!/usr/bin/env node
/**
 * Build an unpacked macOS .app (no installer/DMG).
 * Result: dist/mac-arm64/Top of the Hour.app
 * After build: quit running instance and relaunch automatically.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { writeBuildInfo } = require('./write-build-info');

const root = path.join(__dirname, '..');
const appName = 'Top of the Hour.app';
const productName = 'Top of the Hour';
const legacyRootApp = path.join(root, appName);

function findBuiltApp() {
  const candidates = [
    path.join(root, 'dist', 'mac-arm64', appName),
    path.join(root, 'dist', 'mac', appName),
    path.join(root, 'dist', 'mac-x64', appName),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(dist)) return null;
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (name === appName && fs.statSync(full).isDirectory()) return full;
      if (fs.statSync(full).isDirectory() && !name.startsWith('.')) {
        const hit = walk(full);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(dist);
}

function quitRunningApp() {
  console.log('→ stop lopende app');
  spawnSync(
    'osascript',
    ['-e', `tell application "${productName}" to quit`],
    { stdio: 'ignore' }
  );
  spawnSync('pkill', ['-f', `${productName}.app/Contents/MacOS`], {
    stdio: 'ignore',
  });
  spawnSync('sleep', ['0.4'], { stdio: 'ignore' });
}

function launchApp(appPath) {
  console.log('→ start app');
  spawnSync('xattr', ['-cr', appPath], { stdio: 'ignore' });
  spawnSync('open', ['-n', appPath], { stdio: 'ignore' });
}

console.log('→ build-info');
writeBuildInfo(root);

quitRunningApp();

// Oude root-kopie opruimen (was alleen voor gemak; dist is de bron)
if (fs.existsSync(legacyRootApp)) {
  console.log('→ verwijder verouderde root-kopie');
  fs.rmSync(legacyRootApp, { recursive: true, force: true });
}

console.log('→ electron-builder --mac dir');
const result = spawnSync(
  'npx',
  ['electron-builder', '--mac', 'dir', '--arm64'],
  { cwd: root, stdio: 'inherit', shell: true }
);

if (result.status !== 0) {
  console.error('Build mislukt');
  process.exit(result.status || 1);
}

const built = findBuiltApp();
if (!built) {
  console.error('Kon gebouwde .app niet vinden in dist/');
  process.exit(1);
}

const pkg = require(path.join(root, 'package.json'));
launchApp(built);

console.log(`\nKlaar & herstart: ${path.relative(root, built)} (v${pkg.version})`);
console.log(`Pad: ${built}`);
