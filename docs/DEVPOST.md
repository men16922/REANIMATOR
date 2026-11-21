# Devpost submission text (draft)

Category: **Resurrection**. Paste each section into the matching Devpost field. Replace `<VIDEO_URL>` after the YouTube upload.

- Live demo: https://dlr55kf9v2hn7.cloudfront.net (desktop Chrome, Edge, Firefox or Safari with WebGL2)
- Code: https://github.com/men16922/REANIMATOR (MIT)
- Video: `<VIDEO_URL>`

## Inspiration

*Abuse* (Crack dot Com, 1996) was a DOS run-and-gun with mouse aim and a headlamp in the dark. Its movement felt unlike anything else, and that feel is what usually gets lost in remakes. We wanted to bring it back as a game people can play today, and to prove that the feel survived instead of just claiming it.

## What it does

REANIMATOR is a 3D side-view metroidvania that runs in the browser. You wake in a sealed cryo station, fight down to the reactor, break the Core Warden and escape a 90-second meltdown. Two more stages follow (Foundry Line, Reactor Spire), each with its own boss.

- Six connected sectors with weapon-locked doors, hidden walls and ability gates (Thruster Boots, Crawl Slide, Scan Lens and more).
- Six weapons, a dash, a melee counter, three bosses with telegraphed phases.
- Music and sound are synthesised at runtime; there are no audio files.
- **Classic View** (`V`): a 320x200, 256-colour dithered render of the same scene.
- **Physics Lab** (Extras menu): the original 1996 movement log and our engine's replay side by side. A mutation mode changes one constant and shows the check failing.

## How we built it

The resurrection part comes first. We analysed the *Abuse* DOS shareware 1.05 binary (LE executable converted to ELF, then decompiled), read the game's Lisp scripts, and recorded the original running in DOSBox with an instrumented harness. From that we rebuilt the player movement (run, jump, gravity, wall contact) in TypeScript. The engine matches the original frame by frame on all 11 measured fields in three development scenarios and one sealed holdout scenario that was never used for tuning.

On top of that physics we designed a new 3D game with Three.js and WebGL2. The levels, enemies, bosses, art and music are original. Models came from Meshy. A release check fails the build if any original *Abuse* file ends up in it.

Kiro ran the whole process:

- **Specs.** Five specs, run in order: binary reference, restored motion, 2D slice, 3D quarter-view (later replaced), side-view metroidvania.
- **Steering.** An always-on steering file lists the sealed files and the scope of the restoration. This kept every session from editing the verified physics.
- **Hook.** An agent hook re-runs the full gate whenever the engine or verifier is saved.
- **Sub-agents.** Fourteen rounds of parallel sub-agents, each working in its own git worktree, followed by an integration agent that merged the branches and re-ran the gate.
- **MCP.** The Meshy MCP server generated the terrain models, and the Playwright MCP checked every round in a real browser.

## Challenges we ran into

- The original is a 32-bit DOS/4GW executable. Our decompiler only saw the stub until we wrote an LE-to-ELF converter that applies 17,885 fixups.
- Getting exact frame matches needed the fractional accumulators the original uses for falling and jumping. The first holdout run failed. We traced it to a single `yacel = 0` write in the binary, fixed the engine, then sealed a new holdout.
- Some bugs only showed in the browser and never in unit tests: SVG transforms overridden by CSS animations, an instanced buffer one lamp short, menus left invisible by an animation that never finished. Checking every round in a real browser caught them.

## Accomplishments that we're proud of

- 1996 movement physics restored and verified frame by frame against the original. We do not claim anything beyond what we measured.
- A complete game with three stages, three bosses and three endings that runs at 60 fps in a browser.
- A deterministic simulation. Bots play every stage on every difficulty as part of `make check`, along with more than 760 unit tests.

## What we learned

A restoration needs a verification contract, not just a feeling of "close enough". That means sealed files, a holdout that is never tuned against, and a clear record of what was measured versus what was designed. Specs and steering kept that contract intact across many agent sessions.

## What's next

- Human playtests. So far every full playthrough was by a bot.
- Restoring more of the original's behaviour, such as weapon timing, using the same observe-and-verify loop.

## Prior work disclosure

Before the hackathon the author had built two unrelated projects. MYTHOS: BLACKOUT is a separate game; we read its design notes but reused no code or assets. REA is the author's MIT-licensed reverse-engineering tool; we used its CLI for the decompilation. The first commit in this repository is dated 2026-11-14. Details are in `docs/PREEXISTING_WORK.md`.

## Built with

typescript, three.js, webgl2, webaudio, vite, node.js, kiro, meshy, playwright, ghidra, dosbox, aws-s3, aws-cloudfront
