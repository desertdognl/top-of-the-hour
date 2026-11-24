/**
 * Seconds countdown wheel — top-left.
 * Last minute fills red; optional soft blink in final N seconds.
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

    const blinkEnabled = settings.secondsBlinkEnabled !== false;
    const blinkWithin = Number(settings.secondsBlinkWithin) || 15;
    const secs = snap.secondsToNext;
    const inBlinkZone =
      blinkEnabled && secs != null && secs <= blinkWithin && secs >= 0;
    const pulse = !inBlinkZone || Math.floor(Date.now() / 280) % 2 === 0;
    const hot = Boolean(snap.inFinalMinute) || inBlinkZone;
    const track = Math.max(8 * dpr, radius * (hot ? 0.17 : 0.13));

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = track;
    ctx.lineCap = 'round';
    ctx.stroke();

    const value = snap.secondsWheelValue == null ? 60 : snap.secondsWheelValue;
    const remaining = Math.max(0, Math.min(60, value));
    const progress = remaining / 60;
    const start = -Math.PI / 2;
    const end = start + progress * Math.PI * 2;
    const color = hot ? '#ff2a36' : 'rgba(242,244,247,0.88)';

    if (progress > 0.001) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, start, end, false);
      ctx.strokeStyle = color;
      ctx.globalAlpha = inBlinkZone && !pulse ? 0.45 : 1;
      ctx.lineWidth = track;
      ctx.shadowColor = hot ? 'rgba(227,6,19,0.7)' : 'transparent';
      ctx.shadowBlur = hot ? 18 * dpr : 0;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + (i / 12) * Math.PI * 2;
      const inner = radius - track * 0.85;
      const outer = radius + track * 0.55;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = Math.max(1.5, 2 * dpr);
      ctx.stroke();
    }

    const show =
      snap.secondsToNext == null
        ? '—'
        : String(Math.ceil(remaining)).padStart(2, '0');

    const digitSize = Math.floor(radius * 0.62);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${digitSize}px "IBM Plex Mono", monospace`;
    ctx.globalAlpha = inBlinkZone && !pulse ? 0.5 : 1;
    ctx.lineWidth = Math.max(3, 4 * dpr);
    ctx.strokeStyle = 'rgba(8,10,14,0.85)';
    ctx.strokeText(show, cx, cy);
    ctx.fillStyle = hot ? '#ff2a36' : '#ffffff';
    ctx.fillText(show, cx, cy);
    ctx.globalAlpha = 1;

    ctx.fillStyle = hot ? 'rgba(255,80,90,0.85)' : 'rgba(180,188,200,0.95)';
    ctx.font = `600 ${Math.floor(radius * 0.15)}px "Barlow Condensed", sans-serif`;
    ctx.fillText('SEC', cx, cy + radius * 0.42);

    return { blinking: inBlinkZone && pulse, inBlinkZone };
  }

  return { resize, draw };
}
