/**
 * Kickoff + offset time sync.
 * effectiveNow = Date.now() + offsetMs
 * Cues can be shifted so kickoff aligns with overrideKickoffMs.
 */

export function createSyncState(meta = {}) {
  return {
    offsetMs: 0,
    /** If set, all cue.atMs are shifted so meta.kickoffMs maps to this */
    overrideKickoffMs: null,
    baseKickoffMs: meta.kickoffMs || null,
    /**
     * Flex rundown timeshift (unlocked cues only).
     * Locked anchors stay on wall-clock (+ kickoff align).
     */
    timeshiftMs: 0,
  };
}

export function setOffsetMinutes(state, minutes) {
  state.offsetMs = Number(minutes) * 60 * 1000;
  return state;
}

export function setOffsetMs(state, ms) {
  state.offsetMs = Number(ms) || 0;
  return state;
}

export function addOffsetMs(state, deltaMs) {
  state.offsetMs = (state.offsetMs || 0) + (Number(deltaMs) || 0);
  return state;
}

/** Human-readable offset, e.g. "+7u 12m" or "−3m" */
export function formatOffsetLabel(offsetMs) {
  const ms = Math.round(Number(offsetMs) || 0);
  if (!ms) return '0';
  const sign = ms > 0 ? '+' : '−';
  let sec = Math.abs(Math.round(ms / 1000));
  const h = Math.floor(sec / 3600);
  sec %= 3600;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (h > 0) return `${sign}${h}u ${m}m`;
  if (m > 0 && s === 0) return `${sign}${m}m`;
  if (m > 0) return `${sign}${m}m ${s}s`;
  return `${sign}${s}s`;
}

export function setKickoffOverride(state, hhmm) {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) {
    state.overrideKickoffMs = null;
    return state;
  }
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  state.overrideKickoffMs = d.getTime();
  return state;
}

export function cueShiftMs(state) {
  if (state.overrideKickoffMs != null && state.baseKickoffMs != null) {
    return state.overrideKickoffMs - state.baseKickoffMs;
  }
  return 0;
}

export function effectiveNowMs(state, wallMs = Date.now()) {
  return wallMs + (state.offsetMs || 0);
}

export function effectiveCueMs(cue, state) {
  if (cue.atMs == null) return null;
  let ms = cue.atMs + cueShiftMs(state);
  // Locked anchors ignore flex timeshift — always wall-clock (kickoff-aligned)
  if (!cue.locked && state.timeshiftMs) {
    ms += Number(state.timeshiftMs) || 0;
  }
  return ms;
}

export function setTimeshiftMs(state, ms) {
  state.timeshiftMs = Number(ms) || 0;
  return state;
}

export function addTimeshiftMs(state, deltaMs) {
  state.timeshiftMs = (Number(state.timeshiftMs) || 0) + (Number(deltaMs) || 0);
  return state;
}

export function resetTimeshift(state) {
  state.timeshiftMs = 0;
  return state;
}

/**
 * Human label for flex timeshift.
 * +ms = cues later = uitloop (achter); −ms = cues earlier = inloop (voor).
 */
export function formatTimeshiftLabel(timeshiftMs) {
  const ms = Math.round(Number(timeshiftMs) || 0);
  if (!ms) return 'op schema';
  const abs = formatOffsetLabel(Math.abs(ms)).replace(/^[+−]/, '');
  if (ms > 0) return `uitloop +${abs}`;
  return `inloop −${abs}`;
}

/**
 * Ms-delta to shift unlocked cues by ±N items (gaps between unlocked timed cues).
 * +N = uitloop (later), −N = inloop. Locked anchors ignored for gap picking.
 */
export function timeshiftDeltaForItems(cues, syncState, nowMs, itemDelta) {
  const n = Math.round(Number(itemDelta) || 0);
  if (!n) return 0;
  const baseSync = { ...syncState, timeshiftMs: 0 };
  const unlocked = (cues || [])
    .filter((c) => c.atMs != null && !c.locked)
    .map((c) => ({ ms: effectiveCueMs(c, baseSync) }))
    .filter((c) => c.ms != null)
    .sort((a, b) => a.ms - b.ms);
  if (unlocked.length < 2) return 0;

  const flexNow = Number(nowMs) || 0;
  const withFlex = (cues || [])
    .filter((c) => c.atMs != null && !c.locked)
    .map((c) => ({ ms: effectiveCueMs(c, syncState) }))
    .filter((c) => c.ms != null)
    .sort((a, b) => a.ms - b.ms);

  let i = 0;
  for (let k = 0; k < withFlex.length; k++) {
    if (withFlex[k].ms <= flexNow) i = k;
  }
  const from = Math.max(0, Math.min(unlocked.length - 1, i));
  const to = Math.max(0, Math.min(unlocked.length - 1, from + n));
  if (from === to) return 0;
  return unlocked[to].ms - unlocked[from].ms;
}
