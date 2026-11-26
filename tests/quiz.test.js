import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, MAJ, norm, tonicPc } from '../src/js/theory.js';
import { fnHTML } from '../src/js/analysis.js';
import { makeChord, ROUND_TYPES, buildRound, matches, diagnose } from '../src/js/quiz.js';

// Small seeded random number generator (mulberry32), so rounds are reproducible.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const strip = s => s.replace(/<[^>]+>/g, '');
const C = KEYS.find(k => k.name === 'C');

describe('makeChord', () => {
  // Root-position shape by scale degree: I ii iii IV V vi vii°
  const ROOT = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6] };
  const QUALITY = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
  // Semitones above the bass note for an inversion of a root-position shape [0, a, b]
  const invert = ([, a, b], inv) => inv === 0 ? [0, a, b] : inv === 1 ? [0, b - a, 12 - a] : [0, 12 - b, 12 + a - b];
  const ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
  const FIGS = ['', '6', '64'];

  for (const key of KEYS) {
    it(`builds every diatonic triad in ${key.name} major`, () => {
      for (let deg = 0; deg < 7; deg++) {
        for (let inv = 0; inv < 3; inv++) {
          for (let oct = 2; oct <= 4; oct++) {
            const ch = makeChord(key, deg, inv, oct);
            const where = `${key.name} major, degree ${deg}, inversion ${inv}, octave ${oct}`;
            assert.equal(ch.notes.length, 3, where);
            const midis = ch.notes.map(n => n.midi);
            assert.deepEqual(midis.map(m => m - midis[0]), invert(ROOT[QUALITY[deg]], inv), where + ': intervals');
            for (const m of midis) assert.ok(MAJ.includes(norm(m - tonicPc(key))), where + `: ${m} is not in the key`);
            const bassStep = Math.min(...ch.notes.map(n => n.step));
            assert.equal(Math.floor(bassStep / 7), oct, where + ': octave of the bass note');
            assert.equal(ch.name, ch.an.symbol, where);
            assert.equal(strip(fnHTML(ch.an, 'roman')), ROMAN[deg] + FIGS[inv], where + ': Roman numeral');
            assert.equal(ch.an.cat.short, 'Diatonic', where);
            assert.ok(ch.staff === 'T' || ch.staff === 'B', where + ': staff');
          }
        }
      }
    });
  }
});

describe('buildRound', () => {
  const ALL = { keyMode: 'C', roundType: 'degrees', octaves: [2, 3, 4], inversions: [0, 1, 2] };
  const same = (a, b) => a.deg === b.deg && a.inv === b.inv && a.oct === b.oct;

  it('ROUND_TYPES has the 7, 10 and 20 chord rounds', () => {
    assert.deepEqual(ROUND_TYPES, { degrees: 7, random10: 10, random20: 20 });
  });

  it("'degrees' gives 7 chords, each scale degree once", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const r = buildRound(ALL, null, seeded(seed));
      assert.equal(r.chords.length, 7);
      assert.deepEqual(r.chords.map(c => c.deg).sort(), [0, 1, 2, 3, 4, 5, 6], 'seed ' + seed);
    }
  });

  it('an unknown round type falls back to the 7-chord round', () => {
    const r = buildRound({ ...ALL, roundType: 'bogus' }, null, seeded(7));
    assert.equal(r.chords.length, 7);
  });

  for (const [type, n] of [['random10', 10], ['random20', 20]]) {
    it(`'${type}' gives ${n} chords and never the same chord twice in a row`, () => {
      // The narrow options leave only 7 possible chords, so repeats would be common without the rule.
      for (const opts of [{ ...ALL, roundType: type }, { ...ALL, roundType: type, octaves: [3], inversions: [0] }]) {
        for (let seed = 1; seed <= 300; seed++) {
          const r = buildRound(opts, null, seeded(seed));
          assert.equal(r.chords.length, n, 'seed ' + seed);
          for (let i = 1; i < r.chords.length; i++) {
            assert.ok(!same(r.chords[i], r.chords[i - 1]), `seed ${seed}: chords ${i - 1} and ${i} are the same`);
          }
        }
      }
    });
  }

  it('only uses the selected inversions and octaves', () => {
    for (const roundType of ['degrees', 'random10', 'random20']) {
      const opts = { ...ALL, roundType, inversions: [1, 2], octaves: [2, 4] };
      for (let seed = 1; seed <= 50; seed++) {
        for (const c of buildRound(opts, null, seeded(seed)).chords) {
          assert.ok([1, 2].includes(c.inv), `${roundType} seed ${seed}: inversion ${c.inv}`);
          assert.ok([2, 4].includes(c.oct), `${roundType} seed ${seed}: octave ${c.oct}`);
        }
      }
    }
  });

  it("keyMode 'C' always gives C major", () => {
    for (let seed = 1; seed <= 20; seed++) assert.equal(buildRound(ALL, 'C', seeded(seed)).key.name, 'C');
  });

  it("keyMode 'random' never repeats the previous key", () => {
    const seen = new Set();
    for (const last of KEYS.map(k => k.name)) {
      for (let seed = 1; seed <= 40; seed++) {
        const r = buildRound({ ...ALL, keyMode: 'random' }, last, seeded(seed));
        assert.notEqual(r.key.name, last, 'seed ' + seed);
        seen.add(r.key.name);
      }
    }
    assert.equal(seen.size, KEYS.length, 'every key should come up');
  });

  it('is deterministic for a given seed', () => {
    const a = buildRound({ ...ALL, keyMode: 'random', roundType: 'random20' }, null, seeded(42));
    const b = buildRound({ ...ALL, keyMode: 'random', roundType: 'random20' }, null, seeded(42));
    assert.equal(a.key.name, b.key.name);
    assert.deepEqual(a.chords.map(c => c.name), b.chords.map(c => c.name));
  });
});

