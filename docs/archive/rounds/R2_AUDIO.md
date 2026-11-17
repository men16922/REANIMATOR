# R2 Audio (track D)

All sound is WebAudio procedural synthesis (no files). Listening checks are **unverified**; only pure logic is covered by `tests/audio.test.ts`.

## Music
- 16-step bars. Form: intro(2) / A(4) / B(4) / A(4) / B(4) / break(2); the intro plays once, boss and meltdown loop A/B only.
- Layers per section: pad, arp, bass, kick, snare, hat, perc (metal clang / tom), lead. Fills on the last beat of A/B, riser on the last break bar, crash on section starts.
- Chord progressions per theme, sidechain pump on kicks (pad and melody), tempo-synced feedback delay, reverb send.
- Themes: airlock (drumless ambient synth), shaft (dorian pulse), mines (industrial clang percussion), biolabs (dreamy arpeggio), security (tight tense pulse), core (dark locrian), boss, meltdown (faster, two-tone alarm lead), title (ominous drone), victory.
- Boss phases: I pad/bass/kick/perc, II + arp/snare/hat, III + lead; +4% tempo per phase; a crash and tom accent on the change.

## Console checks (`window.__reanimatorAudio`)
- `__reanimatorAudio()` returns state, theme, `music` (section, bar, layers, intensity), room, paused, rail, counters, last 48 plays.
- `__reanimatorAudio.bgm(true,'boss')`, `.musicIntensity(3)`, `.play('boss.phase')`, `.play('ui.combo',{pitch:1.5})`, `.railCharge(0.6)`, `.setPaused(true)`.

## UI hooks in main.ts
`show()` passes the mode to `syncBeds`; `showSectorCard` (ui.sector), `showPickupBanner` (ui.banner), `showResult` (ui.rank with rank pitch), and one delegated focusin/click listener for menu sounds.
