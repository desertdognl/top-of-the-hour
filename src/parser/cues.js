const {
  collapseSpaces,
  parseClockTime,
  parseTMinus,
  normalizeTMinusText,
  looksLikeHeaderRow,
  detectColumnMap,
  cellAt,
  isSectionHeader,
  shortTitle,
} = require('./normalize');

/**
 * Build absolute Date for HH:MM on a reference calendar day.
 * If times wrap past midnight relative to kickoff, shift day forward.
 */
function timeOnDay(refDate, hours, minutes) {
  const d = new Date(refDate);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function inferKickoffFromRows(rows, colMap) {
  for (const cells of rows) {
    const tMinus = cellAt(cells, colMap.tMinus);
    const time = cellAt(cells, colMap.time);
    const screens = cellAt(cells, colMap.screens);
    const speaker = cellAt(cells, colMap.speaker);
    const joined = `${tMinus} ${time} ${screens} ${speaker}`.toLowerCase();

    if (/aanvang|aftrap|kick\s*off/.test(joined) || /^0h\s*0m$/i.test(stripLoose(tMinus))) {
      const clock = parseClockTime(time) || parseClockTime(screens) || parseClockTime(speaker);
      if (clock) return clock;
    }
  }

  // last timed row often is kickoff / FT — prefer earliest 0h0m style
  for (const cells of rows) {
    const tMinus = cellAt(cells, colMap.tMinus);
    if (parseTMinus(tMinus) === 0) {
      const clock = parseClockTime(cellAt(cells, colMap.time));
      if (clock) return clock;
    }
  }

  // any "Aanvang" nearby in first rows
  for (const cells of rows.slice(0, 8)) {
    const clock = parseClockTime(cells.join(' '));
    if (clock) return clock;
  }

  return null;
}

function stripLoose(s) {
  return String(s || '').replace(/\s+/g, '');
}

function extractMatchTitle(rows, colMap) {
  for (const cells of rows.slice(0, 8)) {
    const speaker = cellAt(cells, colMap.speaker);
    const screens = cellAt(cells, colMap.screens);
    const time = cellAt(cells, colMap.time);

    // Prefer dedicated matchup cell (often SPEAKER on Aanvang row)
    for (const candidate of [speaker, screens, time]) {
      if (/[–—]/.test(candidate) && /[A-Za-zÀ-ÿ]/.test(candidate)) {
        const m = candidate.match(
          /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .]*?)\s*[–—]\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .]*)/
        );
        if (m) return `${m[1].trim()} – ${m[2].trim()}`;
      }
    }

    if (/aanvang/i.test(time) && speaker) return speaker;
  }
  return '';
}

/**
 * @param {string[][]} rows
 * @param {{ referenceDate?: Date }} options
 */
