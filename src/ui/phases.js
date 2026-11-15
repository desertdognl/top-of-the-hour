/**
 * Phase switcher UI + manual clock controls for Rust / post-match.
 *
 * UI is a fallback/test surface. Live phase switch + clock start
 * will primarily come from OSC (see command API on the returned controller).
 */

import {
  PHASES,
  createManualClockState,
  manualStart,
  manualPause,
  manualReset,
  manualElapsedMs,
} from '../clock/phases.js';
import { formatDuration } from '../clock/engine.js';

export function createPhaseController({ onPhaseChange }) {
  const root = document.getElementById('phase-bar');
  const manualBar = document.getElementById('manual-clock-bar');
  const matchNotice = document.getElementById('match-notice');

  let phaseId = 'pre';
  const manuals = {
    rust: createManualClockState(),
    post: createManualClockState(),
  };

  function renderTabs() {
    if (!root) return;
    root.innerHTML = '';
    for (const p of PHASES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'phase-tab' + (p.id === phaseId ? ' is-active' : '');
      btn.dataset.phase = p.id;
      btn.innerHTML = `<span class="phase-tab-label">${p.label}</span><span class="phase-tab-hint">${p.short}</span>`;
      btn.addEventListener('click', () => setPhase(p.id));
      root.appendChild(btn);
    }
  }

  function setPhase(id) {
    if (!PHASES.some((p) => p.id === id)) return false;
    phaseId = id;
    renderTabs();
    updateChrome();
    onPhaseChange?.(phaseId);
    return true;
  }

  function phaseIndex() {
    return Math.max(0, PHASES.findIndex((p) => p.id === phaseId));
  }

  function nextPhase() {
    const i = phaseIndex();
    const next = PHASES[(i + 1) % PHASES.length];
    return setPhase(next.id);
  }

  function prevPhase() {
    const i = phaseIndex();
    const prev = PHASES[(i - 1 + PHASES.length) % PHASES.length];
    return setPhase(prev.id);
  }

  function updateChrome() {
    const meta = PHASES.find((p) => p.id === phaseId);
    if (manualBar && !manualBar.classList.contains('chrome-hidden')) {
      const phaseHidden =
        root?.classList.contains('chrome-hidden') ||
        document.getElementById('phase-wrap')?.classList.contains('chrome-hidden') ||
        document.querySelector('.phase-toolbar')?.classList.contains('chrome-hidden');
      manualBar.hidden = phaseHidden || meta?.clockType !== 'manual';
    }
    if (matchNotice) {
      matchNotice.hidden = meta?.clockType !== 'none';
    }
    const hint = document.getElementById('phase-hint');
    if (hint && meta) {
      hint.textContent =
        meta.clockType === 'manual'
          ? `${meta.hint} · start via OSC of knop hiernaast`
          : meta.hint;
    }
    const listPhase = document.getElementById('list-phase');
    const listHeader = document.getElementById('list-header');
    if (listPhase && meta) listPhase.textContent = meta.label;
    if (listHeader && meta) {
      listHeader.dataset.phase = meta.id;
      listHeader.title = `Huidige fase: ${meta.label}`;
    }
  }

  function startManual(id = phaseId) {
    const st = manuals[id];
    if (!st) return false;
    manualStart(st);
    onPhaseChange?.(phaseId);
    return true;
  }

  function pauseManual(id = phaseId) {
    const st = manuals[id];
    if (!st) return false;
    manualPause(st);
    onPhaseChange?.(phaseId);
    return true;
  }

  function resetManual(id = phaseId) {
    const st = manuals[id];
    if (!st) return false;
    manualReset(st);
    onPhaseChange?.(phaseId);
    return true;
  }

  function nextItem(id = phaseId) {
    const st = manuals[id];
    if (!st) return false;
    st.itemIndex = (st.itemIndex || 0) + 1;
    onPhaseChange?.(phaseId);
    return true;
  }

  function prevItem(id = phaseId) {
    const st = manuals[id];
    if (!st) return false;
    st.itemIndex = Math.max(0, (st.itemIndex || 0) - 1);
    onPhaseChange?.(phaseId);
    return true;
  }

  /**
   * Stable command surface for OSC / remote control.
   *   /toth/phase pre|match|rust|post
   *   /toth/phase/next  /toth/phase/prev
   *   /toth/item/next   /toth/item/prev
   *   /toth/phase/start|pause|reset
   */
  function command(name, arg) {
    switch (String(name || '').toLowerCase()) {
      case 'phase':
      case 'set':
      case 'setphase':
        return setPhase(String(arg || '').toLowerCase());
      case 'start':
        return startManual(arg ? String(arg).toLowerCase() : phaseId);
      case 'pause':
        return pauseManual(arg ? String(arg).toLowerCase() : phaseId);
      case 'reset':
        return resetManual(arg ? String(arg).toLowerCase() : phaseId);
      case 'next':
      case 'nextphase':
        return nextPhase();
      case 'prev':
      case 'prevphase':
        return prevPhase();
      case 'nextitem':
        return nextItem(arg ? String(arg).toLowerCase() : phaseId);
      case 'previtem':
        return prevItem(arg ? String(arg).toLowerCase() : phaseId);
      default:
        return false;
    }
  }

  document.getElementById('btn-manual-start')?.addEventListener('click', () => startManual());
  document.getElementById('btn-manual-pause')?.addEventListener('click', () => pauseManual());
  document.getElementById('btn-manual-reset')?.addEventListener('click', () => resetManual());
  document.getElementById('btn-manual-next')?.addEventListener('click', () => nextItem());
  document.getElementById('btn-manual-prev')?.addEventListener('click', () => prevItem());
  document.getElementById('btn-phase-next')?.addEventListener('click', () => nextPhase());
  document.getElementById('btn-phase-prev')?.addEventListener('click', () => prevPhase());

  renderTabs();
  updateChrome();

  return {
    getPhase: () => phaseId,
    setPhase,
    nextPhase,
    prevPhase,
    startManual,
    pauseManual,
    resetManual,
    nextItem,
    prevItem,
    command,
    getPhaseMeta: () => PHASES.find((p) => p.id === phaseId),
    getManual: (id = phaseId) => manuals[id] || null,
    elapsedLabel(id = phaseId) {
      const st = manuals[id];
      if (!st) return '—';
      return formatDuration(manualElapsedMs(st) / 1000);
    },
    syncManualUi(phaseCues) {
      const st = manuals[phaseId];
      const elapsedEl = document.getElementById('manual-elapsed');
      const itemEl = document.getElementById('manual-item');
      const statusEl = document.getElementById('manual-status');
      if (!st) return;
      if (elapsedEl) elapsedEl.textContent = formatDuration(manualElapsedMs(st) / 1000);
      if (statusEl) {
        statusEl.textContent = st.running ? 'loopt' : st.accumulatedMs ? 'gepauzeerd' : 'wacht op start (OSC)';
        statusEl.classList.toggle('is-live', Boolean(st.running));
      }
      const idx = Math.min(st.itemIndex || 0, Math.max(0, (phaseCues?.length || 1) - 1));
      const cue = phaseCues && phaseCues[idx];
      if (itemEl) {
        itemEl.textContent = cue
          ? `${idx + 1}/${phaseCues.length} · ${cue.title}`
          : 'Geen items in deze fase';
      }
    },
  };
}
