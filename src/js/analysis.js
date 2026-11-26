// Chord recognition and harmonic analysis. Pure functions: no DOM, no app state.
import { NAT, MAJ, LET, KEYS, NO_KEY_KS, QUAL, ROMAN, norm, sgn, letterOf, accStr, tonicPc, diaName, spell, DEFAULT_SPELL } from './theory.js';

/* ---------- Chord recognition ---------- */
// m: semitones above the root -> chord-member label. req: must be present. opt: may be missing.
// n: Nashville [inline, superscript]. cs: case of the Roman numeral. kind: triad / 7th get figured-bass inversions.
const TPL = [
  { id: 'maj',   m: { 0: 'R', 4: '3', 7: '5' }, req: [0, 4, 7], sym: '', n: ['', ''], cs: 'U', mark: '', kind: 'triad', name: 'Major triad', dom: 1 },
  { id: 'min',   m: { 0: 'R', 3: '♭3', 7: '5' }, req: [0, 3, 7], sym: 'm', n: ['-', ''], cs: 'l', mark: '', kind: 'triad', name: 'Minor triad' },
  { id: 'dom7',  m: { 0: 'R', 4: '3', 7: '5', 10: '♭7' }, req: [0, 4, 10], opt: [7], sym: '7', n: ['', '7'], cs: 'U', mark: '', kind: '7th', name: 'Dominant 7th', dom: 1 },
  { id: 'min7',  m: { 0: 'R', 3: '♭3', 7: '5', 10: '♭7' }, req: [0, 3, 10], opt: [7], sym: 'm7', n: ['-', '7'], cs: 'l', mark: '', kind: '7th', name: 'Minor 7th' },
  { id: 'maj7',  m: { 0: 'R', 4: '3', 7: '5', 11: '7' }, req: [0, 4, 11], opt: [7], sym: 'maj7', n: ['', 'Δ7'], cs: 'U', mark: 'maj', kind: '7th', name: 'Major 7th' },
  { id: 'dim',   m: { 0: 'R', 3: '♭3', 6: '♭5' }, req: [0, 3, 6], sym: '°', n: ['°', ''], cs: 'l', mark: '°', kind: 'triad', name: 'Diminished triad', lt: 1 },
  { id: 'sus4',  m: { 0: 'R', 5: '4', 7: '5' }, req: [0, 5, 7], sym: 'sus4', n: ['', 'sus4'], cs: 'U', sfx: 'sus4', kind: 'other', name: 'Suspended 4th', dom: 1 },
  { id: 'sus2',  m: { 0: 'R', 2: '2', 7: '5' }, req: [0, 2, 7], sym: 'sus2', n: ['', 'sus2'], cs: 'U', sfx: 'sus2', kind: 'other', name: 'Suspended 2nd' },
  { id: 'aug',   m: { 0: 'R', 4: '3', 8: '♯5' }, req: [0, 4, 8], sym: '+', n: ['+', ''], cs: 'U', mark: '+', kind: 'triad', name: 'Augmented triad' },
  { id: 'm7b5',  m: { 0: 'R', 3: '♭3', 6: '♭5', 10: '♭7' }, req: [0, 3, 6, 10], sym: 'm7♭5', n: ['', 'ø7'], cs: 'l', mark: 'ø', kind: '7th', name: 'Half-diminished 7th', lt: 1 },
  { id: 'dim7',  m: { 0: 'R', 3: '♭3', 6: '♭5', 9: '°7' }, req: [0, 3, 6, 9], sym: '°7', n: ['°', '7'], cs: 'l', mark: '°', kind: '7th', name: 'Diminished 7th', lt: 1 },
  { id: 'maj6',  m: { 0: 'R', 4: '3', 7: '5', 9: '6' }, req: [0, 4, 7, 9], sym: '6', n: ['', '6'], cs: 'U', sfx: 'add6', kind: 'other', name: 'Major 6th' },
  { id: 'min6',  m: { 0: 'R', 3: '♭3', 7: '5', 9: '6' }, req: [0, 3, 7, 9], sym: 'm6', n: ['-', '6'], cs: 'l', sfx: 'add6', kind: 'other', name: 'Minor 6th' },
  { id: 'add9',  m: { 0: 'R', 2: '9', 4: '3', 7: '5' }, req: [0, 2, 4, 7], sym: 'add9', n: ['', 'add9'], cs: 'U', sfx: 'add9', kind: 'other', name: 'Major add 9' },
  { id: 'madd9', m: { 0: 'R', 2: '9', 3: '♭3', 7: '5' }, req: [0, 2, 3, 7], sym: 'm(add9)', n: ['-', 'add9'], cs: 'l', sfx: 'add9', kind: 'other', name: 'Minor add 9' },
  { id: '7sus4', m: { 0: 'R', 5: '4', 7: '5', 10: '♭7' }, req: [0, 5, 10], opt: [7], sym: '7sus4', n: ['', '7sus4'], cs: 'U', sfx: '7sus4', kind: 'other', name: 'Dominant 7th sus 4', dom: 1 },
  { id: 'dom9',  m: { 0: 'R', 2: '9', 4: '3', 7: '5', 10: '♭7' }, req: [0, 2, 4, 10], opt: [7], sym: '9', n: ['', '9'], cs: 'U', sfx: '9', kind: 'other', name: 'Dominant 9th', dom: 1 },
  { id: 'maj9',  m: { 0: 'R', 2: '9', 4: '3', 7: '5', 11: '7' }, req: [0, 2, 4, 11], opt: [7], sym: 'maj9', n: ['', 'Δ9'], cs: 'U', sfx: 'maj9', kind: 'other', name: 'Major 9th' },
  { id: 'min9',  m: { 0: 'R', 2: '9', 3: '♭3', 7: '5', 10: '♭7' }, req: [0, 2, 3, 10], opt: [7], sym: 'm9', n: ['-', '9'], cs: 'l', sfx: '9', kind: 'other', name: 'Minor 9th' },
  { id: '69',    m: { 0: 'R', 2: '9', 4: '3', 7: '5', 9: '6' }, req: [0, 2, 4, 9], opt: [7], sym: '6/9', n: ['', '6/9'], cs: 'U', sfx: '6/9', kind: 'other', name: 'Six-nine' },
  { id: 'm69',   m: { 0: 'R', 2: '9', 3: '♭3', 7: '5', 9: '6' }, req: [0, 2, 3, 9], opt: [7], sym: 'm6/9', n: ['-', '6/9'], cs: 'l', sfx: '6/9', kind: 'other', name: 'Minor six-nine' },
  { id: 'mMaj7', m: { 0: 'R', 3: '♭3', 7: '5', 11: '7' }, req: [0, 3, 11], opt: [7], sym: 'm(maj7)', n: ['-', 'Δ7'], cs: 'l', mark: 'maj', kind: '7th', name: 'Minor-major 7th' },
  { id: 'add11', m: { 0: 'R', 4: '3', 5: '11', 7: '5' }, req: [0, 4, 5, 7], sym: 'add11', n: ['', 'add11'], cs: 'U', sfx: 'add11', kind: 'other', name: 'Major add 11' },
  { id: 'madd11', m: { 0: 'R', 3: '♭3', 5: '11', 7: '5' }, req: [0, 3, 5, 7], sym: 'm(add11)', n: ['-', 'add11'], cs: 'l', sfx: 'add11', kind: 'other', name: 'Minor add 11' },
  { id: '9sus4', m: { 0: 'R', 2: '9', 5: '4', 7: '5', 10: '♭7' }, req: [0, 2, 5, 10], opt: [7], sym: '9sus4', n: ['', '9sus4'], cs: 'U', sfx: '9sus4', kind: 'other', name: 'Dominant 9th sus 4', dom: 1 },
  { id: 'aug7',  m: { 0: 'R', 4: '3', 8: '♯5', 10: '♭7' }, req: [0, 4, 8, 10], sym: '+7', n: ['+', '7'], cs: 'U', mark: '+', kind: '7th', name: 'Augmented 7th', dom: 1 },
  { id: '7b5',   m: { 0: 'R', 4: '3', 6: '♭5', 10: '♭7' }, req: [0, 4, 6, 10], sym: '7♭5', n: ['', '7♭5'], cs: 'U', sfx: '7♭5', kind: 'other', name: 'Dominant 7th flat 5', dom: 1 },
  { id: '7b9',   m: { 0: 'R', 1: '♭9', 4: '3', 7: '5', 10: '♭7' }, req: [0, 1, 4, 10], opt: [7], sym: '7♭9', n: ['', '7♭9'], cs: 'U', sfx: '7♭9', kind: 'other', name: 'Dominant 7th flat 9', dom: 1 },
  { id: '7s9',   m: { 0: 'R', 3: '♯9', 4: '3', 7: '5', 10: '♭7' }, req: [0, 3, 4, 10], opt: [7], sym: '7♯9', n: ['', '7♯9'], cs: 'U', sfx: '7♯9', kind: 'other', name: 'Dominant 7th sharp 9', dom: 1 },
  { id: '13',    m: { 0: 'R', 2: '9', 4: '3', 7: '5', 9: '13', 10: '♭7' }, req: [0, 4, 9, 10], opt: [2, 7], sym: '13', n: ['', '13'], cs: 'U', sfx: '13', kind: 'other', name: 'Dominant 13th', dom: 1 },
  { id: 'm11',   m: { 0: 'R', 2: '9', 3: '♭3', 5: '11', 7: '5', 10: '♭7' }, req: [0, 3, 5, 10], opt: [2, 7], sym: 'm11', n: ['-', '11'], cs: 'l', sfx: '11', kind: 'other', name: 'Minor 11th' },
  { id: 'augM7', m: { 0: 'R', 4: '3', 8: '♯5', 11: '7' }, req: [0, 4, 8, 11], sym: '+maj7', n: ['+', 'Δ7'], cs: 'U', mark: '+maj', kind: '7th', name: 'Augmented major 7th' },
  { id: 'M7s11', m: { 0: 'R', 2: '9', 4: '3', 6: '♯11', 7: '5', 11: '7' }, req: [0, 4, 6, 11], opt: [2, 7], sym: 'maj7♯11', n: ['', 'Δ7♯11'], cs: 'U', sfx: 'maj7♯11', kind: 'other', name: 'Major 7th sharp 11' },
];
// Letter steps above the root for each member label (alternatives tried in order to avoid double accidentals)
const OFFS = { R: [0], '2': [1], '9': [1], '♭9': [1], '♯9': [1], '3': [2], '♭3': [2], '4': [3], '11': [3], '♯11': [3],
  '5': [4], '♭5': [4], '♯5': [4], '6': [5], '13': [5], '7': [6], '♭7': [6], '°7': [6, 5] };
