// Story data for REANIMATOR (pure text, no DOM, no simulation imports beyond a type). Original writing for this game:
// a sealed biomechanical station, the operative who wakes in the cryo airlock, the Core Warden, the reactor Meltdown.
// Nothing here is taken from the 1996 game's text. The game is English only.

import type { SectorId3D } from '../game3d/types3d.ts';

export type Lang = 'en';
export interface Bilingual {
  en: string;
}

export interface LoreLog {
  /** Same id as Level3D.dataLogs / CollectibleState3D. */
  id: string;
  sector: SectorId3D;
  /** 1..6, the intended reading order. */
  order: number;
  title: Bilingual;
  speaker: Bilingual;
  /** Station time, shown as written (not localized). */
  stamp: string;
  body: Bilingual;
}

export const LOG_WORDS_MIN = 60;
export const LOG_WORDS_MAX = 100;

export const LORE_LOGS: readonly LoreLog[] = [
  {
    id: 'log_airlock',
    sector: 'airlock',
    order: 1,
    title: { en: 'Pod Nine Manifest' },
    speaker: { en: 'Dr. Anselm Roe, Reanimation Lead' },
    stamp: 'Y19 D112 22:14',
    body: {
      en: "Logging the airlock transfer. Pod Nine holds one body, male, thirties, dead on arrival at the breach. Eight pods before it came back wrong. This one took. Heart, lungs, and the long quiet behind the eyes: all of it holds. Security wants him cremated. I told them the cold will keep him until the doors seal. When the station locks down, the pod wakes by itself. Whoever wakes up out of this, please understand: I did not bring you back to suffer. I brought you back because you were the only thing that worked.",
    },
  },
  {
    id: 'log_shaft',
    sector: 'shaft',
    order: 2,
    title: { en: 'Why the Doors Are Armed' },
    speaker: { en: 'Teo Marsh, Maintenance Chief' },
    stamp: 'Y19 D113 03:40',
    body: {
      en: "For the record, I did not design the locks. Commander Varga's order came down at midnight: every inner door gets keyed to a weapon class, not a card. Her reasoning was cold and I could not argue with it. A specimen can steal a keycard from a corpse. It cannot fire a rail cannon. So the shaft stays open and the doors stay hungry. If you are reading this on the roof, you are carrying more firepower than the people who wrote the rule. Spend it carefully. The lifts are not coming back.",
    },
  },
  {
    id: 'log_mines',
    sector: 'mines',
    order: 3,
    title: { en: 'What Powers the Dead' },
    speaker: { en: 'Pia Okonkwo, Geologist' },
    stamp: 'Y18 D301 14:05',
    body: {
      en: "The drift vault is the source. The ore here hums under a Geiger counter, and it does something no one expected: tissue that should be dead closes its own wounds near it. The reactor feeds on this vein, and so does the Reanimation program upstairs. They never told the miners. I left my spare thruster boots in the vault wall, in case someone has to leave quickly. The acid pools below are runoff from the vein. Do not drink. Do not trust anything that crawls out of them.",
    },
  },
  {
    id: 'log_biolabs',
    sector: 'biolabs',
    order: 4,
    title: { en: 'Subject Nine Has a Name' },
    speaker: { en: 'Dr. Anselm Roe, Reanimation Lead' },
    stamp: 'Y19 D114 01:52',
    body: {
      en: "The tanks failed an hour ago. Specimens one through eight are loose, and they remember hunger better than they remember being people. Subject Nine is stable in his pod, so I moved up the schedule. His file lists a name. I have sealed it, because a name makes the work feel like murder, and I need three more hours of nerve. His name was Kade Maren, Varga's deputy, and he died holding the east breach so the rest of us could run. Forgive me, Kade. You are what I have left.",
    },
  },
  {
    id: 'log_security',
    sector: 'security',
    order: 5,
    title: { en: 'Override Memo' },
    speaker: { en: 'Cmdr. Ilse Varga, Head of Security' },
    stamp: 'Y19 D114 04:30',
    body: {
      en: "Roe has woken Kade without my signature, and I am signing it now so there is a record. If the reactor goes critical, someone with a pulse and a gun has to walk down to the core and stop it. I cannot be that person. The lattice below needs a living mind to hold the containment, and every other volunteer is dead. I am going down myself. When I stop answering, the console will treat the core as hostile ground. Kade, if you hear this: do not come looking for me.",
    },
  },
  {
    id: 'log_core',
    sector: 'core',
    order: 6,
    title: { en: 'Warden Protocol' },
    speaker: { en: 'Ilse Varga, Core Warden' },
    stamp: 'Y19 D114 05:07',
    body: {
      en: "I have been the Warden for nineteen years, or one night. The lattice keeps no calendar. It rewrites me whenever I rest, and soon I will not know your face. The protocol will call you an intruder. It will use my hands. Break the core anyway, Kade. The meltdown will take the station and me with it, and that is the only mercy left. You were the one that worked. Run for the airlock and do not look back.",
    },
  },
];

