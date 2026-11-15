/**
 * Fuzzy helpers for speakerformat times and T-minus values.
 * Formats vary slightly between files — keep patterns broad.
 */

function collapseSpaces(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripNoise(text) {
  return collapseSpaces(text).replace(/\s+/g, '');
}

/**
 * Parse "18:45", "18.45", "18:45 uur" → { hours, minutes } or null
 */
function parseClockTime(raw) {
  const text = collapseSpaces(raw);
  if (!text) return null;
  const m = text.match(/\b(\d{1,2})\s*[:.]\s*(\d{2})\b/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/**
 * Parse "1h 30m", "0h 4 5 m", "0h45m", "55m" → seconds or null
 */
function parseTMinus(raw) {
  const compact = stripNoise(raw).toLowerCase();
  if (!compact) return null;

  let hours = 0;
  let minutes = 0;
  let matched = false;

  const hm = compact.match(/(\d+)\s*h(?:our)?s?/);
  if (hm) {
    hours = Number(hm[1]);
    matched = true;
  }

  const mm = compact.match(/(\d+)\s*m(?:in(?:ute)?s?)?/);
  if (mm) {
    minutes = Number(mm[1]);
    matched = true;
  }

  // bare "90" with context words nearby is handled by caller; here only h/m forms
  if (!matched) return null;
  return hours * 3600 + minutes * 60;
}

/** Canonical display: `0h 20m`, `1h 30m` — stabiel voor anker-keys */
function formatTMinusText(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '';
  const s = Math.max(0, Math.round(Number(seconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  // Always include hours-part for <1h so `20m` en `0h 20m` naar dezelfde key gaan
  return `${h}h ${m}m`;
}

/**
 * Normaliseer rommelige t−-labels (`0h 20 m`, `0h 4 5 m`) naar canonieke vorm.
 * Niet-parsebare markers (RUST, 80e min, …) blijven collapsed spaces.
 */
function normalizeTMinusText(raw) {
  const collapsed = collapseSpaces(raw);
  if (!collapsed) return '';
  const sec = parseTMinus(collapsed);
  if (sec == null) return collapsed;
  return formatTMinusText(sec);
}

function looksLikeHeaderRow(cells) {
  const joined = cells.map((c) => collapseSpaces(c).toLowerCase()).join(' | ');
  return (
    /t\s*minus/.test(joined) ||
    (/\btijd\b/.test(joined) && /\bscherm/.test(joined)) ||
    (/\btijd\b/.test(joined) && /\bspeaker\b/.test(joined))
  );
}

function detectColumnMap(headerCells) {
  const map = { tMinus: -1, time: -1, screens: -1, speaker: -1 };
  headerCells.forEach((cell, i) => {
    const t = collapseSpaces(cell).toLowerCase();
    if (/t\s*minus|t-minus|t−/.test(t)) map.tMinus = i;
    else if (/^tijd$|tijd\b/.test(t) && map.time < 0) map.time = i;
    else if (/scherm/.test(t)) map.screens = i;
    else if (/speaker|omroep|tekst/.test(t)) map.speaker = i;
  });
  // fallback classic order
  if (map.tMinus < 0 && map.time < 0) {
    map.tMinus = 0;
    map.time = 1;
    map.screens = 2;
    map.speaker = 3;
  } else {
    if (map.tMinus < 0) map.tMinus = 0;
    if (map.time < 0) map.time = 1;
    if (map.screens < 0) map.screens = 2;
    if (map.speaker < 0) map.speaker = 3;
  }
  return map;
}

function cellAt(cells, index) {
  if (index < 0 || index >= cells.length) return '';
  return collapseSpaces(cells[index]);
}

/**
 * Section headers are often a single non-empty cell without time/t-minus.
 */
function isSectionHeader(cells, colMap) {
  const nonEmpty = cells.map(collapseSpaces).filter(Boolean);
  if (nonEmpty.length === 0) return false;

  const time = cellAt(cells, colMap.time);
  const tMinus = cellAt(cells, colMap.tMinus);
  const screens = cellAt(cells, colMap.screens);
  const speaker = cellAt(cells, colMap.speaker);

  if (parseClockTime(time) || parseTMinus(tMinus)) return false;
  if (screens || speaker) return false;

  // one primary label, short-ish
  const label = nonEmpty[0];
  if (nonEmpty.length <= 2 && label.length < 60) return true;
  return false;
}

function shortTitle(screens, speaker, section) {
  const fromScreens = collapseSpaces(screens);
  if (fromScreens) {
    // first meaningful chunk
    const cut = fromScreens.split(/[.(]/)[0].trim();
    return cut.slice(0, 42) || fromScreens.slice(0, 42);
  }
  const fromSpeaker = collapseSpaces(speaker);
  if (fromSpeaker) return fromSpeaker.slice(0, 42);
  return section || 'Cue';
}

module.exports = {
  collapseSpaces,
  stripNoise,
  parseClockTime,
  parseTMinus,
  formatTMinusText,
  normalizeTMinusText,
  looksLikeHeaderRow,
  detectColumnMap,
  cellAt,
  isSectionHeader,
  shortTitle,
};
