/**
 * Remote read-only client — mirrors desktop stage (seconds + wheel + timeline).
 * Live state via SSE (/events) with /api/state fallback.
 */

const SECTION_COLORS = {
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
  matchTitle: document.getElementById('match-title'),
  matchSub: document.getElementById('match-sub'),
  phaseLabel: document.getElementById('phase-label'),
  listPhase: document.getElementById('list-phase'),
  listHeader: document.getElementById('list-header'),
  timeshiftBar: document.getElementById('timeshift-bar'),
  timeshiftLabel: document.getElementById('timeshift-label'),
  centerClock: document.getElementById('center-clock'),
  centerCurrent: document.getElementById('center-current'),
  centerRemaining: document.getElementById('center-remaining'),
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
  mode: document.getElementById('mode'),
  statusNow: document.getElementById('status-now'),
  programWheel: document.getElementById('program-wheel'),
  secondsWheel: document.getElementById('seconds-wheel'),
};

const params = new URLSearchParams(location.search);
const hashView = (location.hash || '').replace(/^#/, '');
let view = params.get('view') || hashView || 'full';
if (!['full', 'focus', 'list'].includes(view)) view = 'full';

let lastState = null;

function setView(next) {
  view = next;
  els.app.dataset.view = next;
  document.querySelectorAll('.remote-views button').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.view === next);
  });
  const url = new URL(location.href);
  url.searchParams.set('view', next);
  history.replaceState(null, '', url);
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
  if (!key) return SECTION_COLORS.default;
  for (const [name, color] of Object.entries(SECTION_COLORS)) {
    if (name === 'default') continue;
    if (key === name || key.includes(name)) return color;
  }
  return SECTION_COLORS.default;
}

function cueAngleRadians(effectiveMs, nowMs, lookbackMs, windowMs) {
  const offset = effectiveMs - nowMs;
  const min = -Number(lookbackMs) || -10 * 60 * 1000;
  const max = Number(windowMs) - (Number(lookbackMs) || 10 * 60 * 1000);
  const clamped = Math.min(max, Math.max(min, offset));
  return -Math.PI / 2 + (clamped / windowMs) * Math.PI * 2;
}

function resizeProgramWheel() {
  const canvas = els.programWheel;
  const parent = canvas?.parentElement;
  if (!canvas || !parent) return;
  const raw = Math.min(parent.clientWidth, parent.clientHeight) - 8;
  if (raw < 40) return;
  const size = Math.max(120, Math.floor(raw));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.width = Math.max(1, Math.floor(size * dpr));
  canvas.height = Math.max(1, Math.floor(size * dpr));
}

function resizeSecondsWheel() {
  const canvas = els.secondsWheel;
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(96 * dpr);
  canvas.height = Math.floor(96 * dpr);
  canvas.style.width = '96px';
  canvas.style.height = '96px';
}

function drawSecondsWheel(secondsToNext, inFinalMinute) {
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
  const track = Math.max(7 * dpr, radius * 0.12);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = track;
  ctx.lineCap = 'round';
  ctx.stroke();

  const value = secondsToNext == null ? 0 : secondsToNext > 60 ? 60 : Math.max(0, secondsToNext);
  const progress = value / 60;
  const start = -Math.PI / 2;
  const end = start + progress * Math.PI * 2;
  const hot = inFinalMinute || (secondsToNext != null && secondsToNext <= 15);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, end);
  ctx.strokeStyle = hot ? '#e30613' : '#f2f4f7';
  ctx.lineWidth = track;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawProgramWheel(wheel) {
  const canvas = els.programWheel;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const outer = Math.min(w, h) * 0.48;
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
    return;
  }

  const nowMs = wheel.nowMs;
  const windowMs = wheel.windowMs || 60 * 60 * 1000;
  const lookbackMs = wheel.lookbackMs || 10 * 60 * 1000;
  const cues = [...wheel.cues].sort((a, b) => a.effectiveMs - b.effectiveMs);
  const timed = wheel.timed || [];
  const endMsById = wheel.endMsById || {};

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
    const color = colorForSection(cue.section);

    let startMs = cue.effectiveMs;
    let drawStart = startMs;
    let drawEnd = endMs;
    if (isCurrent) {
      drawStart = nowMs;
      drawEnd = Math.max(endMs, nowMs + 90 * 1000);
      if (cue.effectiveMs < nowMs) {
        const elapsedFrom = Math.max(cue.effectiveMs, wheel.windowStart || nowMs - lookbackMs);
        if (elapsedFrom < nowMs) {
          pie(ctx, cx, cy, inner, outer,
            cueAngleRadians(elapsedFrom, nowMs, lookbackMs, windowMs),
            cueAngleRadians(nowMs, nowMs, lookbackMs, windowMs),
            color, true, false, false, dpr);
        }
      }
    }

    pie(ctx, cx, cy, inner, outer,
      cueAngleRadians(drawStart, nowMs, lookbackMs, windowMs),
      cueAngleRadians(drawEnd, nowMs, lookbackMs, windowMs),
      color, isPast, isNext, isCurrent, dpr);

    if (cue.locked) {
      const markerMs = Math.min(wheel.windowEnd || nowMs + windowMs, Math.max(cue.effectiveMs, wheel.windowStart || nowMs - lookbackMs));
      const a = cueAngleRadians(markerMs, nowMs, lookbackMs, windowMs);
      const r = outer + 9 * dpr;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      ctx.beginPath();
      ctx.arc(x, y, 4.5 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#f0b429';
      ctx.fill();
    }
  }

  // Outer track + ticks
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.stroke();

  const tickCount = Math.min(120, Math.max(30, Math.round(windowMs / 60000)));
  for (let m = 0; m < tickCount; m++) {
    const a = -Math.PI / 2 + (m / tickCount) * Math.PI * 2;
    const major = m % 15 === 0;
    const mid = m % 5 === 0;
    const len = (major ? 10 : mid ? 7 : 4) * dpr;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (outer - len), cy + Math.sin(a) * (outer - len));
    ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    ctx.strokeStyle = major ? 'rgba(255,255,255,0.55)' : mid ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.16)';
    ctx.lineWidth = (major ? 2 : 1) * dpr;
    ctx.stroke();
  }

  drawNowHand(ctx, cx, cy, inner, outer, dpr);

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

