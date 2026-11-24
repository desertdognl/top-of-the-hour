const { collapseSpaces, parseClockTime, shortTitle } = require('./normalize');

/**
 * Absolute wall-clock run-of-show (Start / Duur / Wat, ROS, cue lists).
 * Flexibel: kolommen mogen wisselen; PDF mag ID+start+duur in één cel plakken.
 */

const RE_HMS = /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/;
const RE_CUE_PACKED =
  /^(?:(\d{1,3})\s+)?(\d{1,2}:\d{2}(?::\d{2})?)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/i;
const RE_CUE_START_ONLY = /^(?:(\d{1,3})\s+)?(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/i;
const RE_CLIP_META = /^\d{2,4}_[A-Za-zÀ-ÿ]/;
const RE_NOISE =
  /^(ppt|audio|mic\s*\d|hh\s*mic|einde:|note:|\*\*|slide\s+\d+|^\d{1,2}$)/i;

function timeOnDay(refDate, hours, minutes, seconds = 0) {
  const d = new Date(refDate);
  d.setHours(hours, minutes, seconds || 0, 0);
  return d;
}

function parseClockFull(raw) {
  const text = collapseSpaces(raw);
  if (!text) return null;
  const m = text.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!m) {
    // allow embedded
    const m2 = text.match(RE_HMS);
    if (!m2) return null;
    return {
      hours: Number(m2[1]),
      minutes: Number(m2[2]),
      seconds: m2[3] != null ? Number(m2[3]) : 0,
    };
  }
  return {
    hours: Number(m[1]),
    minutes: Number(m[2]),
    seconds: m[3] != null ? Number(m[3]) : 0,
  };
}

/** Duur als HH:MM:SS / MM:SS — niet als wall-clock interpreteren. */
function parseDurationSeconds(raw) {
  const text = collapseSpaces(raw);
  if (!text) return null;
  const m = text.match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = m[3] != null ? Number(m[3]) : null;
  if (c != null) {
    // HH:MM:SS duration
    return a * 3600 + b * 60 + c;
  }
  // MM:SS
  return a * 60 + b;
}

function isLikelyDurationToken(raw) {
  const text = collapseSpaces(raw);
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) return false;
  const sec = parseDurationSeconds(text);
  if (sec == null) return false;
  // Wall clocks for events are usually ≥ ~06:00; durations are often 00:xx:xx / 01:xx / 02:xx
  // Accept up to 8 hours as duration.
  return sec > 0 && sec <= 8 * 3600;
}

function looksLikeHeader(cells) {
  const j = cells.map((c) => collapseSpaces(c).toLowerCase()).join(' ');
  return (
    (/\bstart\b/.test(j) && /\bduur\b/.test(j)) ||
    (/\bid\b/.test(j) && /\bstart\b/.test(j)) ||
    (/\bwat\b/.test(j) && /\b(audio|scherm)\b/.test(j))
  );
}

function extractEventTitle(rows) {
  for (const cells of (rows || []).slice(0, 12)) {
    const line = cells.map(collapseSpaces).filter(Boolean).join(' ');
    if (!line) continue;
    if (looksLikeHeader(cells)) continue;
    if (parseClockFull(line) || RE_CUE_PACKED.test(line)) continue;
    if (/^locatie:|^maandag|^dinsdag|^woensdag|^donderdag|^vrijdag|^zaterdag|^zondag/i.test(line)) {
      continue;
    }
    if (/run[\s-]?of[\s-]?show|talent|event|congres|festival|gala/i.test(line) || line.length > 8) {
      // Prefer ROS title lines
      if (/run[\s-]?of[\s-]?show/i.test(line)) {
        return line.replace(/^run[\s-]?of[\s-]?show\s*/i, '').trim() || line;
      }
      if (!RE_NOISE.test(line) && line.length < 80) return line;
    }
  }
  return '';
}

/**
 * Probeer één rij als absolute cue te lezen.
 * @returns {null | { cueId, start, durationSec, what, audio, screen }}
 */