const IV_NAME = ['Octave', 'Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd', 'Perfect 4th', 'Tritone', 'Perfect 5th', 'Minor 6th', 'Major 6th', 'Minor 7th', 'Major 7th'];
const IV_LABEL = ['bass', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];
const IV_OFF = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];
const MODES = [
  ['minor', [0, 2, 3, 5, 7, 8, 10]], ['Mixolydian', [0, 2, 4, 5, 7, 9, 10]], ['Dorian', [0, 2, 3, 5, 7, 9, 10]],
  ['harmonic minor', [0, 2, 3, 5, 7, 8, 11]], ['Phrygian', [0, 1, 3, 5, 7, 8, 10]], ['Lydian', [0, 2, 4, 6, 7, 9, 11]],
  ['melodic minor', [0, 2, 3, 5, 7, 9, 11]],
];

// Find the best chord name for a set of pitch classes. Prefers the bass note as root, then simpler chords.
function identify(pcs, bassPc) {
  let best = null;
  for (const root of pcs) {
    const rel = new Set(pcs.map(p => norm(p - root)));
    TPL.forEach((t, rank) => {
      if (!t.req.every(i => rel.has(i))) return;
      for (const i of rel) if (!(i in t.m)) return;
      const missing = (t.opt || []).filter(i => !rel.has(i)).length;
      const score = rank + (root === bassPc ? 0 : 40) + missing * 0.5;
      if (!best || score < best.score) best = { t, root, score, missing };
    });
  }
  return best;
}

