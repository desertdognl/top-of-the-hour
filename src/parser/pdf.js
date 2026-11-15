const fs = require('fs');
const path = require('path');

/**
 * Extract approximate table-like rows from a PDF.
 * Broad interpretation: group text items by Y, then split into columns by X gaps.
 */
async function extractPdfRows(input) {
  const buffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const pdf = await loadingTask.promise;

  const allRows = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items = content.items
      .filter((it) => it && typeof it.str === 'string' && it.str.trim())
      .map((it) => {
        const tx = it.transform || [1, 0, 0, 1, 0, 0];
        return {
          text: it.str,
          x: tx[4],
          y: tx[5],
          w: it.width || 0,
        };
      });

    const lines = clusterByY(items, 3);
    for (const line of lines) {
      const cells = splitLineIntoCells(line);
      if (cells.some(Boolean)) allRows.push(cells);
    }
  }

  return allRows;
}

async function loadPdfJs() {
  // pdfjs-dist v4 ESM/CJS interop
  try {
    return require('pdfjs-dist/legacy/build/pdf.js');
  } catch {
    const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
    return mod;
  }
}

function clusterByY(items, tolerance) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const item of sorted) {
    const line = lines.find((l) => Math.abs(l.y - item.y) <= tolerance);
    if (line) {
      line.items.push(item);
      line.y = (line.y * (line.items.length - 1) + item.y) / line.items.length;
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }
  return lines.map((l) => l.items.sort((a, b) => a.x - b.x));
}

function splitLineIntoCells(items) {
  if (!items.length) return [];
  // Heuristic: large X gaps → new column; also try 4-column buckets
  const gaps = [];
  for (let i = 1; i < items.length; i++) {
    gaps.push({ i, gap: items[i].x - (items[i - 1].x + items[i - 1].w) });
  }
  const sortedGaps = [...gaps].sort((a, b) => b.gap - a.gap);
  const splitIndexes = new Set(
    sortedGaps
      .filter((g) => g.gap > 24)
      .slice(0, 3)
      .map((g) => g.i)
  );

  if (!splitIndexes.size) {
    // single cell line
    return [items.map((it) => it.text).join(' ').replace(/\s+/g, ' ').trim()];
  }

  const cells = [];
  let current = [];
  items.forEach((it, idx) => {
    if (splitIndexes.has(idx) && current.length) {
      cells.push(current.map((x) => x.text).join(' ').replace(/\s+/g, ' ').trim());
      current = [];
    }
    current.push(it);
  });
  if (current.length) {
    cells.push(current.map((x) => x.text).join(' ').replace(/\s+/g, ' ').trim());
  }

  // Pad to 4 for speakerformat compatibility
  while (cells.length < 4) cells.push('');
  return cells.slice(0, 8);
}

module.exports = {
  extractPdfRows,
  clusterByY,
  splitLineIntoCells,
};
