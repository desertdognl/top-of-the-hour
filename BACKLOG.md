# Backlog — Top of the Hour

Ideeën en mogelijke vervolgstappen. Geen commitment; prioriteit bij latere iteraties.

## Aanbevolen volgorde (actueel)
1. ~~Branding / polish~~ · ~~Regie UX~~ · ~~Wall-clock ankers~~
2. **Timeshift / flexibel draaiboek** — basis in v0.6.0; item-shift / lookahead / toggle / preview in v0.9.4; rest hieronder
3. **OSC** — basis in v0.7.0 (catalogus + server + docs-pagina); uitbreiden bij elke nieuwe feature
4. ~~Remote webview~~ — basis in v0.8.0; rest hieronder
5. **Parsing / editor / tests / DMG** — basis in v0.9.0 (t−-normalize + unit tests); multi-format detect + absolute ROS in v1.0.4; rest hieronder

## Product / UX
- [x] Halftime / relative clock (RUST, 80e min, 90+1) naast absolute wall-clock — basis in v0.3 (fase-tabs + handmatige rust/post-klok)
- [ ] Fijnmaziger: relative match-minute cues koppelen aan live wedstrijdklok (optioneel)
- [x] Fullscreen stadium / regie-mode (controls auto-hide) — v0.5.0 (knop Regie / toets F)
- [x] Huidige fase zichtbaar in UI (badge + ← Fase / Fase →) — v0.7.0; fase in Timeline-kop + compacte nav — v0.7.6
- [ ] Tweede display: alleen wiel + seconden (geen lijst)
- [x] Audio/visuele cue bij start van actie (soft chime, flash) — v0.5.0
- [x] **Notification sound kiezen** (ping/double/pulse/horn/chime) + preview + onthouden — v0.9.5
- [x] Gebruikersinstellingen persistenteren (localStorage) — herstart behoudt toggles, modus, ankers, OSC/web, enz.
- [x] Handmatig “cue done” / snooze voor live events zonder tijd — v0.5.0
- [x] Kleuren per sectie op het wiel (Opening / Warming-up / Aftrap / Rust) — v0.5.0
- [x] Zoom / vensterbreedte van het 60‑min window instelbaar (30 / 60 / 90) — v0.5.0
- [x] Regie-modus: optioneel timeline verbergen maar ankers/now wel tonen — v0.9.5
- [x] Visuele markering van locked ankers op het **wiel** (niet alleen in de lijst) — v0.9.2
- [x] Ankerteller in topbalk live bijwerken bij lock — v0.9.3
- [x] Sneltoetsen: cue klaar / snooze / volgende anker — v0.9.5 (D / S / A)
- [x] Demo: “spring naar anker” (testbalk) — v0.9.5

## Timeshift / flexibel draaiboek (aparte view)
Andere opzet dan de vaste wall-clock / kickoff-mode. Bedoeld voor draaiboeken **zonder vaste eindtijd**, waar je kunt inlopen of uitlopen en de tijdlijn moet meeschuiven.

- [x] **Moduskeuze**: vast vs flexibel — Instellingen → Draaiboek-modus — v0.6.0
- [x] **Timeshift ± minuten** + indicator (inloop/uitloop) + gele Flex-balk — v0.6.0
- [x] Timeshift reset (unlocked terug; ankers blijven) — v0.6.0
- [x] Onderscheid **test-offset** (rode Test-balk) ≠ **timeshift** (gele Flex-balk) — v0.6.0
- [x] Shift in **aantal items** (bijv. “+2 cues”) naast minuten — v0.9.4
- [x] **Lookahead instelbaar**: hoe ver vooruit kijken — in tijd en/of in aantal items — v0.9.4
- [ ] Eigen UI/view voor flex-modus (nu → volgende N) i.p.v. alleen shift op wall-clock-wiel
- [x] Vaste ankers (slotje, persist, herimport) — v0.5.1–0.5.2
- [x] Bij timeshift: preview “wat schuift / wat blijft” (unlocked vs ankers) op wiel/lijst — v0.9.4
- [x] OSC-bediening van timeshift-items + lookahead — v0.9.4; webview later
- [x] Flex-modus onthouden / snelle toggle in topbar — v0.9.4

### Ankers — vervolgideeën (uit v0.5.x)
- [ ] Bulk-lock: hele sectie vastzetten / alle timed cues tot aftrap
- [x] FCU-standaardanker-set (template): bijv. −20m, −10m, −4m, aftrap — één-klik toepassen — v0.9.2
- [ ] Conflict-UI als twee cues dezelfde anker-key zouden delen
- [ ] Import-rapport: “3 ankers opnieuw gelockt met nieuwe tijd”
- [ ] Anker bewerken in settings (label / key handmatig)

