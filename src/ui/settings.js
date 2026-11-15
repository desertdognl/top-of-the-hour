/**
 * Full-page settings — chrome toggles, wheel, blink, future web/OSC.
 */

import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../settings/store.js';
import { removeAnchorByKey, applyFcuStandardAnchors } from '../settings/anchors.js';
import { cuesToJson, cuesToCsv } from '../export/cues.js';
import { catalogToMarkdown } from '../export/oscMd.js';
import { OSC_CATALOG } from '../osc/catalog.js';
import { playCueSound, CUE_SOUND_PRESETS } from './alerts.js';

const TOGGLE_MAP = [
  ['setting-test-mode', 'testMode'],
  ['setting-show-topbar-tools', 'showTopbarTools'],
  ['setting-show-phase-bar', 'showPhaseBar'],
  ['setting-show-seconds-panel', 'showSecondsPanel'],
  ['setting-show-current-card', 'showCurrentCard'],
  ['setting-show-next-card', 'showNextCard'],
  ['setting-show-wheel-ticks', 'showWheelTicks'],
  ['setting-show-wheel-minute-labels', 'showWheelMinuteLabels'],
  ['setting-blink-enabled', 'secondsBlinkEnabled'],
  ['setting-cue-alert', 'cueAlertEnabled'],
  ['setting-cue-sound', 'cueAlertSound'],
  ['setting-cue-flash', 'cueAlertFlash'],
  ['setting-regie-hide-timeline', 'regieHideTimeline'],
  ['setting-show-timeshift-bar', 'showTimeshiftBar'],
  ['setting-web-enabled', 'webInterfaceEnabled'],
  ['setting-osc-enabled', 'oscEnabled'],
  ['setting-osc-send-enabled', 'oscSendEnabled'],
];

const SOUND_IDS = new Set(CUE_SOUND_PRESETS.map((p) => p.id));

/** Elements controlled by chrome settings (id or selector) */
const CHROME = {
  testMode: ['#demo-bar'],
  showTopbarTools: ['#topbar-tools'],
  showPhaseBar: ['#phase-bar', '.phase-toolbar'],
  showSecondsPanel: ['.seconds-panel'],
  showCurrentCard: ['#current-card'],
  showNextCard: ['#next-card'],
};

