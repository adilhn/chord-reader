// UI: state, drawing, MIDI input, settings. Pure logic lives in theory.js, analysis.js and quiz.js.
import { NAT, MAJ, LET, KEYS, NO_KEY_KS, ROMAN, NASH_DIA, SHARP_POS, FLAT_POS, norm, accStr, noteName, tonicPc, diaName,
  spell, ledgers, placeFree } from './theory.js';
import { IV_LABEL, analyze, fnHTML } from './analysis.js';
import { makeChord, buildRound, matches, diagnose } from './quiz.js';

/* ---------- Staff geometry ---------- */
const S = 10, HS = 5;                       // staff space, half space (one diatonic step)
const TT = 58, TB = TT + 40, GAP = 64, BT = TB + GAP, BB = BT + 40, VH = BB + 68, VH_FREE = BB + 40;
const SLOT = 104, LIVE_DX = 40, NW = 16;    // chord spacing, offset of "what you're playing" column, notehead width
const kG = 0.064, kF = 0.054, kA = 0.028, kW = 0.05;
const ACC = {
  '1':  { id: 'g-sharp',   r: 365, cy: 198 },
  '-1': { id: 'g-flat',    r: 329, cy: 133 },
  '0':  { id: 'g-natural', r: 324, cy: 192 },
};
const COL = { ink: '#16181d', muted: '#7d8696', accent: '#2f6fde', good: '#1f9d55', bad: '#d64545', warn: '#c97a0e', ledger: '#16181d', frozen: '#9aa0aa' };

// Treble staff lines are steps 30..38 (E4..F5); bass staff lines are 18..26 (G2..A3).
const yOf = (step, st) => st === 'T' ? TT + (38 - step) * HS : BT + (26 - step) * HS;
const ksDx = key => key.sig > 0 ? 10 : 9;   // horizontal spacing of key-signature accidentals
const caxFor = key => 52 + Math.abs(key.sig) * ksDx(key) + 12;
const staffFor = (ch, step) => settings.split ? (step < 28 ? 'B' : 'T') : ch.staff;

/* ---------- Settings & state ---------- */
const DEFAULTS = { mode: 'quiz', notation: 'roman', pedal: true, pickKey: 'C',
  keyMode: 'C', roundType: 'degrees', octaves: [2, 3, 4], inversions: [0, 1, 2], split: false, exact: true };
function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ? { ...d, ...v } : { ...d }; } catch (e) { return { ...d }; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
let settings = load('chordReader.settings', DEFAULTS);
const isFree = () => settings.mode !== 'quiz';

let round = null;          // { key, chords, idx, results }
let state = 'play';        // quiz: 'play' | 'done'
const held = new Set();    // MIDI notes physically held
const sustained = new Set(); // released while the sustain pedal is down
let pedal = false;
let fresh = false;         // a key went down since the last chord was accepted
let chordMissed = false, missCount = 0, pendingWrong = false, lastWrong = [], wrongTimer = null;
let doneAt = 0, flash = null, flashTimer = null;
let message = '', tone = 'muted';
let stats = { done: 0, first: 0 };
let lastKeyName = null;
let scrollPos = 0, anim = 0, trackEl = null, G = null;
let randomKey = null, phrase = null, frozen = null, stableTimer = null;

const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];

function freeKey() {
  if (settings.mode === 'random') return randomKey || (randomKey = pick(KEYS));
  if (settings.mode === 'pick') return KEYS.find(k => k.name === settings.pickKey) || KEYS[0];
  return null;
}
function newRandomKey() {
  randomKey = pick(KEYS.filter(k => !randomKey || k.name !== randomKey.name));
  frozen = null; phrase = null;
  renderAll();
}

function startRound() {
  const r = buildRound(settings, lastKeyName);
  lastKeyName = r.key.name;
  const key = r.key;
  round = { key, chords: r.chords, idx: 0, results: [] };
  state = 'play'; fresh = false; resetChord();
  message = key.name + ' major · read the chord and play it'; tone = 'muted';
  document.getElementById('doneBox').classList.add('hidden');
  scrollPos = -1.6;
  renderAll();
  animateScroll(0, 420);
}

function resetChord() { chordMissed = false; missCount = 0; pendingWrong = false; lastWrong = []; clearTimeout(wrongTimer); }
const cur = () => round.chords[round.idx];

