# Chord Reader

Chord Reader is a practice app for reading chords on the grand staff. You plug a MIDI piano or keyboard into an Android phone or tablet, open the app in Chrome, and play what you see. The app listens to the keyboard through Web MIDI, so it can tell you straight away whether you played the right notes.

Live app: https://adilhn.github.io/chord-reader/

## What you need

- An Android phone or tablet with Chrome.
- A MIDI keyboard or digital piano with a USB port.
- A USB OTG cable or adapter, so the keyboard can plug into the phone.

The first time you open the app, Chrome asks for permission to use MIDI devices. Allow it. If the dot at the top left is red, tap it to try again.

## Modes

Open the settings (the sliders icon, top right) to switch modes.

### Quiz

The app writes a chord on the staff. You play it. When you get it right, the staff scrolls to the next chord. At the end of a round you see how many you got right on the first try.

Quiz options:

- **Round**: 7 chords (one for each scale degree, in random order), 10 random chords, or 20 random chords.
- **Key**: C major, or a random major key that changes every round.
- **Octaves**: which octaves the lowest note of a chord can be in.
- **Inversions**: root position, 1st inversion, 2nd inversion, or any mix.
- **Chords near middle C**: write each chord on one staff (the standard way), or split the notes at middle C.
- **Octave must match**: whether you have to play the exact notes, or the same chord in any octave.

The quiz shows chord names only, such as C, Dm or G/B.

### Free play

Play anything and the app writes it on the staff and names it. There are three free play modes:

- **No key**: chord names only.
- **Random key**: the app picks a major key for you. Tap the refresh icon for a new one.
- **Choose key**: you pick the major key.

When there is a key, the app also shows:

- the chord number, as a Roman numeral (iv, ♭VII) or a Nashville number (4-, ♭7). Tap the button in the header to switch between them.
- what kind of chord it is in that key: **diatonic** (all its notes are in the key), **secondary** (a secondary dominant or leading-tone chord, such as V/V), **borrowed** (taken from a related mode, such as the parallel minor), or **chromatic** (none of these).

The sustain pedal setting decides whether notes held by the pedal count as part of the chord.

## Install it as an app on Android

1. Open https://adilhn.github.io/chord-reader/ in Chrome.
2. Tap the three-dot menu at the top right.
3. Tap **Install app**. On some phones this is called **Add to Home screen**.

The app then opens from its own icon on the home screen, without the browser address bar.

## Local development

The source is in `src/`:

- `src/index.html`: the page
- `src/styles.css`: the styles
- `src/js/`: the code, as ES modules

ES modules do not load from a `file://` page, so you need a local web server. From the root of the repo:

```sh
python3 -m http.server
```

Then open http://localhost:8000/src/index.html. Chrome allows Web MIDI on `localhost`, so a keyboard works here too.

The `index.html` file in the repo root is an older, hand-built single-file version of the app. It is not used by the build.

## Tests

You need Node 22. The tests use only Node's built-in test runner, so there is nothing to install first.

```sh
npm test
```

## Build

```sh
npm install
npm run build
```

The build writes `dist/index.html`. This is one self-contained file: the CSS and the JavaScript are minified and placed inside the page. If `src/manifest.webmanifest`, `src/sw.js` and `src/icons/` exist, they are copied into `dist/` too.

To try the built version:

```sh
cd dist
python3 -m http.server
```

Then open http://localhost:8000/.

## Deploy

Push to the `main` branch. GitHub Actions then runs the tests, builds the app and publishes `dist/` to GitHub Pages. Pull requests run the tests but do not deploy. You can also start a deploy by hand from the Actions tab ("Run workflow").

This needs a one-time setting in the repo: go to **Settings > Pages** and, under **Build and deployment**, set **Source** to **GitHub Actions**.
