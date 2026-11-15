/**
 * OSC documentation page — renders exclusively from OSC_CATALOG.
 */

import { oscCatalogByGroup } from '../osc/catalog.js';

export function createOscDocsPage() {
  const page = document.getElementById('osc-docs-page');
  const list = document.getElementById('osc-docs-list');
  const logEl = document.getElementById('osc-docs-log');
  const statusEl = document.getElementById('osc-docs-status');

  function render() {
    if (!list) return;
    list.innerHTML = '';
    const groups = oscCatalogByGroup();
    for (const [group, cmds] of groups) {
      const section = document.createElement('section');
      section.className = 'osc-docs-section';
      section.innerHTML = `<h3>${escapeHtml(group)}</h3>`;
      const table = document.createElement('div');
      table.className = 'osc-docs-table';
      for (const cmd of cmds) {
        const row = document.createElement('article');
        row.className = 'osc-docs-row';
        row.dataset.direction = cmd.direction;
        row.innerHTML = `
          <div class="osc-docs-addr">
            <code>${escapeHtml(cmd.address)}</code>
            <span class="osc-dir osc-dir--${cmd.direction}">${cmd.direction === 'in' ? 'IN' : 'OUT'}</span>
          </div>
          <div class="osc-docs-args"><span>Args</span> ${escapeHtml(cmd.args || '—')}</div>
          <p class="osc-docs-desc">${escapeHtml(cmd.description)}</p>
          ${cmd.example ? `<div class="osc-docs-ex"><span>Voorbeeld</span> <code>${escapeHtml(cmd.example)}</code></div>` : ''}
        `;
        table.appendChild(row);
      }
      section.appendChild(table);
      list.appendChild(section);
    }
  }

  function open() {
    render();
    if (page) page.hidden = false;
    refreshStatus();
  }

  function close() {
    if (page) page.hidden = true;
  }

  function refreshStatus() {
    if (!statusEl || !window.api?.oscStatus) return;
    window.api.oscStatus().then((s) => {
      if (!s) {
        statusEl.textContent = 'OSC-status onbekend';
        return;
      }
      statusEl.textContent = s.running
        ? `Luistert op ${s.host}:${s.port}` +
          (s.sendEnabled ? ` · stuurt naar ${s.sendHost}:${s.sendPort}` : ' · geen status-uit')
        : 'OSC uit (zet aan in Instellingen)';
    });
  }

  function appendLog(entry) {
    if (!logEl) return;
    const line = document.createElement('div');
    line.className = 'osc-log-line' + (entry.result?.ok === false ? ' is-err' : '');
    const args = (entry.args || []).map((a) => JSON.stringify(a)).join(' ');
    const ok = entry.result?.ok === false ? ` ✗ ${entry.result.error}` : ' ✓';
    line.textContent = `${new Date(entry.at || Date.now()).toLocaleTimeString()}  ${entry.address} ${args}${ok}`;
    logEl.prepend(line);
    while (logEl.children.length > 40) logEl.lastChild.remove();
  }

  document.getElementById('btn-osc-docs')?.addEventListener('click', () => {
    document.getElementById('settings-page').hidden = true;
    open();
  });
  document.getElementById('btn-osc-docs-back')?.addEventListener('click', () => {
    close();
    document.getElementById('settings-page').hidden = false;
  });
  document.getElementById('btn-osc-docs-close')?.addEventListener('click', () => {
    close();
    document.getElementById('app')?.removeAttribute('hidden');
  });

  window.addEventListener('toth-osc-rx', (e) => appendLog(e.detail || {}));

  render();

  return { open, close, refreshStatus, render };
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