/* ---------- Input ---------- */
function noteOn(n) {
  held.add(n); sustained.delete(n);
  keepAwake();
  if (isFree()) { freeChanged(); return; }
  if (state === 'done') {
    if (performance.now() - doneAt > 700) startRound();
    else renderAll();
    return;
  }
  fresh = true;
  evaluate();
}
function noteOff(n) {
  held.delete(n);
  if (pedal && settings.pedal) sustained.add(n);
  if (isFree()) { freeChanged(); return; }
  if (state === 'play') evaluate(); else renderAll();
}
function pedalChange(v) {
  const was = pedal;
  pedal = v >= 64;
  if (was && !pedal) { sustained.clear(); if (isFree()) freeChanged(); }
}

/* ---------- Free play: what is sounding, and what to keep on screen after you let go ---------- */
const soundingNotes = () => [...new Set([...held, ...sustained])];
// While playing, the staff shows exactly what is sounding. When everything is released it keeps the last
// chord that was held for at least 150 ms (or, for a very short stab, the fullest one), shown faded.
function freeChanged() {
  const s = soundingNotes();
  clearTimeout(stableTimer);
  if (!s.length) { if (phrase) frozen = phrase.best; phrase = null; renderAll(); return; }
  if (!phrase) phrase = { best: s, stable: false };
  else if (!phrase.stable && s.length >= phrase.best.length) phrase.best = s;
  stableTimer = setTimeout(() => {
    const now = soundingNotes();
    if (now.length && phrase) { phrase.best = now; phrase.stable = true; }
  }, 150);
  renderAll();
}

/* ---------- Quiz judging ---------- */

// A wrong attempt = a wrong set of (at least chord-size) notes held for 350 ms, or one that is
// lifted entirely without becoming correct. Quick finger fixes inside that window are not counted.
function evaluate() {
  const ch = cur();
  if (fresh && matches(ch, held, settings.exact)) { success(); return; }
  clearTimeout(wrongTimer);
  if (fresh && held.size >= ch.notes.length) {
    pendingWrong = true; lastWrong = [...held];
    wrongTimer = setTimeout(() => {
      if (state === 'play' && held.size >= cur().notes.length && !matches(cur(), held, settings.exact)) commitWrong();
    }, 350);
  } else if (held.size === 0 && pendingWrong) {
    commitWrong();
  }
  renderAll();
}

function commitWrong() {
  pendingWrong = false; missCount++; chordMissed = true;
  const ch = cur();
  let m = diagnose(lastWrong, ch, settings.exact);
  if (missCount >= 2) m += ' · written: ' + ch.notes.map(n => noteName(n.step, n.acc)).join(' ');
  message = m; tone = 'bad';
  renderAll();
}


function success() {
  clearTimeout(wrongTimer);
  const ch = cur(), first = !chordMissed;
  round.results.push(first);
  stats.done++; if (first) stats.first++;
  message = (first ? '✓ ' : 'Got it: ') + ch.name;
  tone = first ? 'good' : 'warn';
  round.idx++; fresh = false; resetChord();
  flash = 'good'; clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flash = null; renderAll(); }, 280);
  if (round.idx >= round.chords.length) finishRound();
  renderAll();
  animateScroll(round.idx, 320);
}

function finishRound() {
  state = 'done'; doneAt = performance.now();
  const ok = round.results.filter(Boolean).length, n = round.results.length;
  document.getElementById('doneKey').textContent = round.key.name + ' major';
  document.getElementById('doneAcc').textContent = Math.round(100 * ok / n) + '%';
  document.getElementById('doneSub').textContent = ok + ' of ' + n + ' first try';
  const missed = round.chords.filter((c, i) => !round.results[i]);
  document.getElementById('doneMissed').innerHTML = missed.length
    ? 'Missed: ' + missed.map(c => c.name).join(', ') : '';
  setTimeout(() => { if (state === 'done' && !isFree()) document.getElementById('doneBox').classList.remove('hidden'); }, 380);
  message = 'Round complete'; tone = 'muted';
}

