// Accessibility settings persisted under one versioned key. Pure parse/serialize; the DOM layer owns localStorage.

export const SETTINGS_KEY = 'reanimator.settings.v1';

export interface Settings {
  /** Reduce Motion / Flash: damps camera shake and screen flashes. */
  reduceFx: boolean;
  /** Larger HUD text. */
  largeHud: boolean;
}

export const defaultSettings = (): Settings => ({ reduceFx: false, largeHud: false });

export function parseSettings(raw: string | null | undefined): Settings {
  const out = defaultSettings();
  let o: unknown;
  try {
    o = JSON.parse(raw ?? 'null');
  } catch {
    return out;
  }
  if (!o || typeof o !== 'object') return out;
  const r = o as Record<string, unknown>;
  if (typeof r.reduceFx === 'boolean') out.reduceFx = r.reduceFx;
  if (typeof r.largeHud === 'boolean') out.largeHud = r.largeHud;
  return out;
}

export const serializeSettings = (s: Settings): string => JSON.stringify({ reduceFx: s.reduceFx, largeHud: s.largeHud });