function pie(ctx, cx, cy, inner, outer, a0, a1, color, isPast, isNext, isCurrent, dpr) {
  let start = a0;
  let end = a1;
  let delta = end - start;
  while (delta < 0) delta += Math.PI * 2;
  while (delta > Math.PI * 2) delta -= Math.PI * 2;
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
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1 * dpr;
  ctx.stroke();
}

function shade(hex, factor) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const ch = (i) => Math.max(0, Math.min(255, Math.round(parseInt(m[i], 16) * factor)));
  return `rgb(${ch(1)},${ch(2)},${ch(3)})`;
}

function applyState(state) {
  if (!state || typeof state !== 'object') return;
  lastState = state;
  drawFromState(state);
}

function drawFromState(state) {
  if (!state) return;

  els.matchTitle.textContent = state.matchTitle || 'Top of the Hour';
  els.matchSub.textContent = state.matchSub || '—';
  els.phaseLabel.textContent = state.phaseLabel || state.phase || '—';
  els.listPhase.textContent = state.phaseLabel || state.phase || '—';
  if (els.listHeader) els.listHeader.dataset.phase = state.phase || 'pre';

  els.centerClock.textContent = state.nowClock || '—';
  els.centerCurrent.textContent = state.centerCurrent || state.currentTitle || '—';
  els.centerRemaining.textContent = state.centerRemaining || '';

  els.currentTitle.textContent = state.currentTitle || '—';
  els.currentRemainingLabel.textContent = state.currentRemainingLabel || 'Nog';
  els.currentRemainingTime.textContent = state.currentRemainingTime || state.currentMeta || '—';
  els.currentPlanned.textContent = state.currentPlanned || '';

  els.nextTitle.textContent = state.nextTitle || '—';
  els.nextMetaLabel.textContent = state.nextMetaLabel || '';
  els.nextMetaTime.textContent = state.nextMetaTime || '';

  const secs = state.secondsToNext;
  const inFinal = Boolean(state.wheel?.inFinalMinute) || (secs != null && secs <= 60);
  els.secondsDigital.textContent = secs == null ? '—' : formatCountdown(secs);
  els.secondsDigital.classList.toggle('hot', secs != null && secs <= 60);

  if (state.timeshiftLabel) {
    els.timeshiftBar.hidden = false;
    els.timeshiftLabel.textContent = state.timeshiftLabel;
  } else {
    els.timeshiftBar.hidden = true;
  }

  els.mode.textContent = state.mode === 'flex' ? 'flex' : 'vast';
  els.statusNow.textContent = `${state.phaseLabel || state.phase || ''} · ${state.nowClock || ''}`.trim();

  const wm = state.windowMinutes || 60;
  if (els.windowBadge) {
    els.windowBadge.textContent = `${wm} min`;
    els.windowBadge.hidden = wm === 60;
  }

  const cues = Array.isArray(state.cues) ? state.cues : [];
  els.listCount.textContent = String(cues.length);
  const frag = document.createDocumentFragment();
  for (const cue of cues) {
    const el = document.createElement('div');
    el.className = 'cue-item';
    if (cue.locked) el.classList.add('is-locked');
    if (cue.id && cue.id === state.currentId) el.classList.add('current');
    else if (cue.id && cue.id === state.nextId) el.classList.add('next');
    else if (cue.past) el.classList.add('past');
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

  const focus = els.cueList.querySelector('.cue-item.current, .cue-item.next');
  if (focus) {
    const prev = focus.previousElementSibling;
    (prev || focus).scrollIntoView({ block: 'nearest' });
  }

  drawSecondsWheel(secs, inFinal);
  drawProgramWheel(state.wheel);
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
      // ignore bad payloads
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

  try {
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (res.ok) applyState(await res.json());
  } catch {
    setConn('offline', 'is-err');
  }
  connectSse();
}

bootstrap();