/* ---------- Drawing ---------- */
const svgEl = document.getElementById('staff');
const mainEl = document.getElementById('main');
const boxEl = document.getElementById('staffBox');
const panelEl = document.getElementById('panel');
const f2 = v => v.toFixed(2);
const hline = (x1, x2, y, w, c) => `<line x1="${f2(x1)}" x2="${f2(x2)}" y1="${y}" y2="${y}" stroke="${c || COL.ink}" stroke-width="${w}"/>`;
const glyph = (id, x, y, k, fill) => `<use href="#${id}" fill="${fill}" transform="translate(${f2(x)},${f2(y)}) scale(${k},${-k})"/>`;

function geomQuiz() {
  boxEl.style.width = ''; boxEl.style.height = '';
  const W = Math.max(220, mainEl.clientWidth), H = Math.max(140, mainEl.clientHeight);
  const scale = Math.min(H / VH, W / 300, 1.7);
  const VW = W / scale;
  const cax = caxFor(round.key);                                    // where the chord area starts
  const phX = cax + Math.max(46, Math.min(170, (VW - cax) * 0.26)); // fixed "play here" position
  return { W, H: VH * scale, scale, VW, cax, phX };
}
function geomFree(key) {
  const mw = Math.max(220, mainEl.clientWidth), mh = Math.max(200, mainEl.clientHeight);
  const land = mw > mh * 1.15;
  let W, scale;
  if (land) { W = Math.round(mw * 0.54); scale = Math.min(mh / VH_FREE, W / 240, 1.6); }
  else { W = mw; scale = Math.min(W / 280, (mh * 0.5) / VH_FREE, 1.7); }
  const vh = VH_FREE, H = vh * scale, VW = W / scale, cax = caxFor(key);
  boxEl.style.width = W + 'px'; boxEl.style.height = f2(H) + 'px';
  return { W, H, scale, VW, vh, cax, colX: cax + Math.max(44, (VW - cax) * 0.45) };
}
function sizeSVG(g) {
  svgEl.setAttribute('viewBox', `0 0 ${f2(g.VW)} ${g.vh || VH}`);
  svgEl.style.width = g.W + 'px';
  svgEl.style.height = f2(g.H) + 'px';
}

// Staff lines, brace, clefs, key signature and key label
function staffSVG(key, label, VW) {
  let s = '';
  for (let i = 0; i < 5; i++) { s += hline(16, VW - 3, TT + i * S, 1); s += hline(16, VW - 3, BT + i * S, 1); }
  s += `<line x1="16" x2="16" y1="${TT}" y2="${BB}" stroke="${COL.ink}" stroke-width="1.5"/>`;
  const ky = (BB - TT) / 783, kx = 0.05;
  s += `<use href="#g-brace" fill="${COL.ink}" transform="translate(${f2(4 - 38 * kx)},${f2(BB - 24 * ky)}) scale(${kx},${f2(-ky)})"/>`;
  s += glyph('g-gclef', 20 - 120 * kG, yOf(32, 'T') + 133 * kG, kG, COL.ink);
  s += glyph('g-fclef', 20 - 75 * kF, yOf(24, 'B') + 567 * kF, kF, COL.ink);
  const n = Math.abs(key.sig);
  for (let i = 0; i < n; i++) {
    const g = key.sig > 0 ? ACC['1'] : ACC['-1'], pos = key.sig > 0 ? SHARP_POS[i] : FLAT_POS[i];
    const x = 52 + i * ksDx(key) + 9;
    s += glyph(g.id, x - g.r * kA, yOf(pos, 'T') + g.cy * kA, kA, COL.ink);
    s += glyph(g.id, x - g.r * kA, yOf(pos - 14, 'B') + g.cy * kA, kA, COL.ink);
  }
  s += `<text x="20" y="${TT - 26}" font-size="11" fill="${COL.muted}">${label}</text>`;
  return s;
}

