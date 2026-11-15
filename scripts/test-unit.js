#!/usr/bin/env node
/**
 * Unit tests (CJS) — normalize + wiel-hoekformule + anker-key helper.
 * Run: npm run test:unit
 */

const assert = require('assert');
const {
  parseClockTime,
  parseTMinus,
  normalizeTMinusText,
  formatTMinusText,
  collapseSpaces,
} = require('../src/parser/normalize');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('normalize');
test('parseClockTime 18:45', () => {
  assert.deepStrictEqual(parseClockTime('18:45'), { hours: 18, minutes: 45 });
});
test('parseClockTime 18.45 uur', () => {
  assert.deepStrictEqual(parseClockTime('18.45 uur'), { hours: 18, minutes: 45 });
});
test('parseTMinus 0h 20m', () => {
  assert.strictEqual(parseTMinus('0h 20m'), 20 * 60);
});
test('parseTMinus 0h 20 m → same seconds', () => {
  assert.strictEqual(parseTMinus('0h 20 m'), 20 * 60);
});
test('parseTMinus 0h 4 5 m (OCR) → 45m', () => {
  assert.strictEqual(parseTMinus('0h 4 5 m'), 45 * 60);
});
test('normalizeTMinusText 0h 20 m', () => {
  assert.strictEqual(normalizeTMinusText('0h 20 m'), '0h 20m');
});
test('normalizeTMinusText 0h 4 5 m', () => {
  assert.strictEqual(normalizeTMinusText('0h 4 5 m'), '0h 45m');
});
test('normalizeTMinusText 20m → 0h 20m', () => {
  assert.strictEqual(normalizeTMinusText('20m'), '0h 20m');
});
test('normalizeTMinusText RUST untouched', () => {
  assert.strictEqual(normalizeTMinusText('RUST'), 'RUST');
});
test('formatTMinusText 90m', () => {
  assert.strictEqual(formatTMinusText(90 * 60), '1h 30m');
});
test('collapseSpaces nbsp', () => {
  assert.strictEqual(collapseSpaces('a\u00a0 b'), 'a b');
});

/** Mirrors src/clock/engine.js cueAngleRadians (NOW at top). */
function cueAngleRadians(effectiveMs, nowMs, lookbackMs, windowMs) {
  const offset = effectiveMs - nowMs;
  const min = -lookbackMs;
  const max = windowMs - lookbackMs;
  const clamped = Math.min(max, Math.max(min, offset));
  return -Math.PI / 2 + (clamped / windowMs) * Math.PI * 2;
}

console.log('clock angle');
test('NOW at top (−π/2)', () => {
  const now = 1_000_000;
  const a = cueAngleRadians(now, now, 10 * 60 * 1000, 60 * 60 * 1000);
  assert.ok(Math.abs(a - -Math.PI / 2) < 1e-9, `got ${a}`);
});
test('+15m is +quarter turn from NOW', () => {
  const now = 1_000_000;
  const a = cueAngleRadians(now + 15 * 60 * 1000, now, 10 * 60 * 1000, 60 * 60 * 1000);
  const expected = -Math.PI / 2 + 0.25 * Math.PI * 2;
  assert.ok(Math.abs(a - expected) < 1e-9, `got ${a}`);
});

/** Mirrors durableAnchorKey / findAnchor soft-match from anchors.js */
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
function durableAnchorKey(cue) {
  const tm = norm(cue.tMinusText);
  const kind = norm(cue.kind) || 'action';
  if (tm) return `tm:${tm}|k:${kind}`;
  return `t:${norm(cue.title)}|s:${norm(cue.section)}|k:${kind}`;
}
function findAnchor(anchors, cue) {
  const key = durableAnchorKey(cue);
  const exact = anchors.find((a) => a.key === key);
  if (exact) return exact;
  const tm = norm(cue.tMinusText);
  if (!tm) return null;
  const kind = norm(cue.kind) || 'action';
  return anchors.find((a) => norm(a.tMinusText) === tm && (norm(a.kind) || 'action') === kind) || null;
}

console.log('anchors');
test('normalized t− share the same durable key', () => {
  const a = durableAnchorKey({ tMinusText: normalizeTMinusText('0h 20 m'), kind: 'timed' });
  const b = durableAnchorKey({ tMinusText: normalizeTMinusText('0h 20m'), kind: 'timed' });
  assert.strictEqual(a, b);
});
test('findAnchor soft-rematch on t−', () => {
  const cue = { tMinusText: '0h 20m', kind: 'timed', title: 'Keepers AZ' };
  const anchors = [
    { key: 'tm:0h 20m|k:timed', tMinusText: '0h 20m', kind: 'timed', title: 'Keepers Fey' },
  ];
  assert.ok(findAnchor(anchors, cue));
});

/** Mirrors timeshiftDeltaForItems gap pick (unlocked only). */
function timeshiftDeltaForItems(cues, syncState, nowMs, itemDelta) {
  const n = Math.round(Number(itemDelta) || 0);
  if (!n) return 0;
  // simplify: base times = atMs (no kickoff in unit fixture)
  const base = cues
    .filter((c) => c.atMs != null && !c.locked)
    .map((c) => ({ ms: c.atMs }))
    .sort((a, b) => a.ms - b.ms);
  if (base.length < 2) return 0;
  const flex = cues
    .filter((c) => c.atMs != null && !c.locked)
    .map((c) => ({ ms: c.atMs + (Number(syncState.timeshiftMs) || 0) }))
    .sort((a, b) => a.ms - b.ms);
  let i = 0;
  for (let k = 0; k < flex.length; k++) if (flex[k].ms <= nowMs) i = k;
  const from = Math.max(0, Math.min(base.length - 1, i));
  const to = Math.max(0, Math.min(base.length - 1, from + n));
  if (from === to) return 0;
  return base[to].ms - base[from].ms;
}

console.log('timeshift items');
test('+1 cue uses gap to next unlocked', () => {
  const cues = [
    { atMs: 1000, locked: false },
    { atMs: 5000, locked: true },
    { atMs: 9000, locked: false },
  ];
  const delta = timeshiftDeltaForItems(cues, { timeshiftMs: 0 }, 1000, 1);
  assert.strictEqual(delta, 8000); // 9000 − 1000 (skips locked for index among unlocked)
});

console.log(`\n${passed} assertions ok`);
process.exit(process.exitCode || 0);
