/**
 * Chronological cue list — in-place highlight updates (no hover flicker).
 * Lock button marks wall-clock anchors (persisted across imports).
 *
 * Locked state is NOT part of the DOM structure key — toggling a lock
 * must not rebuild the list (that was resetting scroll and hiding the click).
 * Effective times (kickoff/timeshift) update in place each tick.
 */

export function createCueList(root, { onToggleLock } = {}) {
  let lastScrollId = null;
  let lastStructure = '';
  let latestCues = [];

  // One delegated handler — survives in-place updates / SVG swaps
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('.cue-lock');
    if (!btn || !root.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    const id = btn.getAttribute('data-lock-id');
    const cue = latestCues.find((c) => c.id === id);
    if (cue) onToggleLock?.(cue);
  });

  function structureKey(cues) {
    // Intentionally omit `locked` — lock toggles update in place
    return cues
      .map(
        (c) =>
          `${c.id}|${c.title}|${c.clockText || ''}|${c.tMinusText || ''}|${c.kind}|${c.section || ''}|${(c.speaker || c.screens || '').slice(0, 80)}`
      )
      .join('\n');
  }

  function render(cues, snap) {
    latestCues = cues || [];
    const currentId = snap.current && snap.current.id;
    const nextId = snap.next && snap.next.id;
    const nowMs = snap.nowMs;

    if (!cues.length) {
      if (root.dataset.empty !== '1') {
        root.innerHTML =
          '<div class="empty-state"><strong>Geen cues</strong>Open een speakerformat DOCX of PDF.</div>';
        root.dataset.empty = '1';
        lastStructure = '';
      }
      return;
    }
    root.dataset.empty = '0';

    const struct = structureKey(cues);
    if (struct !== lastStructure) {
      const frag = document.createDocumentFragment();
      for (const cue of cues) {
        const el = document.createElement('div');
        el.className = 'cue-item' + (cue.locked ? ' is-locked' : '');
        el.dataset.id = cue.id;
        const timeLabel =
          cue.clockText ||
          (cue.tMinusText ? cue.tMinusText : cue.kind === 'script' ? '↳' : '—');
        const lockTitle = cue.locked
          ? 'Wall-clock anker — klik om los te maken'
          : 'Vastzetten op wall-clock (anker)';
        el.innerHTML = `
          <div class="row">
            <button type="button" class="cue-lock${cue.locked ? ' is-on' : ''}" data-lock-id="${escapeAttr(cue.id)}" title="${escapeAttr(lockTitle)}" aria-label="${escapeAttr(lockTitle)}" aria-pressed="${cue.locked ? 'true' : 'false'}">${lockIconSvg(cue.locked)}</button>
            <span class="time">${escapeHtml(timeLabel)}</span>
            <span class="title">${escapeHtml(cue.title)}</span>
            <span class="kind">${escapeHtml(cue.kind)}</span>
          </div>
          ${cue.section ? `<div class="section">${escapeHtml(cue.section)}</div>` : ''}
          ${
            cue.speaker
              ? `<div class="speaker">${escapeHtml(cue.speaker)}</div>`
              : cue.screens
                ? `<div class="speaker">${escapeHtml(cue.screens)}</div>`
                : ''
          }
        `;
        frag.appendChild(el);
      }
      root.replaceChildren(frag);
      lastStructure = struct;
      lastScrollId = null;
    }

    const timed = snap.timed || [];
    const shifted = Boolean(snap.timeshiftActive);
    const lookaheadItems = Number(snap.lookaheadItems) || 0;
    const upcomingIds = new Set();
    if (lookaheadItems > 0) {
      timed
        .filter((t) => t.effectiveMs > nowMs)
        .slice(0, lookaheadItems)
        .forEach((t) => upcomingIds.add(t.id));
      if (currentId) upcomingIds.add(currentId);
    }

    for (const el of root.querySelectorAll('.cue-item')) {
      const id = el.dataset.id;
      const cue = cues.find((c) => c.id === id);
      const timedCue = timed.find((t) => t.id === id);
      const effective = timedCue?.effectiveMs ?? (cue && cue.atMs);
      const isFuture = effective != null && effective > nowMs;

      el.classList.toggle('current', id === currentId);
      el.classList.toggle('next', id === nextId);
      el.classList.toggle('is-locked', Boolean(cue?.locked));
      el.classList.toggle(
        'past',
        id !== currentId && id !== nextId && effective != null && effective < nowMs
      );
      el.classList.toggle(
        'is-shifting',
        shifted && Boolean(cue) && cue.atMs != null && !cue.locked
      );
      el.classList.toggle(
        'is-anchored-stay',
        shifted && Boolean(cue?.locked)
      );
      el.classList.toggle(
        'beyond-lookahead',
        lookaheadItems > 0 && isFuture && !upcomingIds.has(id)
      );

      const timeEl = el.querySelector('.time');
      if (timeEl && cue) {
        applyTimeLabel(timeEl, cue, effective);
      }

      const lockBtn = el.querySelector('.cue-lock');
      if (lockBtn && cue) {
        const wantOn = Boolean(cue.locked);
        if (lockBtn.classList.contains('is-on') !== wantOn) {
          lockBtn.innerHTML = lockIconSvg(wantOn);
          lockBtn.classList.toggle('is-on', wantOn);
          lockBtn.setAttribute('aria-pressed', wantOn ? 'true' : 'false');
          lockBtn.title = wantOn
            ? 'Wall-clock anker — klik om los te maken'
            : 'Vastzetten op wall-clock (anker)';
        }
      }
    }

    // Altijd vorige + huidige in beeld (huidige als 2e rij wanneer beide passen)
    const focusId = currentId || nextId;
    if (focusId) {
      const node = root.querySelector(`[data-id="${CSS.escape(focusId)}"]`);
      if (node) {
        const force = focusId !== lastScrollId;
        if (force || !arePrevAndCurrentVisible(root, node)) {
          // Na DOM-rebuild eerst layout laten settelen
          requestAnimationFrame(() => {
            ensurePrevAndCurrentVisible(root, node, { smooth: force });
          });
        }
        lastScrollId = focusId;
      }
    }
  }

  return {
    render,
    invalidate() {
      lastStructure = '';
      lastScrollId = null;
    },
  };
}