// Draw a column of whole notes. items: {step, staff, sign (null | 1 | -1 | 0)}
function column(items, x, colorOf) {
  let out = '';
  for (const st of ['T', 'B']) {
    const its = items.filter(it => it.staff === st).sort((a, b) => a.step - b.step);
    if (!its.length) continue;
    let prev = null;                                               // seconds: push the upper note right
    for (const it of its) { it.dx = (prev && it.step - prev.step <= 1 && prev.dx === 0) ? NW - 1 : 0; prev = it; }
    const top = st === 'T' ? 38 : 26, bot = st === 'T' ? 30 : 18;
    const mx = its[its.length - 1].step, mn = its[0].step;
    for (let s = top + 2; s <= mx; s += 2) {
      const xs = its.filter(it => it.step >= s).map(it => x + it.dx);
      out += hline(Math.min(...xs) - 11.5, Math.max(...xs) + 11.5, yOf(s, st), 1.3, COL.ledger);
    }
    for (let s = bot - 2; s >= mn; s -= 2) {
      const xs = its.filter(it => it.step <= s).map(it => x + it.dx);
      out += hline(Math.min(...xs) - 11.5, Math.max(...xs) + 11.5, yOf(s, st), 1.3, COL.ledger);
    }
    for (const it of its) out += glyph('g-whole', x + it.dx - 199.5 * kW, yOf(it.step, st) + 90 * kW, kW, colorOf(it));
    const placed = [];
    for (const it of its.slice().reverse()) {
      if (it.sign == null) continue;
      let c = 0;
      while (placed.some(p => p.c === c && Math.abs(p.step - it.step) < 6)) c++;
      placed.push({ step: it.step, c });
      const g = ACC[String(it.sign)], right = x - 10.5 - c * 10.5;
      out += glyph(g.id, right - g.r * kA, yOf(it.step, st) + g.cy * kA, kA, colorOf(it));
    }
  }
  return out;
}

function drawChord(ch, i) {
  const x = i * SLOT, done = i < round.idx;
  const items = ch.notes.map(n => ({ step: n.step, staff: staffFor(ch, n.step), sign: null }));
  let out = `<g opacity="${done ? 0.42 : 1}">` + column(items, x, () => COL.ink) + '</g>';
  if (done) {
    const c = round.results[i] ? COL.good : COL.warn;
    out += `<text x="${x}" y="${BB + 45}" text-anchor="middle" font-size="12.5" font-weight="700" fill="${c}">${ch.name}</text>`;
  }
  return out;
}

function liveItems() {
  const ch = cur(), key = round.key;
  return [...held].sort((a, b) => a - b).map(m => {
    const sp = spell(m, key);
    let st;
    if (settings.split) st = sp.step < 28 ? 'B' : 'T';
    else st = ledgers([sp.step], ch.staff) <= 3 ? ch.staff : (ch.staff === 'T' ? 'B' : 'T');
    return { step: sp.step, acc: sp.acc, staff: st, sign: sp.sign, midi: m };
  });
}
function liveColor(it) {
  if (!chordMissed) return COL.accent;
  const ch = cur();
  const hit = settings.exact ? ch.notes.some(n => n.midi === it.midi) : ch.notes.some(n => n.midi % 12 === it.midi % 12);
  return hit ? COL.good : COL.bad;
}

function renderQuiz() {
  G = geomQuiz(); sizeSVG(G);
  const { VW, cax, phX } = G;
  let s = `<defs><linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="${cax}" y1="0" x2="${cax + 28}" y2="0">` +
    `<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient>` +
    `<mask id="fm" maskUnits="userSpaceOnUse" x="0" y="0" width="${f2(VW)}" height="${VH}"><rect x="${cax}" y="0" width="${f2(VW - cax)}" height="${VH}" fill="url(#fade)"/></mask></defs>`;
  if (state === 'play') {
    const fill = flash === 'good' ? '#d5f2e0' : chordMissed ? '#fde8e8' : '#e8effc';
    s += `<rect x="${f2(phX - 25)}" y="${TT - 38}" width="${LIVE_DX + NW + 36}" height="${BB - TT + 74}" rx="11" fill="${fill}"/>`;
  }
  s += staffSVG(round.key, round.key.name + ' major', VW);
  s += `<g mask="url(#fm)"><g id="track" transform="translate(${f2(phX - scrollPos * SLOT)},0)">`;
  round.chords.forEach((ch, i) => { s += drawChord(ch, i); });
  s += '</g></g>';
  if (state === 'play' && held.size) s += column(liveItems(), phX + LIVE_DX, liveColor);
  svgEl.innerHTML = s;
  trackEl = svgEl.querySelector('#track');
}

