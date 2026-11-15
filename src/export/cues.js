/**
 * Export genormaliseerde cues naar JSON of CSV (plain strings).
 */

function cueRow(c) {
  return {
    id: c.id || '',
    kind: c.kind || '',
    clock: c.clockText || '',
    tMinus: c.tMinusText || '',
    tMinusSeconds: c.tMinusSeconds ?? null,
    title: c.title || '',
    section: c.section || '',
    screens: c.screens || '',
    speaker: c.speaker || '',
    locked: Boolean(c.locked),
    at: c.at || null,
  };
}

export function cuesToJson(cues, meta = {}) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      meta: {
        matchTitle: meta.matchTitle || '',
        kickoffText: meta.kickoffText || '',
        kickoff: meta.kickoff || null,
      },
      cues: (cues || []).map(cueRow),
    },
    null,
    2
  );
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function cuesToCsv(cues) {
  const headers = [
    'id',
    'kind',
    'clock',
    'tMinus',
    'tMinusSeconds',
    'title',
    'section',
    'screens',
    'speaker',
    'locked',
    'at',
  ];
  const lines = [headers.join(',')];
  for (const c of cues || []) {
    const row = cueRow(c);
    lines.push(
      [
        row.id,
        row.kind,
        row.clock,
        row.tMinus,
        row.tMinusSeconds ?? '',
        row.title,
        row.section,
        row.screens,
        row.speaker,
        row.locked ? '1' : '0',
        row.at || '',
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  return `${lines.join('\n')}\n`;
}
