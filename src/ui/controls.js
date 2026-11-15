/**
 * Topbar controls — open file, offset, kickoff override, jump helpers.
 */

export function bindControls({
  onOpen,
  onLoadExample,
  onOffsetChange,
  onKickoffChange,
  onJumpNow,
  onJumpPrev,
}) {
  const openBtn = document.getElementById('btn-open');
  const exampleBtn = document.getElementById('btn-example');
  const jumpBtn = document.getElementById('btn-jump-now');
  const jumpPrevBtn = document.getElementById('btn-jump-prev');
  const offsetInput = document.getElementById('offset-min');
  const kickoffInput = document.getElementById('kickoff-override');
  const offsetMinus = document.getElementById('offset-minus');
  const offsetPlus = document.getElementById('offset-plus');

  openBtn?.addEventListener('click', () => onOpen());
  exampleBtn?.addEventListener('click', () => onLoadExample());
  jumpBtn?.addEventListener('click', () => onJumpNow());
  jumpPrevBtn?.addEventListener('click', () => onJumpPrev?.());

  offsetInput?.addEventListener('change', () => {
    onOffsetChange(Number(offsetInput.value) || 0);
  });

  offsetMinus?.addEventListener('click', () => {
    const v = (Number(offsetInput.value) || 0) - 1;
    offsetInput.value = String(v);
    onOffsetChange(v);
  });

  offsetPlus?.addEventListener('click', () => {
    const v = (Number(offsetInput.value) || 0) + 1;
    offsetInput.value = String(v);
    onOffsetChange(v);
  });

  const applyKickoff = () => onKickoffChange(kickoffInput.value.trim());
  kickoffInput?.addEventListener('change', applyKickoff);
  kickoffInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      kickoffInput.blur();
      applyKickoff();
    }
  });

  return {
    setOffset(minutes) {
      if (offsetInput) offsetInput.value = String(minutes);
    },
    setKickoff(hhmm) {
      if (kickoffInput) kickoffInput.value = hhmm || '';
    },
  };
}
