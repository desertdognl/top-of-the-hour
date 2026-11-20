# Top of the Hour

Radio **programmawiel** voor FC Utrecht wedstrijdregie. Laadt een speakerformat (DOCX/PDF) en toont timed acties op een meedraaiend 60‑minutenwiel, met een secondentimer voor de laatste minuut vóór de volgende cue.

## Vereisten

- macOS
- Node.js 18+

## Starten

### Installer (aanbevolen)

Na `npm run build:dmg`:

**`dist/TopOfTheHour-macOS-v1.0.3-arm64.dmg`**

Open de DMG en sleep de app naar Applications.

Unpacked build (zonder installer): **`dist/mac-arm64/Top of the Hour.app`**

Bij Gatekeeper-waarschuwing: rechtsklik → **Open**, of eenmalig:
`xattr -cr "/Applications/Top of the Hour.app"`

### Opnieuw bouwen / updaten

```bash
cd "Top of the Hour"
npm install
npm run build        # unpacked .app + herstart
npm run build:dmg    # DMG-installer in dist/
```

`npm run build` vernieuwt `dist/mac-arm64/Top of the Hour.app`, **stopt de lopende app** en **start hem opnieuw**.

### Dev vanuit terminal

```bash
npm start
```

## Gebruik

1. **Open bestand** — kies een speakerformat DOCX of PDF
2. Wiel toont de **komende 60 minuten**; NOW staat vast bovenaan
3. Linksboven: **secondentimer** (rood in de laatste 60s vóór volgende timed cue)
4. Rechts: chronologische cue-lijst
5. **Offset** (± minuten) of kickoff-override om zonder echte wedstrijd te testen

### Testen (avond-draaiboek overdag)

Op de rode **Test**-balk:

1. **Naar rundown** — zet de klok op 90 seconden vóór de eerste cue
2. Skip met **±1 / ±5 / ±15m** door de show
3. Of start **Demo play** (10× / 60× / 600×) om het wiel automatisch te zien meedraaien
4. **Reset tijd** zet de offset terug naar echte wall-clock

## Mappenstructuur (blokken)

| Pad | Rol |
|-----|-----|
| `src/parser/` | DOCX/PDF → genormaliseerde cues |
| `src/clock/` | Tijd, offset, rolling window, next-cue |
| `src/ui/` | ProgramWheel, SecondsWheel, CueList, controls |
| `src/theme/` | Kleuren, typografie, layout |
| `examples/` | Voorbeeldbestanden |
| `renderer/` | HTML entry |

Pas bij voorkeur één blok aan zonder de rest te herschrijven.

## Remote webview (LAN)

In **Instellingen → Webinterface** kun je een read-only browser-view aanzetten.

1. Zet **Inschakelen (LAN)** aan en noteer de poort (default `8787`)
2. Kopieer de getoonde URL (`http://<jouw-LAN-IP>:8787`) op een andere machine in dezelfde Wi‑Fi/LAN
3. Views in de browser: volledig / focus / lijst

**macOS-firewall:** bij de eerste start kan macOS vragen of *Top of the Hour* inkomend netwerkverkeer mag ontvangen — kies **Sta toe**. Staat de firewall strikt aan zonder prompt: Systeeminstellingen → Netwerk → Firewall → Opties, en sta de app toe.

## Tests

```bash
npm test          # unit + voorbeeld-parse
npm run test:unit
npm run test:parse
```

## Versie

Zie `VERSION`, `package.json` en `CHANGELOG.md`. Ideeën: `BACKLOG.md`.
