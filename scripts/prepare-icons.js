#!/usr/bin/env node
/**
 * Bouw macOS-icons uit een bron-PNG/JPG.
 * Schrijft build/icon.png + build/icon.icns (RGBA vereist voor iconutil).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const buildDir = path.join(root, 'build');
const pngOut = path.join(buildDir, 'icon.png');
const icnsOut = path.join(buildDir, 'icon.icns');

const srcArg = process.argv[2];
const srcCandidates = [
  srcArg ? path.resolve(srcArg) : null,
  path.join(buildDir, 'icon-source.png'),
  path.join(buildDir, 'icon-source.jpg'),
  pngOut,
].filter(Boolean);

const src = srcCandidates.find((p) => fs.existsSync(p));
if (!src) {
  console.error('Geen bron-icoon gevonden. Geef een pad of leg build/icon.png klaar.');
  process.exit(1);
}

fs.mkdirSync(buildDir, { recursive: true });

const py = `
from pathlib import Path
from PIL import Image
import shutil, subprocess, sys

src = Path(${JSON.stringify(src)})
png_out = Path(${JSON.stringify(pngOut)})
icns_out = Path(${JSON.stringify(icnsOut)})
iconset = png_out.parent / 'icon.iconset'

img = Image.open(src).convert('RGBA').resize((1024, 1024), Image.Resampling.LANCZOS)
img.save(png_out, format='PNG')

if iconset.exists():
    shutil.rmtree(iconset)
iconset.mkdir()

sizes = [
  (16, 'icon_16x16.png'),
  (32, 'icon_16x16@2x.png'),
  (32, 'icon_32x32.png'),
  (64, 'icon_32x32@2x.png'),
  (128, 'icon_128x128.png'),
  (256, 'icon_128x128@2x.png'),
  (256, 'icon_256x256.png'),
  (512, 'icon_256x256@2x.png'),
  (512, 'icon_512x512.png'),
  (1024, 'icon_512x512@2x.png'),
]
for px, name in sizes:
    img.resize((px, px), Image.Resampling.LANCZOS).save(iconset / name, format='PNG')

subprocess.check_call(['iconutil', '-c', 'icns', str(iconset), '-o', str(icns_out)])
shutil.rmtree(iconset)
print('icon.png + icon.icns klaar')
`;

try {
  execFileSync('python3', ['-c', py], { stdio: 'inherit' });
} catch (err) {
  console.error('Icon-build mislukt (Pillow + iconutil vereist).');
  process.exit(1);
}

console.log('Bron:', path.relative(root, src));
