// Story data for REANIMATOR (pure text, no DOM, no simulation imports beyond a type). Original writing for this game:
// a sealed biomechanical station, the operative who wakes in the cryo airlock, the Core Warden, the reactor Meltdown.
// Nothing here is taken from the 1996 game's text. Every string exists in English and Korean.

import type { SectorId3D } from '../game3d/types3d.ts';

export type Lang = 'en' | 'ko';
export interface Bilingual {
  en: string;
  ko: string;
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
    title: { en: 'Pod Nine Manifest', ko: '9번 포드 인수증' },
    speaker: { en: 'Dr. Anselm Roe, Reanimation Lead', ko: '안셀름 로 박사, 재생 연구 책임자' },
    stamp: 'Y19 D112 22:14',
    body: {
      en: "Logging the airlock transfer. Pod Nine holds one body, male, thirties, dead on arrival at the breach. Eight pods before it came back wrong. This one took. Heart, lungs, and the long quiet behind the eyes: all of it holds. Security wants him cremated. I told them the cold will keep him until the doors seal. When the station locks down, the pod wakes by itself. Whoever wakes up out of this, please understand: I did not bring you back to suffer. I brought you back because you were the only thing that worked.",
      ko: '에어록 이송 기록. 9번 포드에는 남성 한 명, 삼십 대, 침입 현장에서 도착 시 이미 사망. 앞선 여덟 개 포드는 모두 잘못 깨어났다. 이 포드만 안착했다. 심장도 폐도 눈 뒤의 긴 고요도 전부 유지된다. 보안 쪽은 화장을 원하지만 문이 봉인될 때까지 냉기가 그를 지켜 줄 거라고 말해 두었다. 시설이 잠기면 포드는 스스로 깨어난다. 깨어난 당신이 누구든 이것만은 알아 달라. 당신을 괴롭히려고 되살린 게 아니다. 유일하게 성공한 것이 당신이었을 뿐이다.',
    },
  },
  {
    id: 'log_shaft',
    sector: 'shaft',
    order: 2,
    title: { en: 'Why the Doors Are Armed', ko: '문에 무장이 걸린 이유' },
    speaker: { en: 'Teo Marsh, Maintenance Chief', ko: '테오 마시, 정비 반장' },
    stamp: 'Y19 D113 03:40',
    body: {
      en: "For the record, I did not design the locks. Commander Varga's order came down at midnight: every inner door gets keyed to a weapon class, not a card. Her reasoning was cold and I could not argue with it. A specimen can steal a keycard from a corpse. It cannot fire a rail cannon. So the shaft stays open and the doors stay hungry. If you are reading this on the roof, you are carrying more firepower than the people who wrote the rule. Spend it carefully. The lifts are not coming back.",
      ko: '기록해 두지만 잠금장치를 설계한 건 내가 아니다. 바르가 사령관의 명령이 자정에 내려왔다. 모든 내부 문을 카드가 아니라 무기 등급에 맞춰 잠그라는 것이다. 이유는 냉정했고 나는 반박할 수 없었다. 표본은 시체에서 카드를 훔칠 수 있어도 레일 캐논은 쏘지 못한다. 그래서 수직 통로는 열려 있고 문들은 굶주려 있다. 지붕 위에서 이걸 읽고 있다면 규칙을 만든 사람들보다 화력이 센 것이다. 아껴 써라. 승강기는 돌아오지 않는다.',
    },
  },
  {
    id: 'log_mines',
    sector: 'mines',
    order: 3,
    title: { en: 'What Powers the Dead', ko: '죽은 자를 움직이는 것' },
    speaker: { en: 'Pia Okonkwo, Geologist', ko: '피아 오콩코, 지질학자' },
    stamp: 'Y18 D301 14:05',
    body: {
      en: "The drift vault is the source. The ore here hums under a Geiger counter, and it does something no one expected: tissue that should be dead closes its own wounds near it. The reactor feeds on this vein, and so does the Reanimation program upstairs. They never told the miners. I left my spare thruster boots in the vault wall, in case someone has to leave quickly. The acid pools below are runoff from the vein. Do not drink. Do not trust anything that crawls out of them.",
      ko: '굴착 저장고가 근원이다. 이곳 광석은 계수기 아래에서 웅웅 울고, 아무도 예상하지 못한 일을 한다. 죽었어야 할 조직이 광맥 가까이에서 스스로 상처를 아문다. 리액터는 이 광맥을 먹고, 위층의 재생 프로그램도 마찬가지다. 광부들에게는 아무도 알리지 않았다. 누군가 급히 떠나야 할 때를 대비해 예비 추진 부츠를 저장고 벽에 숨겨 두었다. 아래 산성 웅덩이는 광맥에서 흘러나온 폐액이다. 마시지 마라. 거기서 기어 나오는 것도 믿지 마라.',
    },
  },
  {
    id: 'log_biolabs',
    sector: 'biolabs',
    order: 4,
    title: { en: 'Subject Nine Has a Name', ko: '피험자 9번에게는 이름이 있다' },
    speaker: { en: 'Dr. Anselm Roe, Reanimation Lead', ko: '안셀름 로 박사, 재생 연구 책임자' },
    stamp: 'Y19 D114 01:52',
    body: {
      en: "The tanks failed an hour ago. Specimens one through eight are loose, and they remember hunger better than they remember being people. Subject Nine is stable in his pod, so I moved up the schedule. His file lists a name. I have sealed it, because a name makes the work feel like murder, and I need three more hours of nerve. His name was Kade Maren, Varga's deputy, and he died holding the east breach so the rest of us could run. Forgive me, Kade. You are what I have left.",
      ko: '한 시간 전에 수조가 무너졌다. 1번부터 8번 표본이 풀려났고, 그것들은 사람이었던 기억보다 굶주림을 더 또렷이 기억한다. 9번 피험자는 포드 안에서 안정적이라 일정을 앞당겼다. 파일에는 이름이 적혀 있다. 이름이 있으면 이 일이 살인처럼 느껴지기에 봉인해 두었다. 앞으로 세 시간을 버틸 용기가 필요하다. 그의 이름은 케이드 마렌, 바르가의 부관이었고 동쪽 침입구를 지키다 죽었다. 우리가 달아날 수 있도록. 용서해라, 케이드. 내게 남은 건 너뿐이다.',
    },
  },
  {
    id: 'log_security',
    sector: 'security',
    order: 5,
    title: { en: 'Override Memo', ko: '권한 해제 각서' },
    speaker: { en: 'Cmdr. Ilse Varga, Head of Security', ko: '일제 바르가 사령관, 보안 책임자' },
    stamp: 'Y19 D114 04:30',
    body: {
      en: "Roe has woken Kade without my signature, and I am signing it now so there is a record. If the reactor goes critical, someone with a pulse and a gun has to walk down to the core and stop it. I cannot be that person. The lattice below needs a living mind to hold the containment, and every other volunteer is dead. I am going down myself. When I stop answering, the console will treat the core as hostile ground. Kade, if you hear this: do not come looking for me.",
      ko: '로 박사가 내 서명 없이 케이드를 깨웠다. 기록이 남도록 지금 내가 서명한다. 리액터가 임계에 달하면 맥박이 뛰고 총을 든 누군가가 코어까지 걸어 내려가 멈춰야 한다. 그게 나일 수는 없다. 아래의 격자는 봉쇄를 붙들 살아 있는 정신을 요구하고, 다른 지원자는 모두 죽었다. 내가 직접 내려간다. 내가 응답하지 않게 되면 콘솔은 코어를 적대 구역으로 처리할 것이다. 케이드, 이 말이 들린다면 나를 찾으러 오지 마라.',
    },
  },
  {
    id: 'log_core',
    sector: 'core',
    order: 6,
    title: { en: 'Warden Protocol', ko: '워든 프로토콜' },
    speaker: { en: 'Ilse Varga, Core Warden', ko: '일제 바르가, 코어 워든' },
    stamp: 'Y19 D114 05:07',
    body: {
      en: "I have been the Warden for nineteen years, or one night. The lattice keeps no calendar. It rewrites me whenever I rest, and soon I will not know your face. The protocol will call you an intruder. It will use my hands. Break the core anyway, Kade. The meltdown will take the station and me with it, and that is the only mercy left. You were the one that worked. Run for the airlock and do not look back.",
      ko: '나는 십구 년째 워든이었다. 혹은 단 하룻밤이었다. 격자에는 달력이 없다. 내가 쉴 때마다 격자는 나를 다시 쓰고, 곧 나는 네 얼굴을 알아보지 못할 것이다. 프로토콜은 너를 침입자로 부르며 내 손을 쓸 것이다. 그래도 코어를 부숴라, 케이드. 멜트다운이 시설과 나를 함께 삼킬 것이고, 그게 남은 유일한 자비다. 성공한 건 너였다. 에어록까지 달려라. 뒤돌아보지 마라.',
    },
  },
];

