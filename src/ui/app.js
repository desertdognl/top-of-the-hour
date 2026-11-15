/**
 * App glue: load → parse → phase clocks → wheels + list + demo + settings.
 */

import {
  buildClockSnapshot,
  formatCountdown,
  formatClock,
  formatDuration,
  windowMsForMinutes,
  lookbackMsForWindow,
} from '../clock/engine.js';
import {
  createSyncState,
  setOffsetMinutes,
  setOffsetMs,
  setKickoffOverride,
  formatOffsetLabel,
  formatTimeshiftLabel,
  cueShiftMs,
  effectiveCueMs,
  addTimeshiftMs,
  resetTimeshift,
  setTimeshiftMs,
  timeshiftDeltaForItems,
  effectiveNowMs,
} from '../clock/sync.js';
import { cuesForPhase, tagCuesWithPhases } from '../clock/phases.js';
import { createProgramWheel } from './ProgramWheel.js';
import { createSecondsWheel } from './SecondsWheel.js';
import { createCueList } from './CueList.js';
import { bindControls } from './controls.js';
import {
  jumpToRundown,
  jumpToNextAnchor,
  skipMinutes,
  resetOffset,
  createDemoPlayer,
  bindDemoBar,
} from './demo.js';
import { createSettingsController } from './settings.js';
import { createPhaseController } from './phases.js';
import { maybeAlertCueChange, resetCueAlert } from './alerts.js';
import {
  applyAnchorsToCues,
  refreshAnchorsFromCues,
  toggleAnchorInList,
  makeAnchorFromCue,
  findAnchor,
  removeAnchorByKey,
} from '../settings/anchors.js';
import { colorForCue } from '../settings/store.js';
import { createOscBridge, buildOscStatusMessages } from '../osc/bridge.js';
import { createOscDocsPage } from './oscDocs.js';

const state = {
  cues: [],
  meta: {},
  fileName: '',
  filePath: '',
  loadedAt: null,
  sync: createSyncState(),
  /** Live overrides — also intended for OSC later */
  live: {
    doneIds: new Set(),
    snoozeUntil: new Map(),
  },
  regie: false,
};

const SPLASH_MS = 2800;
const REGIE_IDLE_MS = 2600;

const els = {
  matchTitle: document.getElementById('match-title'),
  matchSub: document.getElementById('match-sub'),
  matchSubText: document.getElementById('match-sub-text'),
  matchSubTip: document.getElementById('match-sub-tip'),
  version: document.getElementById('app-version'),
  settingsVersion: document.getElementById('settings-version'),
  splashOverlay: document.getElementById('splash-overlay'),
  splashVersion: document.getElementById('splash-version'),
  splashDismissHint: document.getElementById('splash-dismiss-hint'),
  statusFile: document.getElementById('status-file'),
  statusNow: document.getElementById('status-now'),
  secondsDigital: document.getElementById('seconds-digital'),
  nextTitle: document.getElementById('next-title'),
  nextMetaLabel: document.getElementById('next-meta-label'),
  nextMetaTime: document.getElementById('next-meta-time'),
  centerClock: document.getElementById('center-clock'),
  centerCurrent: document.getElementById('center-current'),
  centerRemaining: document.getElementById('center-remaining'),
  currentTitleSide: document.getElementById('current-title-side'),
  currentRemainingLabel: document.getElementById('current-remaining-label'),
  currentRemainingTime: document.getElementById('current-remaining-time'),
  currentPlanned: document.getElementById('current-planned'),
  listCount: document.getElementById('list-count'),
  demoOffset: document.getElementById('demo-offset-label'),
  timeshiftLabel: document.getElementById('timeshift-label'),
  timeshiftHint: document.getElementById('timeshift-hint'),
  windowBadge: document.getElementById('window-badge'),
  appRoot: document.getElementById('app'),
};

let splashBootDone = false;
let lastSnapForActions = null;
let regieIdleTimer = null;

function setCurrentMeta(label, time) {
  if (els.currentRemainingLabel) els.currentRemainingLabel.textContent = label || '';
  if (els.currentRemainingTime) els.currentRemainingTime.textContent = time || '';
}

function setNextMeta(label, time) {
  if (els.nextMetaLabel) els.nextMetaLabel.textContent = label || '';
  if (els.nextMetaTime) els.nextMetaTime.textContent = time || '';
}

const programWheel = createProgramWheel(document.getElementById('program-wheel'));
const secondsWheel = createSecondsWheel(document.getElementById('seconds-wheel'));

const settingsUi = createSettingsController({
  getExportContext: () => ({ cues: state.cues, meta: state.meta }),
  onChange: (s) => {
    const settings = s || settingsUi.get();
    // Re-apply locks when anchors change (settings page / clear)
    if (state.cues.length) {
      state.cues = applyAnchorsToCues(state.cues, settings.anchors || []);
    }
    // Fixed mode: timeshift always off
    if ((settings.rundownMode || 'fixed') !== 'flex') {
      resetTimeshift(state.sync);
    }
    syncTimeshiftUi();
    updateMatchSub();
    programWheel.resize();
    secondsWheel.resize();
  },
});

const cueList = createCueList(document.getElementById('cue-list'), {
  onToggleLock: (cue) => {
    const current = settingsUi.get();
    const { anchors, locked } = toggleAnchorInList(current.anchors, cue);
    // Update in-memory first so the next paint (or immediate tick) shows the lock
    const idx = state.cues.findIndex((c) => c.id === cue.id);
    if (idx >= 0) state.cues[idx] = { ...state.cues[idx], locked };
    // Also sync any soft-matched cues to the same locked flag via apply
    state.cues = applyAnchorsToCues(state.cues, anchors);
    settingsUi.patch({ anchors });
    settingsUi.renderAnchorsList();
    syncTimeshiftUi();
    updateMatchSub();
    // Do NOT invalidate the list — lock updates in place (keeps scroll position)
  },
});

const phases = createPhaseController({
  onPhaseChange: () => {
    updatePhaseChrome();
  },
});

