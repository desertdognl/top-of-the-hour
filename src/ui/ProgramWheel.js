/**
 * Rolling 60-minute program wheel with pie segments + in-wheel labels.
 * Labels: small when >30m ahead (left); grow toward NOW on the right half.
 * Text stays in the ring band (wrapped), not into the center disc.
 */

import { cueAngleRadians } from '../clock/engine.js';
import { colorForCue } from '../settings/store.js';

export function createProgramWheel(canvas) {
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  let lastCssSize = 0;

  function resize() {
    const parent = canvas.parentElement;
    if (!parent) return false;
    // Fill the panel: largest square that fits. Avoid locking in a tiny
    // first measure (boot/splash) when the 1fr stage row is still settling.
    const raw = Math.min(parent.clientWidth, parent.clientHeight) - 8;
    if (raw < 40) return false;
    const size = Math.max(120, Math.floor(raw));
    if (size === lastCssSize && canvas.width > 0) return false;
    lastCssSize = size;
    dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.width = Math.max(1, Math.floor(size * dpr));
    canvas.height = Math.max(1, Math.floor(size * dpr));
    return true;
  }

  if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
    const ro = new ResizeObserver(() => {
      if (resize()) {
        canvas.dispatchEvent(new CustomEvent('wheel-resized'));
      }
    });
    ro.observe(canvas.parentElement);
  }

  function draw(snap, settings = {}) {
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return;

    const labelScale = Number(settings.wheelLabelScale) || 1;
    const showTicks = settings.showWheelTicks !== false;

    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    // Thicker ring, larger inner disc for center info
    const outer = Math.min(w, h) * 0.48;
    const inner = outer * 0.62;
    const midR = (outer + inner) / 2;
    const band = outer - inner;

    const grad = ctx.createRadialGradient(cx, cy, inner * 0.2, cx, cy, outer * 1.05);
    grad.addColorStop(0, 'rgba(227,6,19,0.08)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.02)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, outer * 1.05, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, midR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = band;
    ctx.stroke();

    const segments = buildSegments(snap);
    const colorIndexBase = snap.timed.findIndex(
      (c) => snap.windowCues[0] && c.id === snap.windowCues[0].id
    );

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const globalIndex = Math.max(0, colorIndexBase) + i;
      const base = colorForCue(seg.cue, globalIndex, settings);
      const isNext = snap.next && seg.cue.id === snap.next.id;
      const isCurrent = snap.current && seg.cue.id === snap.current.id;
      // Fully finished (ended before now) — not the active current block
      const isPast = !isCurrent && seg.endMs <= snap.nowMs;

      // Elapsed wedge behind NOW for the current item (grey)
      if (seg.elapsedStartAngle != null && seg.elapsedEndAngle != null) {
        drawPieSegment(ctx, cx, cy, inner, outer, seg.elapsedStartAngle, seg.elapsedEndAngle, {
          color: base,
          isPast: true,
          isNext: false,
          isCurrent: false,
          dpr,
        });
      }

      drawPieSegment(ctx, cx, cy, inner, outer, seg.startAngle, seg.endAngle, {
        color: base,
        isPast,
        isNext,
        isCurrent,
        dpr,
      });

      // Current item: label at NOW (top). Others: by start time.
      const minutesAhead = isCurrent ? 0 : (seg.cue.effectiveMs - snap.nowMs) / 60000;
      const labelSeg = isCurrent
        ? { ...seg, startAngle: -Math.PI / 2, endAngle: seg.endAngle }
        : seg;

      drawInWheelLabel(ctx, cx, cy, inner, outer, midR, band, labelSeg, {
        isPast,
        isNext,
        isCurrent,
        dpr,
        labelScale,
        minutesAhead,
      });

      if (seg.cue.locked && seg.cue.effectiveMs != null) {
        const markerMs = Math.min(
          snap.windowEnd,
          Math.max(seg.cue.effectiveMs, snap.windowStart)
        );
        const markerAngle = cueAngleRadians(
          markerMs,
          snap.nowMs,
          snap.lookbackMs,
          snap.windowMs
        );
        drawAnchorMarker(ctx, cx, cy, outer, markerAngle, dpr, isCurrent);
      } else if (
        snap.timeshiftActive &&
        !seg.cue.locked &&
        seg.cue.baseMs != null &&
        seg.cue.effectiveMs != null &&
        Math.abs(seg.cue.baseMs - seg.cue.effectiveMs) > 500
      ) {
        // Ghost: where this unlocked cue sat before flex timeshift
        const ghostMs = Math.min(
          snap.windowEnd,
          Math.max(seg.cue.baseMs, snap.windowStart)
        );
        const ghostAngle = cueAngleRadians(
          ghostMs,
          snap.nowMs,
          snap.lookbackMs,
          snap.windowMs
        );
        drawShiftGhost(ctx, cx, cy, outer, ghostAngle, dpr);
      }
    }

    const windowMinutes = Math.max(1, Math.round((snap.windowMs || 60 * 60 * 1000) / 60000));
    if (showTicks) {
      const tickCount = Math.min(120, Math.max(30, windowMinutes));
      // Outer track so ticks read as a scale
      ctx.beginPath();
      ctx.arc(cx, cy, outer, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();

      for (let m = 0; m < tickCount; m++) {
        const a = -Math.PI / 2 + (m / tickCount) * Math.PI * 2;
        // Hierarchy: quarter (15-ish) > every 5 min > every minute
        const isQuarter = m % Math.max(1, Math.round(tickCount / 4)) === 0;
        const isMajor = m % 5 === 0;
        let inward;
        let outward;
        let width;
        let color;
        if (isQuarter) {
          inward = 14 * dpr;
          outward = 7 * dpr;
          width = 2.5 * dpr;
          color = 'rgba(255,255,255,0.72)';
        } else if (isMajor) {
          inward = 11 * dpr;
          outward = 5 * dpr;
          width = 2 * dpr;
          color = 'rgba(255,255,255,0.48)';
        } else {
          inward = 6 * dpr;
          outward = 3 * dpr;
          width = 1.25 * dpr;
          color = 'rgba(255,255,255,0.22)';
        }
        const r0 = outer - inward;
        const r1 = outer + outward;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'butt';
        ctx.stroke();
      }
      if (settings.showWheelMinuteLabels !== false) {
        drawWindowLabels(ctx, cx, cy, outer + 20 * dpr, dpr, snap);
      }
    }

    const nowA = -Math.PI / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(227,6,19,0.65)';
    ctx.shadowBlur = 14 * dpr;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(nowA) * (inner - 8 * dpr), cy + Math.sin(nowA) * (inner - 8 * dpr));
    ctx.lineTo(cx + Math.cos(nowA) * (outer + 6 * dpr), cy + Math.sin(nowA) * (outer + 6 * dpr));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3 * dpr;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    const tipR = outer + 12 * dpr;
    const bx = cx + Math.cos(nowA) * tipR;
    const by = cy + Math.sin(nowA) * tipR;
    ctx.beginPath();
    ctx.moveTo(bx, by - 7 * dpr);
    ctx.lineTo(bx - 6 * dpr, by + 5 * dpr);
    ctx.lineTo(bx + 6 * dpr, by + 5 * dpr);
    ctx.closePath();
    ctx.fillStyle = '#e30613';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, inner - 3 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,10,14,0.78)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();
  }

  return { resize, draw };
}