/** Sector title-card subtitles, matched to the story above. */
export const SECTOR_SUB: Record<SectorId3D, Bilingual> = {
  airlock: { en: 'Pod Nine opened from the inside. The way out is back where you started.', ko: '9번 포드는 안쪽에서 열렸다. 출구는 처음 깨어난 곳에 있다.' },
  shaft: { en: 'Every door here is keyed to a weapon, not a card.', ko: '이곳의 문은 카드가 아니라 무기로 열린다.' },
  mines: { en: 'The vein that feeds the reactor also feeds the dead.', ko: '리액터를 먹이는 광맥이 죽은 자도 먹인다.' },
  biolabs: { en: 'Eight failures walked out of these tanks. You were the ninth.', ko: '여덟 번의 실패작이 이 수조에서 걸어 나왔다. 당신은 아홉 번째다.' },
  security: { en: 'Varga locked the station behind her. The console decides who follows.', ko: '바르가는 등 뒤의 시설을 잠갔다. 누가 뒤따를지는 콘솔이 정한다.' },
  core: { en: 'The Warden still keeps watch. She has not stopped burning.', ko: '워든은 아직 지키고 있다. 그녀는 멈추지 않고 타고 있다.' },
};

/** First-run intro, four beats (index.html .intro-lines). Total reveal stays under 10 s. */
export const INTRO_LINES: readonly Bilingual[] = [
  { en: 'SIGNAL RESTORED', ko: '신호 복구' },
  { en: 'Pod Nine opens. The station sealed itself nineteen years ago.', ko: '9번 포드가 열린다. 시설은 십구 년 전에 스스로를 봉인했다.' },
  { en: 'Something below keeps the reactor burning, and it wants you to stay.', ko: '아래의 무언가가 리액터를 태우고 있다. 그리고 당신이 머물기를 바란다.' },
  { en: 'Reach the core. Break it. Get out.', ko: '코어에 닿아라. 부숴라. 탈출하라.' },
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
  ko: '코어가 등 뒤에서 어두워지고 시설은 흰 빛으로 접혀 든다. 9번 포드가 열려 있는 에어록에 닿는다. 바깥의 하늘이, 당신이 기억하는 첫 장면이 된다.',
};

