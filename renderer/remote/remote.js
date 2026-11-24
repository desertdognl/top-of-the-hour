/**
 * Remote read-only client — mirrors desktop stage (seconds + wheel + timeline).
 */

const FALLBACK_SECTION = {
  opening: '#2f6fed',
  'warming-up': '#e8a017',
  warming: '#e8a017',
  aftrap: '#e30613',
  rust: '#9b5de5',
  wedstrijd: '#1fa97a',
  commercials: '#00bbf9',
  default: '#8d99ae',
};

const els = {
  app: document.getElementById('app'),
  phaseLabel: document.getElementById('phase-label'),
  flexChip: document.getElementById('flex-chip'),
  timeshiftLabel: document.getElementById('timeshift-label'),
  listPhase: document.getElementById('list-phase'),
  listHeader: document.getElementById('list-header'),
  centerClock: document.getElementById('center-clock'),
  centerCurrent: document.getElementById('center-current'),
  centerRemaining: document.getElementById('center-remaining'),
  centerNext: document.getElementById('center-next'),
  wheelCenterInfo: document.getElementById('wheel-center-info'),
  currentTitle: document.getElementById('current-title'),
  currentRemainingLabel: document.getElementById('current-remaining-label'),
  currentRemainingTime: document.getElementById('current-remaining-time'),
  currentPlanned: document.getElementById('current-planned'),
  nextTitle: document.getElementById('next-title'),
  nextMetaLabel: document.getElementById('next-meta-label'),
  nextMetaTime: document.getElementById('next-meta-time'),
  secondsDigital: document.getElementById('seconds-digital'),
  cueList: document.getElementById('cue-list'),
  listCount: document.getElementById('list-count'),
  windowBadge: document.getElementById('window-badge'),
  conn: document.getElementById('conn'),
  programWheel: document.getElementById('program-wheel'),
  secondsWheel: document.getElementById('seconds-wheel'),
};

const params = new URLSearchParams(location.search);
const hashView = (location.hash || '').replace(/^#/, '');
let view = params.get('view') || hashView || 'full';
if (!['full', 'focus', 'list'].includes(view)) view = 'full';

let lastState = null;
let lastScrollId = null;
let lastListStructure = '';

function setView(next) {
  view = next;
  els.app.dataset.view = next;
  document.querySelectorAll('.remote-views button').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.view === next);
  });
  const url = new URL(location.href);
  url.searchParams.set('view', next);
  history.replaceState(null, '', url);
  lastScrollId = null;
  requestAnimationFrame(() => {
    resizeProgramWheel();
    drawFromState(lastState);
  });
}

document.querySelectorAll('.remote-views button').forEach((btn) => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});
setView(view);