function spellTones(rootL, rootPc, t, rels) {
  const out = {};
  for (const r of rels) {
    const pc = norm(rootPc + r);
    out[r] = null;
    for (const o of OFFS[t.m[r]]) {
      const L = (rootL + o) % 7, a = sgn(pc - NAT[L]);
      if (Math.abs(a) <= 1) { out[r] = { L, a }; break; }
    }
  }
  return out;
}
// Lower is better: penalise awkward spellings (E♯, B♯, F♭, C♭) and anything that would need a double accidental
function spellCost(sp) {
  let c = 0;
  for (const k in sp) {
    const s = sp[k];
    if (!s) { c += 10; continue; }
    c += Math.abs(s.a);
    if ((s.a === 1 && (s.L === 2 || s.L === 6)) || (s.a === -1 && (s.L === 3 || s.L === 0))) c += 3;
  }
  return c;
}
// Scale degree of a spelled note in a key, e.g. {deg: 7, pre: '♭'}
function degInfo(L, pc, key) {
  const deg = ((L - key.letter) % 7 + 7) % 7 + 1;
  const diff = sgn(pc - norm(tonicPc(key) + MAJ[deg - 1]));
  return { deg, pre: accStr(diff) };
}
const FLAT_DEG = { 1: 2, 3: 3, 6: 5, 8: 6, 10: 7 }, SHARP_DEG = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };
function degreeCandidates(i, preferSharp) {
  const d = MAJ.indexOf(i);
  if (d >= 0) return [d + 1];
  return preferSharp ? [SHARP_DEG[i], FLAT_DEG[i]] : [FLAT_DEG[i], SHARP_DEG[i]];
}
function figsFor(t, role) {
  const third = role === '3' || role === '♭3', fifth = role === '5' || role === '♭5' || role === '♯5';
  const seventh = role === '7' || role === '♭7' || role === '°7';
  if (t.kind === 'triad') return third ? ['6'] : fifth ? ['6', '4'] : [];
  if (t.kind === '7th') return third ? ['6', '5'] : fifth ? ['4', '3'] : seventh ? ['4', '2'] : ['7'];
  return [];
}
function invText(role) {
  if (role === 'R') return 'root position';
  if (role === '3' || role === '♭3') return '3rd in the bass (1st inversion)';
  if (role === '5' || role === '♭5' || role === '♯5') return '5th in the bass (2nd inversion)';
  if (role === '7' || role === '♭7' || role === '°7') return '7th in the bass (3rd inversion)';
  return role + ' in the bass';
}

