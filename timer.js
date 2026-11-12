'use strict';
/* 타이머: 행보드(매달리기/휴식 반복), 휴식 타이머, 인터벌. 세션 단계에서 바로 실행할 수도 있습니다. */

const LIMITS = { prep: [0, 60], work: [1, 180], rest: [0, 120], reps: [1, 20], sets: [1, 20], setRest: [0, 900] };
const STEP = { prep: 5, work: 1, rest: 1, reps: 1, sets: 1, setRest: 15 };

function T() {
  const t = state.timer;
  if (!t.mode) t.mode = 'hang';
  if (!t.hang) { t.hang = hangTodayCfg(todayStr()); t.hangPreset = 'today'; }
  if (!t.interval) { t.interval = Object.assign({}, PLAN.intervalPresets[0].cfg); t.intPreset = PLAN.intervalPresets[0].id; }
  if (!isNum(t.rest)) t.rest = 180;
  ['sound', 'voice', 'vibrate'].forEach(k => { if (t[k] === undefined) t[k] = true; });
  fixGrips(t.hang);
  return t;
}
function fixGrips(c) {
  const bd = board();
  const g = (c.grips || []).filter(x => bd.grips.includes(x));
  c.grips = Array.from({ length: c.sets }, (_, i) => g[i] || g[g.length - 1] || bd.def);
}
function board() {
  const id = state.timer.board;
  return PLAN.boards[id] || PLAN.boards.bm1000;
}
function hangTodayCfg(date, sets) {
  const h = hangFor(date), lvl = isNum(h.lvl) ? h.lvl : 0;
  const c = { kind: 'hang', title: '행보드 · 오늘 권장', prep: 10, work: PLAN.hangSeconds[lvl], rest: 0, reps: 1, sets: sets || 5, setRest: 150, load: h.skip ? '' : h.short, grips: [] };
  fixGrips(c);
  return c;
}

// ---------- 단계 만들기 ----------
function buildPhases(c) {
  const ph = [];
  if (c.kind === 'rest') { ph.push({ t: 'rest', d: c.work }); return ph; }
  if (c.prep) ph.push({ t: 'prep', d: c.prep, set: 1, rep: 1 });
  for (let s = 1; s <= c.sets; s++) {
    for (let r = 1; r <= c.reps; r++) {
      ph.push({ t: 'work', d: c.work, set: s, rep: r });
      if (r < c.reps && c.rest) ph.push({ t: 'rest', d: c.rest, set: s, rep: r });
    }
    if (s < c.sets && c.setRest) ph.push({ t: 'setrest', d: c.setRest, set: s, rep: c.reps });
  }
  return ph;
}
const totalSec = c => buildPhases(Object.assign({ kind: 'hang' }, c)).reduce((a, p) => a + p.d, 0);
function phaseName(p, c) {
  if (p.t === 'prep') return ['READY', '준비'];
  if (p.t === 'work') return c.kind === 'hang' ? ['HANG', '매달리기'] : ['WORK', c.workLabel || '운동'];
  if (p.t === 'setrest') return [c.kind === 'hang' ? 'SET REST' : 'ROUND REST', c.kind === 'hang' ? '세트 휴식' : '라운드 휴식'];
  return ['REST', '휴식'];
}

// ---------- 소리·진동·화면 ----------
let actx = null;
function unlockAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) { actx = null; }
}
function beep(freq, dur, vol = 0.25) {
  if (!T().sound || !actx) return;
  try {
    const o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime;
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(actx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (e) { /* 소리 미지원 */ }
}
function say(text) {
  if (!T().voice || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR'; u.rate = 1.1;
    speechSynthesis.speak(u);
  } catch (e) { /* 음성 미지원 */ }
}
function buzz(p) { if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; if (T().vibrate && navigator.vibrate) try { navigator.vibrate(p); } catch (e) { /* 미지원 */ } }
let wake = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { wake = null; }
}
function releaseAwake() { try { wake && wake.release(); } catch (e) { /* 무시 */ } wake = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && RUN.on && !RUN.done) keepAwake(); });

