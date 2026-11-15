/**
 * Render OSC catalog as Markdown (Companion-friendly reference).
 */

export function catalogToMarkdown(catalog, { version = '' } = {}) {
  const lines = [
    '# Top of the Hour — OSC',
    '',
    version ? `Versie: ${version}` : '',
    version ? '' : null,
    'Gegenereerd vanuit `src/osc/catalog.js` (single source of truth).',
    '',
  ].filter((l) => l != null);

  const byGroup = new Map();
  for (const cmd of catalog || []) {
    if (!byGroup.has(cmd.group)) byGroup.set(cmd.group, []);
    byGroup.get(cmd.group).push(cmd);
  }

  for (const [group, cmds] of byGroup) {
    lines.push(`## ${group}`, '');
    for (const c of cmds) {
      lines.push(`### \`${c.address}\``);
      lines.push('');
      lines.push(`- **Richting:** ${c.direction}`);
      lines.push(`- **Args:** ${c.args || '—'}`);
      lines.push(`- **Beschrijving:** ${c.description || ''}`);
      if (c.example) lines.push(`- **Voorbeeld:** \`${c.example}\``);
      lines.push('');
    }
  }
  return `${lines.join('\n').trim()}\n`;
}
