import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, MAJ, norm, tonicPc, midiOf, letterOf, spell, placeFree } from '../src/js/theory.js';
import { analyze } from '../src/js/analysis.js';

describe('KEYS', () => {
  it('has the 13 major keys with unique names', () => {
    assert.equal(KEYS.length, 13);
    assert.equal(new Set(KEYS.map(k => k.name)).size, 13);
    assert.equal(KEYS[0].name, 'C');
  });
});

describe('spell', () => {
  for (const key of KEYS) {
    it(`round-trips every piano key in ${key.name} major`, () => {
      for (let m = 21; m <= 108; m++) {
        const sp = spell(m, key);
        const where = `${key.name} major, midi ${m}`;
        assert.equal(sp.midi, m, where);
        assert.equal(midiOf(sp.step, sp.acc), m, where + ': step and accidental give a different note');
        const diatonic = MAJ.includes(norm(m - tonicPc(key)));
        if (diatonic) {
          assert.equal(sp.sign, null, where + ': a diatonic note should need no accidental sign');
          assert.equal(sp.acc, key.ks[letterOf(sp.step)], where + ': a diatonic note should use the key spelling');
        } else {
          assert.notEqual(sp.sign, null, where + ': a chromatic note needs an accidental sign');
        }
      }
    });
  }
});

describe('placeFree', () => {
  // Staff ('T' treble, 'B' bass) for each note, bottom to top.
  const place = midis => {
    const notes = analyze(midis, null).notes;
    const map = placeFree(notes);
    return notes.map(n => map.get(n.midi));
  };

  it('G3 C4 E4 is one hand on the treble staff (tie, middle note is middle C)', () => {
    assert.deepEqual(place([55, 60, 64]), ['T', 'T', 'T']);
  });
  it('F3 A3 C4 is one hand on the bass staff (fewer ledger lines)', () => {
    assert.deepEqual(place([53, 57, 60]), ['B', 'B', 'B']);
  });
  it('a low C2 with E4 G4 C5 splits into two hands', () => {
    assert.deepEqual(place([36, 64, 67, 72]), ['B', 'T', 'T', 'T']);
  });
  it('C3 E3 G3 C4 E4 G4 splits at the biggest gap', () => {
    assert.deepEqual(place([48, 52, 55, 60, 64, 67]), ['B', 'B', 'B', 'T', 'T', 'T']);
  });
});