export function createSettingsController({ onChange, getExportContext } = {}) {
  let settings = loadSettings();
  const page = document.getElementById('settings-page');
  const app = document.getElementById('app');

  function open() {
    page.hidden = false;
    app?.setAttribute('hidden', '');
    syncForm();
  }

  function close() {
    page.hidden = true;
    app?.removeAttribute('hidden');
    applyChrome(settings);
    onChange?.(settings);
    window.dispatchEvent(new Event('resize'));
  }

  function syncForm() {
    for (const [id, key] of TOGGLE_MAP) setChecked(id, settings[key]);
    setValue('setting-color-mode', settings.wheelColorMode);
    setValue('setting-duo-a', settings.duoColorA);
    setValue('setting-duo-b', settings.duoColorB);
    setValue('setting-label-scale', String(settings.wheelLabelScale));
    setLabelScaleReadout(settings.wheelLabelScale);
    setValue('setting-blink-within', String(settings.secondsBlinkWithin));
    setValue('setting-window-minutes', String(settings.windowMinutes || 60));
    setValue('setting-rundown-mode', settings.rundownMode || 'fixed');
    setValue(
      'setting-lookahead-minutes',
      settings.lookaheadMinutes == null || settings.lookaheadMinutes === 'auto'
        ? 'auto'
        : String(settings.lookaheadMinutes)
    );
    setValue('setting-lookahead-items', String(settings.lookaheadItems || 0));
    setValue(
      'setting-cue-sound-id',
      SOUND_IDS.has(settings.cueAlertSoundId) ? settings.cueAlertSoundId : 'ping'
    );
    setValue('setting-web-port', String(settings.webInterfacePort));
    setValue('setting-osc-port', String(settings.oscPort));
    setValue('setting-osc-host', settings.oscHost);
    setValue('setting-osc-send-host', settings.oscSendHost || '127.0.0.1');
    setValue('setting-osc-send-port', String(settings.oscSendPort || 9001));
    updateDuoVisibility();
    updateBlinkVisibility();
    renderAnchorsList();
    syncOscServer();
    syncWebServer();
  }

  function syncWebServer() {
    if (!window.api?.webApplyConfig) return;
    window.api
      .webApplyConfig({
        enabled: Boolean(settings.webInterfaceEnabled),
        port: Number(settings.webInterfacePort) || 8787,
      })
      .then((res) => {
        renderWebStatus(res);
      })
      .catch((err) => {
        renderWebStatus({
          ok: false,
          running: false,
          error: err?.message || String(err),
          urls: [],
        });
      });
  }

  function renderWebStatus(res) {
    const note = document.getElementById('settings-web-note');
    const urlsEl = document.getElementById('settings-web-urls');
    const copyBtn = document.getElementById('btn-web-copy-url');
    const urls = Array.isArray(res?.urls) ? res.urls : [];
    const preferred =
      urls.find((u) => !u.includes('127.0.0.1')) || urls[0] || '';

    if (copyBtn) {
      copyBtn.hidden = !preferred;
      copyBtn.dataset.url = preferred || '';
    }
    if (urlsEl) {
      if (!settings.webInterfaceEnabled) {
        urlsEl.hidden = true;
        urlsEl.innerHTML = '';
      } else {
        urlsEl.hidden = false;
        urlsEl.innerHTML = urls.length
          ? urls
              .map(
                (u) =>
                  `<a class="settings-web-url" href="${escapeAttr(u)}" title="Open in browser">${escapeHtml(u)}</a>`
              )
              .join('')
          : '<span class="settings-hint">Geen netwerkadres gevonden</span>';
      }
    }
    if (!note) return;
    if (!settings.webInterfaceEnabled) {
      note.textContent =
        'Uit. Zet aan voor een read-only browser-view op dit netwerk (IP + poort). macOS kan om netwerktoegang vragen.';
      return;
    }
    if (res && res.ok === false) {
      note.textContent = `Web-fout: ${res.error || 'kon niet starten'}`;
      return;
    }
    note.textContent = res?.running
      ? `Live op poort ${res.port}${res.clients != null ? ` · ${res.clients} client(s)` : ''}`
      : 'Webinterface starten…';
  }

  function syncOscServer() {
    if (!window.api?.oscApplyConfig) return;
    window.api
      .oscApplyConfig({
        enabled: Boolean(settings.oscEnabled),
        host: settings.oscHost || '0.0.0.0',
        port: Number(settings.oscPort) || 9000,
        sendEnabled: Boolean(settings.oscSendEnabled),
        sendHost: settings.oscSendHost || '127.0.0.1',
        sendPort: Number(settings.oscSendPort) || 9001,
      })
      .then((res) => {
        const note = document.getElementById('settings-osc-note');
        if (!note) return;
        if (!settings.oscEnabled) {
          note.textContent = 'OSC uit. Zet aan om te luisteren op host/poort.';
          return;
        }
        if (res && res.ok === false) {
          note.textContent = `OSC-fout: ${res.error || 'kon niet starten'}`;
          return;
        }
        note.textContent = res?.running
          ? `Luistert op ${res.host}:${res.port}` +
            (res.sendEnabled ? ` · status → ${res.sendHost}:${res.sendPort}` : '')
          : 'OSC geconfigureerd…';
      })
      .catch((err) => {
        const note = document.getElementById('settings-osc-note');
        if (note) note.textContent = `OSC-fout: ${err.message || err}`;
      });
  }

  function renderAnchorsList() {
    const list = document.getElementById('settings-anchors-list');
    if (!list) return;
    const anchors = settings.anchors || [];
    list.innerHTML = '';
    for (const a of anchors) {
      const row = document.createElement('div');
      row.className = 'anchor-row';
      row.innerHTML = `
        <div class="anchor-label">${escapeHtml(a.label || a.title || a.key)}</div>
        <div class="anchor-meta">${escapeHtml(a.tMinusText || a.clockText || '')}</div>
        <button type="button" class="btn" data-anchor-key="${escapeAttr(a.key)}">Wis</button>
      `;
      list.appendChild(row);
    }
    list.querySelectorAll('[data-anchor-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-anchor-key');
        patch({ anchors: removeAnchorByKey(settings.anchors, key) });
        renderAnchorsList();
      });
    });
  }

  function updateDuoVisibility() {
    const duo = document.getElementById('settings-duo-row');
    if (duo) duo.hidden = settings.wheelColorMode !== 'duo';
  }

  function updateBlinkVisibility() {
    const row = document.getElementById('settings-blink-within-row');
    if (row) row.hidden = !settings.secondsBlinkEnabled;
  }

  function setLabelScaleReadout(v) {
    const el = document.getElementById('setting-label-scale-value');
    if (el) el.textContent = `${Number(v).toFixed(2)}×`;
  }

  function patch(partial) {
    settings = saveSettings({ ...settings, ...partial });
    // Keep form fields in sync when changed from topbar / OSC (not only on open)
    if (partial.rundownMode != null) setValue('setting-rundown-mode', settings.rundownMode || 'fixed');
    if (partial.lookaheadMinutes != null) {
      setValue(
        'setting-lookahead-minutes',
        settings.lookaheadMinutes == null || settings.lookaheadMinutes === 'auto'
          ? 'auto'
          : String(settings.lookaheadMinutes)
      );
    }
    if (partial.lookaheadItems != null) {
      setValue('setting-lookahead-items', String(settings.lookaheadItems || 0));
    }
    if (partial.windowMinutes != null) {
      setValue('setting-window-minutes', String(settings.windowMinutes || 60));
    }
    if (partial.cueAlertSoundId != null) {
      setValue(
        'setting-cue-sound-id',
        SOUND_IDS.has(settings.cueAlertSoundId) ? settings.cueAlertSoundId : 'ping'
      );
    }
    updateDuoVisibility();
    updateBlinkVisibility();
    applyChrome(settings);
    if (
      partial.oscEnabled != null ||
      partial.oscHost != null ||
      partial.oscPort != null ||
      partial.oscSendEnabled != null ||
      partial.oscSendHost != null ||
      partial.oscSendPort != null
    ) {
      syncOscServer();
    }
    if (partial.webInterfaceEnabled != null || partial.webInterfacePort != null) {
      syncWebServer();
    }
    onChange?.(settings);
    return settings;
  }

  function setChromeVisible(selector, visible) {
    document.querySelectorAll(selector).forEach((el) => {
      el.classList.toggle('chrome-hidden', !visible);
      el.hidden = !visible;
    });
  }

  function applyChrome(s = settings) {
    setChromeVisible('#demo-bar', Boolean(s.testMode));
    setChromeVisible('#topbar-tools', Boolean(s.showTopbarTools));
    setChromeVisible('#phase-wrap', Boolean(s.showPhaseBar));
    setChromeVisible('#phase-bar', Boolean(s.showPhaseBar));
    setChromeVisible('.phase-toolbar', Boolean(s.showPhaseBar));
    setChromeVisible('#seconds-panel', Boolean(s.showSecondsPanel));
    setChromeVisible('.seconds-panel', Boolean(s.showSecondsPanel));
    setChromeVisible('#current-card', Boolean(s.showCurrentCard));
    setChromeVisible('#next-card', Boolean(s.showNextCard));

    const flex = (s.rundownMode || 'fixed') === 'flex';
    setChromeVisible('#timeshift-bar', flex && Boolean(s.showTimeshiftBar));

    app?.classList.toggle('test-mode-off', !s.testMode);
    app?.classList.toggle('hide-seconds', !s.showSecondsPanel);
    app?.classList.toggle('hide-phase', !s.showPhaseBar);
    app?.classList.toggle('rundown-flex', flex);
    app?.classList.toggle('rundown-fixed', !flex);
    app?.classList.toggle('regie-hide-timeline', Boolean(s.regieHideTimeline));
  }

  // Frontend × buttons — hide panel; re-enable via settings toggles
  document.getElementById('app')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-dismiss]');
    if (!btn || !app?.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    const key = btn.getAttribute('data-dismiss');
    if (!key) return;
    patch({ [key]: false });
  });

  document.getElementById('btn-settings')?.addEventListener('click', open);
  document.getElementById('btn-settings-close')?.addEventListener('click', close);

  for (const [id, key] of TOGGLE_MAP) {
    document.getElementById(id)?.addEventListener('change', (e) => {
      patch({ [key]: e.target.checked });
    });
  }

  document.getElementById('setting-color-mode')?.addEventListener('change', (e) => {
    patch({ wheelColorMode: e.target.value });
  });
  document.getElementById('setting-duo-a')?.addEventListener('input', (e) => {
    patch({ duoColorA: e.target.value });
  });
  document.getElementById('setting-duo-b')?.addEventListener('input', (e) => {
    patch({ duoColorB: e.target.value });
  });
  document.getElementById('setting-label-scale')?.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    setLabelScaleReadout(v);
    patch({ wheelLabelScale: v });
  });
  document.getElementById('setting-blink-within')?.addEventListener('change', (e) => {
    const v = Math.min(60, Math.max(1, Number(e.target.value) || 15));
    e.target.value = String(v);
    patch({ secondsBlinkWithin: v });
  });
  document.getElementById('setting-window-minutes')?.addEventListener('change', (e) => {
    const v = Number(e.target.value) || 60;
    patch({ windowMinutes: v === 30 || v === 90 ? v : 60 });
  });
  document.getElementById('setting-rundown-mode')?.addEventListener('change', (e) => {
    const mode = e.target.value === 'flex' ? 'flex' : 'fixed';
    patch({ rundownMode: mode });
  });
  document.getElementById('setting-lookahead-minutes')?.addEventListener('change', (e) => {
    const raw = e.target.value;
    const v = raw === 'auto' ? 'auto' : Number(raw);
    patch({ lookaheadMinutes: v === 'auto' || [15, 30, 45, 60].includes(v) ? v : 'auto' });
  });
  document.getElementById('setting-lookahead-items')?.addEventListener('change', (e) => {
    patch({ lookaheadItems: Math.max(0, Number(e.target.value) || 0) });
  });
  document.getElementById('setting-cue-sound-id')?.addEventListener('change', (e) => {
    const id = SOUND_IDS.has(e.target.value) ? e.target.value : 'ping';
    patch({ cueAlertSoundId: id });
  });
  document.getElementById('btn-cue-sound-preview')?.addEventListener('click', () => {
    playCueSound(settings.cueAlertSoundId || 'ping');
  });
  document.getElementById('setting-web-port')?.addEventListener('change', (e) => {
    patch({ webInterfacePort: Number(e.target.value) || DEFAULT_SETTINGS.webInterfacePort });
  });
  document.getElementById('setting-osc-port')?.addEventListener('change', (e) => {
    patch({ oscPort: Number(e.target.value) || DEFAULT_SETTINGS.oscPort });
  });
  document.getElementById('setting-osc-host')?.addEventListener('change', (e) => {
    patch({ oscHost: e.target.value.trim() || DEFAULT_SETTINGS.oscHost });
  });
  document.getElementById('setting-osc-send-host')?.addEventListener('change', (e) => {
    patch({ oscSendHost: e.target.value.trim() || DEFAULT_SETTINGS.oscSendHost });
  });
  document.getElementById('setting-osc-send-port')?.addEventListener('change', (e) => {
    patch({ oscSendPort: Number(e.target.value) || DEFAULT_SETTINGS.oscSendPort });
  });
  document.getElementById('btn-settings-reset')?.addEventListener('click', () => {
    settings = saveSettings({ ...DEFAULT_SETTINGS });
    syncForm();
    applyChrome(settings);
    onChange?.(settings);
  });

  document.getElementById('btn-anchors-clear')?.addEventListener('click', () => {
    patch({ anchors: [] });
    renderAnchorsList();
    const note = document.getElementById('settings-anchors-note');
    if (note) note.textContent = 'Alle ankers gewist.';
  });

  document.getElementById('btn-anchors-fcu')?.addEventListener('click', () => {
    const ctx = getExportContext?.() || {};
    const cues = ctx.cues || [];
    const { anchors, added, matched } = applyFcuStandardAnchors(cues, settings.anchors);
    patch({ anchors });
    renderAnchorsList();
    const note = document.getElementById('settings-anchors-note');
    if (note) {
      note.textContent = matched
        ? `FCU-set: ${added} nieuw gelockt (${matched} match in draaiboek).`
        : 'Geen FCU-markers (−20/−10/−4/aftrap) in het geladen draaiboek.';
    }
    onChange?.(settings);
  });

  async function exportCues(format) {
    const note = document.getElementById('settings-export-note');
    const ctx = getExportContext?.() || {};
    const cues = ctx.cues || [];
    if (!cues.length) {
      if (note) note.textContent = 'Geen cues om te exporteren — laad eerst een bestand.';
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const base = (ctx.meta?.matchTitle || 'cues').replace(/[^\w\-]+/g, '_').slice(0, 40);
    const isJson = format === 'json';
    const content = isJson ? cuesToJson(cues, ctx.meta || {}) : cuesToCsv(cues);
    const res = await window.api?.saveText?.({
      title: isJson ? 'Export JSON' : 'Export CSV',
      defaultPath: `${base || 'cues'}_${stamp}.${isJson ? 'json' : 'csv'}`,
      filters: isJson
        ? [{ name: 'JSON', extensions: ['json'] }]
        : [{ name: 'CSV', extensions: ['csv'] }],
      content,
    });
    if (note) {
      if (res?.canceled) note.textContent = '';
      else if (res?.ok) note.textContent = `Opgeslagen: ${res.path}`;
      else note.textContent = res?.error || 'Export mislukt';
    }
  }

  document.getElementById('btn-export-json')?.addEventListener('click', () => exportCues('json'));
  document.getElementById('btn-export-csv')?.addEventListener('click', () => exportCues('csv'));

  document.getElementById('btn-osc-export-md')?.addEventListener('click', async () => {
    const version = document.getElementById('settings-version')?.textContent || '';
    const content = catalogToMarkdown(OSC_CATALOG, { version });
    const res = await window.api?.saveText?.({
      title: 'Export OSC.md',
      defaultPath: 'OSC.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      content,
    });
    const note = document.getElementById('settings-osc-note');
    if (note && res?.ok) note.textContent = `OSC.md opgeslagen: ${res.path}`;
  });

  document.getElementById('btn-web-copy-url')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-web-copy-url');
    const url = btn?.dataset.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      btn.textContent = 'Gekopieerd';
      setTimeout(() => {
        btn.textContent = 'Kopieer URL';
      }, 1200);
    } catch {
      btn.textContent = 'Kopieer mislukt';
    }
  });

  document.getElementById('settings-web-urls')?.addEventListener('click', (e) => {
    const a = e.target.closest('a.settings-web-url');
    if (!a) return;
    e.preventDefault();
    // Electron: open in system browser if available
    const href = a.getAttribute('href');
    if (href) window.open(href, '_blank');
  });

  applyChrome(settings);
  renderAnchorsList();
  syncOscServer();
  syncWebServer();

  return {
    get: () => settings,
    patch,
    open,
    close,
    applyChrome,
    renderAnchorsList,
    syncOscServer,
    syncWebServer,
  };
}

function setChecked(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = Boolean(value);
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