function rowsToCues(rows, options = {}) {
  if (!rows || !rows.length) {
    return { cues: [], meta: { matchTitle: '', kickoff: null, kickoffText: '' } };
  }

  let start = 0;
  let colMap = { tMinus: 0, time: 1, screens: 2, speaker: 3 };
  if (looksLikeHeaderRow(rows[0])) {
    colMap = detectColumnMap(rows[0]);
    start = 1;
  }

  const body = rows.slice(start);
  const kickoffClock = inferKickoffFromRows(body, colMap);
  const referenceDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
  // Use today's date as calendar base; times are wall-clock
  let kickoffDate = null;
  let kickoffText = '';
  if (kickoffClock) {
    kickoffDate = timeOnDay(referenceDate, kickoffClock.hours, kickoffClock.minutes);
    kickoffText = `${String(kickoffClock.hours).padStart(2, '0')}:${String(kickoffClock.minutes).padStart(2, '0')}`;
  }

  const matchTitle = extractMatchTitle(body, colMap);
  const cues = [];
  let section = '';
  let lastTimedId = null;
  let cueIndex = 0;

  for (const cells of body) {
    const nonEmpty = cells.map(collapseSpaces).filter(Boolean);
    if (!nonEmpty.length) continue;

    if (isSectionHeader(cells, colMap)) {
      section = nonEmpty[0];
      continue;
    }

    const tMinusRaw = cellAt(cells, colMap.tMinus);
    const timeRaw = cellAt(cells, colMap.time);
    const screens = cellAt(cells, colMap.screens);
    const speaker = cellAt(cells, colMap.speaker);

    // Aanvang meta-row: time label + clock in screens/speaker — skip as cue
    if (/^aanvang$/i.test(timeRaw) || /^aanvang$/i.test(tMinusRaw)) {
      continue;
    }

    // relative match-minute rows like "80e min", "90+1", "FT"
    const relative = parseRelativeMatchMarker(tMinusRaw) || parseRelativeMatchMarker(timeRaw);

    const tMinusSeconds = parseTMinus(tMinusRaw);
    let clock = parseClockTime(timeRaw);
    // Only treat SCHERMEN as clock when the cell is essentially a time (Aanvang-style)
    if (!clock && screens && /^[\d\s.:uur]+$/i.test(screens) && screens.length <= 12) {
      clock = parseClockTime(screens);
    }

    let at = null;
    if (clock) {
      at = timeOnDay(referenceDate, clock.hours, clock.minutes);
      // if we have kickoff and this clock is before a morning kickoff after late evening cues — rare; skip
      if (kickoffDate && at.getTime() < kickoffDate.getTime() - 12 * 3600 * 1000) {
        at.setDate(at.getDate() + 1);
      }
    } else if (tMinusSeconds != null && kickoffDate) {
      at = new Date(kickoffDate.getTime() - tMinusSeconds * 1000);
    }

    const hasContent = Boolean(screens || speaker || relative);
    if (!hasContent && at == null && tMinusSeconds == null) {
      // maybe misplaced section
      if (nonEmpty.length === 1) {
        section = nonEmpty[0];
      }
      continue;
    }

    const id = `cue-${cueIndex++}`;
    const title = shortTitle(screens || relative || '', speaker, section);
    const cue = {
      id,
      at: at ? at.toISOString() : null,
      atMs: at ? at.getTime() : null,
      clockText: clock
        ? `${String(clock.hours).padStart(2, '0')}:${String(clock.minutes).padStart(2, '0')}`
        : '',
      tMinusSeconds: tMinusSeconds != null ? tMinusSeconds : null,
      tMinusText: tMinusRaw ? normalizeTMinusText(tMinusRaw) : '',
      section,
      screens: screens || relative || '',
      speaker: speaker || '',
      title,
      kind: at ? 'timed' : relative ? 'relative' : 'event',
      parentId: null,
    };

    // Script blocks without own time attach to previous timed cue
    if (!at && lastTimedId && (screens || speaker) && !relative) {
      cue.parentId = lastTimedId;
      cue.kind = 'script';
    }

    cues.push(cue);
    if (at) lastTimedId = id;
  }

  const kickoffMs = kickoffDate ? kickoffDate.getTime() : null;
  const cuesWithPhase = cues.map((c) => ({
    ...c,
    phase: inferPhase(c, kickoffMs),
  }));

  return {
    cues: cuesWithPhase,
    meta: {
      matchTitle,
      kickoff: kickoffDate ? kickoffDate.toISOString() : null,
      kickoffMs,
      kickoffText,
      columnMap: colMap,
      phases: ['pre', 'match', 'rust', 'post'],
    },
  };
}

/**
 * pre = wall-clock to kickoff; match = live (no countdown);
 * rust / post = separate manual clocks.
 */
function inferPhase(cue, kickoffMs) {
  const section = String(cue.section || '').trim();
  const blob = `${section} ${cue.title || ''} ${cue.screens || ''} ${cue.tMinusText || ''}`.toLowerCase();

  if (/^rust$/i.test(section) || cue.tMinusText === 'RUST') return 'rust';

  if (
    /einde wedstrijd|\bft\b|bedank|volgende thuis|na de wedstrijd/.test(blob) ||
    /^ft$/i.test(cue.tMinusText || '')
  ) {
    return 'post';
  }

  if (
    /tweede helft|2e?\s*helft/.test(section.toLowerCase()) ||
    /wissel|80\s*e|90\s*e|90\s*\+|extra tijd|player of the match|reminder stemmen/.test(blob)
  ) {
    return 'match';
  }

  if (cue.atMs != null && kickoffMs != null) {
    return cue.atMs <= kickoffMs ? 'pre' : 'match';
  }

  if (/aftrap/i.test(cue.title || '')) return 'pre';
  return 'pre';
}

function parseRelativeMatchMarker(raw) {
  const t = collapseSpaces(raw);
  if (!t) return '';
  if (/^ft$/i.test(t) || /^einde/i.test(t)) return 'FT';
  if (/^\d+\s*\+\s*\d+/.test(t)) return t;
  if (/^\d+\s*e?\s*min/i.test(t)) return t;
  if (/^2e?\s*helft/i.test(t) || /^rust$/i.test(t)) return t;
  return '';
}

module.exports = {
  rowsToCues,
  inferKickoffFromRows,
  extractMatchTitle,
};