/** Max arc used for label layout (prevents huge→tiny jump when next cue enters window) */
const LABEL_ARC_CAP_MS = 10 * 60 * 1000;
/** If there is no next timed cue, don't stretch to window end */
const DEFAULT_OPEN_END_MS = 8 * 60 * 1000;
const MIN_SEG_MS = 90 * 1000;

/**
 * Font size by minutes ahead only (not by pie width):
 *  >30m → small; within 30m grows toward NOW; next ~15m stays clearly readable
 */
function labelSizeForMinutes(minutesAhead, labelScale, dpr) {
  const scale = labelScale || 1;
  if (minutesAhead < 0) {
    return Math.round(10 * scale * dpr);
  }
  if (minutesAhead > 30) {
    return Math.round(10 * scale * dpr);
  }
  // 30 → 0 maps to 12 → 17; boost under 15m so near items don't look tiny
  const t = 1 - minutesAhead / 30;
  let px = 12 + t * 5;
  if (minutesAhead <= 15) px = Math.max(px, 15);
  if (minutesAhead <= 10) px = Math.max(px, 16);
  return Math.round(px * scale * dpr);
}

function buildSegments(snap) {
  const cues = [...snap.windowCues].sort((a, b) => a.effectiveMs - b.effectiveMs);
  const segments = [];
  const currentId = snap.current && snap.current.id;

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const nextCue = snap.timed.find((c) => c.effectiveMs > cue.effectiveMs) || null;
    let endMs = nextCue ? nextCue.effectiveMs : cue.effectiveMs + DEFAULT_OPEN_END_MS;
    endMs = Math.max(endMs, cue.effectiveMs + MIN_SEG_MS);

    const isCurrent = cue.id === currentId;

    if (isCurrent) {
      // Active item lives at NOW → next: remaining time sits under the NOW hand
      const remainStart = snap.nowMs;
      const remainEnd = Math.max(endMs, snap.nowMs + MIN_SEG_MS);
      const startAngle = cueAngleRadians(
        remainStart,
        snap.nowMs,
        snap.lookbackMs,
        snap.windowMs
      );
      const endAngle = cueAngleRadians(
        remainEnd,
        snap.nowMs,
        snap.lookbackMs,
        snap.windowMs
      );

      // Optional grey elapsed part (started before NOW), clipped to lookback
      let elapsedStartAngle = null;
      let elapsedEndAngle = null;
      if (cue.effectiveMs < snap.nowMs) {
        const elapsedFrom = Math.max(cue.effectiveMs, snap.windowStart);
        if (elapsedFrom < snap.nowMs) {
          elapsedStartAngle = cueAngleRadians(
            elapsedFrom,
            snap.nowMs,
            snap.lookbackMs,
            snap.windowMs
          );
          elapsedEndAngle = startAngle;
        }
      }

      segments.push({
        cue,
        startAngle,
        endAngle,
        startMs: remainStart,
        endMs: remainEnd,
        elapsedStartAngle,
        elapsedEndAngle,
      });
      continue;
    }

    // Skip fully finished cues that ended before the window (shouldn't be in list)
    if (endMs <= snap.windowStart) continue;

    const drawStart = Math.max(cue.effectiveMs, snap.windowStart);
    const drawEnd = Math.min(endMs, snap.windowEnd);
    if (drawEnd <= drawStart) continue;

    segments.push({
      cue,
      startAngle: cueAngleRadians(drawStart, snap.nowMs, snap.lookbackMs, snap.windowMs),
      endAngle: cueAngleRadians(drawEnd, snap.nowMs, snap.lookbackMs, snap.windowMs),
      startMs: drawStart,
      endMs: drawEnd,
      elapsedStartAngle: null,
      elapsedEndAngle: null,
    });
  }
  return segments;
}