function renderFree() {
  const key = freeKey(), shownKey = key || KEYS[0];
  const live = soundingNotes(), notes = live.length ? live : (frozen || []);
  const an = notes.length ? analyze(notes, key) : null;
  const g = geomFree(shownKey); sizeSVG(g);
  let s = staffSVG(shownKey, key ? key.name + ' major' : 'No key', g.VW);
  if (an) {
    const color = live.length ? COL.ink : COL.frozen;
    const place = placeFree(an.notes);
    s += column(an.notes.map(n => ({ step: n.step, staff: place.get(n.midi), sign: n.sign })), g.colX, () => color);
  }
  svgEl.innerHTML = s;
  trackEl = null;
  panelEl.classList.toggle('frozen', !live.length && !!an);   // keep the show-* classes intact
  panelEl.innerHTML = panelHTML(an, key, !live.length);
}

function panelHTML(an, key, isFrozen) {
  let h = '<div class="p-head"><span>' + (an ? (isFrozen ? 'Last played' : 'Playing') : '') + '</span>' +
    (key ? '<span>Key of ' + key.name + ' major</span>' : '<span>No key</span>') + '</div>';
  if (!an) {
    h += '<div class="p-sym muted">Play something</div>';
    if (!key) h += '<div class="p-line muted">Notes within an octave are written as one hand, on whichever staff needs fewer ledger lines. Wider spreads are split between the staves like two hands.</div>';
  } else {
    const big = an.kind === 'chord' || an.kind === 'note';
    h += '<div class="p-sym' + (big ? '' : ' small') + '">' + an.symbol + '</div>';
    if (an.kind === 'chord' && key) {
      h += '<div class="p-fn"><span class="num' + (settings.notation === 'roman' ? ' roman' : '') + '">' + fnHTML(an, settings.notation) + '</span>' +
        '<span class="tag ' + an.cat.cls + '">' + an.cat.short + '</span></div>';
      h += '<div class="p-line">' + an.cat.text + '</div>';
    }
    if (an.kind === 'chord') h += '<div class="p-line">' + an.quality + ', ' + an.inversion + '</div>';
    else if (an.quality) h += '<div class="p-line">' + an.quality + '</div>';
    const role = n => an.kind === 'chord' ? n.role : key ? 'degree ' + n.deg : an.kind === 'note' ? '' : (n.pc === an.bassPc ? 'bass' : IV_LABEL[norm(n.pc - an.bassPc)]);
    h += '<div class="chips">' + an.notes.map(n => '<span class="chip"><b>' + n.name + '</b><i>' + role(n) + '</i></span>').join('') + '</div>';
    if (key && an.kind !== 'note') {
      const degs = [];
      for (const n of an.notes) if (!degs.includes(n.deg)) degs.push(n.deg);
      h += '<div class="p-line muted">Scale degrees, bottom to top: ' + degs.join(' · ') + '</div>';
    }
  }
  if (key) {
    const tPc = tonicPc(key);
    h += '<div class="dia-row">' + [0, 1, 2, 3, 4, 5, 6].map(d => {
      const on = an && an.kind === 'chord' && an.cat.cls === 'dia' && an.id.root === norm(tPc + MAJ[d]);
      const lab = settings.notation === 'nashville' ? NASH_DIA[d] : ROMAN[d];
      return '<div class="dia' + (on ? ' on' : '') + '"><b>' + lab + '</b><i>' + diaName(key, d) + '</i></div>';
    }).join('') + '</div>';
  }
  return h;
}

function animateScroll(to, ms) {
  cancelAnimationFrame(anim);
  const from = scrollPos, t0 = performance.now();
  const stepFn = t => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    scrollPos = from + (to - from) * e;
    if (trackEl && G) trackEl.setAttribute('transform', `translate(${f2(G.phX - scrollPos * SLOT)},0)`);
    if (k < 1) anim = requestAnimationFrame(stepFn);
  };
  anim = requestAnimationFrame(stepFn);
}

