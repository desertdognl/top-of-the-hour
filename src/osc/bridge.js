/**
 * Renderer OSC bridge: catalog addresses → app actions.
 * Keep handlers in sync with src/osc/catalog.js.
 */

import { OSC_CATALOG } from './catalog.js';

function asString(v, fallback = '') {
  if (v == null) return fallback;
  return String(v);
}

function asNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function truthyOn(v) {
  if (v == null || v === '') return null; // toggle
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (s === '1' || s === 'true' || s === 'on') return true;
  if (s === '0' || s === 'false' || s === 'off') return false;
  return Boolean(asNumber(v, 0));
}

/**
 * @param {object} api - action bag from app.js
 */
export function createOscBridge(api) {
  /** @type {Map<string, (args: any[]) => any>} */
  const handlers = new Map();

  function on(address, fn) {
    handlers.set(address, fn);
  }

  // —— Fase ——
  on('/toth/phase', (args) => api.setPhase(asString(args[0])));
  on('/toth/phase/start', (args) => api.phaseStart(args[0] ? asString(args[0]) : undefined));
  on('/toth/phase/pause', (args) => api.phasePause(args[0] ? asString(args[0]) : undefined));
  on('/toth/phase/reset', (args) => api.phaseReset(args[0] ? asString(args[0]) : undefined));
  on('/toth/phase/next', () => api.phaseNext());
  on('/toth/phase/prev', () => api.phasePrev());
  on('/toth/item/next', () => api.itemNext());
  on('/toth/item/prev', () => api.itemPrev());

  // —— Timeline ——
  on('/toth/cue/done', () => api.cueDone());
  on('/toth/cue/snooze', (args) => api.cueSnooze(asNumber(args[0], 1)));
  on('/toth/cue/jump', (args) => api.cueJump(asNumber(args[0], 30)));
  on('/toth/cue/next', () => api.cueNext());
  on('/toth/cue/prev', () => api.cuePrev());
  on('/toth/cue/goto', (args) => api.cueGoto(asNumber(args[0], 0)));
  on('/toth/cue/anchor', () => api.cueJumpAnchor());

  // —— Ankers ——
  on('/toth/anchor/toggle', (args) => api.anchorToggle(args[0] ? asString(args[0]) : null));
  on('/toth/anchor/lock', (args) => api.anchorSet(asString(args[0]), true));
  on('/toth/anchor/unlock', (args) => api.anchorSet(asString(args[0]), false));
  on('/toth/anchor/clear', () => api.anchorClear());

  // —— Timeshift ——
  on('/toth/timeshift', (args) => api.timeshiftAdd(asNumber(args[0], 0)));
  on('/toth/timeshift/set', (args) => api.timeshiftSet(asNumber(args[0], 0)));
  on('/toth/timeshift/items', (args) => api.timeshiftByItems(asNumber(args[0], 0)));
  on('/toth/timeshift/reset', () => api.timeshiftReset());
  on('/toth/mode', (args) => api.setRundownMode(asString(args[0])));
  on('/toth/lookahead', (args) => api.setLookaheadMinutes(args[0] == null ? 'auto' : args[0]));
  on('/toth/lookahead/items', (args) => api.setLookaheadItems(asNumber(args[0], 0)));

  // —— Test ——
  on('/toth/offset', (args) => api.setOffset(asNumber(args[0], 0)));
  on('/toth/offset/add', (args) => api.addOffset(asNumber(args[0], 0)));
  on('/toth/offset/reset', () => api.resetOffset());
  on('/toth/kickoff', (args) => api.setKickoff(asString(args[0], '')));

  // —— Bestand ——
  on('/toth/file/open', () => api.openFile());
  on('/toth/file/example', () => api.loadExample());

  // —— Views ——
  on('/toth/view/regie', (args) => {
    const onOff = truthyOn(args[0]);
    return api.setRegie(onOff);
  });
  on('/toth/view/window', (args) => api.setWindowMinutes(asNumber(args[0], 60)));
  on('/toth/settings', (args) => {
    const onOff = truthyOn(args[0]);
    if (onOff === true) api.openSettings();
    else if (onOff === false) api.closeSettings();
    else api.openSettings();
  });

  on('/toth/web', (args) => {
    if (args.length === 0) return api.webStatus?.();
    const onOff = truthyOn(args[0]);
    if (onOff == null) return api.webStatus?.();
    return api.setWebEnabled?.(onOff);
  });
  on('/toth/web/port', (args) => api.setWebPort?.(asNumber(args[0], 8787)));

  // Sanity: every inbound catalog address must have a handler
  const missing = OSC_CATALOG.filter((c) => c.direction === 'in' && !handlers.has(c.address));
  if (missing.length) {
    console.warn(
      '[OSC] Catalog IN without handler:',
      missing.map((m) => m.address).join(', ')
    );
  }
  for (const address of handlers.keys()) {
    if (!OSC_CATALOG.some((c) => c.address === address && c.direction === 'in')) {
      console.warn('[OSC] Handler without catalog entry:', address);
    }
  }

  function dispatch(address, args = []) {
    const fn = handlers.get(address);
    if (!fn) {
      return { ok: false, error: `Onbekend adres: ${address}` };
    }
    try {
      const result = fn(args);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  }

  function bindIpc() {
    if (!window.api?.onOscMessage) return () => {};
    return window.api.onOscMessage((msg) => {
      if (!msg || !msg.address) return;
      const result = dispatch(msg.address, msg.args || []);
      window.api?.oscLog?.({
        ...msg,
        result,
      });
      // Optional: notify docs page
      window.dispatchEvent(
        new CustomEvent('toth-osc-rx', { detail: { ...msg, result } })
      );
    });
  }

  return { dispatch, bindIpc, handlers };
}

/**
 * Build outbound status payload from a snapshot-like object.
 */
export function buildOscStatusMessages(state) {
  const msgs = [];
  msgs.push(['/toth/out/phase', [state.phase || '']]);
  msgs.push(['/toth/out/current', [state.currentTitle || '', state.currentId || '']]);
  msgs.push(['/toth/out/next', [state.nextTitle || '', state.nextId || '']]);
  msgs.push([
    '/toth/out/seconds',
    [state.secondsToNext == null ? -1 : Number(state.secondsToNext)],
  ]);
  msgs.push(['/toth/out/timeshift', [Number(state.timeshiftMinutes) || 0]]);
  msgs.push(['/toth/out/mode', [state.mode || 'fixed']]);
  msgs.push(['/toth/out/regie', [state.regie ? 1 : 0]]);
  msgs.push([
    '/toth/out/web',
    [
      state.webRunning ? 1 : 0,
      Number(state.webPort) || 0,
      state.webUrl || '',
    ],
  ]);
  return msgs;
}
