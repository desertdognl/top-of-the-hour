/**
 * App settings (localStorage). Easy to extend for OSC / webview later.
 */

const STORAGE_KEY = 'toth-settings-v2';

export const MULTI_PALETTE = [
  '#e30613',
  '#2f6fed',
  '#e8a017',
  '#1fa97a',
  '#9b5de5',
  '#00bbf9',
  '#f15bb5',
  '#8d99ae',
];

/** Fixed palette per speakerformat-sectie */
export const SECTION_COLORS = {
  opening: '#2f6fed',
  'warming-up': '#e8a017',
  warming: '#e8a017',
  aftrap: '#e30613',
  rust: '#9b5de5',
  wedstrijd: '#1fa97a',
  commercials: '#00bbf9',
  default: '#8d99ae',
};

export const DEFAULT_SETTINGS = {
  testMode: true,
  wheelColorMode: 'section',
  duoColorA: '#e30613',
  duoColorB: '#2a3340',
  /** Pie-item labels in het programmawiel (1 = basis; hoger = groter) */
  wheelLabelScale: 1.2,
  /** Timeline-itemtitels (1 = 13px basis) */
  timelineTitleScale: 1.2,
  /** Secondentimer linksboven (1 ≈ 96px; hoger = groter) */
  secondsScale: 1.75,
  /** Volgende-item in het centrum van het programmawiel (radio clock) */
  wheelNextTitleEnabled: true,
  wheelNextTitleColor: '#f0b429',
  wheelNextTitleScale: 1,
  /** “nog Xm Ys” in het wiel-centrum */
  wheelRemainingScale: 1,
  /** 'top' | 'bottom' — positie van de aftel in de center disc */
  wheelRemainingPosition: 'bottom',
  windowMinutes: 60,
  secondsBlinkEnabled: true,
  secondsBlinkWithin: 15,
  cueAlertEnabled: true,
  cueAlertSound: true,
  /** ping | double | pulse | horn | chime — see src/ui/alerts.js */
  cueAlertSoundId: 'ping',
  cueAlertFlash: true,
  /** In regie-mode: hide timeline list; wheel + now/ankers blijven */
  regieHideTimeline: false,
  /**
   * Wall-clock anchors — durable keys (t− / title) that survive re-import.
   * New import keeps the file's new times, then re-locks matching cues.
   * @type {Array<{key:string,label:string,title?:string,tMinusText?:string,kind?:string}>}
   */
  anchors: [],
  /** 'fixed' = wall-clock only; 'flex' = timeshift allowed (unlocked cues) */
  rundownMode: 'fixed',
  showTimeshiftBar: true,
  /**
   * How far ahead the wheel looks. 'auto' = derived from windowMinutes − lookback.
   * Number = explicit minutes ahead (total window = lookback + ahead).
   */
  lookaheadMinutes: 'auto',
  /** Limit emphasis to next N upcoming cues (0 = unlimited) */
  lookaheadItems: 0,
  // Chrome visibility — toggle to free space
  showTopbarTools: true, // offset / kickoff / naar volgende
  showPhaseBar: true,
  showSecondsPanel: true,
  showCurrentCard: true,
  showNextCard: true,
  showWheelTicks: true,
  showWheelMinuteLabels: true,
  // Placeholders
  webInterfaceEnabled: false,
  webInterfacePort: 8787,
  oscEnabled: false,
  oscPort: 9000,
  oscHost: '0.0.0.0',
  oscSendEnabled: false,
  oscSendHost: '127.0.0.1',
  oscSendPort: 9001,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // migrate v1 if present
      const v1 = localStorage.getItem('toth-settings-v1');
      if (v1) {
        const migrated = { ...DEFAULT_SETTINGS, ...JSON.parse(v1) };
        saveSettings(migrated);
        return migrated;
      }
      return { ...DEFAULT_SETTINGS };
    }
    const parsed = JSON.parse(raw);
    // Migrate oude keys (1.0.5 early: next-title zat per abuis op de secondenklok)
    if (parsed.secondsNextTitleEnabled != null && parsed.wheelNextTitleEnabled == null) {
      parsed.wheelNextTitleEnabled = parsed.secondsNextTitleEnabled;
    }
    if (parsed.secondsNextTitleColor && !parsed.wheelNextTitleColor) {
      parsed.wheelNextTitleColor = parsed.secondsNextTitleColor;
    }
    if (parsed.secondsNextTitleScale != null && parsed.wheelNextTitleScale == null) {
      parsed.wheelNextTitleScale = parsed.secondsNextTitleScale;
    }
    if (parsed.secondsNextTitlePosition && !parsed.wheelRemainingPosition) {
      parsed.wheelRemainingPosition = parsed.secondsNextTitlePosition;
    }
    if (parsed.wheelNextTitlePosition && !parsed.wheelRemainingPosition) {
      parsed.wheelRemainingPosition = parsed.wheelNextTitlePosition;
    }
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  const next = { ...DEFAULT_SETTINGS, ...settings };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function colorForSection(section) {
  const key = String(section || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!key) return SECTION_COLORS.default;
  for (const [name, color] of Object.entries(SECTION_COLORS)) {
    if (name === 'default') continue;
    if (key === name || key.includes(name)) return color;
  }
  return SECTION_COLORS.default;
}

export function colorForCue(cue, index, settings) {
  if (settings.wheelColorMode === 'duo') {
    return index % 2 === 0 ? settings.duoColorA : settings.duoColorB;
  }
  if (settings.wheelColorMode === 'section') {
    return colorForSection(cue.section || cue.title);
  }
  let hash = 0;
  const key = cue.id || String(index);
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return MULTI_PALETTE[Math.abs(hash) % MULTI_PALETTE.length];
}