function renderUI() {
  const nash = settings.notation === 'nashville';
  document.getElementById('notaB').textContent = nash ? '4' : 'IV';
  document.getElementById('notaS').textContent = nash ? 'nashville' : 'roman';
  const k = freeKey();
  if (k) { document.getElementById('keyName1').textContent = k.name; document.getElementById('keyName2').textContent = k.name; }
  document.getElementById('newBtn').title = settings.mode === 'random' ? 'New random key' : 'New round';
  if (isFree() || !round) return;
  document.getElementById('progress').textContent = state === 'done' ? round.chords.length + '/' + round.chords.length : (round.idx + 1) + '/' + round.chords.length;
  document.getElementById('acc').textContent = stats.done ? Math.round(100 * stats.first / stats.done) + '%' : '–';
  document.getElementById('accSub').textContent = stats.done ? stats.first + '/' + stats.done + ' 1st try' : 'accuracy';
  const msg = document.getElementById('msg');
  msg.className = tone; msg.innerHTML = message;
  const lt = document.getElementById('liveTxt');
  if (held.size) {
    const items = state === 'play' ? liveItems() : [...held].sort((a, b) => a - b).map(m => ({ ...spell(m, round.key), midi: m }));
    lt.innerHTML = 'Playing: ' + items.map(it => {
      const cls = state !== 'play' || !chordMissed ? 'n' : (liveColor(it) === COL.good ? 'g' : 'r');
      return `<span class="${cls}">${noteName(it.step, it.acc)}</span>`;
    }).join(' ');
  } else lt.textContent = '';
}
function renderAll() {
  if (isFree()) renderFree();
  else if (round) renderQuiz();
  renderUI();
}

/* ---------- MIDI ---------- */
let midiAccess = null;
function setMidi(stateName, text) {
  const colors = { ok: '#34c46a', waiting: '#e5a823', none: '#6b7280', error: '#e05252' };
  document.getElementById('midiDot').style.background = colors[stateName];
  document.getElementById('midiTxt').textContent = text;
}
function onMidiMessage(e) {
  const [st, d1, d2] = e.data, cmd = st & 0xF0;
  if (cmd === 0x90 && d2 > 0) noteOn(d1);
  else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) noteOff(d1);
  else if (cmd === 0xB0 && d1 === 64) pedalChange(d2);
  else if (cmd === 0xB0 && (d1 === 120 || d1 === 123)) { held.clear(); sustained.clear(); if (isFree()) freeChanged(); else if (state === 'play') evaluate(); }
}
function bindInputs() {
  const names = [];
  midiAccess.inputs.forEach(inp => {
    inp.onmidimessage = onMidiMessage;
    if (inp.state === 'connected') names.push(inp.name || 'MIDI keyboard');
  });
  if (names.length) setMidi('ok', names.length > 1 ? names.length + ' MIDI inputs' : names[0]);
  else setMidi('waiting', 'Plug in your keyboard');
}
async function initMidi() {
  if (!navigator.requestMIDIAccess) {
    setMidi('none', 'No Web MIDI in this browser');
    message = 'This browser can’t read MIDI. On Android use Chrome. On iPhone, open this page in the “Web MIDI Browser” app.';
    tone = 'bad'; renderUI();
    return;
  }
  try {
    setMidi('waiting', 'Asking for MIDI access…');
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    midiAccess.onstatechange = bindInputs;
    bindInputs();
  } catch (err) {
    setMidi('error', 'MIDI blocked · tap to retry');
    const local = /^(content|file):$/.test(location.protocol);
    message = local
      ? 'Chrome won’t give MIDI to a page opened from a file. Open this page from an https:// link instead.'
      : 'MIDI access was blocked (' + (err && err.name || 'error') + '). Tap the icon left of the address, open Permissions, and allow MIDI devices.';
    tone = 'bad'; renderUI();
  }
}

/* ---------- Screen wake lock & full screen ---------- */
let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) {}
}
document.addEventListener('visibilitychange', keepAwake);

document.getElementById('fsBtn').onclick = () => {
  keepAwake();
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  } catch (e) {}
};

/* ---------- Modes ---------- */
function enterMode(prev) {
  document.body.dataset.mode = settings.mode;
  if (settings.mode === 'quiz') {
    const changed = !prev || prev.mode !== 'quiz' || ['keyMode', 'roundType', 'octaves', 'inversions', 'split', 'exact']
      .some(k => JSON.stringify(prev[k]) !== JSON.stringify(settings[k]));
    if (changed || !round) startRound(); else renderAll();
  } else {
    if (!prev || prev.mode !== settings.mode) { frozen = null; phrase = null; }
    if (!settings.pedal) sustained.clear();
    renderAll();
  }
}