export const ENDING_VARIANT: Record<EndingTier, Bilingual> = {
  low: {
    en: 'You do not know why the Warden hesitated at the end. The station keeps its secrets, and you walk away not knowing your own name.',
    ko: '워든이 마지막에 왜 망설였는지 당신은 알지 못한다. 시설은 비밀을 안고 사라지고, 당신은 자신의 이름도 모른 채 걸어 나간다.',
  },
  mid: {
    en: 'You pieced together some of what happened here: a doctor who could not stop, a commander who chose to burn. The rest is ash. You carry what you found.',
    ko: '이곳에서 일어난 일을 조금은 맞춰 냈다. 멈추지 못한 의사와 불타기를 택한 사령관. 나머지는 재가 되었다. 당신은 찾아낸 것만 품고 간다.',
  },
  true: {
    en: 'You heard every voice, so you know the name Roe sealed away. Out in the cold dawn you say it aloud once: Kade Maren. Somewhere in the fire Varga hears it, and the Warden finally rests.',
    ko: '모든 목소리를 들었기에 로 박사가 봉인한 이름을 안다. 차가운 새벽 속에서 당신은 그 이름을 한 번 소리 내어 말한다. 케이드 마렌. 불길 어딘가에서 바르가가 그 소리를 듣고, 워든은 마침내 쉰다.',
  },
};

