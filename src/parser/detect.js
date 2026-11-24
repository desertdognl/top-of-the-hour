const { collapseSpaces, parseTMinus, parseClockTime } = require('./normalize');

/**
 * Analyseer rijen en kies een parser-profiel.
 * Geen strikte templates: scores op signalen zodat kleine layout-variaties nog werken.
 *
 * @returns {{ format: 'fcu' | 'absolute', confidence: number, scores: object, reasons: string[] }}
 */
function detectFormat(rows) {
  const sample = (rows || []).slice(0, 80);
  const flat = sample.map((r) => (Array.isArray(r) ? r : [r]).map(collapseSpaces).filter(Boolean));
  const joinedLines = flat.map((cells) => cells.join(' '));
  const blob = joinedLines.join('\n').toLowerCase();

  const scores = { fcu: 0, absolute: 0 };
  const reasons = [];

  // --- Headers / labels ---
  if (/t\s*[-−]?\s*minus|t−/.test(blob) || (/\btijd\b/.test(blob) && /\bscherm/.test(blob))) {
    scores.fcu += 4;
    reasons.push('FCU-achtige kolomkoppen');
  }
  if (/\bspeaker\b/.test(blob) && /\btijd\b/.test(blob)) {
    scores.fcu += 2;
  }
  if (
    /\b(start|begintijd|aanvangstijd)\b/.test(blob) &&
    /\b(duur|duration|lengte)\b/.test(blob)
  ) {
    scores.absolute += 4;
    reasons.push('Start/Duur-koppen');
  }
  if (/\b(run[\s-]?of[\s-]?show|draaiboek|cue[\s-]?list|ros)\b/.test(blob)) {
    scores.absolute += 3;
    reasons.push('Run-of-show label');
  }
  if (/\b(wat|audio|scherm|screen|visual)\b/.test(blob) && /\b(start|duur|id)\b/.test(blob)) {
    scores.absolute += 2;
  }

  // --- Cell / line patterns ---
  let tMinusHits = 0;
  let hmsWallHits = 0;
  let idStartDurHits = 0;
  let aftrapHits = 0;
  let hhmmOnlyHits = 0;

  for (const line of joinedLines) {
    const lower = line.toLowerCase();
    if (parseTMinus(line) != null || /\b\d+\s*h\s*\d+\s*m\b/i.test(line)) tMinusHits += 1;
    if (/aftrap|aanvang|kick\s*off|0h\s*0m/.test(lower)) aftrapHits += 1;

    // Wall clock with seconds: 09:30:00 (not 0:00:53 clip lengths alone)
    if (/\b([01]?\d|2[0-3]):[0-5]\d:[0-5]\d\b/.test(line)) hmsWallHits += 1;

    // Classic absolute cue: optional ID + start + duration + text
    if (
      /^\d{1,3}\s+\d{1,2}:\d{2}(?::\d{2})?\s+\d{1,2}:\d{2}(?::\d{2})?\s+\S+/i.test(line) ||
      /^\d{1,2}:\d{2}(?::\d{2})?\s+\d{1,2}:\d{2}(?::\d{2})?\s+\S+/i.test(line)
    ) {
      idStartDurHits += 1;
    }

    const clock = parseClockTime(line);
    if (clock && !/\d{1,2}:\d{2}:\d{2}/.test(line) && /\b\d{1,2}[:.]\d{2}\b/.test(line)) {
      hhmmOnlyHits += 1;
    }
  }

  if (tMinusHits >= 3) {
    scores.fcu += Math.min(5, tMinusHits);
    reasons.push(`${tMinusHits}× t−-achtige waarden`);
  }
  if (aftrapHits >= 1) {
    scores.fcu += 3;
    reasons.push('Aftrap/aanvang');
  }
  if (hhmmOnlyHits >= 4 && tMinusHits >= 2) {
    scores.fcu += 2;
  }

  if (idStartDurHits >= 3) {
    scores.absolute += Math.min(6, Math.floor(idStartDurHits / 2) + 2);
    reasons.push(`${idStartDurHits}× ID/start/duur-regels`);
  }
  if (hmsWallHits >= 5 && tMinusHits < 2) {
    scores.absolute += 3;
    reasons.push('Veel HH:MM:SS wall-clocks');
  }

  // Football speakerformat rarely has dozens of HH:MM:SS with durations
  if (scores.fcu >= 4 && scores.absolute >= 4 && tMinusHits >= idStartDurHits) {
    scores.fcu += 2;
    reasons.push('t− wint bij twijfel');
  }

  const format = scores.absolute > scores.fcu ? 'absolute' : 'fcu';
  const lead = Math.max(scores.fcu, scores.absolute);
  const other = Math.min(scores.fcu, scores.absolute);
  const confidence = lead === 0 ? 0 : Math.min(1, (lead - other + 1) / (lead + 1));

  return { format, confidence, scores, reasons };
}

module.exports = {
  detectFormat,
};
