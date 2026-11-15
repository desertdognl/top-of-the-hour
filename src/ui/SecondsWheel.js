/**
 * Seconds countdown wheel — top-left (compact).
 * Last minute fills red; optional blink in final N seconds (settings).
 */

export function createSecondsWheel(canvas) {
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  let lastW = 0;
  let lastH = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));
    if (cssW < 8 || cssH < 8) return false;
    dpr = window.devicePixelRatio || 1;
    const bufW = Math.max(1, Math.floor(cssW * dpr));
    const bufH = Math.max(1, Math.floor(cssH * dpr));
    if (cssW === lastW && cssH === lastH && canvas.width === bufW && canvas.height === bufH) {
      return false;
    }
    lastW = cssW;
    lastH = cssH;
    canvas.width = bufW;
    canvas.height = bufH;
    return true;
  }

  if (typeof ResizeObserver !== 'undefined') {
    const target = canvas.parentElement || canvas;
    const ro = new ResizeObserver(() => {
      if (resize()) {
        canvas.dispatchEvent(new CustomEvent('wheel-resized'));
      }
    });
    ro.observe(target);
  }

  /**
   * @param {{ secondsWheelValue: number, inFinalMinute: boolean, secondsToNext: number|null }} snap
   * @param {{ secondsBlinkEnabled?: boolean, secondsBlinkWithin?: number }} [settings]
   */
  function draw(snap, settings = {}) {
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.42;
    const track = Math.max(7 * dpr, radius * 0.12);

    const blinkEnabled = settings.secondsBlinkEnabled !== false;
    const blinkWithin = Number(settings.secondsBlinkWithin) || 15;
    const secs = snap.secondsToNext;
    const inBlinkZone =
      blinkEnabled &&
      secs != null &&
      secs <= blinkWithin &&
      secs >= 0;
    // ~2 Hz blink (on/off every 250ms)
    const blinkOn = !inBlinkZone || Math.floor(Date.now() / 250) % 2 === 0;

    // Track
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = track;
    ctx.lineCap = 'round';
    ctx.stroke();

    const value = snap.secondsWheelValue == null ? 60 : snap.secondsWheelValue;
    const remaining = Math.max(0, Math.min(60, value));
    const progress = remaining / 60;
    const start = -Math.PI / 2;
    const end = start + progress * Math.PI * 2;

    const hot = snap.inFinalMinute || inBlinkZone;
    const color = hot ? '#e30613' : 'rgba(242,244,247,0.75)';

    if (progress > 0.001 && blinkOn) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, start, end, false);
      ctx.strokeStyle = color;
      ctx.lineWidth = track;
      ctx.shadowColor = hot ? 'rgba(227,6,19,0.55)' : 'transparent';
      ctx.shadowBlur = hot ? 14 * dpr : 0;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Tick marks every 5s
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + (i / 12) * Math.PI * 2;
      const inner = radius - track * 0.85;
      const outer = radius + track * 0.55;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
    }

    const show =
      snap.secondsToNext == null
        ? '—'
        : String(Math.ceil(remaining)).padStart(2, '0');

    if (blinkOn) {
      ctx.fillStyle = hot ? '#e30613' : '#f2f4f7';
      ctx.font = `600 ${Math.floor(radius * 0.55)}px "IBM Plex Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(show, cx, cy + 2 * dpr);
    }

    ctx.fillStyle = inBlinkZone && !blinkOn ? 'rgba(227,6,19,0.35)' : 'rgba(154,163,178,0.9)';
    ctx.font = `500 ${Math.floor(radius * 0.16)}px "Barlow Condensed", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SEC', cx, cy + radius * 0.42);

    return { blinking: inBlinkZone && blinkOn, inBlinkZone };
  }

  return { resize, draw };
}