function applyAnchorLocked(cueId, locked) {
  const cue = state.cues.find((c) => c.id === cueId);
  if (!cue) return false;
  let anchors = [...(settingsUi.get().anchors || [])];
  const existing = findAnchor(anchors, cue);
  if (locked && !existing) anchors = [...anchors, makeAnchorFromCue(cue)];
  if (!locked && existing) anchors = removeAnchorByKey(anchors, existing.key);
  settingsUi.patch({ anchors });
  settingsUi.renderAnchorsList();
  state.cues = applyAnchorsToCues(state.cues, anchors);
  return true;
}

function resolveCueId(cueId) {
  if (cueId) return cueId;
  return lastSnapForActions?.current?.id || lastSnapForActions?.next?.id || null;
}

/** Public + OSC action surface — keep in sync with src/osc/catalog.js */
const actions = {
  setPhase: (id) => phases.setPhase(String(id || '').toLowerCase()),
  phaseNext: () => phases.nextPhase(),
  phasePrev: () => phases.prevPhase(),
  phaseStart: (id) => phases.startManual(id),
  phasePause: (id) => phases.pauseManual(id),
  phaseReset: (id) => phases.resetManual(id),
  itemNext: () => phases.nextItem(),
  itemPrev: () => phases.prevItem(),
  cueDone: () => markCueDone(),
  cueSnooze: (minutes = 1) => snoozeCue(minutes),
  cueJump: (leadSeconds = 30) => {
    demo.setSpeed(0);
    const snap = buildClockSnapshot(activeCues(), state.sync, Date.now(), clockOpts(settingsUi.get()));
    const target = snap.next || snap.timed[0];
    jumpToCueLead(target, leadSeconds);
    return Boolean(target);
  },
  cueNext: () => {
    stepTimedCue(1);
    return true;
  },
  cuePrev: () => {
    stepTimedCue(-1);
    return true;
  },
  cueGoto: (index) => {
    demo.setSpeed(0);
    const snap = buildClockSnapshot(activeCues(), state.sync, Date.now(), clockOpts(settingsUi.get()));
    const timed = snap.timed || [];
    if (!timed.length) return false;
    const idx = Math.max(0, Math.min(timed.length - 1, Number(index) || 0));
    return jumpToCueCurrent(timed[idx]);
  },
  cueJumpAnchor: () => jumpToAnchorAction(),
  setWebEnabled: (on) => {
    settingsUi.patch({ webInterfaceEnabled: Boolean(on) });
    return Boolean(on);
  },
  setWebPort: (port) => {
    const p = Number(port) || 8787;
    settingsUi.patch({ webInterfacePort: p });
    return p;
  },
  webStatus: async () => {
    const s = settingsUi.get();
    const st = (await window.api?.webStatus?.()) || {};
    return {
      enabled: Boolean(s.webInterfaceEnabled),
      running: Boolean(st.running),
      port: st.port || s.webInterfacePort || 8787,
      urls: st.urls || [],
    };
  },
  anchorToggle: (cueId) => {
    const id = resolveCueId(cueId);
    const cue = state.cues.find((c) => c.id === id);
    if (!cue) return false;
    const { anchors, locked } = toggleAnchorInList(settingsUi.get().anchors, cue);
    settingsUi.patch({ anchors });
    settingsUi.renderAnchorsList();
    state.cues = applyAnchorsToCues(state.cues, anchors);
    return locked;
  },
  anchorSet: (cueId, locked) => applyAnchorLocked(cueId, locked),
  anchorClear: () => {
    settingsUi.patch({ anchors: [] });
    settingsUi.renderAnchorsList();
    state.cues = applyAnchorsToCues(state.cues, []);
    return true;
  },
  timeshiftAdd: (minutes) => {
    if (!isFlexMode()) return false;
    addTimeshiftMs(state.sync, Number(minutes) * 60 * 1000);
    syncTimeshiftUi();
    return true;
  },
  timeshiftSet: (minutes) => {
    if (!isFlexMode()) return false;
    setTimeshiftMs(state.sync, Number(minutes) * 60 * 1000);
    syncTimeshiftUi();
    return true;
  },
  timeshiftByItems: (count) => {
    if (!isFlexMode()) return false;
    applyTimeshiftByItems(Number(count) || 0);
    return true;
  },
  timeshiftReset: () => {
    resetTimeshift(state.sync);
    syncTimeshiftUi();
    return true;
  },
  setRundownMode: (mode) => {
    const m = String(mode || '').toLowerCase() === 'flex' ? 'flex' : 'fixed';
    settingsUi.patch({ rundownMode: m });
    syncRundownModeButton();
    return m;
  },
  setLookaheadMinutes: (minutes) => {
    const raw = minutes == null || minutes === '' || minutes === 'auto' ? 'auto' : Number(minutes);
    const v = raw === 'auto' ? 'auto' : [15, 30, 45, 60].includes(raw) ? raw : 'auto';
    settingsUi.patch({ lookaheadMinutes: v });
    return v;
  },
  setLookaheadItems: (count) => {
    const n = Math.max(0, Math.min(24, Number(count) || 0));
    settingsUi.patch({ lookaheadItems: n });
    return n;
  },
  setOffset: (minutes) => {
    demo.setSpeed(0);
    setOffsetMinutes(state.sync, minutes);
    syncOffsetUi();
    return true;
  },
  addOffset: (minutes) => {
    demo.setSpeed(0);
    setOffsetMs(state.sync, (state.sync.offsetMs || 0) + Number(minutes) * 60 * 1000);
    syncOffsetUi();
    return true;
  },
  resetOffset: () => {
    demo.setSpeed(0);
    resetOffset(state.sync);
    syncOffsetUi();
    return true;
  },
  setKickoff: (hhmm) => {
    ensureKickoffBase();
    setKickoffOverride(state.sync, hhmm || '');
    controls.setKickoff(hhmm || '');
    syncKickoffUi();
    updateMatchSub();
    return true;
  },
  openFile: async () => {
    demo.setSpeed(0);
    const result = await window.api.openSpeaker();
    applyParseResult(result);
    return Boolean(result?.ok);
  },
  loadExample: async () => {
    demo.setSpeed(0);
    const result = await window.api.parseExample();
    applyParseResult(result);
    return Boolean(result?.ok);
  },
  setRegie: async (onOff) => {
    if (onOff == null) return toggleRegie();
    if (Boolean(onOff) === state.regie) return state.regie;
    return toggleRegie();
  },
  setWindowMinutes: (minutes) => {
    const v = minutes === 30 || minutes === 90 ? minutes : 60;
    settingsUi.patch({ windowMinutes: v });
    return v;
  },
  openSettings: () => settingsUi.open(),
  closeSettings: () => settingsUi.close(),
};

