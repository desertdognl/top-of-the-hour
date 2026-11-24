const fs = require('fs');
const path = require('path');
const { extractDocxRows } = require('./docx');
const { extractPdfRows } = require('./pdf');
const { rowsToCues } = require('./cues');
const { detectFormat } = require('./detect');

/**
 * Parse a speakerformat / run-of-show file (DOCX or PDF) into cues + meta.
 * Format (FCU t− vs absolute Start/Duur) wordt automatisch gedetecteerd.
 */
async function parseSpeakerFile(filePath, options = {}) {
  const ext = path.extname(filePath).toLowerCase();
  if (!fs.existsSync(filePath)) {
    throw new Error(`Bestand niet gevonden: ${filePath}`);
  }

  let rows;
  if (ext === '.docx') {
    rows = await extractDocxRows(filePath);
  } else if (ext === '.pdf') {
    rows = await extractPdfRows(filePath);
  } else {
    throw new Error(
      `Niet-ondersteund type: ${ext || '(geen extensie)'}. Gebruik .docx of .pdf`
    );
  }

  const { cues, meta } = rowsToCues(rows, options);
  return {
    rows,
    cues,
    meta,
    sourceType: ext.replace('.', ''),
  };
}

module.exports = {
  parseSpeakerFile,
  parseSpeakerFileAsync: parseSpeakerFile,
  rowsToCues,
  detectFormat,
};