describe('matches and diagnose', () => {
  const ch = makeChord(C, 0, 0, 4); // C4 E4 G4

  it('the target is C4 E4 G4', () => {
    assert.deepEqual(ch.notes.map(n => n.midi), [60, 64, 67]);
  });

  it('the exact notes match, in any order and from a Set', () => {
    assert.ok(matches(ch, [60, 64, 67], true));
    assert.ok(matches(ch, [67, 60, 64], true));
    assert.ok(matches(ch, new Set([64, 67, 60]), true));
  });

  it('the same chord an octave up matches only when the octave need not match', () => {
    assert.equal(matches(ch, [72, 76, 79], true), false);
    assert.equal(matches(ch, [72, 76, 79], false), true);
    assert.equal(matches(ch, [48, 52, 55], false), true);
  });

  it('other notes do not match', () => {
    assert.equal(matches(ch, [60, 64], false), false);
    assert.equal(matches(ch, [60, 63, 67], false), false);
    assert.equal(matches(ch, [64, 67, 72], false), false, 'an inversion is a different chord');
    assert.equal(matches(ch, [60, 64, 67, 72], false), false, 'an extra note');
  });

  it('says when the chord is in the wrong octave', () => {
    assert.match(diagnose([72, 76, 79], ch, true), /octave/);
    assert.match(diagnose([72, 76, 79], ch, true), /1 octave too high/);
    assert.match(diagnose([48, 52, 55], ch, true), /1 octave too low/);
    assert.match(diagnose([84, 88, 91], ch, true), /2 octaves too high/);
  });

  it('says when the inversion is wrong', () => {
    assert.match(diagnose([64, 67, 72], ch, true), /inversion/);
    assert.match(diagnose([55, 60, 64], ch, false), /inversion/);
  });

  it('says when the right notes are spaced differently', () => {
    assert.match(diagnose([60, 67, 76], ch, true), /spaced differently/);
  });

  it('counts notes that are not in the chord', () => {
    assert.match(diagnose([60, 64, 68], ch, true), /1 of your notes is not in the chord/);
    assert.match(diagnose([61, 65, 68], ch, true), /3 of your notes are not in the chord/);
  });

  // Suspected bug in quiz.js: the chord plus a doubled chord tone (C4 E4 G4 C5) is reported as
  // "Right notes, but spaced differently", because the pitch-class check runs before the extra-note
  // check. With exact = true the "extra note" message can never be reached. With exact = false it is
  // only reached when a chord tone is missing (C4 E4 C5 E5 says "1 extra note" though G is missing).
  // Marked todo so it is reported without failing the suite; drop the todo once diagnose is fixed.
  it('says "extra note" for the whole chord plus a doubled note', { todo: 'diagnose checks pitch classes before extra notes' }, () => {
    assert.match(diagnose([60, 64, 67, 72], ch, true), /1 extra note/);
    assert.match(diagnose([60, 64, 67, 72], ch, false), /1 extra note/);
  });
});
