/**
 * Cue-change alerts: selectable, clearly audible sounds + screen flash.
 */

let audioCtx = null;
let lastAlertKey = null;

/** Presets — louder / more distinct than the old soft chime (regie floor). */
export const CUE_SOUND_PRESETS = [
  { id: 'ping', label: 'Ping (helder)' },
  { id: 'double', label: 'Dubbele beep' },
  { id: 'pulse', label: 'Pulse (aandacht)' },
  { id: 'horn', label: 'Horn (luid)' },
  { id: 'chime', label: 'Chime (zacht)' },
];

function getCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

function tone(ctx, {
  freq,
  type = 'square',
  start = 0,
  dur = 0.18,
  peak = 0.22,
  attack = 0.01,
}) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(4200, freq * 4);
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Play selected preset (also used for settings preview). */
export function playCueSound(soundId = 'ping') {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const id = String(soundId || 'ping');

  if (id === 'chime') {
    tone(ctx, { freq: 523.25, type: 'sine', start: 0, dur: 0.32, peak: 0.12 });
    tone(ctx, { freq: 659.25, type: 'sine', start: 0.07, dur: 0.34, peak: 0.1 });
    return;
  }
  if (id === 'double') {
    tone(ctx, { freq: 880, type: 'square', start: 0, dur: 0.12, peak: 0.28 });
    tone(ctx, { freq: 880, type: 'square', start: 0.16, dur: 0.14, peak: 0.26 });
    return;
  }
  if (id === 'pulse') {
    tone(ctx, { freq: 392, type: 'sawtooth', start: 0, dur: 0.1, peak: 0.24 });
    tone(ctx, { freq: 523.25, type: 'sawtooth', start: 0.11, dur: 0.12, peak: 0.26 });
    tone(ctx, { freq: 659.25, type: 'square', start: 0.24, dur: 0.18, peak: 0.3 });
    return;
  }
  if (id === 'horn') {
    tone(ctx, { freq: 220, type: 'sawtooth', start: 0, dur: 0.45, peak: 0.34 });
    tone(ctx, { freq: 277.18, type: 'square', start: 0.02, dur: 0.42, peak: 0.22 });
    tone(ctx, { freq: 440, type: 'square', start: 0.05, dur: 0.35, peak: 0.18 });
    return;
  }
  // ping (default) — sharp attention beep
  tone(ctx, { freq: 1046.5, type: 'square', start: 0, dur: 0.14, peak: 0.3 });
  tone(ctx, { freq: 1318.5, type: 'square', start: 0.05, dur: 0.2, peak: 0.22 });
}

/** @deprecated use playCueSound */
export function playCueChime() {
  playCueSound('chime');
}

export function flashCueAlert() {
  const el = document.getElementById('cue-flash');
  if (!el) return;
  el.classList.remove('is-on');
  void el.offsetWidth;
  el.classList.add('is-on');
  clearTimeout(flashCueAlert._t);
  flashCueAlert._t = setTimeout(() => el.classList.remove('is-on'), 520);
}

/**
 * Call each tick with current/next ids. Fires once per change.
 */
export function maybeAlertCueChange(snap, settings) {
  if (!settings?.cueAlertEnabled) {
    lastAlertKey = null;
    return;
  }
  const key = `${snap?.current?.id || ''}|${snap?.next?.id || ''}`;
  if (!key || key === '|' || key === lastAlertKey) {
    if (lastAlertKey == null) lastAlertKey = key;
    return;
  }
  const isFirst = lastAlertKey == null;
  lastAlertKey = key;
  if (isFirst) return; // don't chirp on first paint / file load
  if (settings.cueAlertSound) playCueSound(settings.cueAlertSoundId || 'ping');
  if (settings.cueAlertFlash) flashCueAlert();
}

export function resetCueAlert() {
  lastAlertKey = null;
}