function normalizeDelta(delta) {
  let d = delta;
  while (d < 0) d += Math.PI * 2;
  while (d > Math.PI * 2) d -= Math.PI * 2;
  return d;
}

function drawPieSegment(ctx, cx, cy, inner, outer, startAngle, endAngle, opts) {
  const { color, isPast, isNext, isCurrent, dpr } = opts;
  const span = normalizeDelta(endAngle - startAngle);
  if (span < 0.01) return;

  ctx.beginPath();
  ctx.arc(cx, cy, outer, startAngle, endAngle, false);
  ctx.arc(cx, cy, inner, endAngle, startAngle, true);
  ctx.closePath();

  let fill = color;
  if (isPast) fill = fadeHex(color, 0.28);
  ctx.fillStyle = fill;
  ctx.globalAlpha = isPast ? 0.5 : 0.86;
  if (isNext || isCurrent) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 * dpr;
    ctx.globalAlpha = 1;
  }
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.25 * dpr;
  ctx.stroke();

  if (isNext) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
  }
}

function drawInWheelLabel(ctx, cx, cy, inner, outer, midR, band, seg, opts) {
  const { isPast, isNext, isCurrent, dpr, labelScale, minutesAhead } = opts;
  const fullSpan = normalizeDelta(seg.endAngle - seg.startAngle);
  if (fullSpan < 0.035 && minutesAhead > 15) return;

  // Label sits near the cue start (not mid of a long/shrinking pie) — stable as time moves
  const labelAngle = seg.startAngle + Math.min(fullSpan, (3 / 60) * Math.PI * 2) * 0.5;

  const fontSize = labelSizeForMinutes(minutesAhead, labelScale, dpr);

  // Cap arc used for text width so entering the next cue into the window
  // doesn't suddenly crush a previously huge label
  const capSpan = (LABEL_ARC_CAP_MS / (60 * 60 * 1000)) * Math.PI * 2;
  const layoutSpan = Math.min(fullSpan, capSpan);
  const proximityFloor =
    minutesAhead <= 10 ? 72 * dpr : minutesAhead <= 20 ? 52 * dpr : 28 * dpr;
  const maxWidth = Math.max(
    proximityFloor,
    Math.min(band * 0.9, midR * layoutSpan * 0.7)
  );

  const raw = String(seg.cue.title || seg.cue.screens || 'Cue');
  const maxLines = minutesAhead > 30 ? 1 : minutesAhead <= 15 ? 2 : 2;
  const lines = wrapText(ctx, raw, fontSize, maxWidth, maxLines);

  ctx.save();
  ctx.translate(cx + Math.cos(labelAngle) * midR, cy + Math.sin(labelAngle) * midR);
  let rot = labelAngle;
  const flip = labelAngle > Math.PI / 2 || labelAngle < -Math.PI / 2;
  if (flip) rot = labelAngle + Math.PI;
  ctx.rotate(rot);

  ctx.font = `600 ${fontSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lineH = fontSize * 1.05;
  const blockH = lines.length * lineH;
  let blockW = 0;
  for (const line of lines) {
    blockW = Math.max(blockW, ctx.measureText(line).width);
  }
  // Keep label block inside the ring band (don't run into center)
  const maxBlockW = Math.min(blockW, band * 1.15);
  const padX = 5 * dpr;
  const padY = 3 * dpr;
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  roundRect(
    ctx,
    -maxBlockW / 2 - padX,
    -blockH / 2 - padY,
    maxBlockW + padX * 2,
    blockH + padY * 2,
    4 * dpr
  );
  ctx.fill();

  ctx.fillStyle = isPast
    ? 'rgba(255,255,255,0.4)'
    : isNext || isCurrent
      ? '#ffffff'
      : 'rgba(255,255,255,0.92)';

  // Clip text to band width
  ctx.beginPath();
  ctx.rect(-maxBlockW / 2 - padX, -blockH / 2 - padY, maxBlockW + padX * 2, blockH + padY * 2);
  ctx.clip();

  lines.forEach((line, i) => {
    const y = -blockH / 2 + lineH / 2 + i * lineH;
    ctx.fillText(line, 0, y);
  });
  ctx.restore();
}

function wrapText(ctx, text, fontSize, maxWidth, maxLines) {
  ctx.font = `600 ${fontSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return ['—'];

  const lines = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const trial = `${current} ${words[i]}`;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length >= maxLines) break;
    }
  }
  if (lines.length < maxLines) lines.push(current);

  // Truncate last line if still too wide
  let last = lines[lines.length - 1];
  while (last.length > 1 && ctx.measureText(last).width > maxWidth) {
    last = `${last.slice(0, -2)}…`;
  }
  lines[lines.length - 1] = last;

  // If we broke early, indicate more
  if (lines.length >= maxLines && words.join(' ') !== lines.join(' ')) {
    const l = lines[lines.length - 1];
    if (!l.endsWith('…')) lines[lines.length - 1] = `${l.replace(/\…$/, '')}…`;
  }
  return lines;
}

