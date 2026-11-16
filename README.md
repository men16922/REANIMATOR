# REANIMATOR

![REANIMATOR title screen](public/og-image.png)

**A 3D side-view sci-fi metroidvania that runs in your browser.** You wake in a sealed cryo station. Something below keeps the reactor burning. Reach the core, break it, and get out.

## Features

- Six connected sectors with locked doors, hidden walls and ability gates.
- Metroid-style abilities: Thruster Boots (double jump), Blast Core, Scan Lens, Thermal Plating, and Energy Tanks.
- Six weapons, a dash with brief invulnerability, a counter, and the three-phase Core Warden boss.
- A Meltdown escape and three endings.
- Three stages. Stage 1 is the cryo facility. Stages 2 (Foundry Line) and 3 (Reactor Spire) unlock one after another from the Stages menu, with lever doors, exit teleporters, a clear screen and saved best times.
- Minimal HUD, with a short skippable tutorial you can replay from Extras or the pause menu.
- Classic View (press `V`): a 320x200 dithered look with an optional CRT filter.
- Procedural music and effects. Assist options, reduce flashing, gore level and three difficulties.

## Controls

| Key | Action |
|---|---|
| `A` `D` | Run |
| `W` / `Space` | Jump (twice with Thruster Boots) |
| `S` | Drop through grates |
| `Shift` | Dash |
| `Ctrl` | Sneak |
| Mouse, left click | Aim and fire (hold to charge the Rail-Cannon) |
| `1`-`6` / `Q` | Weapons |
| `E` | Headlamp |
| `X` | Counter |
| `Z` | Scan pulse |
| `F` | Save station or console |
| `Tab` | Sector map |
| `V` | Classic View |
| `Esc` | Pause (full controls and settings) |

## System requirements

A desktop browser with WebGL2 (current Chrome, Edge, Firefox or Safari), a keyboard and mouse, and a GPU from the last ten years.

## Run from source

Node 26.12.1 or newer is required.

```bash
npm install
npm run dev        # development server
npm run build      # production build in dist/
make release       # runs all checks, then writes release/reanimator-<version>-web.zip
```

Production builds do not expose debug hooks. Add `?debug=1` to the URL to enable them for testing.

## Tests

`make check` runs the type check, unit tests, bot playthroughs, reachability checks, a production build and a guard that keeps unwanted files out of `dist/`.

## Credits and licenses

Built with TypeScript, Three.js (MIT), Vite and WebAudio. Character and prop models were generated with Meshy. Music and effects are synthesised at runtime. The run-and-gun feel nods to *Abuse* (1996); no assets from that game are included. Code is MIT licensed, see [LICENSE](LICENSE). Release notes are in [CHANGELOG.md](CHANGELOG.md).
