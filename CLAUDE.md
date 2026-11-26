# Chord Reader: notes for AI coding sessions

Chord-reading trainer for Android Chrome with a USB MIDI piano (Web MIDI). Grand staff drawn in SVG. Live at https://adilhn.github.io/chord-reader/ (GitHub Pages, repo adilhn/chord-reader).

## Layout

- `src/index.html`: markup, settings sheets, and the SVG glyph `<defs>`.
- `src/styles.css`: all styles. Elements with `show-<mode>` classes are visible only in that mode (`body[data-mode]`).
- `src/js/theory.js`: keys (`KEYS`, each with `ks`, the accidental per letter), diatonic steps, `spell(m, key)`, staff choice (`ledgers`, `chooseStaff`, `placeFree`), key-signature positions (`SHARP_POS`, `FLAT_POS`).
- `src/js/analysis.js`: chord templates (`TPL`), `identify`, `analyze(midis, key)`, secondary dominants, and the chord-number labels `fnHTML(an, notation)` / `fnSVG(an, x, y, color, notation)`.
- `src/js/quiz.js`: `makeChord(key, deg, inv, oct)`, `buildRound(opts, lastKeyName, rand)`, `ROUND_TYPES`, `matches(ch, notes, exact)`, `diagnose(played, ch, exact)`.
- `src/js/main.js`: everything with state or a DOM: settings (localStorage key `chordReader.settings`), quiz flow, SVG drawing, MIDI input, wake lock, settings and key sheets, and the test hook `window.__chordReader`.
- `index.html` (repo root): the old hand-built single file. Leave it alone; it is not built or deployed.
- `scripts/build.mjs`, `tests/`, `.github/workflows/deploy.yml`: build, tests, deploy.

## Rules

- theory.js, analysis.js and quiz.js stay pure: no DOM, no `settings`, no module-level mutable state. Anything that depends on a setting is a parameter (`notation` for fnHTML/fnSVG, `exact` for matches/diagnose). Randomness comes in as a `rand` function so tests can seed it.
- New logic that can be pure goes in those modules, with tests. main.js only wires it to the UI.
- No em dashes in UI text (or docs). Use commas, colons, or the ` · ` separator the UI already uses.

## Staff geometry and glyphs

- Positions are diatonic steps: `step = octave * 7 + letter`, C4 (middle C) = 28. Treble staff lines are steps 30..38 (E4..F5), bass staff lines 18..26 (G2..A3).
- The layout constants are in the "Staff geometry" block at the top of main.js: `S`/`HS` (staff space, half space), `TT`/`TB`/`GAP`/`BT`/`BB` (staff tops and bottoms), `VH`/`VH_FREE` (view heights), `SLOT`, `LIVE_DX`, `NW`, glyph scales `kG`/`kF`/`kA`/`kW`, the `ACC` accidental metrics, and `yOf(step, staff)`.
- The glyph outlines (clefs, accidentals, whole note, brace) are paths from the FreeSerif font (GNU FreeFont), stored in the `<defs>` of src/index.html and drawn with `<use href="#g-...">`. They are in font units with y pointing up, which is why `glyph()` scales by `(k, -k)`.

## Product decisions to keep

- A chord played by one hand stays on one staff. The staff with fewer ledger lines wins; on a tie, the middle note decides (middle C or higher goes on the treble staff). See `chooseStaff` and `placeFree`.
- The quiz shows chord names only. No Roman or Nashville numbers in quiz mode.
- Keep the 7-chord round (each scale degree once) alongside the 10 and 20 random-chord rounds.
- No em dashes in UI text.

## Testing

- `npm test` runs `node --test "tests/*.test.js"` (node:test and node:assert only, no dependencies). Note that `node --test tests/` does not work on Node 22: a directory is not expanded.
- One test in tests/quiz.test.js is marked `todo`: `diagnose` reports "spaced differently" instead of "1 extra note" when the whole chord is played plus a doubled note. Remove the `todo` once that is fixed.
- Browser smoke test: build, serve `dist/` with `python3 -m http.server`, then load it in headless Chrome (Python Playwright, `p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])`) and drive it through `window.__chordReader`:
  - `noteOn(m)`, `noteOff(m)`, `pedalChange(v)` to play.
  - `round`, `state`, `stats`, `settings` to inspect (getters).
  - `setSettings({mode: 'pick', pickKey: 'C'})` to change modes, `setRandomKey(name)`, `startRound()`.
  - In headless Chrome MIDI shows as blocked, and the only expected console error is a 404 for favicon.ico.
- For the source version, serve the repo root and open `/src/index.html` (ES modules do not load from file://).

## Build and deploy

- `npm run build` runs scripts/build.mjs. It bundles src/js/main.js with esbuild (IIFE, minified, es2020), minifies the CSS, and inlines both into `dist/index.html`. It replaces exactly these two tags, and fails if either is missing, so keep them as they are:
  - `<link rel="stylesheet" href="styles.css">` in the head
  - `<script type="module" src="js/main.js"></script>` at the end of the body
- The HTML minification is light: it only collapses whitespace runs that contain a line break. Tags, comments, and pre/textarea/script/style contents are copied as is.
- If they exist, `src/manifest.webmanifest`, `src/icons/` and `src/sw.js` are copied to `dist/`. In sw.js every `__BUILD_VERSION__` becomes the short commit SHA (from `GITHUB_SHA` in CI, else `git rev-parse --short HEAD`, else a timestamp).
- esbuild is pinned to an exact version in package.json. There is no lockfile.
- Deploy: a push to `main` (or a manual "Run workflow") runs the `test` job, then the `deploy` job: build, then upload `dist/` to GitHub Pages. Pull requests run only the tests. The repo's Pages source must be set to "GitHub Actions" (Settings > Pages).
