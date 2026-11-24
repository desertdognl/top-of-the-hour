/**
 * Match phases with different clock behaviours.
 *
 * - pre:   wall-clock countdown to kickoff (aftelklok)
 * - match: live play — no fixed duration, no countdown clock
 * - rust:  separate manual/relative clock (start at whistle)
 * - post:  separate manual/relative clock after FT
 */

export const PHASES = [
  {
    id: 'pre',
    label: 'Voorprogramma',
    short: 'Pre',
    clockType: 'wall',
    hint: 'Wall-clock tot aftrap',
  },
  {
    id: 'match',
    label: 'Wedstrijd',
    short: 'Live',
    clockType: 'none',
    hint: 'Geen aftelklok — speelduur is niet vast',
  },
  {
    id: 'rust',
    label: 'Rust',
    short: 'Rust',
    clockType: 'manual',
    hint: 'Start bij begin van de rust (OSC of Start-knop)',
  },
  {
    id: 'post',
    label: 'Na de wedstrijd',
    short: 'FT',
    clockType: 'manual',
    hint: 'Start bij eindfluit (OSC of Start-knop)',
  },
];

/**
 * Assign phase to a cue from section / markers / kickoff.
 */
export function assignCuePhase(cue, kickoffMs) {
  const blob = `${cue.section || ''} ${cue.title || ''} ${cue.screens || ''} ${cue.tMinusText || ''} ${cue.kind || ''}`.toLowerCase();

  if (
    /\beinde\b/.test(blob) ||
    /\bft\b/.test(blob) ||
    /bedank/.test(blob) ||
    /volgende thuis/.test(blob) ||
    /na de wedstrijd/.test(blob)
  ) {
    return 'post';
  }

  if (/^rust$/i.test(cue.section || '') || /\brust\b/.test(blob) && /commercials deel|wedstrijdsponsor|wisselsponsor|potm/.test(blob)) {
    // Halftime block — but not "rust" word inside pre-match scripts
    if (/^rust$/i.test(cue.section || '') || cue.tMinusText === 'RUST' || /^rust$/i.test(cue.clockText || '')) {
      return 'rust';
    }
  }

  if (/^rust$/i.test(String(cue.section || '').trim())) return 'rust';

  if (
    /tweede helft|2e?\s*helft|wissel|80\s*e?\s*min|90\s*e?\s*min|90\s*\+|extra tijd|player of the match/.test(
      blob
    )
  ) {
    return 'match';
  }

  // Timed cues up to and including kickoff/aftrap → pre
  if (cue.atMs != null && kickoffMs != null) {
    if (cue.atMs <= kickoffMs) return 'pre';
    return 'match';
  }

  if (/aftrap/i.test(cue.title || '')) return 'pre';

  return 'pre';
}

export function tagCuesWithPhases(cues, meta = {}) {
  // Absolute run-of-show: één wall-clock timeline (alles in pre)
  if (meta.format === 'absolute') {
    return (cues || []).map((c) => ({
      ...c,
      phase: 'pre',
    }));
  }
  const kickoffMs = meta.kickoffMs || null;
  return (cues || []).map((c) => ({
    ...c,
    phase: assignCuePhase(c, kickoffMs),
  }));
}

export function cuesForPhase(cues, phaseId) {
  return (cues || []).filter((c) => c.phase === phaseId);
}

export function createManualClockState() {
  return {
    running: false,
    startedAtMs: null,
    accumulatedMs: 0,
    itemIndex: 0,
  };
}

export function manualElapsedMs(state, nowMs = Date.now()) {
  if (!state) return 0;
  const base = state.accumulatedMs || 0;
  if (state.running && state.startedAtMs != null) {
    return base + (nowMs - state.startedAtMs);
  }
  return base;
}

export function manualStart(state, nowMs = Date.now()) {
  if (state.running) return state;
  state.running = true;
  state.startedAtMs = nowMs;
  return state;
}

export function manualPause(state, nowMs = Date.now()) {
  if (!state.running) return state;
  state.accumulatedMs = manualElapsedMs(state, nowMs);
  state.running = false;
  state.startedAtMs = null;
  return state;
}

export function manualReset(state) {
  state.running = false;
  state.startedAtMs = null;
  state.accumulatedMs = 0;
  state.itemIndex = 0;
  return state;
}