// ---------- 실행기 ----------
let RUN = { on: false };
function startRun(cfg, from) {
  unlockAudio();
  const c = JSON.parse(JSON.stringify(cfg));
  RUN = { on: true, cfg: c, phases: buildPhases(c), i: 0, paused: false, remain: 0, end: 0, lastSec: null, from: from || null, work: [], done: false };
  if (!RUN.phases.length) { RUN.on = false; return; }
  buildRunner();
  beginPhase(performance.now());
  keepAwake();
  tick();
}
function beginPhase(at) {
  const p = RUN.phases[RUN.i];
  RUN.end = at + p.d * 1000; RUN.lastSec = null;
  const [en, ko] = phaseName(p, RUN.cfg);
  const el = document.getElementById('runner');
  el.className = `runner ph-${p.t}${RUN.paused ? ' paused' : ''}`;
  setText('rPhase', en); setText('rSub', ko);
  const c = RUN.cfg, single = c.kind === 'rest';
  setText('rSet', single ? '' : `${p.set}/${c.sets}`);
  setText('rRep', single ? '' : `${p.rep}/${c.reps}`);
  const grip = c.kind === 'hang' ? [c.grips[(p.t === 'setrest' ? p.set : p.set - 1)] || '', c.load].filter(Boolean).join(' · ') : (c.title || '');
  setText('rGrip', p.t === 'setrest' && c.kind === 'hang' ? '다음 세트 · ' + grip : grip);
  const nx = RUN.phases[RUN.i + 1];
  setText('rNext', nx ? `다음 · ${phaseName(nx, c)[1]} ${durText(nx.d)}` : single ? '' : '마지막');
  document.getElementById('rPlus').hidden = p.t === 'work' || p.t === 'prep';
  // 신호
  if (p.t === 'work') { beep(1046, 0.4, 0.35); buzz(250); say(c.kind === 'hang' ? '매달려' : '시작'); }
  else if (p.t === 'rest') { beep(587, 0.3); buzz([80, 60, 80]); if (p.d >= 5 || c.kind === 'rest') say('휴식'); }
  else if (p.t === 'setrest') { beep(587, 0.3); buzz([80, 60, 80]); say(`${c.kind === 'hang' ? '세트' : '라운드'} 휴식 ${durText(p.d)}`); }
  else if (p.t === 'prep') say('준비');
}
function setText(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }
function remainingTotal(now) {
  let s = Math.max(0, (RUN.paused ? RUN.remain : RUN.end - now) / 1000);
  for (let k = RUN.i + 1; k < RUN.phases.length; k++) s += RUN.phases[k].d;
  return s;
}
function tick() {
  if (!RUN.on || RUN.done) return;
  const now = performance.now();
  if (!RUN.paused) {
    while (RUN.end - now <= 0) {
      const p = RUN.phases[RUN.i];
      if (p.t === 'work') RUN.work.push(p);
      RUN.i++;
      if (RUN.i >= RUN.phases.length) return finishRun(false);
      beginPhase(RUN.end);
    }
  }
  const p = RUN.phases[RUN.i];
  const rem = RUN.paused ? RUN.remain : RUN.end - now;
  const sec = Math.ceil(rem / 1000);
  if (sec !== RUN.lastSec) {
    RUN.lastSec = sec;
    setText('rNum', p.d >= 60 && sec >= 60 ? mmss(sec) : String(Math.max(0, sec)));
    document.getElementById('rNum').classList.toggle('long', p.d >= 60 && sec >= 60);
    setText('rTotal', mmss(remainingTotal(now)));
    if (!RUN.paused && sec <= 3 && sec > 0 && p.d > 3) { beep(880, 0.09); if (sec === 3 && RUN.phases[RUN.i + 1] && RUN.phases[RUN.i + 1].t === 'work' && p.t !== 'prep') say('셋'); }
  }
  const arc = document.getElementById('rArc');
  if (arc) arc.style.strokeDashoffset = String(ARC_C * (1 - Math.max(0, Math.min(1, rem / (p.d * 1000)))));
  requestAnimationFrame(tick);
}
const ARC_R = 136, ARC_C = 2 * Math.PI * ARC_R;
function togglePause() {
  const now = performance.now();
  if (RUN.paused) { RUN.paused = false; RUN.end = now + RUN.remain; }
  else { RUN.paused = true; RUN.remain = Math.max(0, RUN.end - now); }
  document.getElementById('runner').classList.toggle('paused', RUN.paused);
  document.getElementById('rPause').innerHTML = RUN.paused ? ic('play', 'fill') : PAUSE_IC;
  RUN.lastSec = null;
  if (RUN.paused) say('일시정지');
}
function jump(delta) {
  const now = performance.now();
  const cur = RUN.phases[RUN.i];
  if (delta > 0 && cur.t === 'work') RUN.work.push(cur);
  RUN.i = Math.max(0, RUN.i + delta);
  if (RUN.i >= RUN.phases.length) return finishRun(false);
  if (RUN.paused) { RUN.remain = RUN.phases[RUN.i].d * 1000; }
  beginPhase(now);
  if (RUN.paused) RUN.end = now + RUN.remain;
}
function addTime(sec) {
  if (RUN.paused) RUN.remain += sec * 1000; else RUN.end += sec * 1000;
  RUN.phases[RUN.i].d += sec;
  RUN.lastSec = null;
}
const PAUSE_IC = '<svg class="ic fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z"/></svg>';

