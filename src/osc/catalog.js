/**
 * OSC command catalog — SINGLE SOURCE OF TRUTH.
 *
 * Regel (project):
 * - Nieuwe app-functie → voeg hier een OSC-adres toe (+ handler in bridge).
 * - Functie verdwijnt → verwijder hier én in de bridge.
 * - De OSC-documentatiepagina rendert uitsluitend uit deze lijst.
 *
 * direction: 'in' = ontvangen door de app, 'out' = status die de app kan sturen
 */

/** @typedef {{ address: string, direction: 'in'|'out', group: string, args: string, description: string, example?: string }} OscCommand */

/** @type {OscCommand[]} */
export const OSC_CATALOG = [
  // —— Fase ——
  {
    address: '/toth/phase',
    direction: 'in',
    group: 'Fase',
    args: 's: pre | match | rust | post',
    description: 'Wissel naar een fase (Voorprogramma / Wedstrijd / Rust / Na de wedstrijd).',
    example: '/toth/phase rust',
  },
  {
    address: '/toth/phase/start',
    direction: 'in',
    group: 'Fase',
    args: '(optioneel) s: rust | post',
    description: 'Start de handmatige klok van de huidige (of opgegeven) manual-fase.',
    example: '/toth/phase/start',
  },
  {
    address: '/toth/phase/pause',
    direction: 'in',
    group: 'Fase',
    args: '(optioneel) s: rust | post',
    description: 'Pauzeer de handmatige faseklok.',
  },
  {
    address: '/toth/phase/reset',
    direction: 'in',
    group: 'Fase',
    args: '(optioneel) s: rust | post',
    description: 'Reset handmatige faseklok en item-index.',
  },
  {
    address: '/toth/phase/next',
    direction: 'in',
    group: 'Fase',
    args: '—',
    description: 'Ga naar de volgende fase (pre → match → rust → post, wrap).',
  },
  {
    address: '/toth/phase/prev',
    direction: 'in',
    group: 'Fase',
    args: '—',
    description: 'Ga naar de vorige fase (wrap).',
  },
  {
    address: '/toth/item/next',
    direction: 'in',
    group: 'Fase',
    args: '—',
    description: 'Volgend item binnen de huidige manual-fase (Rust / Post).',
  },
  {
    address: '/toth/item/prev',
    direction: 'in',
    group: 'Fase',
    args: '—',
    description: 'Vorig item binnen de huidige manual-fase.',
  },

  // —— Timeline / cues ——
  {
    address: '/toth/cue/done',
    direction: 'in',
    group: 'Timeline',
    args: '—',
    description: 'Markeer huidige cue als klaar (of volgende item in manual-fase).',
  },
  {
    address: '/toth/cue/snooze',
    direction: 'in',
    group: 'Timeline',
    args: '(optioneel) i/f: minuten (default 1)',
    description: 'Snooze huidige/next cue N minuten (wall-clock), of next item in manual-fase.',
    example: '/toth/cue/snooze 2',
  },
  {
    address: '/toth/cue/jump',
    direction: 'in',
    group: 'Timeline',
    args: '(optioneel) i/f: seconden lead (default 30)',
    description: 'Zet test-offset zodat de volgende timed cue over N seconden start.',
    example: '/toth/cue/jump 30',
  },
  {
    address: '/toth/cue/next',
    direction: 'in',
    group: 'Timeline',
    args: '—',
    description: 'Ga naar volgend timed item als current (test-offset; zelfde als wiel next).',
  },
  {
    address: '/toth/cue/prev',
    direction: 'in',
    group: 'Timeline',
    args: '—',
    description: 'Ga naar vorig timed item als current (test-offset; zelfde als wiel prev).',
  },
  {
    address: '/toth/cue/goto',
    direction: 'in',
    group: 'Timeline',
    args: 'i: index (0-based in timed cues van actieve fase)',
    description: 'Spring naar timed cue op index als current (via test-offset).',
    example: '/toth/cue/goto 3',
  },
  {
    address: '/toth/cue/anchor',
    direction: 'in',
    group: 'Timeline',
    args: '—',
    description: 'Spring naar volgend locked anker (test-offset; zelfde als Test → Naar anker / toets A).',
  },

  // —— Ankers ——
  {
    address: '/toth/anchor/toggle',
    direction: 'in',
    group: 'Ankers',
    args: 's: cue-id  óf  (geen arg = huidige cue)',
    description: 'Toggle wall-clock anker (slotje) voor cue-id of huidige cue.',
    example: '/toth/anchor/toggle cue-13',
  },
  {
    address: '/toth/anchor/lock',
    direction: 'in',
    group: 'Ankers',
    args: 's: cue-id',
    description: 'Zet anker aan voor gegeven cue-id (no-op als al gelockt).',
  },
  {
    address: '/toth/anchor/unlock',
    direction: 'in',
    group: 'Ankers',
    args: 's: cue-id',
    description: 'Zet anker uit voor gegeven cue-id.',
  },
  {
    address: '/toth/anchor/clear',
    direction: 'in',
    group: 'Ankers',
    args: '—',
    description: 'Wis alle bewaarde ankers uit settings.',
  },

  // —— Timeshift / flex ——
  {
    address: '/toth/timeshift',
    direction: 'in',
    group: 'Timeshift',
    args: 'i/f: minuten (negatief = inloop)',
    description: 'Pas flex-timeshift toe (±min). Alleen in Flex-modus; locked ankers blijven staan.',
    example: '/toth/timeshift 5',
  },
  {
    address: '/toth/timeshift/set',
    direction: 'in',
    group: 'Timeshift',
    args: 'i/f: absolute minuten',
    description: 'Zet timeshift absoluut (0 = op schema).',
  },
  {
    address: '/toth/timeshift/items',
    direction: 'in',
    group: 'Timeshift',
    args: 'i: aantal cues (±)',
    description: 'Shift unlocked cues met ±N items (gaps tussen unlocked). Alleen Flex.',
    example: '/toth/timeshift/items 2',
  },
  {
    address: '/toth/timeshift/reset',
    direction: 'in',
    group: 'Timeshift',
    args: '—',
    description: 'Reset timeshift naar 0 (op schema).',
  },
  {
    address: '/toth/mode',
    direction: 'in',
    group: 'Timeshift',
    args: 's: fixed | flex',
    description: 'Zet draaiboek-modus (vast wall-clock vs flexibel timeshift).',
    example: '/toth/mode flex',
  },
  {
    address: '/toth/lookahead',
    direction: 'in',
    group: 'Timeshift',
    args: 'i/s: minuten of "auto"',
    description: 'Zet hoe ver het wiel vooruit kijkt (15/30/45/60 of auto).',
    example: '/toth/lookahead 30',
  },
  {
    address: '/toth/lookahead/items',
    direction: 'in',
    group: 'Timeshift',
    args: 'i: aantal (0 = onbeperkt)',
    description: 'Dim timeline-cues verder dan de volgende N items.',
    example: '/toth/lookahead/items 5',
  },

  // —— Test / sync ——
  {
    address: '/toth/offset',
    direction: 'in',
    group: 'Test',
    args: 'i/f: minuten',
    description: 'Zet test-offset absoluut (rode Test-balk; ≠ timeshift).',
  },
  {
    address: '/toth/offset/add',
    direction: 'in',
    group: 'Test',
    args: 'i/f: delta minuten',
    description: 'Tel minuten op bij de huidige test-offset.',
  },
  {
    address: '/toth/offset/reset',
    direction: 'in',
    group: 'Test',
    args: '—',
    description: 'Reset test-offset naar 0.',
  },
  {
    address: '/toth/kickoff',
    direction: 'in',
    group: 'Test',
    args: 's: HH:MM  of leeg = wis override',
    description: 'Kickoff-override (verschuift alle cues t.o.v. geparste aanvang).',
    example: '/toth/kickoff 18:45',
  },

  // —— Bestanden ——
  {
    address: '/toth/file/open',
    direction: 'in',
    group: 'Bestand',
    args: '—',
    description: 'Open bestandsdialoog voor speakerformat (DOCX/PDF).',
  },
  {
    address: '/toth/file/example',
    direction: 'in',
    group: 'Bestand',
    args: '—',
    description: 'Laad het ingebouwde voorbeeldbestand.',
  },

  // —— Views ——
  {
    address: '/toth/view/regie',
    direction: 'in',
    group: 'Views',
    args: '(optioneel) i: 1=aan 0=uit  (geen arg = toggle)',
    description: 'Regie-modus (fullscreen + chrome auto-hide).',
  },
  {
    address: '/toth/view/window',
    direction: 'in',
    group: 'Views',
    args: 'i: 30 | 60 | 90',
    description: 'Zoom van het programmawiel-venster in minuten.',
    example: '/toth/view/window 30',
  },
  {
    address: '/toth/settings',
    direction: 'in',
    group: 'Views',
    args: 'i: 1=open 0=dicht',
    description: 'Open of sluit de instellingenpagina.',
  },

  // —— Remote web ——
  {
    address: '/toth/web',
    direction: 'in',
    group: 'Web',
    args: 'i: 1=aan 0=uit  (geen arg = status)',
    description: 'Schakel de LAN webinterface in/uit, of vraag status op.',
    example: '/toth/web 1',
  },
  {
    address: '/toth/web/port',
    direction: 'in',
    group: 'Web',
    args: 'i: poort',
    description: 'Zet de webinterface-poort (herstart server indien actief).',
    example: '/toth/web/port 8787',
  },

  // —— Outbound status ——
  {
    address: '/toth/out/phase',
    direction: 'out',
    group: 'Status (uit)',
    args: 's: phase-id',
    description: 'Huidige fase (pre/match/rust/post). Periodiek of bij wissel.',
  },
  {
    address: '/toth/out/current',
    direction: 'out',
    group: 'Status (uit)',
    args: 's: title, s: cue-id',
    description: 'Huidige cue-titel en id.',
  },
  {
    address: '/toth/out/next',
    direction: 'out',
    group: 'Status (uit)',
    args: 's: title, s: cue-id',
    description: 'Volgende cue-titel en id.',
  },
  {
    address: '/toth/out/seconds',
    direction: 'out',
    group: 'Status (uit)',
    args: 'f: seconds-to-next (−1 als geen)',
    description: 'Seconden tot volgende timed cue.',
  },
  {
    address: '/toth/out/timeshift',
    direction: 'out',
    group: 'Status (uit)',
    args: 'f: minutes',
    description: 'Huidige timeshift in minuten (0 = op schema).',
  },
  {
    address: '/toth/out/mode',
    direction: 'out',
    group: 'Status (uit)',
    args: 's: fixed | flex',
    description: 'Huidige draaiboek-modus.',
  },
  {
    address: '/toth/out/regie',
    direction: 'out',
    group: 'Status (uit)',
    args: 'i: 0|1',
    description: 'Of regie-modus actief is.',
  },
  {
    address: '/toth/out/web',
    direction: 'out',
    group: 'Status (uit)',
    args: 'i: 0|1, i: poort, s: url',
    description: 'Of de webinterface draait, poort, en primaire LAN-URL.',
  },
];

export function oscCatalogByGroup() {
  const map = new Map();
  for (const cmd of OSC_CATALOG) {
    if (!map.has(cmd.group)) map.set(cmd.group, []);
    map.get(cmd.group).push(cmd);
  }
  return map;
}

export function oscInboundAddresses() {
  return OSC_CATALOG.filter((c) => c.direction === 'in').map((c) => c.address);
}
