// Pure music-theory helpers: keys, spelling, and which staff a group of notes belongs on.
/* ---------- Music theory basics ---------- */
const NAT = [0, 2, 4, 5, 7, 9, 11];            // semitones of C D E F G A B
const MAJ = NAT;                               // major-scale intervals above the tonic
const LET = 'CDEFGAB';
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];     // F C G D A E B (letter indexes)
const FLAT_ORDER  = [6, 2, 5, 1, 4, 0, 3];     // B E A D G C F
const SHARP_POS = [38, 35, 39, 36, 33, 37, 34]; // treble-staff steps for key-signature sharps
const FLAT_POS  = [34, 37, 33, 36, 32, 35, 31]; // treble-staff steps for key-signature flats (bass = -14)

// name, tonic letter, tonic accidental, signature (+sharps / -flats)
const KEYS = [
  ['C', 0, 0, 0], ['G', 4, 0, 1], ['D', 1, 0, 2], ['A', 5, 0, 3], ['E', 2, 0, 4], ['B', 6, 0, 5], ['F♯', 3, 1, 6],
  ['F', 3, 0, -1], ['B♭', 6, -1, -2], ['E♭', 2, -1, -3], ['A♭', 5, -1, -4], ['D♭', 1, -1, -5], ['G♭', 4, -1, -6],
].map(([name, letter, acc, sig]) => {
  const ks = [0, 0, 0, 0, 0, 0, 0];             // accidental per letter in this key
  if (sig > 0) for (let i = 0; i < sig; i++) ks[SHARP_ORDER[i]] = 1;
  else for (let i = 0; i < -sig; i++) ks[FLAT_ORDER[i]] = -1;
  return { name, letter, acc, sig, ks };
});
const NO_KEY_KS = [0, 0, 0, 0, 0, 0, 0];

const QUAL  = ['', 'm', 'm', '', '', 'm', '°'];
const ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const NASH_DIA = ['1', '2-', '3-', '4', '5', '6-', '7°'];
// Close-position triads as diatonic step offsets above the bass note
const SHAPES = [[0, 2, 4], [0, 2, 5], [0, 3, 5]]; // root, 1st inversion, 2nd inversion

// A "step" is a diatonic position: octave*7 + letter. C4 (middle C) = 28.
const norm = x => ((x % 12) + 12) % 12;
const sgn = x => { x = norm(x); return x > 6 ? x - 12 : x; };   // signed distance, -5..6
const letterOf = step => ((step % 7) + 7) % 7;
const octOf = step => Math.floor(step / 7);
const midiOf = (step, acc) => 12 * (octOf(step) + 1) + NAT[letterOf(step)] + acc;
const accStr = a => (a > 0 ? '♯'.repeat(a) : a < 0 ? '♭'.repeat(-a) : '');
const noteName = (step, acc) => LET[letterOf(step)] + accStr(acc) + octOf(step);
const tonicPc = key => norm(NAT[key.letter] + key.acc);
const diaName = (key, d) => { const L = (key.letter + d) % 7; return LET[L] + accStr(key.ks[L]) + QUAL[d]; };

// Spell a MIDI note in a key: diatonic spelling first, then a natural sign, then the key's direction.
function spell(m, key) {
  const pc = norm(m);
  let best = null;
  for (let L = 0; L < 7; L++) {
    const a = sgn(pc - NAT[L]);
    if (Math.abs(a) > 1) continue;
    const score = a === key.ks[L] ? 0 : a === 0 ? 1 : ((key.sig >= 0) === (a > 0)) ? 2 : 3;
    if (!best || score < best.score) best = { L, a, score };
  }
  const oct = (m - NAT[best.L] - best.a) / 12 - 1;
  return { step: oct * 7 + best.L, acc: best.a, sign: best.a === key.ks[best.L] ? null : best.a, midi: m };
}
// Spelling with no key: the usual lead-sheet names for the black keys
const DEFAULT_SPELL = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];

/* ---------- Staff placement (pure) ---------- */
function ledgers(steps, st) {
  const top = st === 'T' ? 38 : 26, bot = st === 'T' ? 30 : 18;
  const mx = Math.max(...steps), mn = Math.min(...steps);
  return Math.max(0, Math.floor((mx - top) / 2)) + Math.max(0, Math.floor((bot - mn) / 2));
}
// Whole chord on the staff that needs fewer ledger lines. On a tie, a chord whose middle note
// is middle C or higher goes on the treble staff.
// `prefer` ('T' or 'B'), when given, decides a tie instead of the middle note.
function chooseStaff(notes, prefer) {
  const st = notes.map(n => n.step), t = ledgers(st, 'T'), b = ledgers(st, 'B');
  if (t !== b) return t < b ? 'T' : 'B';
  if (prefer) return prefer;
  const ms = notes.map(n => n.midi).sort((a, b) => a - b), h = ms.length / 2;
  const mid = ms.length % 2 ? ms[Math.floor(h)] : (ms[h - 1] + ms[h]) / 2;
  return mid >= 60 ? 'T' : 'B';
}
// Played notes (free play, and the quiz's live column): notes within an octave are treated as one hand
// and kept on one staff.
// A wider spread is split at its biggest gap into two hands, and each hand gets its own staff.
const HAND_SPAN = 12;
function placeFree(notes, prefer) {
  const out = new Map();
  const keep = grp => { const st = chooseStaff(grp, prefer); grp.forEach(n => out.set(n.midi, st)); };
  const span = grp => grp[grp.length - 1].midi - grp[0].midi;
  if (span(notes) <= HAND_SPAN) { keep(notes); return out; }
  let cut = 1, gap = -1;
  for (let i = 1; i < notes.length; i++) {
    const g = notes[i].midi - notes[i - 1].midi;
    if (g > gap) { gap = g; cut = i; }
  }
  for (const grp of [notes.slice(0, cut), notes.slice(cut)]) {
    if (span(grp) <= HAND_SPAN) keep(grp);
    else grp.forEach(n => out.set(n.midi, n.step < 28 ? 'B' : 'T'));
  }
  return out;
}

export { NAT, MAJ, LET, SHARP_ORDER, FLAT_ORDER, SHARP_POS, FLAT_POS, KEYS, NO_KEY_KS, QUAL, ROMAN, NASH_DIA, SHAPES,
  norm, sgn, letterOf, octOf, midiOf, accStr, noteName, tonicPc, diaName, spell, DEFAULT_SPELL,
  ledgers, chooseStaff, HAND_SPAN, placeFree };