export const ENDING_HEADING: Record<EndingTier, Bilingual> = {
  low: { en: 'ENDING: ASH', ko: '엔딩: 재' },
  mid: { en: 'ENDING: EMBERS', ko: '엔딩: 불씨' },
  true: { en: 'TRUE ENDING: KADE MAREN', ko: '진엔딩: 케이드 마렌' },
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
  { en: '# REANIMATOR', ko: '# REANIMATOR' },
  { en: 'A side-view 3D metroidvania', ko: '사이드뷰 3D 메트로배니아' },
  { en: '# Built with Kiro', ko: '# Kiro로 제작' },
  { en: 'Specs, steering files, parallel agent tracks', ko: '스펙, 스티어링 파일, 병렬 에이전트 트랙' },
  { en: '# Restored', ko: '# 복원' },
  { en: 'Movement physics of DOS Abuse 1.05, checked field by field', ko: 'DOS Abuse 1.05의 이동 물리를 필드 단위로 검증' },
  { en: '# New design', ko: '# 신규 설계' },
  { en: 'Levels, enemies, bosses, music, and this story', ko: '레벨, 적, 보스, 음악, 그리고 이 이야기' },
  { en: '# Tools', ko: '# 도구' },
  { en: 'TypeScript, Three.js, Vite, WebAudio, Meshy', ko: 'TypeScript, Three.js, Vite, WebAudio, Meshy' },
  { en: 'Thank you for playing.', ko: '플레이해 주셔서 감사합니다.' },
];

// ---- language selection ----

export const LANG_STORE_KEY = 'reanimator.lang.v1';

/** Stored preference wins, then the browser language, then English. */
export function pickLang(stored: string | null | undefined, browser: string | null | undefined): Lang {
  if (stored === 'en' || stored === 'ko') return stored;
  return typeof browser === 'string' && /^ko\b/i.test(browser) ? 'ko' : 'en';
}

export function otherLang(l: Lang): Lang {
  return l === 'en' ? 'ko' : 'en';
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function loreLogById(id: string): LoreLog | undefined {
  return LORE_LOGS.find((l) => l.id === id);
}

/** Small UI strings used by the log panels and the result screen. */
export const LORE_UI = {
  hintTyping: { en: 'Press any key to skip', ko: '아무 키나 눌러 건너뛰기' },
  hintDone: { en: 'Press any key to close', ko: '아무 키나 눌러 닫기' },
  hintCredits: { en: 'Press any key to skip', ko: '아무 키나 눌러 건너뛰기' },
  archiveTitle: { en: 'Logs', ko: '기록' },
  recovered: { en: 'RECOVERED', ko: '회수됨' },
  back: { en: 'Back', ko: '뒤로' },
  logsButton: { en: 'Logs', ko: '기록' },
  creditsButton: { en: 'Roll credits', ko: '크레딧 보기' },
  dataLog: { en: 'DATA LOG', ko: '데이터 로그' },
  langButton: { en: '한국어', ko: 'English' },
} as const satisfies Record<string, Bilingual>;
