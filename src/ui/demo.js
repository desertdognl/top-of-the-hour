/**
 * Test / demo scrubber — jump into a future rundown and watch the wheel run
 * at accelerated speed without waiting for wall-clock.
 */

import {
  setOffsetMs,
  addOffsetMs,
  formatOffsetLabel,
  effectiveCueMs,
  effectiveNowMs,
} from '../clock/sync.js';

/**
 * Set effective now to `leadSeconds` before the first timed cue
 * (respects kickoff override + flex timeshift via effectiveCueMs).
 */
export function jumpToRundown(cues, syncState, leadSeconds = 90) {
  const timed = (cues || [])
    .filter((c) => c.atMs != null)
    .map((c) => ({ cue: c, ms: effectiveCueMs(c, syncState) }))
    .filter((c) => c.ms != null)
    .sort((a, b) => a.ms - b.ms);
  if (!timed.length) return false;
  const targetMs = timed[0].ms - leadSeconds * 1000;
  setOffsetMs(syncState, targetMs - Date.now());
  return true;
}

/**
 * Jump so the next locked anchor (after effective now) becomes current.
 * If none ahead, jump to the first locked cue. Returns false if no anchors.
 */
export function jumpToNextAnchor(cues, syncState, leadSeconds = 2) {
  const now = effectiveNowMs(syncState);
  const locked = (cues || [])
    .filter((c) => c.locked && c.atMs != null)
    .map((c) => ({ cue: c, ms: effectiveCueMs(c, syncState) }))
    .filter((c) => c.ms != null)
    .sort((a, b) => a.ms - b.ms);
  if (!locked.length) return false;
  const ahead = locked.find((c) => c.ms > now + 500);
  const target = ahead || locked[0];
  setOffsetMs(syncState, target.ms - leadSeconds * 1000 - Date.now());
  return true;
}

/**
 * Nudge offset by whole minutes (skip forward/back in simulated time).
 */
export function skipMinutes(syncState, minutes) {
  addOffsetMs(syncState, minutes * 60 * 1000);
}

export function resetOffset(syncState) {
  setOffsetMs(syncState, 0);
}

/**
 * Demo playback controller. Call tick(now) from the render loop.
 * speed = simulated seconds per real second (0 = paused).
 */
export function createDemoPlayer(getSyncState, onChange) {
  let speed = 0;
  let lastWall = 0;

  function setSpeed(next) {
    speed = Number(next) || 0;
    lastWall = performance.now();
    onChange?.();
  }

  function getSpeed() {
    return speed;
  }

  function tick() {
    if (!speed) {
      lastWall = performance.now();
      return;
    }
    const now = performance.now();
    const dt = (now - lastWall) / 1000; // real seconds
    lastWall = now;
    if (dt <= 0 || dt > 2) return;
    addOffsetMs(getSyncState(), dt * speed * 1000);
    onChange?.();
  }

  return { setSpeed, getSpeed, tick, formatOffsetLabel };
}

export function bindDemoBar({
  onJumpRundown,
  onJumpAnchor,
  onSkip,
  onReset,
  onSpeed,
}) {
  document.getElementById('btn-jump-rundown')?.addEventListener('click', onJumpRundown);
  document.getElementById('btn-jump-anchor')?.addEventListener('click', onJumpAnchor);
  document.getElementById('btn-demo-reset')?.addEventListener('click', onReset);

  document.querySelectorAll('[data-skip]').forEach((btn) => {
    btn.addEventListener('click', () => onSkip(Number(btn.dataset.skip)));
  });

  document.querySelectorAll('[data-demo-speed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const speed = Number(btn.dataset.demoSpeed);
      onSpeed(speed);
      document.querySelectorAll('[data-demo-speed]').forEach((b) => {
        b.classList.toggle('is-active', Number(b.dataset.demoSpeed) === speed);
      });
    });
  });
}
