# Changelog

Alle noemenswaardige wijzigingen aan Top of the Hour.

Formaat gebaseerd op [Keep a Changelog](https://keepachangelog.com/nl/1.1.0/).
Versienummering volgt [Semantic Versioning](https://semver.org/lang/nl/).

> Bij elke wijziging: werk **`CHANGELOG.md`**, **`VERSION`** en **`package.json`** bij.

## [1.0.3] — 2026-11-20

### Gefixt — Parsing
- Kloktijden met OCR-spatie (`1 8:45` → `18:45`); bij conflict wint t−+kickoff (Cambuur-voorbeeld)
- Standaardvoorbeeld: `examples/11 FC Utrecht - SC Cambuur 2627.docx`

## [1.0.2] — 2026-11-15

### Gefixt
- Wiel-kwartieren: labels zijn +15/+30/+45 (hele window), niet meer afgeleid van lookback (+13/+26)

## [1.0.1] — 2026-11-15

### Gefixt / verbeterd — Remote webview
- Secondentimer toont cijfers in de cirkel (zoals de app)
- Centrumklok rood + groter; NOW/+Nm labels duidelijker; 5‑min ticks sterker
- Itemnamen in pie-segmenten; kleuren volgen app-settings (multicolor/duo/sectie)
- Timeline scrollt mee met current (2e rij); scrollbar verborgen
- Topbar weg; fase + Flex in één compacte chrome-balk

## [1.0.0] — 2026-11-15

Eerste publieke release.

### Toegevoegd
- DesertDog-logo (splash) opent https://desertdog.nl
- macOS DMG-installer (`npm run build:dmg`)

### Gewijzigd
- Versie gemarkeerd als publicatie-klaar

## [0.9.6] — 2026-11-14

### Gewijzigd — Remote webview
- Browser-view spiegelt nu de **app-layout**: topbar, secondenpaneel, programmawiel, timeline
- Live wheel-snapshot + anker-dots; gedeelde theme-tokens; views Volledig / Focus / Lijst

## [0.9.5] — 2026-11-14

### Toegevoegd
- **Notification sounds**: ping / dubbele beep / pulse / horn / chime — keuze + preview in Instellingen (onthouden)
- Sneltoetsen: **D** klaar · **S** snooze · **A** volgend anker · **F** regie
- Testbalk: **Naar anker** (+ OSC `/toth/cue/anchor`)
- Regie: optioneel **timeline verbergen** (wiel + now + anker-dots blijven)

### Gefixt
- “Naar rundown” respecteert kickoff/timeshift (`effectiveCueMs`)
- Wedstrijd-fase: Klaar/Snooze + OSC-status werkten niet
- Dubbele Done/Snooze vóór volgende tick mikte op hetzelfde item
- Kickoff via OSC/API: override-UI + header-label synchroon; base-kickoff ontbrak soms
- Settings-formulier bleef stale na topbar/OSC (modus / lookahead)
- Timeshift-hint telde alle fases; snooze volgt nu de effectieve (demo-)klok

## [0.9.4] — 2026-11-14

### Toegevoegd — Timeshift / flex
- Shift in **aantal cues** (−2c/−1c/+1c/+2c) op de Flex-balk + OSC `/toth/timeshift/items`
- **Lookahead** instelbaar: tijd (auto/15–60m) en aantal items (dimt timeline) + OSC
- Snelle **Vast ↔ Flex**-toggle in de topbar (onthouden in settings)
- Preview bij shift: hint “N schuiven · M ankers vast”, lijst-classes, blauwe ghost-pips op het wiel

## [0.9.3] — 2026-11-14

### Gefixt
- Ankerteller in de topbalk bleef hangen na laden; telt nu mee bij elke lock-/ankerwijziging

## [0.9.2] — 2026-11-14

### Toegevoegd
- Export cues als **JSON/CSV** (Instellingen → Export)
- **FCU-anker-set** (−20/−10/−4/aftrap) één-klik in Instellingen
- Locked ankers als gele markering op het **programmawiel**
- OSC: `/toth/cue/goto` (index); **Export OSC.md** vanuit Instellingen
- `npm run build:dmg` voor macOS DMG

## [0.9.1] — 2026-11-14

### Gewijzigd
- Timeline: huidige cue met sterkere outline/glow; scroll zet current als 2e zichtbare rij

## [0.9.0] — 2026-11-14

### Toegevoegd — Parsing / sync
- t−-labels genormaliseerd bij parse (`0h 20 m` / `0h 4 5 m` → `0h 20m` / `0h 45m`) voor stabielere ankers
- Unit tests: `npm run test:unit` (normalize, wiel-hoeken, ankers)

### Toegevoegd — OSC (bij feature gehouden)
- `/toth/cue/next` · `/toth/cue/prev` (zelfde als wiel-navigatie)
- `/toth/web` · `/toth/web/port` · `/toth/out/web`

### Gefixt
- Bestand-hover tip valt niet meer achter demo-/fasebalk (hogere z-index)

### Docs
- README: remote webview + macOS-firewall-hint

## [0.8.1] — 2026-11-14

### Gefixt
- Programmawiel: NOW-wijzer en segmenten waren uit fase (lookback stond bovenaan i.p.v. nu) → “lege” gekleurde blokken; segmenten lopen nu vanaf de wijzer met de echte restduur

## [0.8.0] — 2026-11-14

### Toegevoegd — Remote webview
- Ingebouwde HTTP-server (Instellingen → Webinterface, poort, LAN-URL’s + kopieer)
- Browser-view met live SSE-sync: focus + timeline (views: volledig / focus / lijst)
- Read-only volgscherm via `http://<IP>:<poort>`

### Gewijzigd
- Settings-blokken packen dicht (column-flow, geen lege rij-hoogte naast lange buren)

## [0.7.8] — 2026-11-14

### Gewijzigd
- Wiel-markers duidelijker: track-ring, langere/contrastvollere 1-/5-/kwart-ticks, grotere `+15m`-labels

## [0.7.7] — 2026-11-14

### Gefixt
- Wiel **prev/next** stappen nu echt van item naar item (item wordt current bovenaan), ook vóór de geplande tijd via test-offset

## [0.7.6] — 2026-11-14

### Gewijzigd — Topbar / navigatie
- Compactere topbar: map-/fullscreen-/tandwiel-iconen; Offset + Kickoff naast elkaar
- Lange wedstrijdtitel ellipsist (bijv. FC Utrecht – Heracles Almelo)
- Fase in lijstkop: `Timeline: Voorprogramma` (kleur per fase)
- Fase-nav: `< prev` / `next >`
- Cue-jump in wielhoeken: links `< prev`, rechts `next >`

## [0.7.5] — 2026-11-14

### Gefixt
- Programmawiel te klein bij start: resize na splash/fonts + ResizeObserver op het panel (niet meer wachten op testmodus-toggle)

## [0.7.4] — 2026-11-14

### Gewijzigd
- Cue-lijst toont **effectieve** tijden bij kickoff/timeshift (blauw = aangepast; hover = planning → nieuw)
- Header-laadtijd korter (`↓HH:MM`); hover-tip met bestandsnaam, pad en volledige laadtijd (eigen tip i.p.v. native title)

## [0.7.3] — 2026-11-14

### Gewijzigd
- Header toont laadtijd i.p.v. bestandsnaam; hover toont bestandsnaam/pad

## [0.7.2] — 2026-11-14

### Gewijzigd
- Kickoff-veld toont planning-aanvang; afwijkende `HH:MM` + Enter verschuift het draaiboek (geel = override actief)

## [0.7.1] — 2026-11-14

### Gewijzigd
- **Naar volgende** staat weer naast Open (niet meer in de offset-tools)
- **Voorbeeld** via hover op Open bestand (flyout), geen losse knop meer

## [0.7.0] — 2026-11-14

### Toegevoegd — OSC
- UDP OSC-server (Instellingen: host/poort, optioneel status-uit)
- Catalogus `src/osc/catalog.js` als enige bron; docs-pagina vanuit Instellingen
- Commando’s o.a. fase set/next/prev, item next/prev, cues, ankers, timeshift, file, regie, window
- Live OSC-log op de docs-pagina

### Toegevoegd — Fase-UI
- Badge “Fase …” in de topbar (kleur per fase)
- Knoppen **← Fase** / **Fase →** naast de fase-tabs

## [0.6.0] — 2026-11-14

### Toegevoegd — Timeshift / flex draaiboek
- Moduskeuze in Instellingen: **Vast** vs **Flexibel**
- Gele **Flex**-balk: ±1/5 min timeshift, reset, indicator (inloop/uitloop / op schema)
- Locked ankers schuiven niet mee; unlocked wel
- Duidelijk gescheiden van rode Test-offset
- API-klaar: `window.__toth.timeshift(min)` / `timeshiftReset()`

## [0.5.2] — 2026-11-14

### Fixed
- Slotje lockte ogenschijnlijk alleen “20 minuten”: lijst werd herbouwd en scrollde weg van het geklikte item. Lock werkt nu in-place zonder scroll-jump.

## [0.5.1] — 2026-11-14

### Toegevoegd
- **Wall-clock ankers**: slotje per cue in de timeline
- Ankers bewaard in Instellingen; bij nieuwe import opnieuw herkend (via t− / titel)
- Nieuwe planningstijd wordt overgenomen, matching cues worden weer gelockt
- Fundament: locked cues negeren toekomstige `timeshiftMs`

## [0.5.0] — 2026-11-14

### Toegevoegd (fase 2 / regie)
- Zoom venster 30 / 60 / 90 min (Instellingen → Wiel)
- Kleuren per sectie op het wiel (standaard)
- Cue **Klaar** / **Snooze +1m** op “Nu bezig”
- Cue-alert: soft chime + schermflits bij wissel
- **Regie**-modus (knop of toets `F`): fullscreen, chrome verdwijnt na idle
- Phase command-API klaar voor OSC (`window.__toth.phase(...)`)

### Gewijzigd
- Rust/post-start: UI is fallback; hint verwijst naar OSC als primair pad
- Start-knop in de fase-balk duidelijker gemarkeerd

## [0.4.0] — 2026-11-14

### Toegevoegd
- Splashscreen met DesertDog-logo (boot + opnieuw via © DesertDog)
- Eigen app-icon (programmawiel)

### Gewijzigd
- Nu bezig / Next: tijd op tweede regel (bijv. “Start over” + `385m 34s`)

## [0.3.9] — 2026-11-14

### Gewijzigd
- Versie alleen bij app-titel en in Instellingen (niet meer in statusbalk / aparte badge)
- **© DesertDog** credit (klikbaar, zoals lineup-tool)

## [0.3.8] — 2026-11-14

### Toegevoegd
- Kleine **×** op uitschakelbare panelen (testbalk, topbar-tools, fases, secondenpaneel, kaarten); weer aanzetten via Instellingen

## [0.3.7] — 2026-11-14

### Opgelost
- Timeline-hover knippert niet meer (lijst niet elke tick opnieuw opbouwen)
- Settings-toggles (fase-tabs, testmodus, topbar tools, …) werken echt: `display:flex` overschreef `[hidden]`

## [0.3.6] — 2026-11-14

### Opgelost
- Huidige cue blijft onder **NOW** (bovenaan): segment = resterende tijd tot volgende cue; niet meer “kwijt” of ergens op ~1u als het item al >5 min loopt
- Huidige item niet meer volledig grijs; alleen verstreken deel achter NOW is gedimd

## [0.3.5] — 2026-11-14

### Opgelost
- Wiel-labels springen niet meer van groot→klein rond ~10 min: segment niet meer tot window-einde rekken; lettergrootte volgt door tijd tot cue (nabije items blijven leesbaar)

## [0.3.4] — 2026-11-14

### Gewijzigd
- `npm run build` **herstart de app automatisch** na elke update (quit + open)

## [0.3.3] — 2026-11-14

### Opgelost
- Programmawiel weer **groot** (vorige layout-constraint ongedaan; wielkolom krijgt opnieuw de meeste ruimte)

## [0.3.2] — 2026-11-14

### Toegevoegd
- Versienummer altijd zichtbaar: badge in topbar, statusbalk, instellingenpagina en venstertitel

## [0.3.1] — 2026-11-14

### Gewijzigd
- Wiel-labels: **klein** als &gt;30 min vooruit; rechts oplopend groter richting NOW; tekst wrap in de ring
- Secondentimer kleiner; wielpaneel **vierkanter**; meer ruimte voor timeline
- Instellingen als **aparte pagina** met aan/uit voor schermonderdelen

## [0.3.0] — 2026-11-14

### Toegevoegd
- **Mac-app build** zonder installer: `npm run build` → `Top of the Hour.app` (dubbelklik)
- Fase-klokken: **Voorprogramma** (wall-clock), **Wedstrijd** (geen aftelling), **Rust** en **Na de wedstrijd** (handmatig starten)

## [0.2.0] — 2026-11-14

### Toegevoegd
- Programmawiel met **pie-segmenten** per cue (multicolor of duo color)
- Grotere labels **in** het wiel; schaalbaar via settings
- **Instellingen**-paneel: testmodus, kleuren, labelgrootte, knipper, web/OSC placeholders
- Secondentimer **knippert** in de laatste N seconden (standaard 15; aan/uit + duur in settings)
- **Resterende duur** van het huidige item (volgens planning tot volgende cue), plus geplande lengte

### Gewijzigd
- Secondentimer compacter (≈130px)

## [0.1.1] — 2026-11-14

### Toegevoegd
- **Test-balk**: spring naar rundown (90s vóór eerste cue), skip ±1/5/15 min
- **Demo play** op 10× / 60× / 600× zodat het wiel zichtbaar meedraait zonder te wachten op wall-clock
- Reset tijd + offset-label in de test-balk

### Gewijzigd
- “Jump to now” hernoemd naar **Naar volgende** (30s vóór volgende cue)

## [0.1.0] — 2026-11-14

### Toegevoegd
- Electron Mac-app (`npm start`) zonder installer
- Inlezen van speakerformat **DOCX** en **PDF** met brede/fuzzy parsing
- Rolling 60‑minuten **programmawiel** (NOW vast bovenaan)
- **Secondentimer** linksboven; laatste minuut vóór volgende actie loopt rood mee
- Cue-lijst, tijd-offset, kickoff-override voor testen
- Voorbeeld: `examples/02 FCU - AZ 2627.docx`
- Modular scaffold: `src/parser`, `src/clock`, `src/ui`, `src/theme`
- `BACKLOG.md` met ideeën voor latere iteraties (o.a. **OSC-integratie**, **remote webview** via IP+poort)