const oscBridge = createOscBridge(actions);
const oscDocs = createOscDocsPage();

window.__toth = {
  ...actions,
  phase: (cmd, arg) => phases.command(cmd, arg),
  dispatchOsc: (address, args) => oscBridge.dispatch(address, args),
};

let lastOscStatusKey = '';
let lastWebStatusKey = '';

function pushOscStatus(extra = {}) {
  const settings = settingsUi.get();
  if (!settings.oscEnabled || !settings.oscSendEnabled) return;
  const meta = phases.getPhaseMeta();
  const snap = lastSnapForActions;
  const web = pushOscStatus._web || {};
  const payload = {
    phase: phases.getPhase(),
    currentTitle: snap?.current?.title || els.currentTitleSide?.textContent || '',
    currentId: snap?.current?.id || '',
    nextTitle: snap?.next?.title || els.nextTitle?.textContent || '',
    nextId: snap?.next?.id || '',
    secondsToNext: snap?.secondsToNext ?? null,
    timeshiftMinutes: (state.sync.timeshiftMs || 0) / 60000,
    mode: settings.rundownMode || 'fixed',
    regie: state.regie,
    phaseLabel: meta?.label || '',
    webRunning: Boolean(web.running),
    webPort: web.port || settings.webInterfacePort || 8787,
    webUrl: (web.urls || []).find((u) => !String(u).includes('127.0.0.1')) || web.urls?.[0] || '',
    ...extra,
  };
  const key = JSON.stringify(payload);
  if (key === lastOscStatusKey) return;
  lastOscStatusKey = key;
  for (const [address, args] of buildOscStatusMessages(payload)) {
    window.api?.oscSend?.(address, args);
  }
}

function refreshWebStatusCache() {
  if (!window.api?.webStatus) return;
  window.api.webStatus().then((st) => {
    pushOscStatus._web = st || {};
  }).catch(() => {});
}

function pushWebState(extra = {}) {
  const settings = settingsUi.get();
  if (!settings.webInterfaceEnabled || !window.api?.webSetState) return;
  const meta = phases.getPhaseMeta();
  const snap = lastSnapForActions;
  const nowMs = snap?.nowMs ?? Date.now();
  const phaseCues = activeCues();
  const cues = phaseCues.map((c) => {
    const effective = effectiveCueMs(c, state.sync);
    const planned = c.clockText || c.tMinusText || '';
    const clock =
      effective != null && c.atMs != null ? formatHm(effective) : planned || '—';
    return {
      id: c.id,
      title: c.title || '',
      section: c.section || '',
      kind: c.kind || '',
      clock,
      shifted: effective != null && c.atMs != null && effective !== c.atMs,
      past: effective != null && effective < nowMs,
      locked: Boolean(c.locked),
    };
  });

  // Compact wheel snapshot so remote can mirror the program wheel
  let wheel = null;
  if (snap?.windowCues && snap.windowMs) {
    const timed = snap.timed || [];
    const colorIndexBase = timed.findIndex(
      (c) => snap.windowCues[0] && c.id === snap.windowCues[0].id
    );
    wheel = {
      nowMs: snap.nowMs,
      windowMs: snap.windowMs,
      lookbackMs: snap.lookbackMs,
      windowStart: snap.windowStart,
      windowEnd: snap.windowEnd,
      currentId: snap.current?.id || '',
      nextId: snap.next?.id || '',
      secondsWheelValue: snap.secondsWheelValue,
      inFinalMinute: Boolean(snap.inFinalMinute),
      endMsById: snap.endMsById || {},
      cues: (snap.windowCues || []).map((c, i) => {
        const globalIndex = Math.max(0, colorIndexBase) + i;
        return {
          id: c.id,
          title: c.title || '',
          section: c.section || '',
          effectiveMs: c.effectiveMs,
          baseMs: c.baseMs,
          locked: Boolean(c.locked),
          color: colorForCue(c, globalIndex, settings),
        };
      }),
      timed: timed.map((c) => ({
        id: c.id,
        effectiveMs: c.effectiveMs,
      })),
    };
  }

  const payload = {
    matchTitle: state.meta.matchTitle || els.matchTitle?.textContent || 'Top of the Hour',
    matchSub: els.matchSubText?.textContent || '',
    phase: phases.getPhase(),
    phaseLabel: meta?.label || '',
    nowClock: formatClock(nowMs),
    currentTitle: snap?.current?.title || els.currentTitleSide?.textContent || '',
    currentId: snap?.current?.id || '',
    currentMeta: els.currentRemainingTime?.textContent || '',
    currentRemainingLabel: els.currentRemainingLabel?.textContent || '',
    currentRemainingTime: els.currentRemainingTime?.textContent || '',
    currentPlanned: els.currentPlanned?.textContent || '',
    nextTitle: snap?.next?.title || els.nextTitle?.textContent || '',
    nextId: snap?.next?.id || '',
    nextMetaLabel: els.nextMetaLabel?.textContent || '',
    nextMetaTime: els.nextMetaTime?.textContent || '',
    centerCurrent: els.centerCurrent?.textContent || '',
    centerRemaining: els.centerRemaining?.textContent || '',
    secondsToNext: snap?.secondsToNext ?? null,
    timeshiftLabel:
      isFlexMode() && state.sync.timeshiftMs
        ? formatTimeshiftLabel(state.sync.timeshiftMs)
        : '',
    mode: settings.rundownMode || 'fixed',
    windowMinutes: settings.windowMinutes || 60,
    theme: {
      wheelColorMode: settings.wheelColorMode || 'section',
      duoColorA: settings.duoColorA,
      duoColorB: settings.duoColorB,
      wheelLabelScale: settings.wheelLabelScale || 1,
      showWheelTicks: settings.showWheelTicks !== false,
      showWheelMinuteLabels: settings.showWheelMinuteLabels !== false,
      secondsBlinkEnabled: settings.secondsBlinkEnabled !== false,
      secondsBlinkWithin: Number(settings.secondsBlinkWithin) || 15,
    },
    cues,
    wheel,
    ...extra,
  };
  const key = JSON.stringify(payload);
  if (key === lastWebStatusKey) return;
  lastWebStatusKey = key;
  window.api.webSetState(payload);
}