## OSC-integratie
Externe bediening via Open Sound Control (bijv. van licht/regie-consoles, TouchOSC, Companion, Max/MSP). Ontvangen én verzenden van berichten zodat Top of the Hour in de bredere stack past.

**Primair bedieningspad in productie:** fase wisselen + rust/post-klok starten gebeurt via OSC (UI-tabs/Start zijn fallback/test).

- [x] OSC-server in de app (UDP, host/poort) — v0.7.0
- [x] Fase-commando’s: set + **next/prev fase** + start/pause/reset + item next/prev — v0.7.0
- [x] Catalogus als single source of truth (`src/osc/catalog.js`) — docs-pagina + bridge moeten mee
- [x] OSC-docs pagina vanuit Instellingen (alle commands + live log) — v0.7.0
- [x] Status-uit: phase, current, next, seconds, timeshift, mode, regie — v0.7.0
- [x] Ankers + timeshift + file + regie + window via OSC — v0.7.0
- [x] Regel handhaven: nieuwe feature → catalog + bridge; verwijderd → beide weg — web + cue next/prev in v0.9.0
- [x] Jump naar cue-index (`/toth/cue/goto`) — v0.9.2; absolute tijd later
- [ ] View-switch “alleen wiel” / tweede display via OSC
- [ ] Presets / mapping-UI (Companion-friendly export)
- [x] `OSC.md` export vanuit catalog — v0.9.2

## Netwerk / remote webview
Browser-view die vanaf andere machines bereikbaar is (LAN), zodat regie/speaker/productie het wiel kunnen volgen zonder de desktop-app.

- [x] Ingebouwde HTTP-server in de app (configureerbaar **poortnummer**) — v0.8.0
- [x] Bereikbaar via **IP-adres + poort** vanaf andere machines op het netwerk — v0.8.0
- [x] Webview views: volledig / focus / lijst (read-only) — v0.8.0; later: alleen wiel / secondentimer
- [x] Live sync met de desktop-app (SSE: cues, now, next, countdown) — v0.8.0
- [x] Remote UI gelijkgetrokken met app (seconden + wiel + timeline) — v0.9.6
- [ ] Optioneel: bediening vanaf de browser (met eenvoudige auth / pincode)
- [x] Toon lokaal IP + poort in Instellingen (kopieerbare URL) — v0.8.0
- [x] Firewall-/netwerk-hint in README (macOS toestemming inkomend verkeer) — v0.9.0
- [x] Remote: timeshift-label + ankers op wiel/lijst — v0.9.6

## Parsing
- [x] Auto-detect FCU (t−) vs absolute run-of-show (Start/Duur) — v1.0.4
- [ ] Meer voorbeeldbestanden (licht afwijkende layouts) voor regressietests — later (geen extra files nu)
- [ ] Manual cue-editor na import (tijd, label, sectie corrigeren)
- [x] Export genormaliseerde cues als JSON/CSV — v0.9.2
- [ ] Gmail-import van speakerformat-bijlage (zoals lineup-tool)
- [x] Normaliseer t−-tekst bij parse (`0h 20 m` → `0h 20m`) voor stabielere anker-keys — v0.9.0

## Techniek
- [x] electron-builder DMG (`npm run build:dmg`) — v0.9.2; **standaard**: altijd `npm run build` → `dist/mac-arm64`; DMG + GitHub release alleen op verzoek
- [ ] Auto-reload in development
- [x] Unit tests voor normalize + cues + anchor matching — basis v0.9.0 (`npm run test:unit`)
- [ ] Native SwiftUI-port (als Xcode beschikbaar is)

## Branding
- [x] Eigen app-icon (icns) — v0.4.0
- [x] DesertDog credit (© DesertDog + versie bij titel / settings) — v0.3.9
- [x] Splashscreen met DesertDog-logo (zoals lineup-tool) — v0.4.0
- [x] DesertDog-logo klikbaar → https://desertdog.nl — v1.0.0

## Integratie-overzicht (gewenst)
Externe systemen / modi die Top of the Hour later moeten kunnen aansturen of volgen:
1. **OSC** — navigatie timeline, views, fase, ankers, timeshift
2. **Remote webview** — browser op andere machine via IP + poort
3. **Timeshift / flexibel draaiboek** — aparte view t.o.v. vaste eindtijd-mode
