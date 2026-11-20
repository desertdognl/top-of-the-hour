#!/usr/bin/env node
const path = require('path');
const { parseSpeakerFile } = require('../src/parser');

async function main() {
  const file =
    process.argv[2] ||
    path.join(__dirname, '..', 'examples', '11 FC Utrecht - SC Cambuur 2627.docx');
  console.log('Parsing', file);
  const result = await parseSpeakerFile(file);
  console.log('Meta:', result.meta);
  console.log('Cues:', result.cues.length);
  for (const c of result.cues.slice(0, 25)) {
    console.log(
      `- [${c.kind}] ${c.clockText || c.tMinusText || '—'} | ${c.title} | section=${c.section || ''}`
    );
  }
  if (result.cues.length > 25) console.log(`… +${result.cues.length - 25} more`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
