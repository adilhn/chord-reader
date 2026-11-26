import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KEYS } from '../src/js/theory.js';
import { analyze, fnHTML } from '../src/js/analysis.js';

const keyOf = name => {
  const k = KEYS.find(k => k.name === name);
  assert.ok(k, 'no key named ' + name);
  return k;
};
const strip = s => s.replace(/<[^>]+>/g, '');

// key, MIDI notes, chord symbol, Roman numeral, Nashville number, category
const IN_KEY = [
  ['C', [48, 52, 55], 'C', 'I', '1', 'Diatonic'],
  ['C', [53, 56, 60], 'Fm', 'iv', '4-', 'Borrowed'],
  ['C', [58, 62, 65], 'B♭', '♭VII', '♭7', 'Borrowed'],
  ['C', [50, 54, 57, 60], 'D7', 'V7/V', '27', 'Secondary'],
  ['C', [59, 62, 65, 67], 'G7/B', 'V65', '57/7', 'Diatonic'],
  ['C', [48, 52, 55, 57], 'C6', 'Iadd6', '16', 'Diatonic'],
  ['C', [57, 60, 64, 67], 'Am7', 'vi7', '6-7', 'Diatonic'],
  ['C', [52, 56, 59], 'E', 'V/vi', '3', 'Secondary'],
  ['C', [49, 53, 56], 'D♭', '♭II', '♭2', 'Borrowed'],
  ['C', [54, 57, 60, 63], 'F♯°7', 'vii°7/V', '♯4°7', 'Secondary'],
  ['C', [59, 62, 65, 68], 'B°7', 'vii°7', '7°7', 'Borrowed'],
  ['C', [55, 58, 62], 'Gm', 'v', '5-', 'Borrowed'],
  ['C', [48, 52, 55, 58], 'C7', 'V7/IV', '17', 'Secondary'],
  ['C', [48, 52, 55, 59, 62], 'Cmaj9', 'Imaj9', '1Δ9', 'Diatonic'],
  ['E♭', [56, 59, 63], 'A♭m', 'iv', '4-', 'Borrowed'],
  ['E♭', [61, 65, 68], 'D♭', '♭VII', '♭7', 'Borrowed'],
  ['F♯', [52, 56, 59], 'E', '♭VII', '♭7', 'Borrowed'],
  ['G♭', [59, 63, 66], 'C♭', 'IV', '4', 'Diatonic'],
  ['A', [52, 56, 59, 62, 66], 'E9', 'V9', '59', 'Diatonic'],
];

describe('analyze in a key', () => {
  for (const [keyName, midis, symbol, roman, nash, cat] of IN_KEY) {
    it(`${keyName} major: [${midis}] is ${symbol}, ${roman}, ${nash}, ${cat}`, () => {
      const an = analyze(midis, keyOf(keyName));
      assert.equal(an.kind, 'chord');
      assert.equal(an.symbol, symbol);
      assert.equal(strip(fnHTML(an, 'roman')), roman);
      assert.equal(strip(fnHTML(an, 'nashville')), nash);
      assert.equal(an.cat.short, cat);
    });
  }
});

const NO_KEY = [
  [[49, 52, 56], 'C♯m'],
  [[56, 60, 63], 'A♭'],
  [[56, 59, 63], 'G♯m'],
  [[51, 54, 58], 'E♭m'],
  [[48, 51, 54, 57], 'C°7'],
  [[47, 50, 53, 56], 'B°7'],
];

describe('analyze with no key', () => {
  for (const [midis, symbol] of NO_KEY) {
    it(`[${midis}] is ${symbol}`, () => {
      const an = analyze(midis, null);
      assert.equal(an.kind, 'chord');
      assert.equal(an.symbol, symbol);
      assert.equal(fnHTML(an, 'roman'), '', 'no chord numbers without a key');
    });
  }

  it('two notes are an interval', () => {
    const an = analyze([48, 55], null);
    assert.equal(an.kind, 'interval');
    assert.equal(an.symbol, 'Perfect 5th');
  });
  it('one note is a note', () => {
    assert.equal(analyze([60], null).kind, 'note');
  });
  it('a cluster has no chord name', () => {
    assert.equal(analyze([60, 61, 62], null).kind, 'unknown');
  });
  it('no notes gives null', () => {
    assert.equal(analyze([], null), null);
  });
});