function activeCues() {
  const now = effectiveNowMs(state.sync);
  return cuesForPhase(state.cues, phases.getPhase()).filter((c) => {
    if (state.live.doneIds.has(c.id)) return false;
    const until = state.live.snoozeUntil.get(c.id);
    if (until && until > now) return false;
    return true;
  });
}

/** Ensure kickoff override can compute a shift (needs baseKickoffMs). */
function ensureKickoffBase() {
  if (state.sync.baseKickoffMs != null) return;
  if (state.meta.kickoffMs != null) {
    state.sync.baseKickoffMs = state.meta.kickoffMs;
    return;
  }
  const text = state.meta.kickoffText;
  if (text && /^\d{1,2}:\d{2}$/.test(text)) {
    const [h, m] = text.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    state.sync.baseKickoffMs = d.getTime();
  }
}

function clockOpts(settings) {
  const baseWindow = windowMsForMinutes(settings.windowMinutes || 60);
  const lookbackMs = lookbackMsForWindow(baseWindow);
  const la = settings.lookaheadMinutes;
  if (la != null && la !== 'auto' && la !== '') {
    const aheadMin = Number(la);
    if (aheadMin > 0) {
      return { windowMs: lookbackMs + aheadMin * 60 * 1000, lookbackMs };
    }
  }
  return { windowMs: baseWindow, lookbackMs };
}

function updatePhaseChrome() {
  const meta = phases.getPhaseMeta();
  const type = meta?.clockType || 'wall';
  els.appRoot?.classList.toggle('phase-match', type === 'none');
  els.appRoot?.classList.toggle('phase-manual', type === 'manual');
  els.appRoot?.classList.toggle('phase-wall', type === 'wall');
}

function syncOffsetUi() {
  const minutes = Math.round((state.sync.offsetMs || 0) / 60000);
  controls.setOffset(minutes);
  if (els.demoOffset) {
    const label = formatOffsetLabel(state.sync.offsetMs);
    const speed = demo.getSpeed();
    els.demoOffset.textContent =
      speed > 0 ? `offset ${label} · demo ${speed}×` : `offset ${label}`;
  }
}

function syncKickoffUi() {
  const input = document.getElementById('kickoff-override');
  if (!input) return;
  const shift = cueShiftMs(state.sync);
  input.classList.toggle('is-overridden', Boolean(shift));
  const mins = Math.round(shift / 60000);
  input.title = shift
    ? `Override actief: draaiboek ${mins > 0 ? '+' : ''}${mins}m t.o.v. planning (${state.meta.kickoffText || '—'})`
    : `Planning-aanvang ${state.meta.kickoffText || '—'}. Andere HH:MM + Enter verschuift het hele wiel.`;
}

function isFlexMode() {
  return (settingsUi.get().rundownMode || 'fixed') === 'flex';
}

function lockedCueCount() {
  return state.cues.filter((c) => c.locked).length;
}