// Analyse any set of MIDI notes, optionally in a major key.
function analyze(midis, key) {
  const sorted = [...new Set(midis)].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const ks = key ? key.ks : NO_KEY_KS, tPc = key ? tonicPc(key) : 0;
  const bassPc = norm(sorted[0]);
  const pcs = [...new Set(sorted.map(norm))];
  const res = { sorted, bassPc, pcs, key };
  const id = pcs.length >= 3 ? identify(pcs, bassPc) : null;
  const spellMap = {};

  if (id) {
    const rels = pcs.map(p => norm(p - id.root));
    const cands = [];
    if (key) {
      for (const deg of degreeCandidates(norm(id.root - tPc), !!id.t.lt)) {
        const L = (key.letter + deg - 1) % 7;
        if (Math.abs(sgn(id.root - NAT[L])) <= 1) { cands.push(L); break; }
      }
    }
    if (!cands.length) for (let L = 0; L < 7; L++) if (Math.abs(sgn(id.root - NAT[L])) <= 1) cands.push(L);
    let best = null;
    for (const L of cands) {
      const sp = spellTones(L, id.root, id.t, rels);
      const cost = spellCost(sp) - (DEFAULT_SPELL[id.root][0] === L ? 0.01 : 0);
      if (!best || cost < best.cost) best = { L, sp, cost };
    }
    for (const r of rels) if (best.sp[r]) spellMap[norm(id.root + r)] = { ...best.sp[r], role: id.t.m[r] };
    res.id = id; res.rootL = best.L;
  } else if (pcs.length === 2 && !key) {
    const b = DEFAULT_SPELL[bassPc], other = pcs.find(p => p !== bassPc);
    spellMap[bassPc] = { L: b[0], a: b[1] };
    const L = (b[0] + IV_OFF[norm(other - bassPc)]) % 7, a = sgn(other - NAT[L]);
    if (Math.abs(a) <= 1) spellMap[other] = { L, a };
  }

  res.notes = sorted.map(m => {
    const pc = norm(m);
    let s = spellMap[pc];
    if (!s) {
      if (key) { const sp = spell(m, key); s = { L: letterOf(sp.step), a: sp.acc }; }
      else { const d = DEFAULT_SPELL[pc]; s = { L: d[0], a: d[1] }; }
    }
    const oct = (m - NAT[s.L] - s.a) / 12 - 1;
    const d = key ? degInfo(s.L, pc, key) : null;
    return { midi: m, pc, L: s.L, a: s.a, step: oct * 7 + s.L, name: LET[s.L] + accStr(s.a) + oct,
      role: s.role || null, sign: s.a === ks[s.L] ? null : s.a, deg: d ? d.pre + d.deg : null };
  });
  const bass = res.notes[0], bassName = LET[bass.L] + accStr(bass.a);

  if (id) {
    const t = id.t, rootA = sgn(id.root - NAT[res.rootL]);
    const rootName = LET[res.rootL] + accStr(rootA);
    const bassRel = norm(bassPc - id.root), bassRole = t.m[bassRel];
    res.kind = 'chord';
    res.symbol = rootName + t.sym + (bassRel ? '/' + bassName : '');
    res.quality = t.name + (id.missing && (t.opt || []).includes(7) && !pcs.includes(norm(id.root + 7)) ? ' (no 5th)' : '');
    res.inversion = invText(bassRole);
    res.roles = res.notes.map(n => n.role);
    if (key) {
      const dl = degInfo(res.rootL, id.root, key);
      const figs = figsFor(t, bassRole);
      let num = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][dl.deg - 1];
      if (t.cs === 'l') num = num.toLowerCase();
      res.roman = { pre: dl.pre, num, mark: t.mark || '', figs, sfx: t.sfx || '', slash: '' };
      const bd = degInfo(bass.L, bassPc, key);
      res.nash = { num: dl.pre + dl.deg, inl: t.n[0], sup: t.n[1], slash: bassRel ? '/' + bd.pre + bd.deg : '' };
      const inScale = sc => pcs.every(p => sc.includes(norm(p - tPc)));
      if (inScale(MAJ)) {
        res.cat = { cls: 'dia', short: 'Diatonic', text: 'Diatonic: every note is in ' + key.name + ' major' };
      } else {
        const sec = secondaryOf(id, key);
        if (sec) {
          res.roman = { pre: '', num: sec.type === 'V' ? 'V' : 'vii', mark: t.mark || '', figs, sfx: t.sfx || '', slash: '/' + sec.target };
          res.cat = { cls: 'sec', short: 'Secondary', text: sec.text };
        } else {
          const modes = MODES.filter(([, sc]) => inScale(sc)).map(([n]) => key.name + ' ' + n);
          if (modes.length) {
            let txt = t.id === 'maj' && norm(id.root - tPc) === 1 ? 'Neapolitan chord (♭II), borrowed from ' + modes[0]
              : 'Borrowed from ' + modes[0] + (modes[0].endsWith(' minor') && modes[0] === key.name + ' minor' ? ' (the parallel minor)' : '');
            if (modes[1]) txt += '. Also fits ' + modes[1];
            res.cat = { cls: 'bor', short: 'Borrowed', text: txt };
          } else {
            res.cat = { cls: 'chr', short: 'Chromatic', text: 'Chromatic: outside ' + key.name + ' major and its usual borrowed chords' };
          }
        }
      }
    }
  } else if (pcs.length === 1) {
    res.kind = 'note';
    res.symbol = [...new Set(res.notes.map(n => n.name))].join(' ');
  } else if (pcs.length === 2) {
    res.kind = 'interval';
    const top = res.notes.find(n => n.pc !== bassPc);
    const semis = norm(top.pc - bassPc);
    res.symbol = IV_NAME[semis];
    res.quality = bass.name + ' up to ' + top.name + (top.midi - bass.midi > 12 ? ' (more than an octave apart)' : '');
    if (semis === 7) res.quality += '. Power chord: ' + bassName + '5';
  } else {
    res.kind = 'unknown';
    res.symbol = 'No common chord name';
    res.quality = 'Intervals above ' + bass.name + ': ' + res.notes.slice(1).map(n => IV_LABEL[norm(n.pc - bassPc)]).filter((v, i, a) => a.indexOf(v) === i).join(', ');
  }
  return res;
}

