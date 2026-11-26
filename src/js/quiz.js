// Quiz rounds and judging. Pure functions: no DOM, no app state.
import { KEYS, SHAPES, letterOf, midiOf, chooseStaff } from './theory.js';
import { analyze } from './analysis.js';

// A close-position diatonic triad: scale degree (0-6), inversion (0-2), octave of its lowest note.
function makeChord(key, deg, inv, oct) {
  const bassLetter = (key.letter + deg + 2 * inv) % 7;
  const bass = oct * 7 + bassLetter;
  const notes = SHAPES[inv].map(off => {
    const step = bass + off, acc = key.ks[letterOf(step)];
    return { step, acc, midi: midiOf(step, acc) };
  });
  const an = analyze(notes.map(n => n.midi), key);
  const ch = { deg, inv, oct, notes, an, name: an.symbol };
  ch.staff = chooseStaff(notes);
  return ch;
}

const pickFrom = (a, rand) => a[Math.floor(rand() * a.length)];
function shuffled(a, rand) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Round types:
//   degrees  - each of the 7 scale-degree chords once, in random order
//   random10 / random20 - that many chords picked fully at random (repeats allowed),
//                         but never the exact same chord twice in a row
const ROUND_TYPES = { degrees: 7, random10: 10, random20: 20 };
function buildRound(opts, lastKeyName = null, rand = Math.random) {
  const key = opts.keyMode === 'random' ? pickFrom(KEYS.filter(k => k.name !== lastKeyName), rand) : KEYS[0];
  const one = deg => makeChord(key, deg, pickFrom(opts.inversions, rand), pickFrom(opts.octaves, rand));
  const type = ROUND_TYPES[opts.roundType] ? opts.roundType : 'degrees';
  if (type === 'degrees') return { key, chords: shuffled([0, 1, 2, 3, 4, 5, 6], rand).map(one) };
  const chords = [];
  while (chords.length < ROUND_TYPES[type]) {
    const c = one(Math.floor(rand() * 7)), p = chords[chords.length - 1];
    if (p && p.deg === c.deg && p.inv === c.inv && p.oct === c.oct) continue;
    chords.push(c);
  }
  return { key, chords };
}

/* ---------- Judging ---------- */
function matches(ch, notes, exact) {
  const t = ch.notes.map(n => n.midi).sort((a, b) => a - b);
  const p = [...notes].sort((a, b) => a - b);
  if (p.length !== t.length) return false;
  const d = p[0] - t[0];
  if (exact ? d !== 0 : d % 12 !== 0) return false;
  return p.every((m, i) => m - t[i] === d);
}

function diagnose(played, ch, exact) {
  const t = ch.notes.map(n => n.midi).sort((a, b) => a - b);
  const p = [...played].sort((a, b) => a - b);
  const pcs = a => [...new Set(a.map(m => m % 12))].sort((x, y) => x - y).join(',');
  if (p.length === t.length) {
    const d = p[0] - t[0];
    if (d !== 0 && d % 12 === 0 && p.every((m, i) => m - t[i] === d)) {
      const o = Math.abs(d / 12);
      return 'Right chord, ' + o + ' octave' + (o > 1 ? 's' : '') + (d > 0 ? ' too high' : ' too low');
    }
  }
  if (pcs(p) === pcs(t)) {
    if (p[0] % 12 !== t[0] % 12) return 'Right notes, wrong inversion: check the bottom note';
    return 'Right notes, but spaced differently';
  }
  const hit = m => exact ? t.includes(m) : t.some(x => x % 12 === m % 12);
  const wrong = p.filter(m => !hit(m)).length;
  if (!wrong && p.length > t.length) return 'Not quite: ' + (p.length - t.length) + ' extra note' + (p.length - t.length > 1 ? 's' : '');
  return 'Not quite: ' + wrong + ' of your notes ' + (wrong === 1 ? 'is' : 'are') + ' not in the chord (red)';
}

export { makeChord, ROUND_TYPES, buildRound, matches, diagnose };
