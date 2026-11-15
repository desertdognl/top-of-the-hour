const fs = require('fs');
const path = require('path');

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Local time as yymmdd-hhmm */
function formatBuildStamp(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yy}${mm}${dd}-${hh}${mi}`;
}

function writeBuildInfo(rootDir = path.join(__dirname, '..')) {
  const pkg = require(path.join(rootDir, 'package.json'));
  const info = {
    version: pkg.version,
    build: formatBuildStamp(),
    builtAt: new Date().toISOString(),
  };
  const out = path.join(rootDir, 'build-info.json');
  fs.writeFileSync(out, JSON.stringify(info, null, 2) + '\n', 'utf8');
  console.log(`build-info.json → v${info.version} · ${info.build}`);
  return info;
}

if (require.main === module) {
  writeBuildInfo();
}

module.exports = { formatBuildStamp, writeBuildInfo };