function parseAbsoluteRow(cells) {
  const cleaned = (cells || []).map(collapseSpaces);
  const nonEmpty = cleaned.filter(Boolean);
  if (!nonEmpty.length) return null;
  if (looksLikeHeader(cleaned)) return null;

  const primary = cleaned[0] || '';
  const joined = nonEmpty.join(' ');
  if (RE_CLIP_META.test(primary) || RE_CLIP_META.test(joined)) return null;
  if (/^slide\s+\d+/i.test(joined)) return null;
  if (/^\d{1,2}$/.test(joined)) return null; // page number

  const audio = sideCell(cleaned, /audio|mic|playlist|video|touche|walk-?in/i);
  const screen = sideCell(cleaned, /ppt|scherm|hdmi|pip|slide/i);

  // Prefer matching on first cell (PDF often packs ID+start+duur+wat there;
  // audio/scherm staan in aparte kolommen).
  const packedSource = RE_CUE_PACKED.test(primary) ? primary : joined;
  let m = packedSource.match(RE_CUE_PACKED);
  if (m) {
    const startTok = m[2];
    const durTok = m[3];
    let what = collapseSpaces(m[4]);
    // If we matched on joined, strip trailing audio/screen cells from what
    if (packedSource === joined) {
      what = stripTrailingSides(what, cleaned.slice(1));
    }
    if (!what || RE_CLIP_META.test(what)) return null;
    if (!isLikelyDurationToken(durTok) && parseClockFull(durTok)?.hours >= 6) {
      return null;
    }
    const start = parseClockFull(startTok);
    if (!start) return null;
    return {
      cueId: m[1] || '',
      start,
      durationSec: parseDurationSeconds(durTok),
      what: cleanWhat(what),
      audio,
      screen,
    };
  }

  // Cell0 = start only, cell1 = what (crew call style)
  if (primary && /^([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(primary)) {
    const start = parseClockFull(primary);
    const rest = cleaned.slice(1).filter(Boolean);
    if (!rest.length) return null;
    if (rest[0] && isLikelyDurationToken(rest[0]) && rest[1]) {
      return {
        cueId: '',
        start,
        durationSec: parseDurationSeconds(rest[0]),
        what: cleanWhat(rest.slice(1).filter((c) => c !== audio && c !== screen).join(' ')),
        audio,
        screen,
      };
    }
    const what = cleanWhat(rest.filter((c) => c !== audio && c !== screen).join(' ') || rest[0]);
    if (!what || RE_CLIP_META.test(what)) return null;
    if (RE_NOISE.test(what) && what.length < 12) return null;
    return {
      cueId: '',
      start,
      durationSec: null,
      what,
      audio,
      screen,
    };
  }

  // Start + what without duration in primary cell: "3 09:30:00 Begüm…"
  const startSource = RE_CUE_START_ONLY.test(primary) ? primary : joined;
  m = startSource.match(RE_CUE_START_ONLY);
  if (m && !isLikelyDurationToken(m[3].split(/\s+/)[0] || '')) {
    const start = parseClockFull(m[2]);
    let what = cleanWhat(m[3]);
    if (startSource === joined) what = stripTrailingSides(what, cleaned.slice(1));
    if (!start || !what || RE_CLIP_META.test(what)) return null;
    if (/^\d{1,2}:\d{2}/.test(what) && isLikelyDurationToken(what.split(/\s+/)[0])) return null;
    return {
      cueId: m[1] || '',
      start,
      durationSec: null,
      what,
      audio,
      screen,
    };
  }

  return null;
}

function sideCell(cells, re) {
  for (let i = 1; i < cells.length; i++) {
    const c = cells[i];
    if (c && re.test(c)) return c;
  }
  return '';
}

function stripTrailingSides(what, sideCells) {
  let t = collapseSpaces(what);
  for (const side of sideCells) {
    if (!side) continue;
    if (t.endsWith(side)) t = t.slice(0, -side.length).trim();
    else if (t.includes(side)) t = t.replace(side, ' ').replace(/\s+/g, ' ').trim();
  }
  return t;
}

function cleanWhat(raw) {
  let t = collapseSpaces(raw);
  t = t.replace(/^[-–—•]+\s*/, '');
  t = t.replace(/^audio:\s*/i, '');
  return t.trim();
}

function isScriptContinuation(cells) {
  const joined = cells.map(collapseSpaces).filter(Boolean).join(' ');
  if (!joined) return false;
  if (parseAbsoluteRow(cells)) return false;
  if (looksLikeHeader(cells)) return false;
  if (/^\d{1,2}$/.test(joined)) return false;
  if (RE_CLIP_META.test(joined)) return false; // talent-clip metadata: skip
  // Alleen nuttige regie-regels (geen losse mic-toewijzingen — die zitten al in audio)
  if (/^(ppt|einde:|audio:|note:|\*\*)/i.test(joined)) return true;
  if (/^-\s+\S/.test(joined) && joined.length > 8) return true;
  if (/^(uitdelen|badge|jurylaptops)/i.test(joined)) return true;
  return false;
}

/**
 * @param {string[][]} rows
 * @param {{ referenceDate?: Date }} options
 * @param {{ format?: string }} detection
 */
function absoluteRowsToCues(rows, options = {}, detection = {}) {
  if (!rows || !rows.length) {
    return {
      cues: [],
      meta: { matchTitle: '', kickoff: null, kickoffText: '', format: 'absolute' },
    };
  }

  const referenceDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
  const matchTitle = extractEventTitle(rows);
  const cues = [];
  let cueIndex = 0;
  let lastTimedId = null;
  let section = '';

  for (const cells of rows) {
    const nonEmpty = (cells || []).map(collapseSpaces).filter(Boolean);
    if (!nonEmpty.length) continue;

    const parsed = parseAbsoluteRow(cells);
    if (parsed) {
      const at = timeOnDay(
        referenceDate,
        parsed.start.hours,
        parsed.start.minutes,
        parsed.start.seconds || 0
      );
      // Midnight wrap vs previous
      if (cues.length) {
        const prev = cues.filter((c) => c.atMs != null).slice(-1)[0];
        if (prev && at.getTime() < prev.atMs - 6 * 3600 * 1000) {
          at.setDate(at.getDate() + 1);
        }
      }

      const clockText = `${String(parsed.start.hours).padStart(2, '0')}:${String(parsed.start.minutes).padStart(2, '0')}${
        parsed.start.seconds
          ? `:${String(parsed.start.seconds).padStart(2, '0')}`
          : ''
      }`;
      // Display HH:MM for wheel consistency (seconds optional in clockText)
      const clockHm = `${String(parsed.start.hours).padStart(2, '0')}:${String(parsed.start.minutes).padStart(2, '0')}`;

      const screens = parsed.screen || '';
      const speaker = parsed.audio || '';
      const title = shortTitle(parsed.what, speaker, section);
      const id = `cue-${cueIndex++}`;
      const cue = {
        id,
        at: at.toISOString(),
        atMs: at.getTime(),
        clockText: clockHm,
        tMinusSeconds: null,
        tMinusText: parsed.cueId ? `#${parsed.cueId}` : '',
        durationSec: parsed.durationSec,
        section,
        screens: screens || parsed.what,
        speaker,
        title,
        kind: 'timed',
        parentId: null,
        phase: 'pre',
      };
      cues.push(cue);
      lastTimedId = id;
      continue;
    }

    // Section-ish single labels
    if (nonEmpty.length === 1 && nonEmpty[0].length < 40 && !RE_HMS.test(nonEmpty[0])) {
      if (/break|lunch|borrel|inloop|case|workshop|masterclass|prijs|finale/i.test(nonEmpty[0])) {
        section = nonEmpty[0];
        continue;
      }
    }

    if (lastTimedId && isScriptContinuation(cells)) {
      const text = nonEmpty.join(' — ');
      if (!text || text.length < 2) continue;
      cues.push({
        id: `cue-${cueIndex++}`,
        at: null,
        atMs: null,
        clockText: '',
        tMinusSeconds: null,
        tMinusText: '',
        durationSec: null,
        section,
        screens: text,
        speaker: '',
        title: shortTitle(text, '', section),
        kind: 'script',
        parentId: lastTimedId,
        phase: 'pre',
      });
    }
  }

  // Deduplicate identical atMs+title (PDF sometimes repeats a block)
  const seen = new Set();
  const deduped = [];
  for (const c of cues) {
    if (c.kind === 'timed') {
      const key = `${c.atMs}|${c.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    deduped.push(c);
  }

  const timed = deduped.filter((c) => c.atMs != null).sort((a, b) => a.atMs - b.atMs);
  const first = timed[0] || null;
  const last = timed[timed.length - 1] || null;
  const kickoffDate = first ? new Date(first.atMs) : null;
  const kickoffText = first ? first.clockText : '';

  return {
    cues: deduped,
    meta: {
      matchTitle,
      kickoff: kickoffDate ? kickoffDate.toISOString() : null,
      kickoffMs: kickoffDate ? kickoffDate.getTime() : null,
      kickoffText,
      format: 'absolute',
      formatConfidence: detection.confidence ?? null,
      formatReasons: detection.reasons || [],
      columnMap: { start: 0, duration: 1, what: 2, audio: 3 },
      phases: ['pre'],
      endMs: last ? last.atMs : null,
    },
  };
}

module.exports = {
  absoluteRowsToCues,
  parseAbsoluteRow,
  parseClockFull,
  parseDurationSeconds,
  extractEventTitle,
};