/** Faint pip: planned position of an unlocked cue while timeshift is active */
function drawShiftGhost(ctx, cx, cy, outer, angle, dpr) {
  const r = outer + 9 * dpr;
  const x = cx + Math.cos(angle) * r;
  const y = cy + Math.sin(angle) * r;
  const size = 3.2 * dpr;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(120, 160, 220, 0.35)';
  ctx.strokeStyle = 'rgba(160, 190, 240, 0.55)';
  ctx.lineWidth = 1 * dpr;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Small lock pip on the outer ring for wall-clock anchors */
function drawAnchorMarker(ctx, cx, cy, outer, angle, dpr, isCurrent) {
  const r = outer + 9 * dpr;
  const x = cx + Math.cos(angle) * r;
  const y = cy + Math.sin(angle) * r;
  const size = (isCurrent ? 5.5 : 4.5) * dpr;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, size + 2 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8,10,14,0.85)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fillStyle = '#f0b429';
  ctx.shadowColor = 'rgba(240,180,41,0.65)';
  ctx.shadowBlur = 8 * dpr;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1 * dpr;
  ctx.stroke();
  ctx.restore();
}

function drawWindowLabels(ctx, cx, cy, r, dpr, snap) {
  const windowMs = snap?.windowMs || 60 * 60 * 1000;
  // Quarters of the full wheel (= windowMs), not of the ahead-only arc.
  // 60‑min window → +15 / +30 / +45 at 3 / 6 / 9 o'clock.
  const q = Math.max(1, Math.round(windowMs / 4 / 60000));
  const labels = [
    { t: 0, text: 'NOW' },
    { t: 0.25, text: `+${q}m` },
    { t: 0.5, text: `+${q * 2}m` },
    { t: 0.75, text: `+${q * 3}m` },
  ];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const lab of labels) {
    const a = -Math.PI / 2 + lab.t * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const isNow = lab.t === 0;
    ctx.font = `${isNow ? 700 : 600} ${(isNow ? 13 : 12) * dpr}px "Barlow Condensed", sans-serif`;
    // Soft halo so labels stay readable on busy segments
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = 'rgba(8,10,14,0.75)';
    ctx.strokeText(lab.text, x, y);
    ctx.fillStyle = isNow ? '#ff3b46' : 'rgba(232,236,242,0.92)';
    ctx.fillText(lab.text, x, y);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fadeHex(hex, amount) {
  const c = parseHex(hex);
  if (!c) return hex;
  const mix = (ch) => Math.round(ch * amount + 20 * (1 - amount));
  return `rgb(${mix(c.r)},${mix(c.g)},${mix(c.b)})`;
}

function parseHex(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