function buildRunner() {
  const el = document.getElementById('runner'), c = RUN.cfg;
  el.hidden = false;
  document.body.classList.add('lock');
  el.innerHTML = `
    <div class="r-top"><button class="r-icon" data-act="r-stop" aria-label="그만하기">${ic('close')}</button><div class="r-title">${esc(c.title || '타이머')}</div><div class="r-total"><small>남은</small><span id="rTotal">0:00</span></div></div>
    <div class="r-meta" ${c.kind === 'rest' ? 'hidden' : ''}><div><span>${c.kind === 'interval' ? 'ROUND' : 'SET'}</span><b id="rSet"></b></div><div><span>REP</span><b id="rRep"></b></div></div>
    <div class="r-ring">
      <svg viewBox="0 0 300 300" aria-hidden="true"><circle cx="150" cy="150" r="${ARC_R}" class="r-bg"/><circle id="rArc" cx="150" cy="150" r="${ARC_R}" class="r-arc" stroke-dasharray="${ARC_C.toFixed(1)}" transform="rotate(-90 150 150)"/></svg>
      <div class="r-center"><div class="r-phase" id="rPhase"></div><div class="r-num" id="rNum" role="timer" aria-live="off"></div><div class="r-sub" id="rSub"></div></div>
    </div>
    <div class="r-grip" id="rGrip"></div>
    <div class="r-next" id="rNext"></div>
    <div class="r-ctrl">
      <button class="r-icon lg" data-act="r-prev" aria-label="이전 단계">${ic('chevL')}</button>
      <button class="r-play" id="rPause" data-act="r-pause" aria-label="일시정지/재개">${PAUSE_IC}</button>
      <button class="r-icon lg" data-act="r-next" aria-label="다음 단계">${ic('chevR')}</button>
    </div>
    <button class="r-plus" id="rPlus" data-act="r-plus">+15초</button>`;
}
function finishRun(stopped) {
  RUN.done = true;
  releaseAwake();
  const c = RUN.cfg;
  if (!stopped) { beep(1046, 0.15, 0.35); setTimeout(() => beep(1046, 0.15, 0.35), 220); setTimeout(() => beep(1318, 0.5, 0.35), 440); buzz([200, 100, 200, 100, 400]); say('완료. 수고했어요'); }
  const setsDone = new Set(RUN.work.filter(p => p.rep === c.reps).map(p => p.set)).size;
  const hangSec = RUN.work.reduce((a, p) => a + p.d, 0);
  let saved = '';
  const date = (RUN.from && RUN.from.date) || todayStr();
  if (RUN.work.length && (c.kind === 'hang' || RUN.from)) {
    const x = dayW(date);
    if (c.kind === 'hang') {
      x.hangLog = x.hangLog || [];
      const now = new Date();
      x.hangLog.push({ at: `${pad(now.getHours())}:${pad(now.getMinutes())}`, title: c.title || '행보드', work: c.work, reps: c.reps, sets: c.sets, setsDone, board: board().short, grip: [...new Set(c.grips)].join('/'), load: c.load || '' });
      if (!x.hang && c.load && PLAN.hangLevels.includes(c.load)) x.hang = c.load;
      saved = `${md(date)} 기록에 저장했어요`;
    }
    if (RUN.from && !stopped) { x.checks = x.checks || {}; x.checks[RUN.from.id] = true; saved = saved || '세션 단계를 완료로 표시했어요'; }
    save();
  }
  const el = document.getElementById('runner');
  el.className = 'runner ph-done';
  el.innerHTML = `
    <div class="r-top"><span class="r-icon ghost"></span><div class="r-title">${esc(c.title || '타이머')}</div><span class="r-icon ghost"></span></div>
    <div class="r-done">
      <div class="r-badge">${ic(stopped ? 'close' : 'check')}</div>
      <h2>${stopped ? '중단했어요' : '완료!'}</h2>
      <div class="r-sum">
        ${c.kind === 'rest' ? `<div><b>${durText(c.work)}</b><span>휴식</span></div>` : `
        <div><b>${setsDone}<small>/${c.sets}</small></b><span>${c.kind === 'interval' ? '라운드' : '세트'}</span></div>
        <div><b>${hangSec}<small>초</small></b><span>${c.kind === 'hang' ? '매달린 시간' : '운동 시간'}</span></div>`}
      </div>
      ${saved ? `<p class="r-saved">${ic('check')}${saved}</p>` : ''}
      <button class="btn-xl" data-act="r-close">닫기</button>
      ${stopped ? '' : `<button class="r-again" data-act="r-again">${ic('swap')}한 번 더</button>`}
    </div>`;
  if (typeof render === 'function') { const keep = ui.focus; render(); ui.focus = keep; renderFocus(); }
}
function closeRunner() {
  RUN = { on: false };
  releaseAwake();
  try { speechSynthesis.cancel(); } catch (e) { /* 무시 */ }
  const el = document.getElementById('runner');
  el.hidden = true; el.innerHTML = '';
  if (ui.focus == null) document.body.classList.remove('lock');
  render();
}

