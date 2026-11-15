/**
 * Rolling program-wheel clock engine.
 */

import { effectiveNowMs, effectiveCueMs } from './sync.js';

export const WINDOW_MS = 60 * 60 * 1000;
/** Past shown on the wheel (behind NOW) */
export const LOOKBACK_MS = 10 * 60 * 1000;

export function windowMsForMinutes(minutes) {
  const m = Number(minutes) || 60;
  return Math.max(15, Math.min(180, m)) * 60 * 1000;
}

/** Lookback scales with window (~1/6), clamped */
export function lookbackMsForWindow(windowMs) {
  const raw = windowMs / 6;
  return Math.max(3 * 60 * 1000, Math.min(20 * 60 * 1000, raw));
}

/**
 * @param {object[]} cues
 * @param {object} syncState
 * @param {number} [wallMs]
 * @param {{ windowMs?: number, lookbackMs?: number }} [opts]
 */
export function buildClockSnapshot(cues, syncState, wallMs = Date.now(), opts = {}) {
  const windowMs = opts.windowMs || WINDOW_MS;
  const lookbackMs = opts.lookbackMs != null ? opts.lookbackMs : lookbackMsForWindow(windowMs);
  const nowMs = effectiveNowMs(syncState, wallMs);
  const baseSync = { ...syncState, timeshiftMs: 0 };
  const timed = cues
    .filter((c) => c.atMs != null)
    .map((c) => ({
      ...c,
      effectiveMs: effectiveCueMs(c, syncState),
      /** Kickoff-aligned time without flex timeshift (for shift-preview ghosts) */
      baseMs: effectiveCueMs(c, baseSync),
    }))
    .filter((c) => c.effectiveMs != null)
    .sort((a, b) => a.effectiveMs - b.effectiveMs);

  const windowStart = nowMs - lookbackMs;
  const windowEnd = nowMs + (windowMs - lookbackMs);

  let current = null;
  let next = null;
  for (const c of timed) {
    if (c.effectiveMs <= nowMs) current = c;
    if (c.effectiveMs > nowMs) {
      next = c;
      break;
    }
  }

  // End time of each timed cue = start of the following cue
  const endMsById = new Map();
  for (let i = 0; i < timed.length; i++) {
    const end = i + 1 < timed.length ? timed[i + 1].effectiveMs : timed[i].effectiveMs + 8 * 60 * 1000;
    endMsById.set(timed[i].id, end);
  }

  // Include cues that overlap the window (not only those that *start* inside it).
  // Critical: current item that started > lookback ago must stay on the wheel.
  const byId = new Map();
  for (const c of timed) {
    const end = endMsById.get(c.id);
    const overlaps = c.effectiveMs < windowEnd && end > windowStart;
    if (overlaps) byId.set(c.id, c);
  }
  if (current) byId.set(current.id, current);
  if (next) byId.set(next.id, next);

  const windowCues = [...byId.values()].sort((a, b) => a.effectiveMs - b.effectiveMs);

  const secondsToNext = next ? Math.max(0, (next.effectiveMs - nowMs) / 1000) : null;
  const inFinalMinute = secondsToNext != null && secondsToNext <= 60;

  let currentPlannedSeconds = null;
  let currentRemainingSeconds = null;
  let currentElapsedSeconds = null;
  if (current && next) {
    currentPlannedSeconds = Math.max(0, (next.effectiveMs - current.effectiveMs) / 1000);
    currentRemainingSeconds = secondsToNext;
    currentElapsedSeconds = Math.max(0, (nowMs - current.effectiveMs) / 1000);
  } else if (current && !next) {
    currentElapsedSeconds = Math.max(0, (nowMs - current.effectiveMs) / 1000);
  }

  return {
    nowMs,
    windowStart,
    windowEnd,
    windowMs,
    lookbackMs,
    timed,
    windowCues,
    endMsById: Object.fromEntries(endMsById),
    current,
    next,
    secondsToNext,
    currentPlannedSeconds,
    currentRemainingSeconds,
    currentElapsedSeconds,
    inFinalMinute,
    finalMinuteProgress:
      inFinalMinute && secondsToNext != null ? 1 - secondsToNext / 60 : 0,
    secondsWheelValue:
      secondsToNext == null ? 0 : secondsToNext > 60 ? 60 : secondsToNext,
  };
}

/** e.g. 5m 20s or 45s */
export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const s = Math.max(0, Math.ceil(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  if (mm <= 0) return `${ss}s`;
  if (ss === 0) return `${mm}m`;
  return `${mm}m ${String(ss).padStart(2, '0')}s`;
}

/**
 * Angle for program wheel: NOW is at top (−90° / 12 o'clock).
 * Full circle = windowMs (lookback behind NOW, rest ahead).
 *
 * Note: lookbackMs is kept in the signature for callers/API stability;
 * NOW-at-top means angle depends only on (t − now) / windowMs.
 */
export function cueAngleRadians(
  effectiveMs,
  nowMs,
  lookbackMs = LOOKBACK_MS,
  windowMs = WINDOW_MS
) {
  const offset = effectiveMs - nowMs;
  // Clamp to the visible window so pie arcs never wrap the long way
  const min = -Number(lookbackMs) || -LOOKBACK_MS;
  const max = Number(windowMs) - (Number(lookbackMs) || LOOKBACK_MS);
  const clamped = Math.min(max, Math.max(min, offset));
  return -Math.PI / 2 + (clamped / windowMs) * Math.PI * 2;
}

export function formatCountdown(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const s = Math.max(0, Math.ceil(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function formatClock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
    d.getSeconds()
  ).padStart(2, '0')}`;
}