function contentOffsetTop(root, el) {
  const er = el.getBoundingClientRect();
  const rr = root.getBoundingClientRect();
  return er.top - rr.top + root.scrollTop;
}

function arePrevAndCurrentVisible(root, currentNode) {
  if (!root?.clientHeight) return true;
  const prev =
    currentNode.previousElementSibling && root.contains(currentNode.previousElementSibling)
      ? currentNode.previousElementSibling
      : null;
  const pad = 4;
  const topNode = prev || currentNode;
  const topY = contentOffsetTop(root, topNode);
  const bottomY = contentOffsetTop(root, currentNode) + currentNode.offsetHeight;
  const viewTop = root.scrollTop + pad;
  const viewBottom = root.scrollTop + root.clientHeight - pad;
  return topY >= viewTop - 1 && bottomY <= viewBottom + 1;
}

/**
 * Houd vorige + huidige zichtbaar. Past beide → vorige bovenaan.
 * Past niet → huidige volledig in beeld (zoveel mogelijk van vorige mee).
 */
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

  let nextTop;
  if (span <= root.clientHeight) {
    nextTop = topY;
  } else {
    nextTop = curBottom - root.clientHeight;
  }
  nextTop = Math.max(0, Math.min(nextTop, maxScroll));
  if (Math.abs(root.scrollTop - nextTop) < 2) return;
  root.scrollTo({ top: nextTop, behavior: smooth ? 'smooth' : 'auto' });
}

function applyTimeLabel(timeEl, cue, effectiveMs) {
  const planned =
    cue.clockText ||
    (cue.tMinusText ? cue.tMinusText : cue.kind === 'script' ? '↳' : '—');
  const shifted =
    effectiveMs != null && cue.atMs != null && effectiveMs !== cue.atMs;

  if (effectiveMs != null && cue.atMs != null) {
    const hm = formatHm(effectiveMs);
    timeEl.textContent = hm;
    timeEl.classList.toggle('is-shifted', shifted);
    timeEl.title = shifted
      ? `Aangepast · planning ${planned || formatHm(cue.atMs)} → ${hm}`
      : planned && planned !== hm
        ? planned
        : '';
  } else {
    timeEl.textContent = planned;
    timeEl.classList.remove('is-shifted');
    timeEl.title = '';
  }
}

function formatHm(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

function lockIconSvg(locked) {
  if (locked) {
    return `<svg class="lock-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-7-2a2 2 0 1 1 4 0v2h-4V7zm3 8.7V18h-2v-2.3a1.5 1.5 0 1 1 2 0z"/></svg>`;
  }
  return `<svg class="lock-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 9h-1V7a4 4 0 0 0-7.7-1.5l1.6 1.2A2 2 0 0 1 14 7v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-4 8.7V18h-2v-2.3a1.5 1.5 0 1 1 2 0z"/></svg>`;
}
