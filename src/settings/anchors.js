/**
 * Wall-clock anchors: cues that stay locked to planning time
 * (later: do not follow timeshift). Persisted in settings and
 * re-applied on new imports via a durable key (t− / title).
 */

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Stable identity across imports.
 * Prefer t− mark (10m, 0h 0m) — wall clock changes per match, t− usually not.
 */
export function durableAnchorKey(cue) {
  const tm = norm(cue.tMinusText);
  const kind = norm(cue.kind) || 'action';
  if (tm) return `tm:${tm}|k:${kind}`;
  const title = norm(cue.title);
  const section = norm(cue.section);
  return `t:${title}|s:${section}|k:${kind}`;
}

export function anchorLabel(cue) {
  const parts = [
    cue.tMinusText || cue.clockText || '',
    cue.title || 'Cue',
  ].filter(Boolean);
  return parts.join(' · ');
}

export function makeAnchorFromCue(cue) {
  return {
    key: durableAnchorKey(cue),
    label: anchorLabel(cue),
    title: cue.title || '',
    section: cue.section || '',
    tMinusText: cue.tMinusText || '',
    clockText: cue.clockText || '',
    kind: cue.kind || '',
    lockedAt: new Date().toISOString(),
  };
}

export function findAnchor(anchors, cue) {
  const list = anchors || [];
  const key = durableAnchorKey(cue);
  const exact = list.find((a) => a.key === key);
  if (exact) return exact;
  // Soft rematch: same t− + kind (title may change with opponent)
  const tm = norm(cue.tMinusText);
  if (!tm) return null;
  const kind = norm(cue.kind) || 'action';
  return (
    list.find((a) => norm(a.tMinusText) === tm && (norm(a.kind) || 'action') === kind) || null
  );
}

/** Apply saved anchors onto freshly parsed cues (new times kept). */
export function applyAnchorsToCues(cues, anchors) {
  const list = anchors || [];
  return (cues || []).map((c) => {
    const hit = findAnchor(list, c);
    return {
      ...c,
      locked: Boolean(hit),
      anchorKey: durableAnchorKey(c),
    };
  });
}

/**
 * After import: refresh stored labels/clockText for rematched anchors
 * so settings stay readable with the latest planning.
 */
export function refreshAnchorsFromCues(anchors, cues) {
  const list = [...(anchors || [])];
  for (const cue of cues || []) {
    const idx = list.findIndex((a) => {
      if (a.key === durableAnchorKey(cue)) return true;
      const tm = norm(cue.tMinusText);
      if (!tm) return false;
      return norm(a.tMinusText) === tm && (norm(a.kind) || 'action') === (norm(cue.kind) || 'action');
    });
    if (idx < 0) continue;
    list[idx] = {
      ...list[idx],
      key: durableAnchorKey(cue),
      label: anchorLabel(cue),
      title: cue.title || list[idx].title,
      section: cue.section || list[idx].section,
      tMinusText: cue.tMinusText || list[idx].tMinusText,
      clockText: cue.clockText || list[idx].clockText,
      kind: cue.kind || list[idx].kind,
      lastSeenAt: new Date().toISOString(),
    };
  }
  return list;
}

export function toggleAnchorInList(anchors, cue) {
  const list = [...(anchors || [])];
  const existing = findAnchor(list, cue);
  if (existing) {
    return {
      anchors: list.filter((a) => a.key !== existing.key),
      locked: false,
    };
  }
  return {
    anchors: [...list, makeAnchorFromCue(cue)],
    locked: true,
  };
}

export function removeAnchorByKey(anchors, key) {
  return (anchors || []).filter((a) => a.key !== key);
}

/**
 * FCU standaardanker-set (t− markers die vaak wall-clock blijven).
 * Keys match durableAnchorKey for timed cues with these t− texts.
 */
export const FCU_STANDARD_ANCHORS = [
  { tMinusText: '0h 20m', label: '−20m · 20 minuten tot aftrap' },
  { tMinusText: '0h 10m', label: '−10m · 10 minuten tot aftrap' },
  { tMinusText: '0h 4m', label: '−4m · opkomst / countdown' },
  { tMinusText: '0h 0m', label: 'Aftrap' },
];

/**
 * Lock all cues that match the FCU template (by normalized t−).
 * Merges into existing anchors (does not clear others).
 */
export function applyFcuStandardAnchors(cues, anchors = []) {
  const list = [...(anchors || [])];
  const byKey = new Map(list.map((a) => [a.key, a]));
  let added = 0;
  let matched = 0;

  for (const cue of cues || []) {
    const tm = norm(cue.tMinusText);
    if (!tm) continue;
    const hit = FCU_STANDARD_ANCHORS.find((t) => norm(t.tMinusText) === tm);
    if (!hit) continue;
    matched += 1;
    const key = durableAnchorKey(cue);
    if (byKey.has(key)) continue;
    const anchor = {
      ...makeAnchorFromCue(cue),
      label: hit.label || anchorLabel(cue),
    };
    byKey.set(key, anchor);
    list.push(anchor);
    added += 1;
  }

  return { anchors: list, added, matched };
}