/** Header subtitle — refresh whenever locks/anchors change (not only on load). */
function updateMatchSub() {
  if (!els.matchSubText) return;
  const locked = lockedCueCount();
  const loadedShort = state.loadedAt ? formatLoadedAtShort(state.loadedAt) : '';
  const shift = cueShiftMs(state.sync);
  let kickoffLabel = null;
  if (shift && state.sync.overrideKickoffMs != null) {
    kickoffLabel = `Aanvang ${formatHm(state.sync.overrideKickoffMs)} (override)`;
  } else if (state.meta.kickoffText) {
    kickoffLabel = `Aanvang ${state.meta.kickoffText}`;
  }
  els.matchSubText.textContent = [
    loadedShort ? `↓${loadedShort}` : null,
    kickoffLabel,
    state.cues.length ? `${state.cues.length} cues` : null,
    locked ? `${locked} anker${locked === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function syncTimeshiftUi() {
  if (!isFlexMode()) {
    resetTimeshift(state.sync);
  }
  const label = formatTimeshiftLabel(state.sync.timeshiftMs);
  if (els.timeshiftLabel) {
    els.timeshiftLabel.textContent = label;
    els.timeshiftLabel.classList.toggle('is-shifted', Boolean(state.sync.timeshiftMs));
  }
  if (els.timeshiftHint) {
    const phase = activeCues();
    const locked = phase.filter((c) => c.locked).length;
    const shifting = phase.filter((c) => c.atMs != null && !c.locked).length;
    const shifted = Boolean(state.sync.timeshiftMs);
    if (shifted) {
      els.timeshiftHint.textContent = [
        shifting ? `${shifting} schuiven` : null,
        locked ? `${locked} anker${locked === 1 ? '' : 's'} vast` : 'geen ankers',
      ]
        .filter(Boolean)
        .join(' · ');
    } else {
      els.timeshiftHint.textContent = locked
        ? `${locked} anker${locked === 1 ? '' : 's'} blijven vast`
        : 'geen ankers — alles schuift';
    }
  }
  syncRundownModeButton();
}

function syncRundownModeButton() {
  const btn = document.getElementById('btn-rundown-mode');
  if (!btn) return;
  const flex = isFlexMode();
  btn.textContent = flex ? 'Flex' : 'Vast';
  btn.classList.toggle('is-flex', flex);
  btn.setAttribute('aria-pressed', flex ? 'true' : 'false');
  btn.title = flex
    ? 'Flex-modus aan — klik voor vast (wall-clock)'
    : 'Vast (wall-clock) — klik voor flex timeshift';
}

function applyTimeshiftByItems(itemDelta) {
  if (!isFlexMode()) return false;
  const delta = timeshiftDeltaForItems(
    activeCues(),
    state.sync,
    effectiveNowMs(state.sync),
    itemDelta
  );
  if (!delta) return false;
  addTimeshiftMs(state.sync, delta);
  syncTimeshiftUi();
  return true;
}

function bindTimeshiftBar() {
  document.querySelectorAll('[data-timeshift]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isFlexMode()) return;
      const minutes = Number(btn.getAttribute('data-timeshift')) || 0;
      addTimeshiftMs(state.sync, minutes * 60 * 1000);
      syncTimeshiftUi();
    });
  });
  document.querySelectorAll('[data-timeshift-items]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTimeshiftByItems(Number(btn.getAttribute('data-timeshift-items')) || 0);
    });
  });
  document.getElementById('btn-timeshift-reset')?.addEventListener('click', () => {
    resetTimeshift(state.sync);
    syncTimeshiftUi();
  });
  document.getElementById('btn-rundown-mode')?.addEventListener('click', () => {
    const next = isFlexMode() ? 'fixed' : 'flex';
    settingsUi.patch({ rundownMode: next });
    syncRundownModeButton();
  });
}

function jumpToCueLead(cue, leadSeconds = 30) {
  const effective = effectiveCueMs(cue, state.sync);
  if (effective == null) return;
  setOffsetMs(state.sync, effective - leadSeconds * 1000 - Date.now());
  syncOffsetUi();
}

/** Zet effectieve klok net ná cue-start → item wordt "current" (bovenaan). */
function jumpToCueCurrent(cue) {
  const effective = effectiveCueMs(cue, state.sync);
  if (effective == null) return false;
  setOffsetMs(state.sync, effective + 250 - Date.now());
  syncOffsetUi();
  return true;
}

/**
 * Stap naar vorig/volgend timed item in de actieve fase.
 * delta +1 = next, −1 = prev. Werkt ook vóór de geplande tijd (via test-offset).
 */
function stepTimedCue(delta) {
  demo.setSpeed(0);
  const clockType = phases.getPhaseMeta()?.clockType || 'wall';
  if (clockType === 'manual') {
    if (delta > 0) phases.nextItem();
    else phases.prevItem();
    return;
  }

  const settings = settingsUi.get();
  const snap = buildClockSnapshot(activeCues(), state.sync, Date.now(), clockOpts(settings));
  const timed = snap.timed || [];
  if (!timed.length) return;

  let idx = -1;
  if (snap.current) {
    idx = timed.findIndex((c) => c.id === snap.current.id);
  } else if (snap.next) {
    idx = timed.findIndex((c) => c.id === snap.next.id);
    if (delta > 0) {
      jumpToCueCurrent(timed[idx]);
      return;
    }
    jumpToCueCurrent(timed[Math.max(0, idx - 1)]);
    return;
  } else {
    idx = timed.length - 1;
  }

  if (idx < 0) return;
  const targetIdx = Math.max(0, Math.min(timed.length - 1, idx + delta));
  jumpToCueCurrent(timed[targetIdx]);
}

function markCueDone() {
  const clockType = phases.getPhaseMeta()?.clockType || 'wall';
  if (clockType === 'manual') {
    phases.nextItem();
    return true;
  }
  const id = lastSnapForActions?.current?.id || lastSnapForActions?.next?.id;
  if (!id) return false;
  state.live.doneIds.add(id);
  state.live.snoozeUntil.delete(id);
  refreshActionSnapAfterLiveChange(id);
  return true;
}

function snoozeCue(minutes = 1) {
  const clockType = phases.getPhaseMeta()?.clockType || 'wall';
  if (clockType === 'manual') {
    // Manual: just advance — snooze is mainly for timed wall-clock cues
    phases.nextItem();
    return true;
  }
  const id = lastSnapForActions?.current?.id || lastSnapForActions?.next?.id;
  if (!id) return false;
  state.live.snoozeUntil.set(id, effectiveNowMs(state.sync) + minutes * 60 * 1000);
  refreshActionSnapAfterLiveChange(id);
  return true;
}

/** Avoid double-Done/Snooze hitting the same id before the next tick. */
function refreshActionSnapAfterLiveChange(excludeId) {
  const remaining = activeCues().filter((c) => c.id !== excludeId);
  const clockType = phases.getPhaseMeta()?.clockType || 'wall';
  if (clockType === 'none') {
    lastSnapForActions = {
      current: null,
      next: remaining[0] ? { id: remaining[0].id } : null,
    };
    return;
  }
  const snap = buildClockSnapshot(remaining, state.sync, Date.now(), clockOpts(settingsUi.get()));
  lastSnapForActions = {
    current: snap.current ? { id: snap.current.id } : null,
    next: snap.next ? { id: snap.next.id } : remaining[0] ? { id: remaining[0].id } : null,
  };
}

/** Jump test-offset to the next locked anchor (or first if none ahead). */
function jumpToAnchorAction() {
  demo.setSpeed(0);
  const ok = jumpToNextAnchor(activeCues(), state.sync, 2);
  if (ok) syncOffsetUi();
  return ok;
}

async function toggleRegie() {
  state.regie = !state.regie;
  els.appRoot?.classList.toggle('regie-mode', state.regie);
  document.getElementById('btn-regie')?.classList.toggle('is-active', state.regie);
  try {
    await window.api.setFullscreen(state.regie);
  } catch {
    // ignore if IPC missing
  }
  if (state.regie) {
    bumpRegieIdle();
  } else {
    els.appRoot?.classList.remove('regie-chrome-hidden');
    clearTimeout(regieIdleTimer);
  }
  window.dispatchEvent(new Event('resize'));
  return state.regie;
}

function bumpRegieIdle() {
  if (!state.regie) return;
  els.appRoot?.classList.remove('regie-chrome-hidden');
  clearTimeout(regieIdleTimer);
  regieIdleTimer = setTimeout(() => {
    if (state.regie) els.appRoot?.classList.add('regie-chrome-hidden');
  }, REGIE_IDLE_MS);
}

const controls = bindControls({
  onOpen: async () => {
    demo.setSpeed(0);
    const result = await window.api.openSpeaker();
    applyParseResult(result);
  },
  onLoadExample: async () => {
    demo.setSpeed(0);
    const result = await window.api.parseExample();
    applyParseResult(result);
  },
  onOffsetChange: (minutes) => {
    demo.setSpeed(0);
    setOffsetMinutes(state.sync, minutes);
    syncOffsetUi();
  },
  onKickoffChange: (hhmm) => {
    ensureKickoffBase();
    const planned = state.meta.kickoffText || '';
    const value = String(hhmm || '').trim();
    // Zelfde als planning of leeg = geen override (originele tijden)
    if (!value || value === planned) {
      setKickoffOverride(state.sync, '');
    } else {
      setKickoffOverride(state.sync, value);
    }
    syncKickoffUi();
    updateMatchSub();
  },
  onJumpNow: () => stepTimedCue(1),
  onJumpPrev: () => stepTimedCue(-1),
});

const demo = createDemoPlayer(
  () => state.sync,
  () => syncOffsetUi()
);

bindDemoBar({
  onJumpRundown: () => {
    demo.setSpeed(0);
    if (jumpToRundown(activeCues(), state.sync, 90)) syncOffsetUi();
  },
  onJumpAnchor: () => jumpToAnchorAction(),
  onSkip: (minutes) => {
    skipMinutes(state.sync, minutes);
    syncOffsetUi();
  },
  onReset: () => {
    demo.setSpeed(0);
    resetOffset(state.sync);
    document.querySelectorAll('[data-demo-speed]').forEach((b) => {
      b.classList.toggle('is-active', Number(b.dataset.demoSpeed) === 0);
    });
    syncOffsetUi();
  },
  onSpeed: (speed) => {
    demo.setSpeed(speed);
    syncOffsetUi();
  },
});

function applyParseResult(result) {
  if (!result || result.canceled) return;
  if (!result.ok) {
    els.statusFile.textContent = result.error || 'Parse mislukt';
    return;
  }
  state.meta = result.meta || {};
  const tagged = tagCuesWithPhases(result.cues || [], state.meta);
  // Re-lock saved anchors; keep NEW times from this import
  let anchors = settingsUi.get().anchors || [];
  anchors = refreshAnchorsFromCues(anchors, tagged);
  settingsUi.patch({ anchors });
  settingsUi.renderAnchorsList();
  state.cues = applyAnchorsToCues(tagged, anchors);
  cueList.invalidate();
  state.fileName = result.fileName || '';
  state.filePath = result.path || '';
  state.loadedAt = new Date();
  state.sync = createSyncState(state.meta);
  state.live.doneIds.clear();
  state.live.snoozeUntil.clear();
  resetCueAlert();
  // Toon planning-aanvang in het veld; override pas bij afwijkende HH:MM
  setKickoffOverride(state.sync, '');
  controls.setKickoff(state.meta.kickoffText || '');
  resetOffset(state.sync);
  resetTimeshift(state.sync);
  syncOffsetUi();
  syncTimeshiftUi();
  syncKickoffUi();
  phases.setPhase('pre');
  updatePhaseChrome();

  els.matchTitle.textContent = state.meta.matchTitle || 'Top of the Hour';
  const loadedShort = formatLoadedAtShort(state.loadedAt);
  const loadedFull = formatLoadedAtFull(state.loadedAt);
  updateMatchSub();
  const tipLines = [state.fileName, state.filePath, loadedFull ? `geladen ${loadedFull}` : null].filter(
    Boolean
  );
  if (els.matchSub && els.matchSubTip) {
    const hasTip = tipLines.length > 0;
    els.matchSub.classList.toggle('has-file-tip', hasTip);
    els.matchSubTip.hidden = !hasTip;
    els.matchSubTip.textContent = tipLines.join('\n');
    els.matchSub.removeAttribute('title');
  }
  els.statusFile.textContent = loadedShort ? `↓${loadedShort}` : 'geen bestand';
  if (els.statusFile) els.statusFile.title = tipLines.join('\n') || '';
}

function formatLoadedAtShort(date) {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mi}`;
}

function formatLoadedAtFull(date) {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${mi}`;
}

function formatHm(ms) {
  if (ms == null) return '';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function updateWindowBadge(settings) {
  if (!els.windowBadge) return;
  const la = settings.lookaheadMinutes;
  if (la != null && la !== 'auto' && la !== '') {
    els.windowBadge.textContent = `→${la}m`;
    els.windowBadge.hidden = false;
    return;
  }
  const m = settings.windowMinutes || 60;
  els.windowBadge.textContent = `${m} min`;
  els.windowBadge.hidden = m === 60;
}

function enrichSnap(snap, settings) {
  snap.timeshiftActive = isFlexMode() && Boolean(state.sync.timeshiftMs);
  snap.lookaheadItems = Number(settings.lookaheadItems) || 0;
  return snap;
}

function tick() {
  demo.tick();
  const settings = settingsUi.get();
  const phaseMeta = phases.getPhaseMeta();
  const phaseCues = activeCues();
  els.listCount.textContent = String(phaseCues.length);
  updateWindowBadge(settings);

  const clockType = phaseMeta?.clockType || 'wall';
  const opts = clockOpts(settings);

  if (clockType === 'manual') {
    phases.syncManualUi(phaseCues);
    const manual = phases.getManual();
    const idx = Math.min(manual?.itemIndex || 0, Math.max(0, phaseCues.length - 1));
    const current = phaseCues[idx];
    const next = phaseCues[idx + 1];
    lastSnapForActions = {
      current: current ? { id: current.id } : null,
      next: next ? { id: next.id } : null,
    };

    cueList.render(phaseCues, {
      nowMs: Date.now(),
      timed: [],
      current: current ? { id: current.id } : null,
      next: next ? { id: next.id } : null,
    });

    els.centerClock.textContent = phases.elapsedLabel();
    els.centerCurrent.textContent = current ? current.title : '—';
    els.centerRemaining.textContent = manual?.running
      ? 'handmatige klok loopt'
      : 'wacht op start (OSC of Start-knop boven)';
    els.secondsDigital.textContent = phases.elapsedLabel();
    els.secondsDigital.classList.remove('hot', 'blink');
    els.currentTitleSide.textContent = current ? current.title : '—';
    if (next) setCurrentMeta('Volgende', next.title);
    else setCurrentMeta('Laatste item', '');
    els.currentPlanned.textContent = `${idx + 1} / ${phaseCues.length || 0}`;
    els.nextTitle.textContent = next ? next.title : '—';
    setNextMeta(next?.section || '', '');

    const emptySnap = buildClockSnapshot([], state.sync, Date.now(), opts);
    programWheel.draw(emptySnap, settings);
    secondsWheel.draw(
      { ...emptySnap, secondsToNext: null, secondsWheelValue: 60, inFinalMinute: false },
      settings
    );

    els.statusNow.textContent = `${phaseMeta.label} · ${phases.elapsedLabel()}`;
    pushOscStatus({
      secondsToNext: null,
      currentTitle: current?.title || '',
      currentId: current?.id || '',
      nextTitle: next?.title || '',
      nextId: next?.id || '',
    });
    pushWebState({
      secondsToNext: null,
      currentTitle: current?.title || '',
      currentId: current?.id || '',
      nextTitle: next?.title || '',
      nextId: next?.id || '',
      nowClock: phases.elapsedLabel(),
    });
    return;
  }

  if (clockType === 'none') {
    const matchNext = phaseCues[0] || null;
    lastSnapForActions = {
      current: null,
      next: matchNext ? { id: matchNext.id } : null,
    };
    cueList.render(phaseCues, {
      nowMs: Date.now(),
      timed: [],
      current: null,
      next: matchNext ? { id: matchNext.id } : null,
    });
    els.centerClock.textContent = formatClock(Date.now());
    els.centerCurrent.textContent = 'Wedstrijd loopt';
    els.centerRemaining.textContent = 'geen aftelklok';
    els.secondsDigital.textContent = '—';
    els.secondsDigital.classList.remove('hot', 'blink');
    els.currentTitleSide.textContent = 'Live';
    setCurrentMeta('Reminders in de lijst', '');
    els.currentPlanned.textContent = 'Speelduur niet vast';
    els.nextTitle.textContent = matchNext?.title || '—';
    setNextMeta('relatief / op call', '');
    const emptySnap = buildClockSnapshot([], state.sync, Date.now(), opts);
    programWheel.draw(emptySnap, settings);
    secondsWheel.draw(
      { ...emptySnap, secondsToNext: null, secondsWheelValue: 60, inFinalMinute: false },
      settings
    );
    els.statusNow.textContent = 'Wedstrijd · geen aftelling';
    pushOscStatus({
      secondsToNext: null,
      currentTitle: 'Live',
      currentId: '',
      nextTitle: matchNext?.title || '',
      nextId: matchNext?.id || '',
    });
    pushWebState({
      currentTitle: 'Live',
      nextTitle: matchNext?.title || '',
      nextId: matchNext?.id || '',
      secondsToNext: null,
    });
    return;
  }

  // Wall-clock pre-match
  const snap = enrichSnap(
    buildClockSnapshot(phaseCues, state.sync, Date.now(), opts),
    settings
  );
  lastSnapForActions = snap;
  programWheel.draw(snap, settings);
  const secDraw = secondsWheel.draw(snap, settings);
  cueList.render(phaseCues, snap);
  maybeAlertCueChange(snap, settings);

  const hot = snap.inFinalMinute;
  const blinking = Boolean(secDraw && secDraw.inBlinkZone);
  els.secondsDigital.textContent = formatCountdown(snap.secondsToNext);
  els.secondsDigital.classList.toggle('hot', Boolean(hot) || blinking);
  els.secondsDigital.classList.toggle(
    'blink',
    blinking && !(Math.floor(Date.now() / 250) % 2 === 0)
  );

  els.centerClock.textContent = formatClock(snap.nowMs);
  els.centerCurrent.textContent = snap.current
    ? snap.current.title
    : snap.next
      ? `Volgende: ${snap.next.title}`
      : '—';

  if (snap.current && snap.currentRemainingSeconds != null) {
    const left = formatDuration(snap.currentRemainingSeconds);
    const planned =
      snap.currentPlannedSeconds != null
        ? `gepland ${formatDuration(snap.currentPlannedSeconds)}`
        : '';
    els.centerRemaining.textContent = `nog ${left}`;
    els.currentTitleSide.textContent = snap.current.title;
    setCurrentMeta('Nog', left);
    els.currentPlanned.textContent = planned
      ? `${planned} · verstreken ${formatDuration(snap.currentElapsedSeconds)}`
      : '';
  } else if (snap.current) {
    els.centerRemaining.textContent = 'geen eindtijd in planning';
    els.currentTitleSide.textContent = snap.current.title;
    setCurrentMeta('Geen volgende timed cue', '');
    els.currentPlanned.textContent =
      snap.currentElapsedSeconds != null
        ? `verstreken ${formatDuration(snap.currentElapsedSeconds)}`
        : '';
  } else {
    els.centerRemaining.textContent = '';
    els.currentTitleSide.textContent = 'Nog niet gestart';
    if (snap.next) {
      setCurrentMeta('Start over', formatDuration(snap.secondsToNext));
    } else {
      setCurrentMeta('—', '');
    }
    els.currentPlanned.textContent = '';
  }

  if (snap.next) {
    els.nextTitle.textContent = snap.next.title;
    const nextClock =
      snap.next.effectiveMs != null ? formatHm(snap.next.effectiveMs) : snap.next.clockText || '';
    setNextMeta(
      [nextClock, snap.next.section].filter(Boolean).join(' · '),
      `over ${formatCountdown(snap.secondsToNext)}`
    );
  } else {
    els.nextTitle.textContent = 'Geen volgende cue';
    setNextMeta('', '');
  }

  const off = formatOffsetLabel(state.sync.offsetMs);
  const shift =
    isFlexMode() && state.sync.timeshiftMs
      ? formatTimeshiftLabel(state.sync.timeshiftMs)
      : '';
  const phaseLabel = phaseMeta?.label || '';
  els.statusNow.textContent =
    `${phaseLabel} · effectief ${formatClock(snap.nowMs)}` +
    (state.sync.offsetMs ? ` · test ${off}` : '') +
    (shift ? ` · ${shift}` : '');
  syncTimeshiftUi();
  if (Date.now() - (pushOscStatus._last || 0) > 400) {
    pushOscStatus._last = Date.now();
    if (Date.now() - (refreshWebStatusCache._last || 0) > 4000) {
      refreshWebStatusCache._last = Date.now();
      refreshWebStatusCache();
    }
    pushOscStatus({
      secondsToNext: snap.secondsToNext,
      currentTitle: snap.current?.title || '',
      currentId: snap.current?.id || '',
      nextTitle: snap.next?.title || '',
      nextId: snap.next?.id || '',
    });
    pushWebState({
      secondsToNext: snap.secondsToNext,
      currentTitle: snap.current?.title || '',
      currentId: snap.current?.id || '',
      nextTitle: snap.next?.title || '',
      nextId: snap.next?.id || '',
    });
  }
}

function onResize() {
  programWheel.resize();
  secondsWheel.resize();
  tick();
}

function finishBootSplash() {
  splashBootDone = true;
  if (!els.splashOverlay) return;
  els.splashOverlay.hidden = true;
  els.splashOverlay.classList.remove('splash--dismissible');
  if (els.splashDismissHint) els.splashDismissHint.hidden = true;
  // Layout often settles only after splash leaves — remeasure wheels
  requestAnimationFrame(() => onResize());
}

function showAboutSplash() {
  if (!els.splashOverlay) return;
  els.splashOverlay.classList.add('splash--dismissible');
  if (els.splashDismissHint) els.splashDismissHint.hidden = false;
  els.splashOverlay.hidden = false;
}

function hideAboutSplash() {
  if (!splashBootDone || !els.splashOverlay) return;
  els.splashOverlay.hidden = true;
  els.splashOverlay.classList.remove('splash--dismissible');
  if (els.splashDismissHint) els.splashDismissHint.hidden = true;
}

async function boot() {
  const info = await window.api.getAppInfo();
  const versionLabel = `v${info.version}`;
  const fullLabel = `${versionLabel} · ${info.build}`;
  if (els.version) els.version.textContent = fullLabel;
  if (els.settingsVersion) els.settingsVersion.textContent = fullLabel;
  if (els.splashVersion) els.splashVersion.textContent = fullLabel;
  document.title = `Top of the Hour ${versionLabel}`;

  document.getElementById('btn-about')?.addEventListener('click', showAboutSplash);
  document.getElementById('btn-about-settings')?.addEventListener('click', showAboutSplash);

  const openDesertDog = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    window.api?.openExternal?.('https://desertdog.nl');
  };
  document.getElementById('btn-desertdog')?.addEventListener('click', openDesertDog);
  document.getElementById('btn-desertdog-copy')?.addEventListener('click', openDesertDog);

  els.splashOverlay?.addEventListener('click', () => {
    if (els.splashOverlay.classList.contains('splash--dismissible')) {
      hideAboutSplash();
    }
  });

  document.getElementById('btn-cue-done')?.addEventListener('click', () => markCueDone());
  document.getElementById('btn-cue-snooze')?.addEventListener('click', () => snoozeCue(1));
  document.getElementById('btn-regie')?.addEventListener('click', () => toggleRegie());
  bindTimeshiftBar();
  syncRundownModeButton();
  syncTimeshiftUi();
  oscBridge.bindIpc();
  window.api?.onOscError?.((err) => {
    const note = document.getElementById('settings-osc-note');
    if (note) note.textContent = `OSC-fout: ${err?.message || err}`;
  });
  window.api?.onWebError?.((err) => {
    const note = document.getElementById('settings-web-note');
    if (note) note.textContent = `Web-fout: ${err?.message || err}`;
  });

  window.addEventListener('keydown', (e) => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleRegie();
      return;
    }
    if (e.key === 'Escape' && state.regie) {
      toggleRegie();
      return;
    }
    if (e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      markCueDone();
      return;
    }
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      snoozeCue(1);
      return;
    }
    if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      jumpToAnchorAction();
    }
  });

  document.addEventListener('mousemove', bumpRegieIdle);
  document.addEventListener('mousedown', bumpRegieIdle);

  settingsUi.applyChrome();
  updatePhaseChrome();

  const redrawWheels = () => onResize();
  document.getElementById('program-wheel')?.addEventListener('wheel-resized', redrawWheels);
  document.getElementById('seconds-wheel')?.addEventListener('wheel-resized', redrawWheels);

  programWheel.resize();
  secondsWheel.resize();
  window.addEventListener('resize', onResize);
  // Fonts / first layout pass can still change stage height after boot
  requestAnimationFrame(() => {
    onResize();
    requestAnimationFrame(onResize);
  });
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => onResize()).catch(() => {});
  }

  const example = await window.api.parseExample();
  applyParseResult(example);

  setInterval(tick, 100);
  tick();

  setTimeout(finishBootSplash, SPLASH_MS);
}

boot();