/** Sector title-card subtitles, matched to the story above. */
export const SECTOR_SUB: Record<SectorId3D, Bilingual> = {
  airlock: { en: 'Pod Nine opened from the inside. The way out is back where you started.' },
  shaft: { en: 'Every door here is keyed to a weapon, not a card.' },
  mines: { en: 'The vein that feeds the reactor also feeds the dead.' },
  biolabs: { en: 'Eight failures walked out of these tanks. You were the ninth.' },
  security: { en: 'Varga locked the station behind her. The console decides who follows.' },
  core: { en: 'The Warden still keeps watch. She has not stopped burning.' },
};

/** First-run intro, four beats (index.html .intro-lines). Total reveal stays under 10 s. */
export const INTRO_LINES: readonly Bilingual[] = [
  { en: 'SIGNAL RESTORED' },
  { en: 'Pod Nine opens. The station sealed itself nineteen years ago.' },
  { en: 'Something below keeps the reactor burning, and it wants you to stay.' },
  { en: 'Reach the core. Break it. Get out.' },
];

export type EndingTier = 'low' | 'mid' | 'true';

export const ENDING_TRUE_PCT = 100;
export const ENDING_MID_PCT = 50;

/** Ending tier from the completion percentage (the same number the result screen shows). */
export function endingTier(collectionPct: number): EndingTier {
  if (collectionPct >= ENDING_TRUE_PCT) return 'true';
  if (collectionPct >= ENDING_MID_PCT) return 'mid';
  return 'low';
}

export const ENDING_BASE: Bilingual = {
  en: 'The core goes dark behind you and the station folds into white light. You reach the airlock where Pod Nine still stands open. The sky outside is the first thing you remember.',
};

export const ENDING_VARIANT: Record<EndingTier, Bilingual> = {
  low: {
    en: 'You do not know why the Warden hesitated at the end. The station keeps its secrets, and you walk away not knowing your own name.',
  },
  mid: {
    en: 'You pieced together some of what happened here: a doctor who could not stop, a commander who chose to burn. The rest is ash. You carry what you found.',
  },
  true: {
    en: 'You heard every voice, so you know the name Roe sealed away. Out in the cold dawn you say it aloud once: Kade Maren. Somewhere in the fire Varga hears it, and the Warden finally rests.',
  },
};

export const ENDING_HEADING: Record<EndingTier, Bilingual> = {
  low: { en: 'ENDING: ASH' },
  mid: { en: 'ENDING: EMBERS' },
  true: { en: 'TRUE ENDING: KADE MAREN' },
};

export interface EndingText {
  tier: EndingTier;
  heading: string;
  paragraphs: string[];
}

export function endingText(collectionPct: number, lang: Lang): EndingText {
  const tier = endingTier(collectionPct);
  return { tier, heading: ENDING_HEADING[tier][lang], paragraphs: [ENDING_BASE[lang], ENDING_VARIANT[tier][lang]] };
}

/** Short credits roll (skippable). Lines starting with '#' are headings. */
export const CREDITS_LINES: readonly Bilingual[] = [
  { en: '# REANIMATOR' },
  { en: 'A side-view 3D metroidvania' },
  { en: '# Technology' },
  { en: 'Three.js, WebGL2, procedural audio' },
  { en: '# Restored' },
  { en: 'Movement physics of DOS Abuse 1.05, checked field by field' },
  { en: '# New design' },
  { en: 'Levels, enemies, bosses, music, and this story' },
  { en: '# Tools' },
  { en: 'TypeScript, Three.js, Vite, WebAudio, Meshy' },
  { en: 'Thank you for playing.' },
];

// ---- language (English only) ----

export const LANG_STORE_KEY = 'reanimator.lang.v1';

/** The game ships in English only: stored and browser languages are ignored. */
export function pickLang(_stored?: string | null, _browser?: string | null): Lang {
  return 'en';
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function loreLogById(id: string): LoreLog | undefined {
  return LORE_LOGS.find((l) => l.id === id);
}

/** Small UI strings used by the log panels and the result screen. */
/**
 * UI chrome language. Buttons, panel titles, key hints and counters stay English in every language so the pause menu
 * matches the title menu (PLAY / SETTINGS / EXTRAS) and the HUD. Only story text (intro lines, log titles, speakers,
 * bodies, sector subtitles, endings, credits) follows the KO/EN choice. The language toggle names its target language.
 */
export const CHROME_LANG: Lang = 'en';

/** Chrome label for a LORE_UI key (always English). */
export function chromeLabel(key: keyof typeof LORE_UI, _lang: Lang = CHROME_LANG): string {
  return LORE_UI[key][CHROME_LANG];
}

export const LORE_UI = {
  hintTyping: { en: 'Press any key to skip' },
  hintDone: { en: 'Press any key to close' },
  hintCredits: { en: 'Press any key to skip' },
  archiveTitle: { en: 'Logs' },
  recovered: { en: 'RECOVERED' },
  back: { en: 'Back' },
  logsButton: { en: 'Logs' },
  creditsButton: { en: 'Roll credits' },
  dataLog: { en: 'DATA LOG' },
} as const satisfies Record<string, Bilingual>;