/* ---------- Settings sheet ---------- */
const sheet = document.getElementById('sheet');
let draft = null;
function syncSheet() {
  sheet.querySelectorAll('.group').forEach(g => {
    const k = g.dataset.k, v = draft[k];
    g.querySelectorAll('button').forEach(b => {
      const bv = b.dataset.v;
      const on = Array.isArray(v) ? v.includes(Number(bv)) : (typeof v === 'boolean' ? (bv === '1') === v : bv === v);
      b.classList.toggle('on', on);
    });
  });
  sheet.querySelectorAll('[data-for]').forEach(el => { el.style.display = el.dataset.for.split(' ').includes(draft.mode) ? '' : 'none'; });
}
sheet.querySelectorAll('.group').forEach(g => {
  g.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const k = g.dataset.k, bv = b.dataset.v;
    if (g.dataset.multi) {
      const n = Number(bv), set = new Set(draft[k]);
      if (set.has(n)) {
        if (set.size === 1) { g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake'); return; }
        set.delete(n);
      } else set.add(n);
      draft[k] = [...set].sort((a, b) => a - b);
    } else if (typeof DEFAULTS[k] === 'boolean') draft[k] = bv === '1';
    else draft[k] = bv;
    syncSheet();
  });
});
document.getElementById('setBtn').onclick = () => { draft = JSON.parse(JSON.stringify(settings)); syncSheet(); sheet.classList.remove('hidden'); };
document.getElementById('doneBtn').onclick = () => {
  sheet.classList.add('hidden');
  if (JSON.stringify(draft) === JSON.stringify(settings)) return;
  const prev = settings;
  settings = draft; save('chordReader.settings', settings);
  enterMode(prev);
};
sheet.addEventListener('click', e => { if (e.target === sheet) document.getElementById('doneBtn').click(); });
document.getElementById('resetBtn').onclick = () => { stats = { done: 0, first: 0 }; renderUI(); };
document.getElementById('newBtn').onclick = () => { if (settings.mode === 'random') newRandomKey(); else startRound(); };
document.getElementById('nextBtn').onclick = () => startRound();
document.getElementById('midiBtn').onclick = () => { initMidi(); keepAwake(); };
document.getElementById('notaBtn').onclick = () => {
  settings.notation = settings.notation === 'nashville' ? 'roman' : 'nashville';
  save('chordReader.settings', settings);
  renderAll();
};

/* ---------- Key picker ---------- */
const keySheet = document.getElementById('keySheet');
const keyGrid = document.getElementById('keyGrid');
keyGrid.innerHTML = KEYS.map(k => `<button data-k="${k.name}">${k.name}</button>`).join('');
function syncKeyGrid() { keyGrid.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === settings.pickKey)); }
document.getElementById('keyPickBtn').onclick = () => { syncKeyGrid(); keySheet.classList.remove('hidden'); };
keyGrid.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  settings.pickKey = b.dataset.k; save('chordReader.settings', settings);
  keySheet.classList.add('hidden');
  renderAll();
});
document.getElementById('keyClose').onclick = () => keySheet.classList.add('hidden');
keySheet.addEventListener('click', e => { if (e.target === keySheet) keySheet.classList.add('hidden'); });

let resizeQueued = false;
function onResize() { if (resizeQueued) return; resizeQueued = true; requestAnimationFrame(() => { resizeQueued = false; renderAll(); }); }
window.addEventListener('resize', onResize);
document.addEventListener('fullscreenchange', onResize);

// Hook for testing without a keyboard (e.g. from the browser console): __chordReader.noteOn(60)
window.__chordReader = {
  noteOn, noteOff, pedalChange, startRound, spell, makeChord, analyze, KEYS, buildRound,
  fnHTML: an => fnHTML(an, settings.notation),
  get round() { return round; }, get stats() { return stats; }, get state() { return state; },
  get settings() { return settings; },
  setSettings(o) { const prev = settings; settings = { ...settings, ...o }; enterMode(prev); },
  setRandomKey(name) { randomKey = KEYS.find(k => k.name === name); renderAll(); },
};

enterMode(null);
initMidi();
