const fs = require('fs');
const JSZip = require('jszip');

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function localName(node) {
  return (node.localName || node.nodeName || '').replace(/^.*:/, '');
}

/**
 * Extract table rows from a DOCX buffer/path as string[][].
 * Also flattens non-table paragraphs as single-cell rows (section headers).
 */
async function extractDocxRows(input) {
  const buffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');

  // Prefer DOMParser in renderer; in Node use a minimal regex/XML walk via xml2-free approach
  const rows = parseDocumentXml(xml);
  return rows;
}

function parseDocumentXml(xml) {
  // Lightweight tag walker — enough for Word table cells + paragraphs
  const rows = [];

  // Split on table rows
  const trRegex = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
  let trMatch;
  let foundTable = false;
  while ((trMatch = trRegex.exec(xml))) {
    foundTable = true;
    const trXml = trMatch[1];
    const cells = [];
    const tcRegex = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
    let tcMatch;
    while ((tcMatch = tcRegex.exec(trXml))) {
      cells.push(extractText(tcMatch[1]));
    }
    if (cells.some((c) => c.trim())) rows.push(cells);
  }

  if (foundTable && rows.length) return rows;

  // Fallback: paragraphs
  const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let pMatch;
  while ((pMatch = pRegex.exec(xml))) {
    const text = extractText(pMatch[1]).trim();
    if (text) rows.push([text]);
  }
  return rows;
}

function extractText(fragmentXml) {
  const parts = [];
  const tRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  let m;
  while ((m = tRegex.exec(fragmentXml))) {
    parts.push(decodeXml(m[1]));
  }
  // Word often splits words across runs without an explicit space run
  let out = '';
  for (const part of parts) {
    if (!part) continue;
    if (
      out &&
      !/\s$/.test(out) &&
      !/^\s/.test(part) &&
      /[A-Za-zÀ-ÿ0-9]$/.test(out) &&
      /^[A-Za-zÀ-ÿ0-9(]/.test(part)
    ) {
      out += ' ';
    }
    out += part;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function decodeXml(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractDocxRowsSync(filePath) {
  // JSZip is async; provide sync wrapper via deasync-free approach:
  // use child-process free blocking with sync unzip via adm — we stick to async in index.
  // For main process we use async parseSpeakerFile.
  throw new Error('Use extractDocxRows (async)');
}

module.exports = {
  extractDocxRows,
  parseDocumentXml,
  W_NS,
  localName,
  extractDocxRowsSync,
};