function formatCountdown(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const s = Math.max(0, Math.ceil(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function colorForSection(section) {
  const key = String(section || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!key) return FALLBACK_SECTION.default;
  for (const [name, color] of Object.entries(FALLBACK_SECTION)) {
    if (name === 'default') continue;
    if (key === name || key.includes(name)) return color;
  }
  return FALLBACK_SECTION.default;
}

function cueAngleRadians(effectiveMs, nowMs, lookbackMs, windowMs) {
  const offset = effectiveMs - nowMs;
  const min = -Number(lookbackMs) || -10 * 60 * 1000;
  const max = Number(windowMs) - (Number(lookbackMs) || 10 * 60 * 1000);
  const clamped = Math.min(max, Math.max(min, offset));
  return -Math.PI / 2 + (clamped / windowMs) * Math.PI * 2;
}

function normalizeDelta(d) {
  let x = d;
  while (x < 0) x += Math.PI * 2;
  while (x > Math.PI * 2) x -= Math.PI * 2;
  return x;
}

function resizeProgramWheel() {
  const canvas = els.programWheel;
  const parent = canvas?.parentElement;
  if (!canvas || !parent) return;
  const raw = Math.min(parent.clientWidth, parent.clientHeight) - 8;
  if (raw < 40) return;
  const size = Math.max(140, Math.floor(raw));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.width = Math.max(1, Math.floor(size * dpr));
  canvas.height = Math.max(1, Math.floor(size * dpr));
}

function resizeSecondsWheel() {
  const canvas = els.secondsWheel;
  if (!canvas) return;
  const theme = lastState?.theme || {};
  const scale = Number(theme.secondsScale) || 1.75;
  const size = Math.round(96 * scale);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(size * dpr);
  canvas.height = Math.floor(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
}

function drawSecondsWheel(secondsToNext, theme = {}) {
  const canvas = els.secondsWheel;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.42;
  const blinkEnabled = theme.secondsBlinkEnabled !== false;
  const blinkWithin = Number(theme.secondsBlinkWithin) || 15;
  const inBlinkZone =
    blinkEnabled && secondsToNext != null && secondsToNext <= blinkWithin && secondsToNext >= 0;
  const pulse = !inBlinkZone || Math.floor(Date.now() / 280) % 2 === 0;
  const inFinalMinute = secondsToNext != null && secondsToNext <= 60;
  const hot = inFinalMinute || inBlinkZone;
  const trackHot = Math.max(8 * dpr, radius * (hot ? 0.17 : 0.13));

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = trackHot;
  ctx.lineCap = 'round';
  ctx.stroke();

  const value = secondsToNext == null ? 0 : secondsToNext > 60 ? 60 : Math.max(0, secondsToNext);
  const remaining = Math.max(0, Math.min(60, value));
  const progress = remaining / 60;
  const start = -Math.PI / 2;
  const end = start + progress * Math.PI * 2;

  if (progress > 0.001) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, end, false);
    ctx.strokeStyle = hot ? '#ff2a36' : 'rgba(242,244,247,0.88)';
    ctx.globalAlpha = inBlinkZone && !pulse ? 0.45 : 1;
    ctx.lineWidth = trackHot;
    ctx.shadowColor = hot ? 'rgba(227,6,19,0.7)' : 'transparent';
    ctx.shadowBlur = hot ? 18 * dpr : 0;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI * 2;
    const inner = radius - trackHot * 0.85;
    const outer = radius + trackHot * 0.55;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = Math.max(1.5, 2 * dpr);
    ctx.stroke();
  }

  const show = secondsToNext == null ? '—' : String(Math.ceil(remaining)).padStart(2, '0');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.floor(radius * 0.62)}px "IBM Plex Mono", monospace`;
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
}

function drawProgramWheel(wheel, theme = {}) {
  const canvas = els.programWheel;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  const labelScale = Number(theme.wheelLabelScale) || 1;
  const showTicks = theme.showWheelTicks !== false;
  const showMinuteLabels = theme.showWheelMinuteLabels !== false;

  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const outer = Math.min(w, h) * 0.46;
  const inner = outer * 0.62;
  const midR = (outer + inner) / 2;
  const band = outer - inner;

  ctx.beginPath();
  ctx.arc(cx, cy, midR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = band;
  ctx.stroke();

  if (!wheel || !wheel.cues?.length) {
    drawNowHand(ctx, cx, cy, inner, outer, dpr);
    fillCenterDisc(ctx, cx, cy, inner, dpr);
    return;
  }

  const nowMs = wheel.nowMs;
  const windowMs = wheel.windowMs || 60 * 60 * 1000;
  const lookbackMs = wheel.lookbackMs || 10 * 60 * 1000;
  const cues = [...wheel.cues].sort((a, b) => a.effectiveMs - b.effectiveMs);
  const timed = wheel.timed || [];
  const endMsById = wheel.endMsById || {};
  const segments = [];

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const nextTimed = timed.find((t) => t.effectiveMs > cue.effectiveMs);
    let endMs = endMsById[cue.id];
    if (endMs == null) {
      endMs = nextTimed ? nextTimed.effectiveMs : cue.effectiveMs + 8 * 60 * 1000;
    }
    endMs = Math.max(endMs, cue.effectiveMs + 90 * 1000);
    const isCurrent = cue.id === wheel.currentId;
    const isNext = cue.id === wheel.nextId;
    const isPast = !isCurrent && endMs <= nowMs;
    const color = cue.color || colorForSection(cue.section);

    let drawStart = cue.effectiveMs;
    let drawEnd = endMs;
    let elapsedStart = null;
    if (isCurrent) {
      drawStart = nowMs;
      drawEnd = Math.max(endMs, nowMs + 90 * 1000);
      if (cue.effectiveMs < nowMs) {
        const elapsedFrom = Math.max(cue.effectiveMs, wheel.windowStart || nowMs - lookbackMs);
        if (elapsedFrom < nowMs) elapsedStart = elapsedFrom;
      }
    }

    if (elapsedStart != null) {
      pie(
        ctx,
        cx,
        cy,
        inner,
        outer,
        cueAngleRadians(elapsedStart, nowMs, lookbackMs, windowMs),
        cueAngleRadians(nowMs, nowMs, lookbackMs, windowMs),
        color,
        true,
        false,
        false,
        dpr
      );
    }

    const startAngle = cueAngleRadians(drawStart, nowMs, lookbackMs, windowMs);
    const endAngle = cueAngleRadians(drawEnd, nowMs, lookbackMs, windowMs);
    pie(ctx, cx, cy, inner, outer, startAngle, endAngle, color, isPast, isNext, isCurrent, dpr);

    segments.push({
      cue,
      startAngle: isCurrent ? -Math.PI / 2 : startAngle,
      endAngle,
      isPast,
      isNext,
      isCurrent,
      minutesAhead: isCurrent ? 0 : (cue.effectiveMs - nowMs) / 60000,
    });

    if (cue.locked) {
      const markerMs = Math.min(
        wheel.windowEnd || nowMs + windowMs,
        Math.max(cue.effectiveMs, wheel.windowStart || nowMs - lookbackMs)
      );
      const a = cueAngleRadians(markerMs, nowMs, lookbackMs, windowMs);
      drawAnchor(ctx, cx, cy, outer, a, dpr, isCurrent);
    }
  }

  for (const seg of segments) {
    drawInWheelLabel(ctx, cx, cy, midR, band, seg, dpr, labelScale);
  }

  if (showTicks) {
    const tickCount = Math.min(120, Math.max(30, Math.round(windowMs / 60000)));
    ctx.beginPath();
    ctx.arc(cx, cy, outer, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();

    for (let m = 0; m < tickCount; m++) {
      const a = -Math.PI / 2 + (m / tickCount) * Math.PI * 2;
      const isQuarter = m % Math.max(1, Math.round(tickCount / 4)) === 0;
      const isMajor = m % 5 === 0;
      let inward;
      let outward;
      let width;
      let color;
      if (isQuarter) {
        inward = 14 * dpr;
        outward = 8 * dpr;
        width = 2.6 * dpr;
        color = 'rgba(255,255,255,0.78)';
      } else if (isMajor) {
        inward = 12 * dpr;
        outward = 6 * dpr;
        width = 2.2 * dpr;
        color = 'rgba(255,255,255,0.55)';
      } else {
        inward = 6 * dpr;
        outward = 3 * dpr;
        width = 1.25 * dpr;
        color = 'rgba(255,255,255,0.22)';
      }
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (outer - inward), cy + Math.sin(a) * (outer - inward));
      ctx.lineTo(cx + Math.cos(a) * (outer + outward), cy + Math.sin(a) * (outer + outward));
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }

    if (showMinuteLabels) {
      drawWindowLabels(ctx, cx, cy, outer + 22 * dpr, dpr, windowMs);
    }
  }

  drawNowHand(ctx, cx, cy, inner, outer, dpr);
  fillCenterDisc(ctx, cx, cy, inner, dpr);
}

function fillCenterDisc(ctx, cx, cy, inner, dpr) {
  ctx.beginPath();
  ctx.arc(cx, cy, inner - 3 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8,10,14,0.78)';
  ctx.fill();
}

function drawNowHand(ctx, cx, cy, inner, outer, dpr) {
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
}

function drawAnchor(ctx, cx, cy, outer, angle, dpr, isCurrent) {
  const r = outer + 9 * dpr;
  const x = cx + Math.cos(angle) * r;
  const y = cy + Math.sin(angle) * r;
  const size = (isCurrent ? 5.5 : 4.5) * dpr;
  ctx.beginPath();
  ctx.arc(x, y, size + 2 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8,10,14,0.85)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fillStyle = '#f0b429';
  ctx.fill();
}

function drawWindowLabels(ctx, cx, cy, r, dpr, windowMs) {
  // Quarters of the full wheel (= windowMs): 60‑min → +15 / +30 / +45.
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
    ctx.font = `${isNow ? 700 : 600} ${(isNow ? 14 : 13) * dpr}px "Barlow Condensed", sans-serif`;
    ctx.lineWidth = 3.5 * dpr;
    ctx.strokeStyle = 'rgba(8,10,14,0.85)';
    ctx.strokeText(lab.text, x, y);
    ctx.fillStyle = isNow ? '#ff3b46' : 'rgba(232,236,242,0.95)';
    ctx.fillText(lab.text, x, y);
  }
}

function labelSizeForMinutes(minutesAhead, labelScale, dpr) {
  const scale = labelScale || 1;
  if (minutesAhead < 0) return Math.round(12 * scale * dpr);
  if (minutesAhead > 30) return Math.round(12 * scale * dpr);
  const t = 1 - minutesAhead / 30;
  let px = 14 + t * 7;
  if (minutesAhead <= 15) px = Math.max(px, 18);
  if (minutesAhead <= 10) px = Math.max(px, 20);
  return Math.round(px * scale * dpr);
}

function wrapText(ctx, text, fontSize, maxWidth, maxLines) {
  ctx.font = `600 ${fontSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return ['—'];
  const lines = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const trial = `${current} ${words[i]}`;
    if (ctx.measureText(trial).width <= maxWidth) current = trial;
    else {
      lines.push(current);
      current = words[i];
      if (lines.length >= maxLines) break;
    }
  }
  if (lines.length < maxLines) lines.push(current);
  let last = lines[lines.length - 1];
  while (last.length > 1 && ctx.measureText(last).width > maxWidth) {
    last = `${last.slice(0, -2)}…`;
  }
  lines[lines.length - 1] = last;
  return lines;
}

function drawInWheelLabel(ctx, cx, cy, midR, band, seg, dpr, labelScale) {
  const fullSpan = normalizeDelta(seg.endAngle - seg.startAngle);
  if (fullSpan < 0.035 && seg.minutesAhead > 15) return;

  const labelAngle = seg.startAngle + Math.min(fullSpan, (3 / 60) * Math.PI * 2) * 0.5;
  const fontSize = labelSizeForMinutes(seg.minutesAhead, labelScale, dpr);
  const capSpan = (10 * 60 * 1000 / (60 * 60 * 1000)) * Math.PI * 2;
  const layoutSpan = Math.min(fullSpan, capSpan);
  const proximityFloor =
    seg.minutesAhead <= 10 ? 72 * dpr : seg.minutesAhead <= 20 ? 52 * dpr : 28 * dpr;
  const maxWidth = Math.max(proximityFloor, Math.min(band * 0.9, midR * layoutSpan * 0.7));
  const maxLines = seg.minutesAhead > 30 ? 1 : 2;
  const lines = wrapText(ctx, seg.cue.title || 'Cue', fontSize, maxWidth, maxLines);

  ctx.save();
  ctx.translate(cx + Math.cos(labelAngle) * midR, cy + Math.sin(labelAngle) * midR);
  let rot = labelAngle;
  if (labelAngle > Math.PI / 2 || labelAngle < -Math.PI / 2) rot = labelAngle + Math.PI;
  ctx.rotate(rot);
  ctx.font = `600 ${fontSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lineH = fontSize * 1.05;
  const blockH = lines.length * lineH;
  let blockW = 0;
  for (const line of lines) blockW = Math.max(blockW, ctx.measureText(line).width);
  const maxBlockW = Math.min(blockW, band * 1.15);
  const padX = 5 * dpr;
  const padY = 3 * dpr;
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  roundRect(ctx, -maxBlockW / 2 - padX, -blockH / 2 - padY, maxBlockW + padX * 2, blockH + padY * 2, 4 * dpr);
  ctx.fill();

  ctx.fillStyle = seg.isPast
    ? 'rgba(255,255,255,0.4)'
    : seg.isNext || seg.isCurrent
      ? '#ffffff'
      : 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.rect(-maxBlockW / 2 - padX, -blockH / 2 - padY, maxBlockW + padX * 2, blockH + padY * 2);
  ctx.clip();
  lines.forEach((line, i) => {
    ctx.fillText(line, 0, -blockH / 2 + lineH / 2 + i * lineH);
  });
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function pie(ctx, cx, cy, inner, outer, a0, a1, color, isPast, isNext, isCurrent, dpr) {
  let start = a0;
  let end = a1;
  let delta = normalizeDelta(end - start);
  if (delta < 0.01) return;
  end = start + delta;

  ctx.beginPath();
  ctx.arc(cx, cy, outer, start, end);
  ctx.arc(cx, cy, inner, end, start, true);
  ctx.closePath();

  let fill = color;
  if (isPast) fill = shade(color, 0.35);
  else if (isCurrent) fill = shade(color, 1.05);
  else if (isNext) fill = shade(color, 0.9);
  ctx.fillStyle = fill;
  ctx.globalAlpha = isPast ? 0.45 : 0.88;
  ctx.fill();
  ctx.globalAlpha = 1;
  if (isNext) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();
  }
}

function shade(hex, factor) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const ch = (i) => Math.max(0, Math.min(255, Math.round(parseInt(m[i], 16) * factor)));
  return `rgb(${ch(1)},${ch(2)},${ch(3)})`;
}

function contentOffsetTop(root, el) {
  const er = el.getBoundingClientRect();
  const rr = root.getBoundingClientRect();
  return er.top - rr.top + root.scrollTop;
}

function ensurePrevAndCurrentVisible(root, currentNode, { smooth = true } = {}) {
  if (!root || !currentNode) return;
  const prev =
    currentNode.previousElementSibling && root.contains(currentNode.previousElementSibling)
      ? currentNode.previousElementSibling
      : null;
  const pad = 4;
  const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight);
  const topNode = prev || currentNode;
  const topY = contentOffsetTop(root, topNode) - pad;
  const curBottom = contentOffsetTop(root, currentNode) + currentNode.offsetHeight + pad;
  const span = curBottom - topY;
  let nextTop = span <= root.clientHeight ? topY : curBottom - root.clientHeight;
  nextTop = Math.max(0, Math.min(nextTop, maxScroll));
  if (Math.abs(root.scrollTop - nextTop) < 2) return;
  root.scrollTo({ top: nextTop, behavior: smooth ? 'smooth' : 'auto' });
}

function applyState(state) {
  if (!state || typeof state !== 'object') return;
  lastState = state;
  drawFromState(state);
}

function drawFromState(state) {
  if (!state) return;
  const theme = state.theme || {};

  els.phaseLabel.textContent = state.phaseLabel || state.phase || '—';
  els.listPhase.textContent = state.phaseLabel || state.phase || '—';
  if (els.listHeader) els.listHeader.dataset.phase = state.phase || 'pre';

  if (state.timeshiftLabel) {
    els.flexChip.hidden = false;
    els.timeshiftLabel.textContent = state.timeshiftLabel;
  } else if (state.mode === 'flex') {
    els.flexChip.hidden = false;
    els.timeshiftLabel.textContent = 'op schema';
  } else {
    els.flexChip.hidden = true;
  }

  els.centerClock.textContent = state.nowClock || '—';
  els.centerCurrent.textContent = state.centerCurrent || state.currentTitle || '—';
  els.centerRemaining.textContent = state.centerRemaining || '';
  if (els.centerNext) {
    const enabled = theme.wheelNextTitleEnabled !== false;
    const nextText = enabled ? String(state.nextTitle || '').trim() : '';
    els.centerNext.textContent = nextText;
    els.centerNext.hidden = !nextText;
  }

  els.currentTitle.textContent = state.currentTitle || '—';
  els.currentRemainingLabel.textContent = state.currentRemainingLabel || 'Nog';
  els.currentRemainingTime.textContent = state.currentRemainingTime || state.currentMeta || '—';
  els.currentPlanned.textContent = state.currentPlanned || '';

  els.nextTitle.textContent = state.nextTitle || '—';
  els.nextMetaLabel.textContent = state.nextMetaLabel || '';
  els.nextMetaTime.textContent = state.nextMetaTime || '';

  const secs = state.secondsToNext;
  els.secondsDigital.textContent = secs == null ? '—' : formatCountdown(secs);
  els.secondsDigital.classList.toggle('hot', secs != null && secs <= 60);

  const wm = state.windowMinutes || 60;
  if (els.windowBadge) {
    els.windowBadge.textContent = `${wm} min`;
    els.windowBadge.hidden = wm === 60;
  }

  const cues = Array.isArray(state.cues) ? state.cues : [];
  els.listCount.textContent = String(cues.length);
  const structure = cues
    .map((c) => `${c.id}|${c.title}|${c.clock}|${c.kind}|${c.section || ''}|${c.locked ? 1 : 0}`)
    .join('\n');
  const rebuilt = structure !== lastListStructure;
  if (rebuilt) {
    const frag = document.createDocumentFragment();
    for (const cue of cues) {
      const el = document.createElement('div');
      el.className = 'cue-item';
      el.dataset.id = cue.id || '';
      el.innerHTML = `
      <div class="row">
        <span class="cue-lock" aria-hidden="true">${cue.locked ? lockSvg() : ''}</span>
        <span class="time${cue.shifted ? ' is-shifted' : ''}">${escapeHtml(cue.clock || '—')}</span>
        <span class="title">${escapeHtml(cue.title || '—')}</span>
        <span class="kind">${escapeHtml(cue.kind || '')}</span>
      </div>
      ${cue.section ? `<div class="section">${escapeHtml(cue.section)}</div>` : ''}
    `;
      frag.appendChild(el);
    }
    els.cueList.replaceChildren(frag);
    lastListStructure = structure;
    lastScrollId = null;
  }

  for (const el of els.cueList.querySelectorAll('.cue-item')) {
    const id = el.dataset.id;
    el.classList.toggle('is-locked', Boolean(cues.find((c) => c.id === id)?.locked));
    el.classList.toggle('current', Boolean(id && id === state.currentId));
    el.classList.toggle('next', Boolean(id && id === state.nextId && id !== state.currentId));
    el.classList.toggle(
      'past',
      Boolean(cues.find((c) => c.id === id)?.past) && id !== state.currentId && id !== state.nextId
    );
  }

  applyThemeScales(theme);

  const focusId = state.currentId || state.nextId;
  if (focusId) {
    const node = els.cueList.querySelector(`[data-id="${CSS.escape(focusId)}"]`);
    if (node) {
      const force = rebuilt || focusId !== lastScrollId;
      requestAnimationFrame(() => {
        ensurePrevAndCurrentVisible(els.cueList, node, { smooth: force && !rebuilt });
      });
      lastScrollId = focusId;
    }
  }

  drawSecondsWheel(secs, theme);
  drawProgramWheel(state.wheel, theme);
}

function applyThemeScales(theme = {}) {
  const root = document.querySelector('.remote-app') || document.documentElement;
  const secondsScale = Number(theme.secondsScale) || 1.75;
  const timelineTitleScale = Number(theme.timelineTitleScale) || 1.2;
  const nextScale = Number(theme.wheelNextTitleScale) || 1;
  const nextColor = theme.wheelNextTitleColor || '#f0b429';
  const remainingScale = Number(theme.wheelRemainingScale) || 1;
  const remainingPos = theme.wheelRemainingPosition === 'top' ? 'top' : 'bottom';
  root.style.setProperty('--seconds-scale', String(secondsScale));
  root.style.setProperty('--timeline-title-scale', String(timelineTitleScale));
  if (els.wheelCenterInfo) {
    els.wheelCenterInfo.style.setProperty('--wheel-next-scale', String(nextScale));
    els.wheelCenterInfo.style.setProperty('--wheel-next-color', nextColor);
    els.wheelCenterInfo.style.setProperty('--wheel-remaining-scale', String(remainingScale));
    els.wheelCenterInfo.dataset.remainingPos = remainingPos;
  }
  const size = Math.round(96 * secondsScale);
  if (els.secondsWheel) {
    const dpr = window.devicePixelRatio || 1;
    els.secondsWheel.style.width = `${size}px`;
    els.secondsWheel.style.height = `${size}px`;
    els.secondsWheel.width = Math.floor(size * dpr);
    els.secondsWheel.height = Math.floor(size * dpr);
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lockSvg() {
  return `<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-7-2a2 2 0 1 1 4 0v2h-4V7zm3 8.7V18h-2v-2.3a1.5 1.5 0 1 1 2 0z"/></svg>`;
}

function setConn(text, cls) {
  els.conn.textContent = text;
  els.conn.classList.remove('is-live', 'is-err');
  if (cls) els.conn.classList.add(cls);
}

function connectSse() {
  const es = new EventSource('/events');
  es.onopen = () => setConn('live', 'is-live');
  es.onmessage = (ev) => {
    try {
      applyState(JSON.parse(ev.data));
      setConn('live', 'is-live');
    } catch {
      // ignore
    }
  };
  es.onerror = () => {
    setConn('herverbindt…', 'is-err');
    es.close();
    setTimeout(connectSse, 1500);
  };
}

async function bootstrap() {
  resizeSecondsWheel();
  resizeProgramWheel();
  window.addEventListener('resize', () => {
    resizeProgramWheel();
    drawFromState(lastState);
  });
  if (typeof ResizeObserver !== 'undefined' && els.programWheel?.parentElement) {
    new ResizeObserver(() => {
      resizeProgramWheel();
      drawFromState(lastState);
    }).observe(els.programWheel.parentElement);
  }
  // Keep seconds blink alive between SSE ticks
  setInterval(() => {
    if (lastState) drawSecondsWheel(lastState.secondsToNext, lastState.theme || {});
  }, 250);

  try {
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (res.ok) applyState(await res.json());
  } catch {
    setConn('offline', 'is-err');
  }
  connectSse();
}

bootstrap();