// Secondary dominants (V of ii, iii, IV, V, vi) and secondary leading-tone chords (vii of the same)
function secondaryOf(id, key) {
  const tPc = tonicPc(key);
  for (const d of [2, 3, 4, 5, 6]) {
    const tp = norm(tPc + MAJ[d - 1]), target = ROMAN[d - 1], name = diaName(key, d - 1);
    if (id.t.dom && id.root === norm(tp + 7))
      return { type: 'V', target, text: 'Secondary dominant: the V of ' + target + ', so it pulls toward ' + name };
    if (id.t.lt && id.root === norm(tp - 1))
      return { type: 'vii', target, text: 'Secondary leading-tone chord: the vii of ' + target + ', so it pulls toward ' + name };
  }
  return null;
}

/* ---------- Chord-number labels (Roman or Nashville) ---------- */
function figsHTML(f) {
  if (!f.length) return '';
  if (f.length === 1) return '<sup>' + f[0] + '</sup>';
  return '<span class="fig"><span>' + f[0] + '</span><span>' + f[1] + '</span></span>';
}
function fnHTML(an, notation) {
  if (!an || !an.roman) return '';
  if (notation === 'nashville') {
    const n = an.nash;
    return n.num + n.inl + (n.sup ? '<sup>' + n.sup + '</sup>' : '') + n.slash;
  }
  const r = an.roman;
  return r.pre + r.num + r.mark + figsHTML(r.figs) + (r.sfx ? '<span class="sfx">' + r.sfx + '</span>' : '') + r.slash;
}
function fnSVG(an, x, y, c, notation) {
  let t = `<text x="${x}" y="${y}" text-anchor="middle" font-size="11.5" fill="${c}">`;
  if (notation === 'nashville') {
    const n = an.nash;
    t += n.num + n.inl;
    if (n.sup) t += `<tspan font-size="8" dy="-4.5">${n.sup}</tspan>`;
    if (n.slash) t += `<tspan dy="${n.sup ? 4.5 : 0}">${n.slash}</tspan>`;
    return t + '</text>';
  }
  const r = an.roman;
  t += r.pre + r.num + r.mark;
  let dy = 0;
  if (r.figs.length === 1) { t += `<tspan font-size="8" dy="-4.5">${r.figs[0]}</tspan>`; dy = 4.5; }
  if (r.figs.length === 2) { t += `<tspan font-size="7.5" dy="-5">${r.figs[0]}</tspan><tspan font-size="7.5" dx="-4.3" dy="7.5">${r.figs[1]}</tspan>`; dy = -2.5; }
  if (r.sfx || r.slash) t += `<tspan dy="${dy}">${r.sfx}${r.slash}</tspan>`;
  return t + '</text>';
}

export { TPL, MODES, IV_NAME, IV_LABEL, identify, analyze, secondaryOf, degInfo, figsHTML, fnHTML, fnSVG };