// ---------- 타이머 탭 ----------
function tRow(cfgKey, k, label, show = true) {
  if (!show) return '';
  const c = T()[cfgKey], v = c[k];
  const unit = k === 'reps' || k === 'sets' ? (k === 'reps' ? '회' : cfgKey === 'interval' ? '라운드' : '세트') : '';
  return `<div class="trow"><span class="tr-k">${label}</span><div class="tstep">
    <button class="mt-btn" data-act="t-adj" data-cfg="${cfgKey}" data-k="${k}" data-delta="-1" aria-label="${label} 줄이기">${ic('minus')}</button>
    <b>${unit ? v + `<small>${unit}</small>` : durText(v)}</b>
    <button class="mt-btn" data-act="t-adj" data-cfg="${cfgKey}" data-k="${k}" data-delta="1" aria-label="${label} 늘리기">${ic('plus')}</button></div></div>`;
}
function presetCards(list, cur, act) {
  return `<div class="presets">${list.map(p => `<button class="preset ${cur === p.id ? 'on' : ''}" data-act="${act}" data-id="${p.id}"><b>${p.name}</b><small>${p.sub}</small></button>`).join('')}</div>`;
}
function viewTimer() {
  const t = T();
  const seg = `<div class="seg wide" role="tablist">${[['hang', '행보드'], ['rest', '휴식'], ['interval', '인터벌']].map(([k, l]) => `<button class="${t.mode === k ? 'on' : ''}" data-act="t-mode" data-v="${k}" role="tab" aria-selected="${t.mode === k}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (t.mode === 'hang') {
    const c = t.hang, h = hangFor(todayStr());
    const today = { id: 'today', name: '오늘 권장', sub: h.skip ? '이번 주 행보드 생략' : `${PLAN.hangSeconds[h.lvl]}초 × 5 · ${h.short}` };
    const tot = totalSec(c), hangT = c.work * c.reps * c.sets;
    body = `${h.skip ? `<p class="warn">${ic('alert')}${h.skip}. 그래도 쓰려면 강도를 낮게 잡으세요.</p>` : ''}
      ${liveFlags(todayStr()).fingerWeek ? `<p class="warn">${ic('finger')}이번 주 손가락 통증 기록이 있습니다. 행보드는 쉬는 걸 권합니다.</p>` : ''}
      <div class="seg board" role="group" aria-label="행보드 종류">${Object.entries(PLAN.boards).map(([id, b]) => `<button class="${board() === b ? 'on' : ''}" data-act="t-board" data-v="${id}">${b.short}</button>`).join('')}</div>
      ${presetCards([today, ...PLAN.hangPresets.slice(1)], t.hangPreset, 't-preset')}
      <section class="card">
        <div class="card-h"><h2>설정</h2><span class="muted">총 ${mmss(tot)} · 매달리기 ${hangT}초</span></div>
        ${tRow('hang', 'prep', '준비')}${tRow('hang', 'work', '매달리기')}${tRow('hang', 'reps', '반복')}${tRow('hang', 'rest', '반복 사이 휴식', c.reps > 1)}${tRow('hang', 'sets', '세트')}${tRow('hang', 'setRest', '세트 휴식', c.sets > 1)}
        <label class="field"><span>무게 · 보조</span><input type="text" placeholder="예: 발 지지 / -10kg / +2.5kg" data-field="t:load" value="${esc(c.load)}"></label>
        <div class="field"><span>세트별 그립 · ${board().name}</span><div class="grips">${c.grips.map((g, i) => `<label class="grip"><em>${i + 1}세트</em><select data-field="t:grip:${i}" aria-label="${i + 1}세트 그립">${board().grips.map(o => `<option ${o === g ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`).join('')}</div>
          <button class="link-sm" data-act="t-gripall">1세트 그립을 모든 세트에 적용</button></div>
      </section>
      <button class="btn-start" data-act="t-start">${ic('play', 'fill')}<span>시작</span><small>${mmss(tot)}</small></button>`;
  } else if (t.mode === 'rest') {
    body = `<section class="card"><div class="card-h"><h2>바로 시작</h2><span class="muted">누르면 바로 카운트다운</span></div>
      <div class="restgrid">${PLAN.restPresets.map(s => `<button class="restbtn" data-act="t-rest" data-sec="${s}"><b>${mmss(s)}</b><small>${s === 180 ? '시도 간' : s === 150 ? '풀업 세트' : s === 240 ? '라운드' : ''}</small></button>`).join('')}</div></section>
      <section class="card"><div class="card-h"><h2>직접 설정</h2></div>
        <div class="trow"><span class="tr-k">휴식</span><div class="tstep"><button class="mt-btn" data-act="t-restadj" data-delta="-15" aria-label="15초 줄이기">${ic('minus')}</button><b>${mmss(t.rest)}</b><button class="mt-btn" data-act="t-restadj" data-delta="15" aria-label="15초 늘리기">${ic('plus')}</button></div></div>
      </section>
      <button class="btn-start" data-act="t-rest" data-sec="${t.rest}">${ic('play', 'fill')}<span>휴식 시작</span><small>${mmss(t.rest)}</small></button>`;
  } else {
    const c = t.interval, tot = totalSec(c);
    body = `${presetCards(PLAN.intervalPresets, t.intPreset, 't-ipreset')}
      <section class="card"><div class="card-h"><h2>설정</h2><span class="muted">총 ${mmss(tot)}</span></div>
        ${tRow('interval', 'prep', '준비')}${tRow('interval', 'work', c.workLabel || '운동')}${tRow('interval', 'reps', '반복')}${tRow('interval', 'rest', '반복 사이 휴식', c.reps > 1 || c.sets > 1)}${tRow('interval', 'sets', '라운드')}${tRow('interval', 'setRest', '라운드 휴식', c.sets > 1)}
      </section>
      <button class="btn-start" data-act="t-start">${ic('play', 'fill')}<span>시작</span><small>${mmss(tot)}</small></button>`;
  }
  const opt = (k, l) => `<button class="chipbtn ${t[k] ? 'on' : ''}" data-act="t-opt" data-k="${k}" aria-pressed="${!!t[k]}">${l}</button>`;
  return appbar('<span class="eb-tag">TIMER</span> 행보드 · 휴식 · 인터벌', '타이머', null) + seg + body +
    `<section class="card"><div class="card-h"><h2>알림</h2></div><div class="chips">${opt('sound', '소리')}${opt('voice', '음성 안내')}${opt('vibrate', '진동')}</div>
    <p class="hint">타이머가 도는 동안 화면이 꺼지지 않게 합니다(지원 브라우저). 아이폰은 진동이 지원되지 않습니다.</p></section>`;
}
VIEWS.timer = viewTimer;

// ---------- 타이머 이벤트 ----------
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act;
  if (!a.startsWith('t-') && !a.startsWith('r-')) return;
  const t = T();
  switch (a) {
    case 't-mode': t.mode = b.dataset.v; return commit();
    case 't-preset': {
      t.hangPreset = b.dataset.id;
      if (b.dataset.id === 'today') t.hang = hangTodayCfg(todayStr());
      else { const p = PLAN.hangPresets.find(x => x.id === b.dataset.id); t.hang = Object.assign({ kind: 'hang', title: '행보드 · ' + p.name, load: t.hang.load, grips: t.hang.grips }, p.cfg); fixGrips(t.hang); }
      return commit();
    }
    case 't-ipreset': {
      t.intPreset = b.dataset.id;
      const p = PLAN.intervalPresets.find(x => x.id === b.dataset.id);
      t.interval = Object.assign({ kind: 'interval', title: p.name }, p.cfg);
      return commit();
    }
    case 't-adj': {
      const c = t[b.dataset.cfg], k = b.dataset.k, [lo, hi] = LIMITS[k];
      c[k] = Math.max(lo, Math.min(hi, c[k] + STEP[k] * +b.dataset.delta));
      if (b.dataset.cfg === 'hang') { fixGrips(c); t.hangPreset = 'custom'; c.title = '행보드 · 내 설정'; }
      else { t.intPreset = 'custom'; c.title = c.title || '인터벌'; }
      return commit();
    }
    case 't-board': t.board = b.dataset.v; t.hang.grips = []; fixGrips(t.hang); return commit();
    case 't-gripall': t.hang.grips = t.hang.grips.map(() => t.hang.grips[0]); return commit();
    case 't-restadj': t.rest = Math.max(15, Math.min(900, t.rest + +b.dataset.delta)); return commit();
    case 't-opt': t[b.dataset.k] = !t[b.dataset.k]; return commit();
    case 't-start': {
      const c = t.mode === 'hang' ? Object.assign({ kind: 'hang' }, t.hang) : Object.assign({ kind: 'interval', title: '인터벌' }, t.interval);
      return startRun(c);
    }
    case 't-rest': return startRun({ kind: 'rest', work: +b.dataset.sec, title: `휴식 ${durText(+b.dataset.sec)}` });
    case 't-step': {
      const d = b.dataset.date, st = getSteps(sessOn(d), d).find(x => x.id === b.dataset.id);
      if (!st || !st.tm) return;
      let c;
      if (st.tm.kind === 'hang') { c = hangTodayCfg(d, st.tm.sets); c.title = st.t; c.grips = T().hang.grips.slice(); fixGrips(c); }
      else if (st.tm.kind === 'rest') c = { kind: 'rest', work: st.tm.work, title: st.tm.title || '휴식' };
      else c = Object.assign({ prep: 5, rest: 0, reps: 1, sets: 1, setRest: 0 }, st.tm, { title: st.tm.title || st.t });
      return startRun(c, { date: d, id: st.id });
    }
    case 'r-pause': return togglePause();
    case 'r-next': return jump(1);
    case 'r-prev': return jump(-1);
    case 'r-plus': return addTime(15);
    case 'r-stop':
      if (RUN.done) return closeRunner();
      if (!RUN.paused) togglePause();
      if (confirm(RUN.work.length && RUN.cfg.kind === 'hang' ? '그만할까요? 여기까지 한 세트는 기록에 남깁니다.' : '타이머를 그만할까요?')) return finishRun(true);
      return togglePause();
    case 'r-close': return closeRunner();
    case 'r-again': { const c = RUN.cfg, f = RUN.from; return startRun(c, f); }
  }
});
document.addEventListener('change', e => {
  const f = e.target.dataset && e.target.dataset.field;
  if (!f || !f.startsWith('t:')) return;
  const t = T();
  if (f === 't:load') t.hang.load = e.target.value.trim();
  else if (f.startsWith('t:grip:')) t.hang.grips[+f.split(':')[2]] = e.target.value;
  commit();
});
document.addEventListener('keydown', e => {
  if (!RUN.on || RUN.done) return;
  if (e.code === 'Space') { e.preventDefault(); togglePause(); }
  else if (e.key === 'ArrowRight') jump(1);
  else if (e.key === 'ArrowLeft') jump(-1);
});
