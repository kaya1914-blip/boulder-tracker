'use strict';
/* 볼더링 트래커 — 데이터는 이 기기 브라우저(localStorage)에만 저장됩니다. */

// ---------- 저장 ----------
const KEY = 'bt.v1';
function freshState() {
  return normalize({ v: 1, settings: {}, days: {}, weeks: {}, meta: {}, timer: {} });
}
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function nextMonday() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
  return ymd(d);
}
function normalize(s) {
  if (!s || typeof s !== 'object' || typeof s.days !== 'object') return null;
  const saved = s.settings || {};
  // 예전 기록: 목표 종류가 없으면 시작·목표 체중으로 추정
  if (!('goal' in saved) && typeof saved.startWeight === 'number' && typeof saved.targetWeight === 'number') {
    saved.goal = saved.targetWeight < saved.startWeight ? 'cut' : saved.targetWeight > saved.startWeight ? 'gain' : 'keep';
  }
  s.settings = Object.assign({}, PLAN.defaults, saved);
  if (!s.settings.startDate) s.settings.startDate = nextMonday();
  if (!s.settings.targetDate) { const d = new Date(s.settings.startDate + 'T00:00:00'); d.setDate(d.getDate() + 27); s.settings.targetDate = ymd(d); }
  s.weeks = s.weeks || {};
  s.meta = s.meta || {};
  s.timer = s.timer || {};
  return s;
}
function load() {
  try { const s = normalize(JSON.parse(localStorage.getItem(KEY))); if (s) return s; } catch (e) { /* 비어 있거나 막힘 */ }
  return freshState();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('저장하지 못했습니다. 브라우저 저장소가 막혀 있습니다.'); }
}
let state = load();

// ---------- 날짜 ----------
const pad = n => String(n).padStart(2, '0');
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayStr = () => fmt(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
const utc = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const diffDays = (a, b) => Math.round((utc(a) - utc(b)) / 864e5);
const dow = s => parse(s).getDay();
const mondayOf = s => addDays(s, -((dow(s) + 6) % 7));
const weekDates = mon => Array.from({ length: 7 }, (_, i) => addDays(mon, i));
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const md = s => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const longDate = s => { const d = parse(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`; };
const weekNo = s => Math.floor(diffDays(mondayOf(s), mondayOf(state.settings.startDate)) / 7) + 1;
const mmss = sec => { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${pad(sec % 60)}`; };
const durText = sec => (sec >= 60 ? (sec % 60 ? mmss(sec) : `${sec / 60}분`) : `${sec}초`);

// ---------- 공통 ----------
const isNum = v => typeof v === 'number' && isFinite(v);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = s => state.days[s] || {};
const dayW = s => (state.days[s] = state.days[s] || {});
const sessOn = s => (state.days[s] && state.days[s].session) || null;
// 세션 정보 (시간은 등급별 처방이 있으면 그 값)
const S = id => { const x = PLAN.sessions[id]; if (!x) return x; const m = tier().min; return m && m[id] ? Object.assign({}, x, { min: m[id] }) : x; };
const isHigh = id => !!id && S(id) && S(id).intensity === 'high';
const slotOf = id => (id && S(id) ? S(id).slot : null);
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const f1 = n => (isNum(n) ? n.toFixed(1) : '-');
const INT_LABEL = { high: '고강도', mid: '중강도', low: '저강도', rest: '휴식' };
const minText = m => (m >= 60 ? Math.floor(m / 60) + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : '') : m + '분');

const ICON = {
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  finger: 'M8 13V5a1.5 1.5 0 0 1 3 0v6m0 0V3.5a1.5 1.5 0 0 1 3 0V11m0 0V5a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 4 15.5V12a1.5 1.5 0 0 1 3 0v2',
  stack: 'M12 3 2 8l10 5 10-5zM2 12.5l10 5 10-5M2 17l10 5 10-5',
  dumbbell: 'M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11',
  leaf: 'M5 19C5 11 11 5 20 5c0 9-6 15-14 15M5 19l7-7',
  pull: 'M4 4h16M8 4v6a4 4 0 0 0 8 0V4M12 14v7',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2M9.5 2h5',
  play: 'M8 5.5v13l11-6.5z',
  check: 'M5 12.5l4.5 4.5L19 7',
  close: 'M6 6l12 12M18 6 6 18',
  chevL: 'M15 6l-6 6 6 6', chevR: 'M9 6l6 6-6 6',
  alert: 'M12 3.5 2.5 20h19zM12 10v4.5M12 17.2v.1',
  swap: 'M4 8h14l-3.5-3.5M20 16H6l3.5 3.5',
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  share: 'M12 3v12M7.5 7.5 12 3l4.5 4.5M5 13v7h14v-7',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  scale: 'M4 20h16l-2-13H6zM9 7a3 3 0 0 1 6 0',
  battery: 'M3 8h15v8H3zM21 11v2M7 11v2',
  food: 'M7 3v7a2 2 0 0 0 4 0V3M9 12v9M17 21V3c-2 1-3 4-3 8h3',
  download: 'M12 3v12M7.5 10.5 12 15l4.5-4.5M5 20h14',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.6v.1',
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[n]}"/></svg>`;
function ring(p, size, sw, cls = '', inner = '') {
  const r = (size - sw) / 2, c = 2 * Math.PI * r, o = c * (1 - Math.max(0, Math.min(1, p)));
  return `<div class="ring ${cls}" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg" stroke-width="${sw}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-width="${sw}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${o.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg><div class="ring-in">${inner}</div></div>`;
}

// ---------- 레벨 (V0~V10) ----------
const lvl = () => { const v = state.settings.level; return isNum(v) ? Math.max(0, Math.min(10, Math.round(v))) : PLAN.defaultLevel; };
const lvlSet = () => isNum(state.settings.level);
const tierIdx = () => PLAN.tierOf[lvl()];
// 지금 레벨의 처방: 5단계 기본값 위에 등급별 값을 덮어씀
let _tierKey = null, _tierVal = null;
const tier = () => { const L = lvl(); if (_tierKey !== L) { _tierKey = L; _tierVal = Object.assign({}, PLAN.tiers[PLAN.tierOf[L]], PLAN.levels[L] || {}); } return _tierVal; };
function vRange(a, b) {
  a = Math.max(0, Math.min(10, a)); b = Math.max(0, Math.min(10, b));
  return a === b ? `V${a}` : `V${a}~V${b}`;
}
// 등급 표시 기준: V 등급 · 더클라임 색 · 웨이브락 색
const gradeSys = () => (PLAN.gradeSystems[state.settings.gradeSys] ? state.settings.gradeSys : 'v');
const sysColors = (sys = gradeSys()) => PLAN.gradeSystems[sys].colors || null;
function colorAt(v, sys = gradeSys()) {
  const cs = sysColors(sys);
  if (!cs) return null;
  v = Math.max(0, Math.min(10, v));
  return cs.find(c => v >= c.lo && v <= c.hi) || (v > cs[cs.length - 1].hi ? cs[cs.length - 1] : cs[0]);
}
const gName = v => (gradeSys() === 'v' ? `V${Math.max(0, Math.min(10, v))}` : colorAt(v).n);
function gRange(a, b) {
  if (gradeSys() === 'v') return vRange(a, b);
  const na = gName(a), nb = gName(b);
  return na === nb ? na : `${na}~${nb}`;
}
// 지금 고른 레벨의 이름 (색 기준이면 고른 색, 아니면 V)
function levelName() {
  const cs = sysColors();
  if (!cs) return `V${lvl()}`;
  const i = state.settings.gradeColor, c = isNum(i) && cs[i] && cs[i].lo === lvl() ? cs[i] : colorAt(lvl());
  return c.n;
}
// 고른 색의 V 범위 글자 (색 기준일 때)
function levelV() {
  const cs = sysColors();
  if (!cs) return `V${lvl()}`;
  const c = cs.find(x => x.n === levelName()) || colorAt(lvl());
  return c.label || (c.hi >= 10 ? `V${c.lo}+` : vRange(c.lo, c.hi));
}
// 레벨에 맞춘 문제 등급: 한계(proj) · 볼륨(vol) · 쉬운(easy) · 워밍업(warm)
// 색 기준에서 지금 레벨의 색 번호
function colorIdx(L = lvl()) {
  const cs = sysColors(), i = state.settings.gradeColor;
  if (isNum(i) && cs[i] && cs[i].lo === L) return i;
  return cs.indexOf(colorAt(L));
}
function grades(L = lvl()) {
  const cs = sysColors();
  if (cs) {
    // 색은 한 색이 V 여러 단계에 걸칠 수 있어서 색 단위로 계산: 한계 = 내 색~다음 색, 볼륨 = 두 색 아래~한 색 아래
    const i = colorIdx(L), n = k => cs[Math.max(0, Math.min(cs.length - 1, k))].n;
    const rg = (a2, b2) => (n(a2) === n(b2) ? n(a2) : `${n(a2)}~${n(b2)}`);
    return { proj: rg(i, i + 1), vol: rg(i - 2, i - 1), easy: rg(i - 3, i - 2), warm: i <= 3 ? n(0) : `${n(i - 3)} 이하` };
  }
  const top = gradeSys() === 'v' ? 'V10+' : gName(10);
  return { proj: L >= 10 ? top : gRange(L, L + 1), vol: gRange(L - 2, L - 1), easy: gRange(L - 3, L - 2), warm: L <= 3 ? gName(0) : `${gName(L - 3)} 이하` };
}
function fill(str) {
  if (!str) return str;
  const g = grades(), t = tier();
  const extra = { vn1: t.vn && t.vn[0], vn2: t.vn && t.vn[1], vn3: t.vn && t.vn[2], lockT: t.lock.t, lockD: t.lock.d, hangRestT: durText(t.hangRest || 150) };
  const one = x => String(x).replace(/\{(\w+)\}/g, (m, k) => (g[k] != null ? g[k] : extra[k] != null ? extra[k] : typeof t[k] === 'string' || typeof t[k] === 'number' ? t[k] : m));
  return one(one(str)); // 처방 글 안에 다시 {vol} 같은 표시가 들어 있을 수 있어 두 번
}

// ---------- 몸·목표·식단 목표 ----------
const GOALS = { cut: '감량', keep: '유지', gain: '증량' };
const goalOf = () => (GOALS[state.settings.goal] ? state.settings.goal : 'keep');
// 체중 목표가 있는지 (유지가 아니고 시작·목표 체중이 모두 있을 때)
const weightGoal = () => goalOf() !== 'keep' && isNum(state.settings.startWeight) && isNum(state.settings.targetWeight) && state.settings.startWeight !== state.settings.targetWeight;
const profileSet = () => { const s = state.settings; return !!(s.sex && isNum(s.age) && isNum(s.heightCm) && isNum(s.startWeight)); };
function curWeight(date) {
  const v = avgWeightAround(date);
  return isNum(v) ? v : (lastWeightBefore(date) ?? state.settings.startWeight ?? null);
}
// 자동 목표: 키·나이·성별이 있으면 기초대사량(Mifflin-St Jeor) × 활동 계수, 없으면 체중 기준 근사치
function autoTargets(date) {
  const s = state.settings, w = curWeight(date), g = goalOf(), m = PLAN.meals;
  if (!isNum(w)) return null;
  const f = m.goalFactor[g], full = (s.sex === 'm' || s.sex === 'f') && isNum(s.age) && isNum(s.heightCm);
  let rest, gym;
  if (full) {
    const bmr = 10 * w + 6.25 * s.heightCm - 5 * s.age + (s.sex === 'f' ? -161 : 5);
    rest = bmr * m.activity.rest * f; gym = bmr * m.activity.gym * f;
  } else { rest = w * 31 * f; gym = w * 37 * f; }
  const r50 = v => Math.round(v / 50) * 50;
  return { rest: r50(rest), gym: r50(gym), protein: Math.round((w * m.proteinPerKg[g]) / 5) * 5, bmr: full };
}
function targets(date) {
  const s = state.settings, a = autoTargets(date) || { gym: PLAN.meals.refKcal.gym, rest: PLAN.meals.refKcal.rest, protein: 100, bmr: false, none: true };
  return { gym: isNum(s.kcalGym) ? s.kcalGym : a.gym, rest: isNum(s.kcalRest) ? s.kcalRest : a.rest, protein: isNum(s.protein) ? s.protein : a.protein, auto: a };
}

function weekCfg(w) {
  const c = Object.assign({}, PLAN.weeks[Math.min(Math.max(w, 1), 8)], w < 1 ? { pre: true } : {});
  c.goal = fill(c.goal);
  c.pull = tier().pull[Math.min(Math.max(w, 1), 8) - 1];
  return c;
}
function didIt(x) {
  if (!x || !x.session) return false;
  if (x.session === 'rest') return true;
  return Object.values(x.checks || {}).some(Boolean) || isNum(x.brown) || !!x.white || !!x.pull || !!x.hang || !!(x.hangLog && x.hangLog.length);
}
function lastWeightBefore(date) {
  const ks = Object.keys(state.days).filter(k => k <= date && isNum(state.days[k].weight)).sort();
  return ks.length ? state.days[ks[ks.length - 1]].weight : null;
}
function avgWeightAround(date) {
  const ws = [];
  for (let i = 0; i < 7; i++) { const x = day(addDays(date, -i)); if (isNum(x.weight)) ws.push(x.weight); }
  return ws.length ? avg(ws) : null;
}

// ---------- 몸 상태 ----------
function liveFlags(date) {
  const mon = mondayOf(date);
  let fingerWeek = false, elbow7 = false, short = 0;
  for (let d = mon; d <= date; d = addDays(d, 1)) if (day(d).finger) fingerWeek = true;
  for (let i = 0; i < 7; i++) {
    const x = day(addDays(date, -i));
    if (x.elbow) elbow7 = true;
    if (isNum(x.sleep) && x.sleep < state.settings.shortSleepH) short++;
  }
  return { fingerWeek, elbow7, short };
}
function hangFor(date) {
  const w = weekNo(date), cfg = weekCfg(w);
  if (cfg.hang == null) return { skip: '회복 주간 · 행보드 생략' };
  const mon = mondayOf(date);
  let lvl = cfg.hang;
  const why = [];
  if (weekStats(addDays(mon, -7)).finger) why.push('지난주 손가락 통증');
  if (state.weeks[mon] && state.weeks[mon].hold) why.push('강도 유지 선택');
  if (why.length) lvl--; // 두 사유가 겹쳐도 한 단계만 낮춤
  lvl = Math.max(0, lvl);
  const hl = tier().hangLevels;
  return { lvl, text: hl[lvl] + (why.length ? ` (한 단계 낮춤: ${why.join(', ')})` : ''), short: hl[lvl] };
}
function pullFor(date) {
  const w = weekNo(date), mon = mondayOf(date);
  if (state.weeks[mon] && state.weeks[mon].hold && w > 1) return weekCfg(w - 1).pull;
  return weekCfg(w).pull;
}
function compensationDay(date) {
  const ds = weekDates(mondayOf(date));
  const c = ds.find(d => sessOn(d) === 'homeC');
  if (!c || c >= date) return false;
  const next = ds.find(d => d > c && (sessOn(d) === 'limit' || sessOn(d) === 'volume'));
  return next === date;
}
const bump = (r, n) => r.replace(/\d+/g, m => String(+m + n));
function restSec(str) {
  if (!str) return null;
  let m = str.match(/(\d+)~(\d+)분/); if (m) return Math.round((+m[1] + +m[2]) / 2 * 60);
  m = str.match(/(\d+)분/); if (m) return +m[1] * 60;
  m = str.match(/(\d+)초/); if (m) return +m[1];
  return null;
}

function getSteps(sid, date) {
  const w = Math.max(1, weekNo(date)), cfg = weekCfg(w), mode = cfg.home, rec = !!cfg.recovery;
  const f = liveFlags(date), hang = hangFor(date), pull = pullFor(date);
  const home = sid === 'homeA' || sid === 'homeB';
  const T0 = tier();
  const list = (PLAN.steps[sid] || []).map(st0 => {
    let st = st0;
    if (st0.from) { // 등급별 처방에서 가져오는 단계
      const src = T0[st0.from];
      if (!src) return null;
      st = Object.assign({}, st0, { t: src.t, d: src.d, deload: src.deload, tm: src.tm });
    }
    const o = { id: st.id, tag: st.tag, tm: st.tm ? Object.assign({}, st.tm) : null };
    if (st.ex) {
      const ex = Object.assign({}, st.ex, (PLAN.variants[sid + ':' + st.id] || {})[tierIdx()] || {}, (PLAN.levelVariants[sid + ':' + st.id] || {})[lvl()] || {});
      let { n, s, r, rest, reps, side, tip, tempo, parts } = ex;
      if (home && reps && (mode === 'reps' || mode === 'sets')) r = bump(r, 2);
      if (home && mode === 'sets') s += 1;
      if (rec) { s = Math.min(s, 2); if (sid === 'homeC' && st.id === 'p') { s = 3; r = '4'; } }
      o.t = `${n} ${s}×${r}`;
      o.d = [rest ? `휴식 ${rest}` : '', tip].filter(Boolean).join(' · ');
      if (home && !rec && mode === 'sets') o.note = '세트 +1';
      else if (home && !rec && reps && mode === 'reps') o.note = '+2회';
      if (rec) o.note = '회복 주간';
      if (/초/.test(r)) {
        const secs = Math.max(...(r.match(/\d+/g) || ['30']).map(Number)), rs = restSec(rest) || 30;
        o.tm = side
          ? { kind: 'interval', title: `${n} (왼쪽 → 오른쪽)`, work: secs, rest: 10, reps: 2, sets: s, setRest: rs }
          : { kind: 'interval', title: n, work: secs, rest: rs, reps: 1, sets: s, setRest: rs };
      } else if (tempo && tempo.length) {
        // 템포 카운터: 한 회의 박자(구간·초)를 소리·음성으로 세며 세트와 세트 휴식까지 이어서 진행
        o.tm = { kind: 'tempo', title: n, tempo, parts: parts || null, side: !!side, reps: +((r.match(/\d+/) || ['8'])[0]), sets: s, setRest: restSec(rest) || 60 };
      } else if (rest) o.tm = { kind: 'rest', work: restSec(rest), title: `${n} 세트 휴식` };
    } else {
      o.t = fill(st.t.replace('{pull}', pull));
      o.d = fill(rec && st.deload ? st.deload : (st.d || '').replace('{hang}', hang.text || ''));
      if (rec && st.deload) o.note = '회복 주간';
      if (st.id === 'p' && sid === 'strength' && T0.pullRest) o.tm = { kind: 'rest', work: T0.pullRest, title: '풀업 세트 휴식' };
    }
    if (st.tag === 'hang') {
      if (hang.skip) o.skip = hang.skip;
      else if (f.fingerWeek) o.skip = '이번 주 손가락 통증 기록 → 행보드 제외';
    }
    if (st.tag === 'pull' && f.elbow7) o.skip = '최근 7일 팔꿈치 통증 → 중단';
    if (o.skip) o.tm = null;
    return o;
  }).filter(Boolean);
  if ((sid === 'limit' || sid === 'volume') && compensationDay(date) && !hang.skip && !f.fingerWeek) {
    list.splice(1, 0, { id: 'hc', t: '행보드 보충 3세트', d: `집 C로 대체한 근력 세션분 · ${tier().grip} · ${hang.text}`, tag: 'hang', note: '보충', tm: { kind: 'hang', sets: 3 } });
  }
  return list;
}

// ---------- 오늘 세션 추천 ----------
function recommend(date) {
  const mon = mondayOf(date), dates = weekDates(mon), st = state.settings;
  const other = d => (d === date ? null : sessOn(d));
  const busy = !!(state.weeks[mon] && state.weeks[mon].busy);
  const req = busy ? PLAN.busySlots : PLAN.slots.map(s => s.id);
  const used = new Set(dates.map(other).map(slotOf).filter(Boolean));
  const remaining = req.filter(s => !used.has(s));
  const free = dates.filter(d => d >= date && !other(d));
  const yHigh = isHigh(other(addDays(date, -1))), tHigh = isHigh(other(addDays(date, 1)));
  const canHigh = !yHigh && !tHigh;
  const highRem = remaining.filter(s => s === 'limit' || s === 'str');
  const slack = free.length - remaining.length;

  // 오늘을 빼고 남은 빈 날에 고강도를 하루씩 띄워 몇 개 넣을 수 있나
  const placed = new Set();
  let cap = 0;
  free.filter(d => d !== date).forEach(d => {
    const p = addDays(d, -1), n = addDays(d, 1);
    if (!isHigh(other(p)) && !placed.has(p) && !isHigh(other(n))) { placed.add(d); cap++; }
  });

  const sleepBad = liveFlags(date).short >= st.shortSleepDays || verdict(addDays(mon, -7)).flags.sleep;
  const ok = s => remaining.includes(slotOf(s)) && (!isHigh(s) || canHigh);
  let id, why;
  if (!remaining.length) {
    id = 'rest'; why = busy ? '바쁜 주 필수 세션(한계·볼륨)을 다 채웠습니다' : '이번 주 세션을 다 채웠습니다';
  } else if (highRem.length && canHigh && highRem.length > cap) {
    id = highRem.includes('limit') ? 'limit' : 'strength';
    why = `남은 ${free.length}일에 고강도 ${highRem.length}개를 하루씩 띄워 넣으려면 오늘 해야 합니다`;
  } else {
    const base = PLAN.baseByWeekday[dow(date)];
    if (base === 'rest' && slack > 0) { id = 'rest'; why = '기본 배치상 쉬는 날'; }
    else if (base !== 'rest' && ok(base)) { id = base; why = '기본 배치 순서'; }
    else {
      id = PLAN.order.find(ok);
      why = yHigh ? '어제 고강도 → 오늘은 고강도 제외' : tHigh ? '내일 고강도 예정 → 오늘은 고강도 제외'
        : base === 'rest' ? `남은 ${free.length}일에 세션 ${remaining.length}개 → 오늘 쉬면 다 못 채웁니다` : '남은 세션 중 순서상 다음';
      if (!id) { id = 'rest'; why = '고강도 연속을 피하려면 오늘은 휴식'; }
    }
  }
  if (id === 'limit' && sleepBad && remaining.includes('volume')) {
    id = 'volume'; why = '수면 6시간 미만이 잦음 → 한계 대신 볼륨';
  }
  return { id, why, remaining, busy, canHigh, yHigh, tHigh, slack, free };
}

// ---------- 주간 통계·판정 ----------
function weekStats(mon) {
  const ds = weekDates(mon).map(d => [d, day(d)]);
  const weights = ds.map(([, x]) => x.weight).filter(isNum);
  const st = state.settings;
  let consec = 0;
  weekDates(mon).forEach(d => { if (isHigh(sessOn(d)) && isHigh(sessOn(addDays(d, -1)))) consec++; });
  const brownVals = ds.map(([, x]) => x.brown).filter(isNum);
  const sleeps = ds.map(([, x]) => x.sleep).filter(isNum);
  return {
    mon, ds, weights, avg: avg(weights), sleepAvg: avg(sleeps),
    gymDone: ds.filter(([, x]) => S(x.session) && S(x.session).gym && didIt(x)).length,
    done: ds.filter(([, x]) => didIt(x) && x.session !== 'rest').length,
    brownMax: brownVals.length ? Math.max(...brownVals) : null,
    whites: ds.filter(([, x]) => x.white).map(([d, x]) => [d, x.white]),
    hangs: ds.filter(([, x]) => x.hang || x.pull).map(([d, x]) => [d, x.hang, x.pull]),
    hangLogs: ds.flatMap(([d, x]) => (x.hangLog || []).map(l => [d, l])),
    finger: ds.some(([, x]) => x.finger),
    elbow: ds.some(([, x]) => x.elbow),
    weak: ds.filter(([, x]) => x.weak).length,
    short: ds.filter(([, x]) => isNum(x.sleep) && x.sleep < st.shortSleepH).length,
    busy: !!(state.weeks[mon] && state.weeks[mon].busy),
    consec,
  };
}

function verdict(mon) {
  const st = state.settings, s = weekStats(mon), p = weekStats(addDays(mon, -7));
  const w = weekNo(mon);
  const cards = [], flags = {};
  const ended = addDays(mon, 6) < todayStr();
  let pAvg = p.weights.length >= 2 ? p.avg : null, pLabel = '지난주 평균';
  if (pAvg == null && w === 1 && isNum(st.startWeight)) { pAvg = st.startWeight; pLabel = '시작 체중'; }
  const goal = goalOf();

  if (s.weights.length < 3 || pAvg == null) {
    cards.push({ lv: 'info', icon: 'scale', t: '체중 판정 보류', b: `기록이 부족합니다 (이번 주 ${s.weights.length}일${pAvg == null ? ', 지난주 2일 미만' : ''}). 아침 체중을 3일 이상 적으면 판정합니다.` });
  } else {
    const diff = s.avg - pAvg;
    const line = `${pLabel} ${f1(pAvg)} → 이번 주 ${f1(s.avg)}kg (${diff > 0 ? '+' : ''}${diff.toFixed(1)})`;
    if (goal === 'gain') {
      if (diff < st.plateauKg) { flags.plateau = true; cards.push({ lv: 'warn', icon: 'scale', t: '체중이 늘지 않음', b: `${line}. 다음 주는 끼니마다 밥 1/3공기를 더합니다.` }); }
      else if (diff > st.fastLossKg) cards.push({ lv: 'warn', icon: 'scale', t: '체중이 너무 빨리 늘어남', b: `${line}. 간식·야식을 줄이고 단백질 위주로 먹습니다.` });
      else cards.push({ lv: 'ok', icon: 'scale', t: '증량 순조', b: `${line}. 계획대로 진행합니다.` });
    } else if (goal === 'keep') {
      if (Math.abs(diff) > st.fastLossKg) {
        if (diff < 0) flags.fast = true;
        cards.push({ lv: 'warn', icon: 'scale', t: diff < 0 ? '체중이 빠지는 중' : '체중이 느는 중', b: `${line}. 유지가 목표라 ${diff < 0 ? '다음 주 운동 전에 간식을 더합니다.' : '간식·야식을 줄입니다.'}` });
      } else cards.push({ lv: 'ok', icon: 'scale', t: '체중 유지 중', b: `${line}. 계획대로 진행합니다.` });
    } else if (diff > -st.plateauKg) {
      flags.plateau = true;
      cards.push({ lv: 'warn', icon: 'scale', t: '체중 정체', b: `${line}. 다음 주 쉬는 날은 끼니마다 밥 1/3공기를 더 줄입니다.` });
    } else if (-diff > st.fastLossKg) {
      flags.fast = true;
      cards.push({ lv: 'warn', icon: 'scale', t: '감량이 너무 빠름', b: `${line}. 다음 주 암장 날 운동 전에 식빵 1장 또는 김밥 1줄을 추가합니다.` });
    } else {
      cards.push({ lv: 'ok', icon: 'scale', t: '체중 순조', b: `${line}. 계획대로 진행합니다.` });
    }
  }
  if (s.weak) {
    flags.fast = true;
    cards.push({ lv: 'warn', icon: 'battery', t: `암장에서 힘 떨어짐 ${s.weak}회`, b: '다음 주 암장 날 운동 전에 식빵 1장 또는 김밥 1줄을 추가합니다.' });
  }
  if (s.finger) {
    flags.finger = true;
    cards.push({ lv: 'warn', icon: 'finger', t: '손가락 통증 기록', b: '다음 주 행보드를 한 단계 낮춥니다(자동 반영). 크림프 위주 문제는 피하세요.' });
  }
  if (s.elbow) {
    flags.elbow = true;
    cards.push({ lv: 'warn', icon: 'alert', t: '팔꿈치 통증 기록', b: '통증을 기록한 날부터 7일간 풀업·록오프를 자동으로 뺍니다. 손목 운동은 가볍게 유지하세요.' });
  }
  if (s.short >= st.shortSleepDays) {
    flags.sleep = true;
    cards.push({ lv: 'warn', icon: 'moon', t: `수면 ${st.shortSleepH}시간 미만 ${s.short}일`, b: '다음 주에는 한계 세션 대신 볼륨 세션을 추천합니다.' });
  }
  if (s.consec) cards.push({ lv: 'warn', icon: 'bolt', t: `고강도 연속 ${s.consec}회`, b: '한계·근력(집 C 포함)은 하루 이상 띄우세요. 손가락 인대 회복에 필요합니다.' });
  if (s.busy || (ended && s.gymDone <= 2)) {
    cards.push({ lv: 'info', icon: 'stack', t: `암장 ${s.gymDone}회 · 바쁜 주`, b: '다음 주도 바쁘면 오늘 화면에서 "바쁜 주"를 켜세요. 한계와 볼륨만 추천합니다.' });
  }
  if (w === 2 && (s.weak || s.finger)) {
    flags.hold = true;
    cards.push({ lv: 'warn', icon: 'finger', t: '3주차 맨몸 7초 보류 권장', b: '2주차에 통증이나 힘 떨어짐이 있었습니다. 3주차도 2주차 강도를 유지하세요.', act: { k: 'hold', mon: addDays(mon, 7), on: !!(state.weeks[addDays(mon, 7)] || {}).hold } });
  }
  if (!cards.some(c => c.lv === 'warn')) cards.push({ lv: 'ok', icon: 'check', t: '조정 없음', b: '모든 규칙이 정상입니다. 다음 주 진행표대로 갑니다.' });
  return { cards, flags, s, p, ended };
}

// 식단 로직과 화면은 food.js에 있습니다.

// ---------- 그래프 ----------
function weightChart() {
  const st = state.settings;
  const pts = Object.keys(state.days).filter(d => isNum(state.days[d].weight)).sort().map(d => ({ d, w: state.days[d].weight }));
  const startMon = mondayOf(st.startDate);
  let x0 = addDays(startMon, -7), x1 = st.targetDate > addDays(startMon, 27) ? st.targetDate : addDays(startMon, 27);
  if (pts.length) { if (pts[0].d < x0) x0 = mondayOf(pts[0].d); if (pts[pts.length - 1].d > x1) x1 = pts[pts.length - 1].d; }
  const span = Math.max(1, diffDays(x1, x0));
  const wg = weightGoal();
  const all = pts.map(p => p.w).concat(wg ? [st.targetWeight, st.startWeight] : []).concat(!pts.length && isNum(st.startWeight) ? [st.startWeight] : []);
  if (!all.length) all.push(60);
  const y0 = Math.floor(Math.min(...all) - 0.5), y1 = Math.ceil(Math.max(...all) + 0.5);
  const W = 340, H = 210, L = 28, R = 8, T = 14, B = 24;
  const X = d => +(L + (diffDays(d, x0) / span) * (W - L - R)).toFixed(1);
  const Y = v => +(T + ((y1 - v) / (y1 - y0)) * (H - T - B)).toFixed(1);
  let g = `<defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>`;
  const stepY = y1 - y0 > 6 ? 2 : 1;
  for (let v = y0; v <= y1; v += stepY) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="c-grid"/><text x="${L - 6}" y="${Y(v) + 3.5}" class="c-lbl" text-anchor="end">${v}</text>`;
  const mons = [];
  for (let d = mondayOf(x0); d <= x1; d = addDays(d, 7)) if (d >= x0) mons.push(d);
  const every = mons.length > 7 ? 2 : 1;
  mons.forEach((d, i) => { if (i % every === 0) g += `<text x="${X(d)}" y="${H - 6}" class="c-lbl" text-anchor="middle">${md(d)}</text>`; });
  const t = todayStr();
  if (t >= x0 && t <= x1) g += `<line x1="${X(t)}" x2="${X(t)}" y1="${T}" y2="${H - B}" class="c-today"/><text x="${X(t)}" y="${T - 4}" class="c-lbl" text-anchor="middle">오늘</text>`;
  if (wg) {
    g += `<line x1="${X(st.startDate)}" y1="${Y(st.startWeight)}" x2="${X(st.targetDate)}" y2="${Y(st.targetWeight)}" class="c-plan"/>`;
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(st.targetWeight)}" y2="${Y(st.targetWeight)}" class="c-goal"/>`;
    g += `<text x="${L + 4}" y="${Y(st.targetWeight) + 13}" class="c-goal-lbl">목표 ${st.targetWeight}kg</text>`;
  }
  const roll = pts.map(p => ({ x: X(p.d), y: Y(avg(pts.filter(q => q.d <= p.d && diffDays(p.d, q.d) <= 6).map(q => q.w))) }));
  if (roll.length > 1) {
    const line = roll.map(p => `${p.x},${p.y}`).join(' ');
    g += `<polygon points="${roll[0].x},${H - B} ${line} ${roll[roll.length - 1].x},${H - B}" fill="url(#wg)"/>`;
    g += `<polyline points="${line}" class="c-avg"/>`;
  }
  pts.forEach(p => { g += `<circle cx="${X(p.d)}" cy="${Y(p.w)}" r="2.4" class="c-dot"><title>${md(p.d)} ${p.w}kg</title></circle>`; });
  if (roll.length) { const lp = roll[roll.length - 1]; g += `<circle cx="${lp.x}" cy="${lp.y}" r="4.5" class="c-end"/>`; }
  if (!pts.length) g += `<text x="${(W + L) / 2}" y="${H / 2}" class="c-empty" text-anchor="middle">아침 체중을 적으면 그래프가 그려집니다</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="체중 추이와 목표선">${g}</svg>
  <div class="legend"><span><i class="lg-dot"></i>매일</span><span><i class="lg-avg"></i>7일 평균</span><span><i class="lg-plan"></i>계획</span><span><i class="lg-goal"></i>목표</span></div>`;
}
function brownChart(curMon) {
  const startMon = mondayOf(state.settings.startDate);
  const n = Math.max(4, Math.min(8, weekNo(curMon)));
  const vals = Array.from({ length: n }, (_, i) => weekStats(addDays(startMon, i * 7)).brownMax);
  const max = Math.max(10, ((tier().vol && tier().vol.target) || 8) + 2, ...vals.filter(isNum));
  const W = 340, H = 140, L = 8, B = 22, T = 10, bw = (W - L * 2) / n;
  const Y = v => T + (1 - v / max) * (H - T - B);
  const tgt = (tier().vol && tier().vol.target) || 8;
  let g = `<line x1="${L}" x2="${W - L}" y1="${Y(tgt)}" y2="${Y(tgt)}" class="c-goal"/><text x="${W - L}" y="${Y(tgt) - 4}" class="c-goal-lbl" text-anchor="end">목표 ${tgt}</text>`;
  vals.forEach((v, i) => {
    const x = L + i * bw + bw * 0.22, w = bw * 0.56, cur = addDays(startMon, i * 7) === curMon;
    if (isNum(v)) g += `<rect x="${x}" y="${Y(v)}" width="${w}" height="${H - B - Y(v)}" rx="5" class="bar ${cur ? 'cur' : ''}"/><text x="${x + w / 2}" y="${Y(v) - 5}" class="c-val" text-anchor="middle">${v}</text>`;
    else g += `<rect x="${x}" y="${H - B - 3}" width="${w}" height="3" rx="1.5" class="bar empty"/>`;
    g += `<text x="${x + w / 2}" y="${H - 6}" class="c-lbl ${cur ? 'c-cur' : ''}" text-anchor="middle">${i + 1}주</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="주차별 볼륨 최고 완등">${g}</svg>`;
}

// ---------- 화면 조각 ----------
let ui = { tab: 'today', date: todayStr(), recDate: todayStr(), weekMon: mondayOf(todayStr()), picking: false, focus: null };

function weekStrip(date, target) {
  const t = todayStr();
  return `<div class="strip">${weekDates(mondayOf(date)).map(d => {
    const x = day(d), s = S(x.session);
    let p = 0;
    if (s && x.session !== 'rest') { const st = getSteps(x.session, d).filter(z => !z.skip); p = st.length ? st.filter(z => (x.checks || {})[z.id]).length / st.length : 0; }
    else if (s) p = 1;
    const cls = ['chip', d === date ? 'sel' : '', d === t ? 'today' : '', s ? 'i-' + s.intensity : 'none'].join(' ');
    return `<button class="${cls}" data-act="goto" data-target="${target}" data-date="${d}" aria-label="${longDate(d)} ${s ? s.short : '미정'}">
      <span class="c-dow">${DOW[dow(d)]}</span>${ring(p, 38, 3.5, 'c-ring', `<span class="c-day">${parse(d).getDate()}</span>`)}<span class="c-s">${s ? s.short : ''}</span></button>`;
  }).join('')}</div>`;
}

function appbar(eyebrow, title, act, extra = '') {
  return `<header class="appbar">
    <div class="ab-l"><div class="eyebrow">${eyebrow}</div><h1 class="ab-title">${title}</h1></div>
    ${act ? `<div class="ab-r"><button class="nav-btn" data-act="${act}" data-delta="-1" aria-label="이전">${ic('chevL')}</button><button class="nav-btn" data-act="${act}" data-delta="1" aria-label="다음">${ic('chevR')}</button></div>` : extra}
  </header>`;
}
function eyebrowFor(date) {
  const w = weekNo(date), cfg = weekCfg(w);
  if (w < 1) return `<span class="eb-tag">PRE</span><span class="eb-tag lv">${levelName()}</span> 1주차까지 ${diffDays(state.settings.startDate, date)}일`;
  return `<span class="eb-tag">WEEK ${w}</span><span class="eb-tag lv">${levelName()}</span>${cfg.recovery ? ' 회복 주간' : ' ' + cfg.goal}`;
}

function goalCard(date) {
  const st = state.settings, cur = avgWeightAround(date);
  const dd = diffDays(st.targetDate, date);
  if (!weightGoal()) return `<section class="goal">
    <div class="g-l">${ic('scale')}<div><div class="g-k">체중 ${GOALS[goalOf()]}</div><div class="g-v ${isNum(cur) ? '' : 'empty'}">${isNum(cur) ? cur.toFixed(1) + '<small>kg · 7일 평균</small>' : '아침 체중을 적어주세요'}</div></div></div>
    <div class="g-r"><div class="g-k">${dd >= 0 ? 'D-' + dd : '목표일 지남'}</div><div class="g-sub">4주 진행 목표일</div></div>
  </section>`;
  const sign = st.targetWeight < st.startWeight ? 1 : -1;
  const left = isNum(cur) ? (cur - st.targetWeight) * sign : null;
  const p = isNum(cur) ? (st.startWeight - cur) / (st.startWeight - st.targetWeight) : 0;
  return `<section class="goal">
    <div class="g-l">${ic('target')}<div><div class="g-k">목표 ${st.targetWeight}kg까지</div><div class="g-v ${left == null ? 'empty' : ''}">${left == null ? '아침 체중을 적어주세요' : left <= 0 ? '달성!' : left.toFixed(1) + '<small>kg</small>'}</div></div></div>
    <div class="g-r"><div class="g-k">${dd >= 0 ? 'D-' + dd : '목표일 지남'}</div><div class="g-sub">7일 평균 ${f1(cur)}kg</div></div>
    <div class="g-bar"><i style="width:${Math.max(2, Math.min(100, p * 100)).toFixed(0)}%"></i></div>
  </section>`;
}

function levelCard() {
  const L = lvl(), set = lvlSet(), t = tier(), g = grades(), sys = gradeSys(), cs = sysColors();
  const sysSeg = `<div class="seg theme-seg lv-sys" role="group" aria-label="등급 기준">${Object.entries(PLAN.gradeSystems).map(([k, v]) => `<button class="${sys === k ? 'on' : ''}" data-act="grade-sys" data-v="${k}" aria-pressed="${sys === k}">${v.name}</button>`).join('')}</div>`;
  let btns;
  if (!cs) btns = `<div class="lv-grid" role="group" aria-label="레벨 선택">${Array.from({ length: 11 }, (_, v) => `<button class="lv-btn ${set && v === L ? 'on' : ''}" data-act="level" data-v="${v}" aria-pressed="${set && v === L}">V${v}</button>`).join('')}</div>`;
  else {
    const curName = levelName();
    btns = `<div class="lv-grid colors" role="group" aria-label="색 선택">${cs.map((c, i) => { const on = set && c.lo === L && c.n === curName; return `<button class="lv-btn col ${on ? 'on' : ''}" data-act="level-c" data-i="${i}" aria-pressed="${on}"><i class="sw" style="background:${c.hex}"></i><b>${c.n}</b><small>${c.label || (c.hi >= 10 ? `V${c.lo}+` : vRange(c.lo, c.hi))}</small></button>`; }).join('')}</div>
      <p class="hint">${PLAN.gradeSystems[sys].note}</p>`;
  }
  return `<section class="card lv-card" id="level">
    <div class="card-h"><h2>${ic('target')}내 클라이밍 레벨</h2><span class="muted">${set ? `${levelName()}${cs ? ` (${levelV()})` : ''} · ${t.name}` : '아직 안 골랐어요'}</span></div>
    <p class="hint"><b>대부분 완등할 수 있는 가장 높은 등급</b>을 고르세요. 기준은 자연 바위 V 등급이나 다니는 암장 색 중 편한 쪽으로 바꿀 수 있습니다. 문제 난이도, 행보드, 풀업, 록오프, 집 운동 횟수와 변형이 레벨에 맞게 바뀝니다.</p>
    ${sysSeg}
    ${btns}
    <div class="lv-info">
      <b>V${L} · ${t.title || t.name}${set ? '' : ' (고르기 전 기본값)'}</b>
      <p>${t.who ? `<em class="lv-who">${t.who} · ${t.name}(${t.range})</em><br>` : ''}${t.focus || t.sub}</p>
      <ul class="plain">
        <li><span>주간</span>${t.week || ''}</li>
        <li><span>문제</span>한계 ${g.proj} · 볼륨 ${g.vol} · 워밍업 ${g.warm}</li>
        <li><span>한계 세션</span>${fill(t.limit.d)}</li>
        <li><span>볼륨 세션</span>${fill(t.vol.d)} · 주차 목표 ${t.vn.join(' → ')}개</li>
        <li><span>지구력</span>${fill(t.end.d)}</li>
        <li><span>손가락</span>${t.grip} · ${t.hangSets}회 · 휴식 ${durText(t.hangRest)}<br>${t.hangLevels.map((h, i) => `${['1주', '2주', '3주', '5~6주', '7~8주'][i]} ${h}`).join(' → ')}</li>
        <li><span>풀업</span>${t.pull[0]} → ${t.pull[2]} → ${t.pull[7]}<br>${t.pullD}</li>
        <li><span>록오프</span>${t.lock.t} · ${t.lock.d}</li>
        ${t.campus ? `<li><span>캠퍼스</span>${t.campus.d}</li>` : ''}
        <li><span>코어</span>${t.core.d}</li>
        ${t.drill ? `<li><span>기술</span>${t.drill.d}</li>` : ''}
        <li><span>세션 시간</span>한계 ${minText(t.min.limit)} · 근력 ${minText(t.min.strength)} · 볼륨 ${minText(t.min.volume)}</li>
      </ul>
      ${t.caution ? `<p class="warn">${ic('alert')}${t.caution}</p>` : ''}
      <p class="hint">4주차는 회복 주간(양 절반·행보드 생략)입니다. 강도 기준은 RPE(힘든 정도 1~10)이고, 손가락 무게는 "10초 매달리고 3초 더 버틸 수 있는" 선입니다. 근거: Eva López 맥스행, Hörst 무게 풀업·4×4, Lattice 등급별 근력 자료. 개인차가 크니 통증이 있으면 한 등급 낮춰 진행하세요.</p>
    </div>
  </section>`;
}

function toggleChip(date, k, label, icon) {
  const on = !!day(date)[k];
  return `<button class="chipbtn ${on ? 'on' : ''}" data-act="flag" data-date="${date}" data-k="${k}" aria-pressed="${on}">${ic(icon)}${label}</button>`;
}
function bigStepper(date, k, label, unit, step, ph) {
  const v = day(date)[k];
  return `<div class="metric">
    <div class="mt-k">${label}</div>
    <div class="mt-row">
      <button class="mt-btn" data-act="adj" data-date="${date}" data-k="${k}" data-step="-${step}" aria-label="${label} 줄이기">${ic('minus')}</button>
      <label class="mt-val"><input type="number" inputmode="decimal" step="${step}" placeholder="${ph}" data-field="${k}" data-date="${date}" value="${isNum(v) ? v : ''}" aria-label="${label}"><span>${unit}</span></label>
      <button class="mt-btn" data-act="adj" data-date="${date}" data-k="${k}" data-step="${step}" aria-label="${label} 늘리기">${ic('plus')}</button>
    </div>
  </div>`;
}
function morningCard(date) {
  const lw = lastWeightBefore(addDays(date, -1));
  return `<section class="card">
    <div class="card-h"><h2>컨디션 체크</h2><span class="muted">매일 아침</span></div>
    <div class="metrics2">
      ${bigStepper(date, 'weight', '체중', 'kg', 0.1, lw != null ? String(lw) : '—')}
      ${bigStepper(date, 'sleep', '수면', '시간', 0.5, '—')}
    </div>
    <div class="chips">${toggleChip(date, 'finger', '손가락 통증', 'finger')}${toggleChip(date, 'elbow', '팔꿈치 통증', 'alert')}${toggleChip(date, 'weak', '힘 떨어짐', 'battery')}</div>
  </section>`;
}

function metricFields(date, sid) {
  const x = day(date);
  const g = grades();
  const brown = `<div class="field"><span>볼륨 완등 (${g.vol})</span><div class="counter">
      <button class="mt-btn" data-act="brown" data-date="${date}" data-delta="-1" aria-label="하나 빼기">${ic('minus')}</button>
      <b>${isNum(x.brown) ? x.brown : 0}</b><small>개</small>
      <button class="mt-btn" data-act="brown" data-date="${date}" data-delta="1" aria-label="하나 더하기">${ic('plus')}</button></div></div>`;
  const white = `<label class="field"><span>한계 문제(${g.proj}) 도달 홀드</span><input type="text" placeholder="예: ${g.proj.split('~').pop()} 3번 · 7번째 홀드" data-field="white" data-date="${date}" value="${esc(x.white)}"></label>`;
  const hangOpts = ['', ...tier().hangLevels, ...(x.hang && x.hang !== '생략' && !tier().hangLevels.includes(x.hang) ? [x.hang] : []), '생략'].map(o => `<option ${x.hang === o ? 'selected' : ''} value="${esc(o)}">${o || '선택'}</option>`).join('');
  const hang = `<label class="field"><span>행보드 단계</span><select data-field="hang" data-date="${date}">${hangOpts}</select></label>`;
  const pull = `<label class="field"><span>풀업 세트별 횟수</span><input type="text" inputmode="numeric" placeholder="예: 5,5,5,4" data-field="pull" data-date="${date}" value="${esc(x.pull)}"></label>`;
  const logs = (x.hangLog || []).length ? `<div class="loglist">${x.hangLog.map(l => `<div class="logrow">${ic('timer')}<span>${esc(l.at)} · ${esc(l.title)} · ${l.setsDone}/${l.sets}세트 · ${esc(l.board ? l.board + ' ' : '')}${esc(l.grip || '')}${l.load ? ' · ' + esc(l.load) : ''}</span></div>`).join('')}</div>` : '';
  if (sid === 'limit') return white + brown;
  if (sid === 'volume') return brown;
  if (sid === 'strength') return hang + pull + logs;
  if (sid === 'homeC') return pull + logs;
  return logs;
}

const INT_LV = { high: 3, mid: 2, low: 1, rest: 0 };
function heroStats(s) {
  const lv = INT_LV[s.intensity];
  const time = s.min ? (s.min >= 60 ? `${Math.floor(s.min / 60)}<small>시간</small>${s.min % 60 ? ` ${s.min % 60}<small>분</small>` : ''}` : `${s.min}<small>분</small>`) : '—';
  return `<dl class="hstats">
    <div><dt>장소</dt><dd>${s.place}</dd></div>
    <div><dt>시간</dt><dd>${time}</dd></div>
    <div><dt>강도</dt><dd><span class="meter" aria-hidden="true">${[1, 2, 3].map(n => `<i class="${n <= lv ? 'on' : ''}"></i>`).join('')}</span>${INT_LABEL[s.intensity]}</dd></div>
  </dl>`;
}

function pickerHero(date) {
  const r = recommend(date), x = day(date), mon = mondayOf(date), rs = S(r.id);
  const usedSlots = new Set(weekDates(mon).filter(d => d !== date).map(sessOn).map(slotOf).filter(Boolean));
  const opts = ['limit', 'strength', 'volume', 'homeA', 'homeB', 'homeC', 'rest'];
  const remainLabel = r.remaining.length ? r.remaining.map(id => PLAN.slots.find(s => s.id === id).label.replace(' (암장 또는 집 C)', '')).join(' · ') : '없음';
  return `<section class="hero i-${rs.intensity}">
      <span class="hero-mark" aria-hidden="true">${ic(rs.icon)}</span>
      <div class="hero-top"><span class="kicker"><i class="kdot"></i>오늘의 추천</span>${x.session ? `<button class="hero-x" data-act="cancel-pick">닫기</button>` : ''}</div>
      <h2 class="hero-name">${rs.name}</h2>
      <p class="hero-why">${ic('spark')}${r.why}</p>
      ${heroStats(rs)}
      <button class="btn-xl" data-act="pick" data-date="${date}" data-sid="${r.id}"><span>이 세션으로 할게요</span>${ic('chevR')}</button>
    </section>
    <section class="card">
      <div class="card-h"><h2>직접 고르기</h2><span class="muted">남은 세션 ${r.remaining.length}개</span></div>
      <div class="opt-grid">${opts.map(id => {
        const s = S(id), used = s.slot && usedSlots.has(s.slot), warn = isHigh(id) && !r.canHigh;
        return `<button class="opt i-${s.intensity} ${x.session === id ? 'cur' : ''} ${used ? 'used' : ''}" data-act="pick" data-date="${date}" data-sid="${id}">
          <span class="opt-ic">${ic(s.icon)}</span><b>${s.short}</b><span class="opt-desc">${s.desc}</span><small class="${used ? '' : warn ? 'opt-warn' : ''}">${used ? '이번 주 완료' : warn ? '고강도 연속 주의' : s.place + (s.min ? ' · ' + s.min + '분' : '')}</small></button>`;
      }).join('')}</div>
      <p class="hint">남은 세션: ${remainLabel}</p>
      <button class="chipbtn ${r.busy ? 'on' : ''}" data-act="busy" data-mon="${mon}" aria-pressed="${r.busy}">${ic('stack')}바쁜 주 · 암장 한계+볼륨만</button>
    </section>`;
}

function sessionBlock(date) {
  const x = day(date), sid = x.session, s = S(sid);
  if (!sid || ui.picking) return pickerHero(date);
  const steps = getSteps(sid, date), checks = x.checks || {};
  const active = steps.filter(st => !st.skip);
  const doneN = active.filter(st => checks[st.id]).length;
  const pct = active.length ? doneN / active.length : 0;
  const w = weekNo(date), cfg = weekCfg(w), mon = mondayOf(date);
  const warns = [];
  if (isHigh(sid) && (isHigh(sessOn(addDays(date, -1))) || isHigh(sessOn(addDays(date, 1))))) warns.push('앞뒤 날에 고강도가 있습니다. 고강도는 하루 이상 띄우세요.');
  const lf = liveFlags(date);
  if (sid === 'limit' && lf.short >= state.settings.shortSleepDays) warns.push(`최근 7일 중 수면 부족 ${lf.short}일 → 볼륨 세션으로 바꾸기를 권합니다.`);
  if (sid === 'limit' && verdict(addDays(mon, -7)).flags.sleep) warns.push('지난주 수면 부족 판정 → 이번 주는 한계 대신 볼륨을 권합니다.');
  if (lf.fingerWeek && (sid === 'limit' || sid === 'volume')) warns.push('손가락 통증 기록 주간: 크림프 위주 문제는 피하세요.');
  const extra = [];
  if (sid === 'strength') extra.push(`<button class="chipbtn" data-act="pick" data-date="${date}" data-sid="homeC">${ic('swap')}암장 못 감 → 집 C</button>`);
  if (sid === 'homeC') extra.push(`<button class="chipbtn" data-act="pick" data-date="${date}" data-sid="strength">${ic('swap')}암장 근력으로 되돌리기</button>`);
  if ((sid === 'strength' || sid === 'homeC') && w >= 3 && !cfg.recovery) {
    const on = !!(state.weeks[mon] && state.weeks[mon].hold);
    extra.push(`<button class="chipbtn ${on ? 'on' : ''}" data-act="hold" data-mon="${mon}" aria-pressed="${on}">${ic('finger')}버거움 → 지난주 강도 유지</button>`);
  }
  const hero = `<section class="hero i-${s.intensity}">
    <div class="hero-top"><span class="kicker"><i class="kdot"></i>오늘 세션${cfg.recovery ? ' · 회복 주간' : ''}</span><button class="hero-x" data-act="repick">${ic('swap')}변경</button></div>
    <div class="hero-main">
      <h2 class="hero-name">${s.name}</h2>
      ${sid === 'rest' ? `<span class="hero-mark static" aria-hidden="true">${ic(s.icon)}</span>` : ring(pct, 76, 7, 'hero-ring', `<b>${Math.round(pct * 100)}</b><small>%</small>`)}
    </div>
    ${heroStats(s)}
    ${s.gym ? `<div class="seg hero-seg" role="group" aria-label="운동 시간">${['eve', 'day'].map(v => `<button class="${(x.time || 'eve') === v ? 'on' : ''}" data-act="time" data-date="${date}" data-v="${v}">${v === 'eve' ? '저녁 운동' : '낮 운동'}</button>`).join('')}</div>` : ''}
    ${sid === 'rest' ? '<p class="hero-why">오늘은 회복하는 날. 가벼운 걷기와 스트레칭만.</p>' : `<button class="btn-xl" data-act="focus" data-date="${date}"><span>${ic('play', 'fill')}${doneN === 0 ? '세션 시작' : doneN === active.length ? '다시 보기' : '이어하기'}</span><span class="btn-sub">${doneN}/${active.length} 단계</span></button>`}
  </section>`;
  const list = sid === 'rest' ? '' : `<section class="card">
    <div class="card-h"><h2>세션 단계</h2><span class="muted">${doneN}/${active.length} 완료</span></div>
    ${warns.map(t => `<p class="warn">${ic('alert')}${t}</p>`).join('')}
    <ol class="steps">${steps.map((st, i) => `<li class="step ${checks[st.id] ? 'on' : ''} ${st.skip ? 'skip' : ''}">
      <button class="step-main" data-act="step" data-date="${date}" data-id="${st.id}" ${st.skip ? 'disabled' : ''} aria-pressed="${!!checks[st.id]}">
        <span class="step-no">${checks[st.id] ? ic('check') : pad(i + 1)}</span>
        <span class="st-txt"><b>${esc(st.t)}${st.note ? ` <em>${st.note}</em>` : ''}</b>${st.skip ? `<small class="skip-why">${st.skip}</small>` : st.d ? `<small>${esc(st.d)}</small>` : ''}</span>
      </button>
      ${guideBtn(sid, st.id)}
      ${st.tm ? `<button class="step-tm" data-act="t-step" data-date="${date}" data-id="${st.id}" aria-label="${esc(st.t)} 타이머">${ic('timer')}<small>${tmLabel(st.tm)}</small></button>` : ''}
    </li>`).join('')}</ol>
    ${extra.length ? `<div class="chips">${extra.join('')}</div>` : ''}
  </section>`;
  const metrics = metricFields(date, sid);
  const mcard = metrics ? `<section class="card" id="metrics"><div class="card-h"><h2>세션 기록</h2></div>${metrics}</section>` : '';
  return hero + list + mcard;
}
function tmLabel(tm) {
  if (tm.kind === 'rest') return durText(tm.work);
  if (tm.kind === 'hang') return '행보드';
  if (tm.kind === 'tempo') return `${tm.reps}회×${tm.sets}`;
  return `${tm.work}초×${(tm.reps || 1) * (tm.sets || 1)}`;
}

// 이번 주 준비·장보기 목록 (사용자가 고칠 수 있음). 체크는 주 단위로 남습니다.
function prepLists() {
  if (!state.prepList) state.prepList = {
    todo: PLAN.sundayPrep.map(it => ({ id: it.id, t: it.t })),
    shop: PLAN.shopping.replace(/\s*\(.*\)\s*$/, '').split('·').map((t, i) => ({ id: 's' + i, t: t.trim() })).filter(it => it.t),
  };
  return state.prepList;
}
function prepRows(date, kind, list, p, edit) {
  if (edit) return `<ul class="pedit">${list.map((it, i) => `<li>
      <input type="text" value="${esc(it.t)}" data-field="prep:${kind}:${i}" aria-label="${kind === 'todo' ? '할 일' : '장보기'} ${i + 1}">
      <button class="q-btn" data-act="prep-move" data-kind="${kind}" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="위로">${ic('chevL')}</button>
      <button class="q-btn" data-act="prep-del" data-kind="${kind}" data-i="${i}" aria-label="지우기">${ic('close')}</button>
    </li>`).join('')}
    <li class="padd"><input type="text" id="padd-${kind}" placeholder="${kind === 'todo' ? '할 일 추가 (예: 도시락 통 씻기)' : '살 것 추가 (예: 그릭요거트 2)'}"><button class="sa-btn" data-act="prep-add" data-kind="${kind}">${ic('plus')}추가</button></li></ul>`;
  return `<ul class="timeline compact">${list.map(it => `<li class="${p[it.id] ? 'on' : ''}"><button class="tl-main" data-act="prep" data-date="${date}" data-id="${it.id}" aria-pressed="${!!p[it.id]}"><span class="tl-dot">${p[it.id] ? ic('check') : ''}</span><span class="tl-txt"><b>${esc(it.t)}</b></span></button></li>`).join('')}</ul>`;
}
// 그 주의 준비 체크 (예전 기록은 날짜별로 있어서 그 주 것을 합쳐 읽음)
function prepChecks(date, create) {
  const mon = mondayOf(date), w = state.weeks[mon];
  if (w && w.prep) return w.prep;
  const merged = {};
  weekDates(mon).forEach(d => Object.assign(merged, day(d).prep || {}));
  if (create) { state.weeks[mon] = w || {}; state.weeks[mon].prep = merged; }
  return merged;
}
function prepCard(date) {
  const p = prepChecks(date), L = prepLists(), edit = !!ui.prepEdit;
  const n = L.todo.filter(it => p[it.id]).length, m = L.shop.filter(it => p[it.id]).length;
  const folded = !!state.meta.prepFold && !edit;
  const foldBtn = `<button class="fold-btn ${folded ? '' : 'open'}" data-act="prep-fold" aria-expanded="${!folded}" aria-label="${folded ? '펼치기' : '접기'}">${ic('chevR')}</button>`;
  if (folded) return `<section class="card folded" id="prep">
    <div class="card-h"><h2>이번 주 준비</h2><span class="ph-r"><span class="muted">할 일 ${n}/${L.todo.length} · 장보기 ${m}/${L.shop.length}</span>${foldBtn}</span></div>
  </section>`;
  return `<section class="card" id="prep">
    <div class="card-h"><h2>이번 주 준비</h2><span class="ph-r">${edit ? '' : `<span class="muted">${n}/${L.todo.length}</span>`}<button class="sa-btn ${edit ? 'fold' : ''}" data-act="prep-edit">${ic(edit ? 'check' : 'swap')}${edit ? '완료' : '편집'}</button>${edit ? '' : foldBtn}</span></div>
    ${prepRows(date, 'todo', L.todo, p, edit)}
    <h3 class="h3">장보기 ${edit ? '' : `<span class="muted">${m}/${L.shop.length}</span>`}</h3>
    ${prepRows(date, 'shop', L.shop, p, edit)}
    ${edit ? `<button class="sa-btn ghost" data-act="prep-reset">처음 목록으로 되돌리기</button>` : ''}
  </section>`;
}

function profileNag() {
  return `<button class="nag" data-act="tab" data-tab="settings">${ic('scale')}성별·나이·키·체중과 체중 목표(감량·유지·증량)를 넣으면 칼로리·단백질이 내 몸에 맞춰집니다 · 설정</button>`;
}
function backupNag() {
  const n = Object.keys(state.days).length, lb = state.meta.lastBackup;
  if (n < 5 || (lb && diffDays(todayStr(), lb) <= 7)) return '';
  return `<button class="nag" data-act="tab" data-tab="settings">${ic('download')}백업한 지 ${lb ? diffDays(todayStr(), lb) + '일' : '오래'} 됐어요 · 설정에서 백업</button>`;
}

// ---------- 탭: 오늘 ----------
function viewToday() {
  const d = ui.date, t = todayStr();
  return appbar(eyebrowFor(d), longDate(d), 'nav') +
    (d !== t ? `<button class="back-today" data-act="goto" data-target="today" data-date="${t}">오늘로 돌아가기</button>` : '') +
    weekStrip(d, 'today') + (lvlSet() ? '' : levelCard()) + (profileSet() ? '' : profileNag()) + goalCard(d) + backupNag() + sessionBlock(d) + morningCard(d) + dietCard(d) + prepCard(d);
}

// ---------- 포커스 모드 ----------
function renderFocus() {
  const el = document.getElementById('focus');
  if (ui.focus == null) {
    el.hidden = true; el.innerHTML = '';
    if (!(typeof RUN !== 'undefined' && RUN.on)) document.body.classList.remove('lock');
    return;
  }
  const d = ui.focus.date, x = day(d), sid = x.session, s = S(sid);
  if (!s) { ui.focus = null; return renderFocus(); }
  const steps = getSteps(sid, d), checks = x.checks || {};
  const i = Math.max(0, Math.min(ui.focus.i, steps.length));
  ui.focus.i = i;
  const bars = steps.map((st, k) => `<i class="${checks[st.id] ? 'done' : ''} ${st.skip ? 'skip' : ''} ${k === i ? 'cur' : ''}"></i>`).join('');
  let body;
  if (i >= steps.length) {
    const metrics = metricFields(d, sid);
    body = `<div class="f-body f-end">
      <div class="f-trophy">${ic('check')}</div>
      <h2 class="f-name">세션 완료</h2>
      <p class="f-desc">${steps.filter(st => checks[st.id]).length}/${steps.filter(st => !st.skip).length} 단계를 마쳤습니다. 수고했어요.</p>
      ${metrics ? `<div class="f-metrics">${metrics}</div>` : ''}
    </div>
    <div class="f-ctrl"><button class="f-nav" data-act="f-move" data-delta="-1" aria-label="이전 단계">${ic('chevL')}</button><button class="btn-xl" data-act="f-close">${ic('check')}닫기</button><span class="f-nav-sp"></span></div>`;
  } else {
    const st = steps[i];
    body = `<div class="f-body">
      <div class="f-idx">STEP ${pad(i + 1)} <span>/ ${pad(steps.length)}</span></div>
      <h2 class="f-name">${esc(st.t)}</h2>
      ${st.note ? `<span class="pill i-${s.intensity}">${st.note}</span>` : ''}
      ${st.skip ? `<p class="warn">${ic('alert')}${st.skip}</p>` : st.d ? `<p class="f-desc">${esc(st.d)}</p>` : ''}
      ${guideBtn(sid, st.id, 'wide')}
      ${st.tm ? `<button class="f-timer" data-act="t-step" data-date="${d}" data-id="${st.id}">${ic('timer')}<span><b>타이머 시작</b><small>${st.tm.kind === 'rest' ? durText(st.tm.work) + ' 휴식' : st.tm.kind === 'hang' ? '행보드 · ' + (hangFor(d).short || '') : (st.tm.title || '') + ' · ' + tmLabel(st.tm)}</small></span>${ic('play', 'fill')}</button>` : ''}
    </div>
    <div class="f-ctrl">
      <button class="f-nav" data-act="f-move" data-delta="-1" ${i === 0 ? 'disabled' : ''} aria-label="이전 단계">${ic('chevL')}</button>
      ${st.skip ? `<button class="btn-xl ghost" data-act="f-move" data-delta="1">건너뛰기</button>` : `<button class="btn-xl ${checks[st.id] ? 'ghost' : ''}" data-act="f-done" data-id="${st.id}">${ic('check')}${checks[st.id] ? '완료됨 · 다음' : '완료하고 다음'}</button>`}
      <button class="f-nav" data-act="f-move" data-delta="1" aria-label="다음 단계">${ic('chevR')}</button>
    </div>`;
  }
  el.className = `focus i-${s.intensity}`;
  el.hidden = false;
  document.body.classList.add('lock');
  el.innerHTML = `<div class="f-top"><button class="f-close" data-act="f-close" aria-label="닫기">${ic('close')}</button><div class="f-title">${s.name}</div><div class="f-week">W${Math.max(1, weekNo(d))}</div></div>
    <div class="f-bars">${bars}</div>${body}`;
}

// ---------- 탭: 기록 ----------
function viewRecord() {
  const d = ui.recDate, x = day(d);
  const opts = ['', 'limit', 'strength', 'volume', 'homeA', 'homeB', 'homeC', 'rest'].map(id => `<option value="${id}" ${(x.session || '') === id ? 'selected' : ''}>${id ? S(id).name : '선택 안 함'}</option>`).join('');
  const hist = Object.keys(state.days).filter(k => { const y = state.days[k]; return y.session || isNum(y.weight) || y.note; }).sort().reverse().slice(0, 30);
  const allMetrics = ['limit', 'volume', 'strength', 'homeC'].includes(x.session) ? metricFields(d, x.session) : metricFields(d, 'limit') + metricFields(d, 'strength');
  return appbar(eyebrowFor(d), longDate(d), 'recnav') + weekStrip(d, 'record') +
    `<section class="card"><div class="card-h"><h2>세션</h2></div>
      <label class="field"><span>한 세션</span><select data-field="session" data-date="${d}">${opts}</select></label>
    </section>` +
    morningCard(d) +
    `<section class="card"><div class="card-h"><h2>세션 기록</h2></div>${allMetrics}
      <label class="field"><span>메모</span><textarea rows="2" placeholder="컨디션, 문제 특징 등" data-field="note" data-date="${d}">${esc(x.note)}</textarea></label>
    </section>` +
    `<section class="card"><div class="card-h"><h2>최근 기록</h2><span class="muted">${hist.length}일</span></div>${hist.length ? `<ul class="hist">${hist.map(k => {
      const y = state.days[k], s = S(y.session);
      const bits = [isNum(y.brown) ? '완등 ' + y.brown : '', y.white ? '한계 ' + esc(y.white) : '', y.hang ? esc(y.hang) : '', y.pull ? '풀업 ' + esc(y.pull) : '', (y.hangLog || []).length ? '행보드 타이머 ' + y.hangLog.length + '회' : '', y.finger ? '손가락 통증' : '', y.elbow ? '팔꿈치 통증' : ''].filter(Boolean).join(' · ');
      return `<li><button data-act="goto" data-target="record" data-date="${k}">
        <span class="h-d"><b>${parse(k).getDate()}</b><small>${DOW[dow(k)]}</small></span>
        <span class="h-mid"><span class="h-s ${s ? 'i-' + s.intensity : ''}">${s ? s.short : '기록'}</span><span class="h-b">${bits || '&nbsp;'}</span></span>
        <span class="h-w">${isNum(y.weight) ? y.weight + '<small>kg</small>' : ''}</span></button></li>`;
    }).join('')}</ul>` : '<p class="hint">아직 기록이 없습니다.</p>'}</section>`;
}

// ---------- 탭: 주간 ----------
function viewWeek() {
  const mon = ui.weekMon, w = weekNo(mon), v = verdict(mon), s = v.s, cfg = weekCfg(w);
  const sun = addDays(mon, 6);
  const goalGym = s.busy ? 2 : 3;
  const diff = isNum(s.avg) && isNum(v.p.avg) ? s.avg - v.p.avg : null;
  const nextW = w + 1, nc = weekCfg(nextW), nm = addDays(mon, 7);
  const nHang = hangFor(nm);
  const eyebrow = `<span class="eb-tag">${w < 1 ? 'PRE' : 'WEEK ' + w}</span> ${md(mon)} – ${md(sun)}${v.ended ? '' : ' · 진행 중'}`;
  return appbar(eyebrow, w < 1 ? '준비 기간' : cfg.goal, 'weeknav') + weekStrip(mon, 'today') +
    `<section class="stats">
      <div class="stat">${ring(s.gymDone / goalGym, 64, 6, 'r-gym', `<b>${s.gymDone}</b><small>/${goalGym}</small>`)}<span>암장</span></div>
      <div class="stat">${ring(s.done / (s.busy ? 2 : 5), 64, 6, 'r-ses', `<b>${s.done}</b><small>/${s.busy ? 2 : 5}</small>`)}<span>세션</span></div>
      <div class="stat num"><b>${f1(s.avg)}</b><span>평균 kg</span><small class="${diff == null ? '' : diff < 0 ? 'down' : 'up'}">${diff == null ? '—' : (diff > 0 ? '▲' : '▼') + Math.abs(diff).toFixed(1)}</small></div>
      <div class="stat num"><b>${s.brownMax ?? '—'}</b><span>완등 최고</span><small>${isNum(s.sleepAvg) ? '수면 ' + s.sleepAvg.toFixed(1) + 'h' : ''}</small></div>
    </section>` +
    `<section class="card"><div class="card-h"><h2>체중 추이</h2><span class="muted">${weightGoal() ? `목표 ${state.settings.targetWeight}kg` : '체중 ' + GOALS[goalOf()]}</span></div>${weightChart()}</section>` +
    `<section class="card"><div class="card-h"><h2>볼륨 완등 (주차별 최고)</h2></div>${brownChart(mon)}</section>` +
    `<section class="card"><div class="card-h"><h2>다음 주 권장사항</h2>${v.ended ? '' : '<span class="muted">현재까지 기록 기준</span>'}</div>
      ${v.cards.map(c => `<div class="vcard ${c.lv}"><span class="v-ic">${ic(c.icon)}</span><div><b>${c.t}</b><p>${c.b}</p>${c.act ? `<button class="chipbtn ${c.act.on ? 'on' : ''}" data-act="hold" data-mon="${c.act.mon}" aria-pressed="${c.act.on}">${c.act.on ? '적용됨 · 다음 주 강도 유지' : '다음 주에 적용하기'}</button>` : ''}</div></div>`).join('')}
      <div class="vcard next"><span class="v-ic">${ic('chevR')}</span><div><b>다음 주 · ${nextW}주차</b><p>${nc.goal} · 행보드 ${nHang.skip ? '생략' : nHang.text} · 풀업 ${pullFor(nm)}${nc.recovery ? ' · 회복 주간(볼륨 절반)' : ''}</p></div></div>
    </section>` +
    analysisCard(mon) +
    `<section class="card"><div class="card-h"><h2>이번 주 기록</h2></div>
      <h3 class="h3">한계 문제 도달 홀드</h3>${s.whites.length ? `<ul class="plain">${s.whites.map(([d, t]) => `<li><span>${md(d)} ${DOW[dow(d)]}</span>${esc(t)}</li>`).join('')}</ul>` : '<p class="hint">기록 없음</p>'}
      <h3 class="h3">행보드 · 풀업</h3>${s.hangs.length || s.hangLogs.length ? `<ul class="plain">${s.hangs.map(([d, h, p]) => `<li><span>${md(d)} ${DOW[dow(d)]}</span>${esc(h || '-')} · 풀업 ${esc(p || '-')}</li>`).join('')}${s.hangLogs.map(([d, l]) => `<li><span>${md(d)} ${DOW[dow(d)]}</span>타이머 ${esc(l.title)} ${l.setsDone}/${l.sets}세트</li>`).join('')}</ul>` : '<p class="hint">기록 없음</p>'}
      <h3 class="h3">몸 상태</h3><p class="hint">손가락 통증 ${s.finger ? '있음' : '없음'} · 팔꿈치 통증 ${s.elbow ? '있음' : '없음'} · 힘 떨어짐 ${s.weak}회 · 수면 부족 ${s.short}일 · 고강도 연속 ${s.consec}회</p>
      <button class="chipbtn ${s.busy ? 'on' : ''}" data-act="busy" data-mon="${mon}" aria-pressed="${s.busy}">${ic('stack')}이번 주는 바쁜 주</button>
    </section>`;
}

// ---------- Claude 분석 내보내기 ----------
function analysisCard(mon) {
  return `<section class="card ai">
    <div class="card-h"><h2>${ic('spark')}Claude 주간 분석</h2></div>
    <p class="hint">이번 주 기록, 자동 판정, 지난 4주 추이를 분석 요청문과 함께 묶습니다. 복사해서 Claude 대화창에 붙여넣거나 파일로 공유하세요.</p>
    <div class="btn-row">
      <button class="btn" data-act="report-copy" data-mon="${mon}">${ic('copy')}복사</button>
      <button class="btn" data-act="report-share" data-mon="${mon}">${ic('share')}공유</button>
      <button class="btn" data-act="report-file" data-mon="${mon}">${ic('download')}파일</button>
    </div>
  </section>`;
}
function buildReport(mon) {
  const st = state.settings, w = weekNo(mon), v = verdict(mon), s = v.s, cfg = weekCfg(w);
  const L = [];
  L.push(`# 볼더링 트래커 주간 리포트 — ${w < 1 ? '준비 기간' : w + '주차'} (${mon} ~ ${addDays(mon, 6)})`);
  L.push('');
  L.push('## 분석 요청');
  L.push('아래는 내 볼더링 트레이닝·식단 트래커의 한 주 기록이다. 코치 관점에서 분석해줘.');
  L.push('1. 이번 주 잘한 점과 문제점 (체중 추세, 세션 수행률, 강도 배치, 손가락·팔꿈치 부상 신호, 수면)');
  L.push('2. 앱의 자동 판정이 적절한지, 놓친 신호가 있는지');
  L.push('3. 다음 주 구체적 조정안 (세션 배치, 행보드·풀업 강도, 식단 칼로리·단백질)');
  L.push(`4. 4주 목표(원데이 볼륨 ${grades().vol} ${tier().vol.target}개 이상 + ${grades().proj} 시도${weightGoal() ? `, 체중 ${st.targetWeight}kg` : ''}) 달성 가능성`);
  L.push('');
  L.push('## 계획 요약');
  {
    const tg = targets(mon), wk = Math.max(1, diffDays(st.targetDate, st.startDate) / 7);
    const who = [st.sex === 'm' ? '남' : st.sex === 'f' ? '여' : '', isNum(st.age) ? st.age + '세' : '', isNum(st.heightCm) ? st.heightCm + 'cm' : ''].filter(Boolean).join(' ');
    L.push(`- 나: ${who || '정보 없음'} · 체중 목표 ${GOALS[goalOf()]}${weightGoal() ? ` (${st.targetDate}까지 ${st.startWeight}kg → ${st.targetWeight}kg, 주 ${Math.abs((st.startWeight - st.targetWeight) / wk).toFixed(2)}kg)` : ''}`);
    L.push(`- 식단 목표: 단백질 ${tg.protein}g/일, 암장 날 ${tg.gym}kcal · 쉬는 날 ${tg.rest}kcal${isNum(st.kcalGym) || isNum(st.kcalRest) || isNum(st.protein) ? ' (직접 지정)' : ' (자동 계산)'}`);
  }
  L.push(`- 레벨: V${lvl()}${gradeSys() === 'v' ? '' : ` (${PLAN.gradeSystems[gradeSys()].name} ${levelName()})`} · ${tier().range} ${tier().name} · 한계 ${grades().proj} · 볼륨 ${grades().vol}`);
  L.push(`- 등급 처방(V${lvl()} ${tier().title || ''}): 한계 세션 ${fill(tier().limit.d)} / 손가락 ${tier().grip} ${tier().hangSets}회 / 지구력 ${fill(tier().end.d)}${tier().campus ? ' / 캠퍼스 ' + tier().campus.t : ''}`);
  L.push('- 주간 묶음: 한계(고강도) · 근력(고강도, 집 C 대체 가능) · 볼륨 · 집 A · 집 B · 휴식 2. 요일 자유, 고강도 연속 금지');
  L.push(`- 이번 주 진행표: ${cfg.goal} / 행보드 ${hangFor(mon).skip ? '생략' : hangFor(mon).text} / 풀업 ${pullFor(mon)}${cfg.recovery ? ' / 회복 주간' : ''}`);
  L.push('');
  L.push('## 일별 기록');
  L.push('| 날짜 | 세션 | 단계 | 체중 | 수면 | 몸 상태 | 클라이밍 기록 | 식단 체크 |');
  L.push('|---|---|---|---|---|---|---|---|');
  weekDates(mon).forEach(d => {
    const x = day(d), ss = S(x.session);
    let stp = '-';
    if (ss && x.session !== 'rest') { const sp = getSteps(x.session, d).filter(z => !z.skip); stp = `${sp.filter(z => (x.checks || {})[z.id]).length}/${sp.length}`; }
    const body = [x.finger ? '손가락 통증' : '', x.elbow ? '팔꿈치 통증' : '', x.weak ? '힘 떨어짐' : ''].filter(Boolean).join(', ') || '-';
    const climb = [isNum(x.brown) ? `볼륨 완등 ${x.brown}` : '', x.white ? `한계 문제 도달: ${x.white}` : '', x.hang ? `행보드 ${x.hang}` : '', x.pull ? `풀업 ${x.pull}` : '', ...(x.hangLog || []).map(l => `타이머 ${l.title} ${l.setsDone}/${l.sets}세트 ${l.work}초 ${l.board ? l.board + ' ' : ''}${l.grip || ''}${l.load ? ' ' + l.load : ''}`)].filter(Boolean).join(' · ') || '-';
    let meal = '-';
    { const t = foodTotals(d); if (t.n) meal = `${t.n}개 음식 · ${Math.round(t.k)}kcal · 단백질 ${Math.round(t.p)}g${t.names ? ' (' + t.names + ')' : ''}`; }
    L.push(`| ${md(d)} ${DOW[dow(d)]} | ${ss ? ss.short : '-'}${ss && ss.gym && x.time === 'day' ? '(낮)' : ''} | ${stp} | ${isNum(x.weight) ? x.weight : '-'} | ${isNum(x.sleep) ? x.sleep : '-'} | ${body} | ${climb.replace(/\|/g, '/')} | ${meal} |`);
    if (x.note) L.push(`|  | 메모: ${String(x.note).replace(/\|/g, '/').replace(/\n/g, ' ')} |  |  |  |  |  |  |`);
  });
  L.push('');
  L.push('## 주간 요약');
  L.push(`- 암장 ${s.gymDone}회, 운동 세션 ${s.done}회, 고강도 연속 ${s.consec}회${s.busy ? ', 바쁜 주' : ''}`);
  L.push(`- 체중 주 평균 ${f1(s.avg)}kg (기록 ${s.weights.length}일), 지난주 ${f1(v.p.avg)}kg`);
  L.push(`- 수면 평균 ${isNum(s.sleepAvg) ? s.sleepAvg.toFixed(1) + '시간' : '-'}, 6시간 미만 ${s.short}일`);
  L.push(`- 볼륨 완등 최고 ${s.brownMax ?? '-'}개`);
  L.push('');
  L.push('## 앱 자동 판정');
  v.cards.forEach(c => L.push(`- [${c.lv === 'warn' ? '주의' : c.lv === 'ok' ? '정상' : '참고'}] ${c.t}: ${c.b}`));
  L.push('');
  L.push('## 최근 4주 추이');
  L.push('| 주차 | 기간 | 평균 체중 | 암장 | 볼륨 완등 최고 | 통증 | 수면 부족 |');
  L.push('|---|---|---|---|---|---|---|');
  for (let k = 3; k >= 0; k--) {
    const m = addDays(mon, -7 * k), ws = weekStats(m), wn = weekNo(m);
    L.push(`| ${wn < 1 ? '준비' : wn + '주'} | ${md(m)}~${md(addDays(m, 6))} | ${f1(ws.avg)} | ${ws.gymDone} | ${ws.brownMax ?? '-'} | ${[ws.finger ? '손가락' : '', ws.elbow ? '팔꿈치' : ''].filter(Boolean).join(',') || '-'} | ${ws.short}일 |`);
  }
  L.push('');
  L.push(`(생성: ${todayStr()} · 볼더링 트래커)`);
  return L.join('\n');
}
async function reportAction(kind, mon) {
  const text = buildReport(mon), name = `boulder-week-${mon}.md`;
  if (kind === 'copy') {
    try { await navigator.clipboard.writeText(text); toast('복사했습니다. Claude 대화창에 붙여넣으세요'); }
    catch (e) { fallbackCopy(text); }
  } else if (kind === 'share') {
    try {
      const file = new File([text], name, { type: 'text/markdown' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: name });
      else if (navigator.share) await navigator.share({ title: name, text });
      else { fallbackCopy(text); }
    } catch (e) { if (e && e.name !== 'AbortError') toast('공유하지 못했습니다'); }
  } else {
    downloadBlob(text, name, 'text/markdown');
    toast('리포트 파일을 저장했습니다');
  }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('복사했습니다'); } catch (e) { toast('복사하지 못했습니다. 파일로 저장하세요'); }
  ta.remove();
}
function downloadBlob(text, name, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- 탭: 설정 ----------
function viewSettings() {
  const st = state.settings;
  const num = (k, label, step, ph = '') => `<label class="field"><span>${label}</span><input type="number" inputmode="decimal" step="${step}" data-field="set:${k}" value="${isNum(st[k]) ? st[k] : ''}" placeholder="${ph}"></label>`;
  const seg = (k, opts) => `<div class="seg theme-seg" role="group">${opts.map(([v, l]) => `<button class="${st[k] === v ? 'on' : ''}" data-act="set-v" data-k="${k}" data-v="${v}" aria-pressed="${st[k] === v}">${l}</button>`).join('')}</div>`;
  const tg = targets(todayStr()), a = tg.auto;
  const lb = state.meta.lastBackup;
  return appbar('<span class="eb-tag">SETTINGS</span> 데이터는 이 기기에만 저장', '설정', null) +
    levelCard() + themeCard() +
    `<section class="card" id="profile"><div class="card-h"><h2>내 정보</h2><span class="muted">${profileSet() ? '입력됨' : '칼로리 계산에 사용'}</span></div>
      <h3 class="h3">성별</h3>${seg('sex', [['m', '남성'], ['f', '여성']])}
      <div class="fields2">
        ${num('age', '나이', 1, '예: 30')}${num('heightCm', '키 (cm)', 0.5, '예: 172')}
      </div>
    </section>
    <section class="card"><div class="card-h"><h2>체중 목표</h2><span class="muted">${GOALS[goalOf()]}</span></div>
      ${seg('goal', [['cut', '감량'], ['keep', '유지'], ['gain', '증량']])}
      <div class="fields2">
        ${num('startWeight', '시작 체중 (kg)', 0.1, '예: 70')}${goalOf() === 'keep' ? '' : num('targetWeight', '목표 체중 (kg)', 0.1, '예: 68')}
        <label class="field"><span>1주차 시작일 (월)</span><input type="date" data-field="set:startDate" value="${st.startDate}"></label>
        <label class="field"><span>목표일</span><input type="date" data-field="set:targetDate" value="${st.targetDate}"></label>
        ${num('plateauKg', '정체 기준 (kg/주)', 0.1)}${num('fastLossKg', '급변 기준 (kg/주)', 0.1)}
      </div>
      <p class="hint">감량은 주 0.3~0.7kg, 증량은 주 0.2~0.4kg 정도가 손가락·관절 부담 없이 안전합니다.</p>
    </section>
    <section class="card"><div class="card-h"><h2>식단 목표</h2><span class="muted">${isNum(st.kcalGym) || isNum(st.kcalRest) || isNum(st.protein) ? '직접 지정' : '자동'}</span></div>
      <div class="fields2">
        ${num('kcalGym', '암장 날 칼로리', 50, `자동 ${a.gym}`)}${num('kcalRest', '쉬는 날 칼로리', 50, `자동 ${a.rest}`)}
        ${num('protein', '단백질 (g/일)', 5, `자동 ${a.protein}`)}
      </div>
      <p class="hint">비워 두면 자동으로 계산합니다. 지금 목표: 암장 날 <b>${tg.gym}kcal</b> · 쉬는 날 <b>${tg.rest}kcal</b> · 단백질 <b>${tg.protein}g</b>. ${a.none ? '체중을 넣으면 계산을 시작합니다.' : a.bmr ? '기초대사량(성별·나이·키·최근 7일 체중) × 활동량' + (goalOf() === 'cut' ? ' × 0.82 (감량)' : goalOf() === 'gain' ? ' × 1.1 (증량)' : '') + '으로 계산했어요.' : '성별·나이·키를 넣으면 더 정확해집니다 (지금은 체중만으로 추정).'} 끼니 추천의 밥 양도 이 목표에 맞춰 늘거나 줄어듭니다.</p>
    </section>
    <section class="card"><div class="card-h"><h2>백업</h2><span class="muted">마지막 ${lb ? md(lb) : '없음'}</span></div>
      <p class="hint">브라우저 데이터를 지우면 기록이 사라집니다. 주 1회 내보내기를 권합니다.</p>
      <div class="btn-row">
        <button class="btn primary" data-act="export">${ic('download')}내보내기</button>
        <button class="btn" data-act="import">불러오기</button>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
      </div>
      <button class="btn danger" data-act="reset">모든 기록 지우기</button>
    </section>
    ${analysisCard(mondayOf(todayStr()))}
    <section class="card"><div class="card-h"><h2>진행표</h2><span class="muted">${levelName()} · ${tier().name}</span></div>
      <div class="tbl"><table><thead><tr><th>주차</th><th>목표</th><th>행보드</th><th>풀업</th></tr></thead><tbody>
      ${[1, 2, 3, 4, 5, 7].map(w => { const c = weekCfg(w); return `<tr><td>${w === 5 ? '5~6' : w === 7 ? '7~8' : w}</td><td>${c.goal}</td><td>${c.hang == null ? '생략' : tier().hangLevels[c.hang]}</td><td>${c.pull}</td></tr>`; }).join('')}
      </tbody></table></div>
    </section>
    <section class="card"><div class="card-h"><h2>자동 조정 규칙</h2></div><ul class="plain rules">
      ${goalOf() === 'gain' ? `<li>주 평균 체중이 ${st.plateauKg}kg 미만으로 늘면 → 다음 주 끼니마다 밥 1/3공기 추가</li>` : goalOf() === 'cut' ? `<li>주 평균 체중 정체 → 다음 주 쉬는 날 밥 끼니당 1/3공기 감소</li>` : `<li>주 평균 체중이 ${st.fastLossKg}kg 넘게 변하면 알림</li>`}
      <li>${goalOf() === 'cut' ? `주 ${st.fastLossKg}kg 초과 감량 또는 ` : ''}힘 떨어짐 → 다음 주 암장 날 운동 전 식빵 1장/김밥 1줄</li>
      <li>손가락 통증 → 그 주 행보드 제외, 다음 주 한 단계 후퇴</li>
      <li>팔꿈치 통증 → 7일간 풀업·록오프 제외</li>
      <li>바쁜 주 → 한계+볼륨만</li>
      <li>수면 ${st.shortSleepH}시간 미만 ${st.shortSleepDays}일 이상 → 한계 대신 볼륨</li>
      <li>근력 세션을 집 C로 대체 → 다음 암장 날 행보드 보충 3세트</li>
      <li>레벨(V0~V10)을 바꾸면 문제 등급·행보드·풀업·록오프·집 운동 변형이 바로 바뀝니다</li>
    </ul></section>
    <p class="foot">볼더링 트래커 · 계획 수정은 plan.js</p>`;
}

// ---------- 테마 ----------
const darkMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme() {
  const t = state.meta.theme || 'system', root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  const m = document.querySelector('meta[name=theme-color]');
  if (m && bg) m.content = bg;
}
if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener('change', applyTheme);
function themeCard() {
  const t = state.meta.theme || 'system';
  return `<section class="card"><div class="card-h"><h2>화면 테마</h2></div>
    <div class="seg theme-seg" role="group" aria-label="화면 테마">${[['system', '시스템'], ['light', '라이트'], ['dark', '다크']].map(([k, l]) => `<button class="${t === k ? 'on' : ''}" data-act="theme" data-v="${k}" aria-pressed="${t === k}">${l}</button>`).join('')}</div>
    <p class="hint">시스템은 폰의 다크 모드 설정을 따라갑니다.</p></section>`;
}

// ---------- 렌더 ----------
const VIEWS = { today: viewToday, record: viewRecord, week: viewWeek, settings: viewSettings };
function render() {
  const main = document.getElementById('main');
  main.innerHTML = (VIEWS[ui.tab] || viewToday)();
  document.querySelectorAll('.tabbar [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  renderFocus();
}
function commit() { save(); render(); }
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400);
}

// ---------- 이벤트 ----------
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act, d = b.dataset.date;
  switch (a) {
    case 'tab': ui.tab = b.dataset.tab; ui.picking = false; window.scrollTo(0, 0); return render();
    case 'nav': ui.date = addDays(ui.date, +b.dataset.delta); ui.picking = false; return render();
    case 'recnav': ui.recDate = addDays(ui.recDate, +b.dataset.delta); return render();
    case 'weeknav': ui.weekMon = addDays(ui.weekMon, 7 * b.dataset.delta); return render();
    case 'goto':
      if (b.dataset.target === 'record') { ui.recDate = d; ui.tab = 'record'; }
      else { ui.date = d; ui.tab = 'today'; ui.picking = false; }
      return render();
    case 'pick': {
      const x = dayW(d);
      if (x.session !== b.dataset.sid) x.checks = {};
      x.session = b.dataset.sid;
      if (!x.time && S(x.session).gym) x.time = 'eve';
      ui.picking = false;
      if (isHigh(x.session) && (isHigh(sessOn(addDays(d, -1))) || isHigh(sessOn(addDays(d, 1))))) toast('고강도 연속입니다. 손가락을 위해 하루 띄우는 걸 권합니다.');
      return commit();
    }
    case 'repick': ui.picking = true; return render();
    case 'cancel-pick': ui.picking = false; return render();
    case 'step': { const x = dayW(d); x.checks = x.checks || {}; x.checks[b.dataset.id] = !x.checks[b.dataset.id]; return commit(); }
    case 'focus': {
      const x = day(d), steps = getSteps(x.session, d), ch = x.checks || {};
      let i = steps.findIndex(st => !st.skip && !ch[st.id]);
      ui.focus = { date: d, i: i < 0 ? 0 : i };
      return render();
    }
    case 'f-close': ui.focus = null; return render();
    case 'f-move': ui.focus.i += +b.dataset.delta; return renderFocus();
    case 'f-done': {
      const x = dayW(ui.focus.date); x.checks = x.checks || {};
      x.checks[b.dataset.id] = true;
      const steps = getSteps(x.session, ui.focus.date);
      let n = steps.findIndex((st, k) => k > ui.focus.i && !st.skip && !x.checks[st.id]);
      ui.focus.i = n < 0 ? steps.length : n;
      if (navigator.vibrate) try { navigator.vibrate(30); } catch (err) { /* 미지원 */ }
      return commit();
    }
    case 'prep-edit': ui.prepEdit = !ui.prepEdit; return render();
    case 'prep-add': {
      const k = b.dataset.kind, inp = document.getElementById('padd-' + k), t = inp && inp.value.trim();
      if (!t) { toast('내용을 입력해 주세요'); return; }
      prepLists()[k].push({ id: k[0] + Date.now().toString(36), t });
      return commit();
    }
    case 'prep-del': { prepLists()[b.dataset.kind].splice(+b.dataset.i, 1); return commit(); }
    case 'prep-move': {
      const l = prepLists()[b.dataset.kind], i = +b.dataset.i, j = i + +b.dataset.d;
      if (j < 0 || j >= l.length) return;
      [l[i], l[j]] = [l[j], l[i]]; return commit();
    }
    case 'prep-reset': if (confirm('이번 주 준비·장보기 목록을 처음 상태로 되돌릴까요?')) { delete state.prepList; return commit(); } return;
    case 'prep': { const pc = prepChecks(d, true); pc[b.dataset.id] = !pc[b.dataset.id]; return commit(); }
    case 'time': dayW(d).time = b.dataset.v; return commit();
    case 'flag': { const x = dayW(d); x[b.dataset.k] = !x[b.dataset.k]; return commit(); }
    case 'adj': {
      const x = dayW(d), k = b.dataset.k, step = +b.dataset.step;
      // 비어 있을 때 처음 누르면 기준값(전날 체중 / 수면 7시간)을 그대로 채움
      if (!isNum(x[k])) x[k] = k === 'weight' ? (lastWeightBefore(addDays(d, -1)) ?? state.settings.startWeight ?? 60) : 7;
      else x[k] = Math.max(0, Math.round((x[k] + step) * 10) / 10);
      return commit();
    }
    case 'brown': { const x = dayW(d); x.brown = Math.max(0, (isNum(x.brown) ? x.brown : 0) + +b.dataset.delta); return commit(); }
    case 'busy': case 'hold': {
      const m = b.dataset.mon;
      state.weeks[m] = state.weeks[m] || {}; state.weeks[m][a] = !state.weeks[m][a];
      return commit();
    }
    case 'report-copy': return reportAction('copy', b.dataset.mon);
    case 'report-share': return reportAction('share', b.dataset.mon);
    case 'report-file': return reportAction('file', b.dataset.mon);
    case 'level': {
      const v = +b.dataset.v; state.settings.level = v; state.settings.gradeColor = null; commit();
      return toast(`V${v} · ${tier().name} 프로그램으로 바꿨어요`);
    }
    case 'level-c': {
      const i = +b.dataset.i, c = sysColors()[i];
      state.settings.level = c.lo; state.settings.gradeColor = i; commit();
      return toast(`${c.n} (${c.label || vRange(c.lo, c.hi)}) · ${tier().name} 프로그램으로 바꿨어요`);
    }
    case 'grade-sys': state.settings.gradeSys = b.dataset.v; state.settings.gradeColor = null; return commit();
    case 'prep-fold': state.meta.prepFold = !state.meta.prepFold; return commit();
    case 'set-v': state.settings[b.dataset.k] = b.dataset.v; return commit();
    case 'theme': state.meta.theme = b.dataset.v; save(); applyTheme(); return render();
    case 'export': return exportData();
    case 'import': return document.getElementById('importFile').click();
    case 'reset':
      if (confirm('모든 기록을 지웁니다. 되돌릴 수 없습니다. 먼저 백업하셨나요?') && confirm('정말 지울까요?')) { state = freshState(); commit(); toast('기록을 지웠습니다'); }
      return;
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'importFile') return importData(el.files[0]);
  const f = el.dataset.field;
  if (!f) return;
  if (f.startsWith('set:')) {
    const k = f.slice(4), v = el.type === 'number' ? parseFloat(el.value) : el.value;
    const optional = ['age', 'heightCm', 'startWeight', 'targetWeight', 'kcalGym', 'kcalRest', 'protein'];
    if (el.value === '' && optional.includes(k)) { state.settings[k] = null; return commit(); }
    if ((el.type === 'number' && !isNum(v)) || v === '') { toast('값을 확인해 주세요'); return render(); }
    state.settings[k] = v;
    return commit();
  }
  if (f.startsWith('t:')) return; // 타이머 설정은 timer.js가 처리
  if (f.startsWith('prep:')) {
    const [, kind, i] = f.split(':'), t = el.value.trim();
    if (t) prepLists()[kind][+i].t = t; else prepLists()[kind].splice(+i, 1);
    return commit();
  }
  const x = dayW(el.dataset.date);
  if (f === 'session' && x.session !== el.value) x.checks = {};
  if (el.type === 'number') {
    const v = parseFloat(el.value);
    if (el.value === '') delete x[f];
    else if (!isNum(v)) { toast('숫자를 입력해 주세요'); return render(); }
    else x[f] = Math.round(v * 10) / 10;
  } else if (el.value === '') delete x[f];
  else x[f] = el.value;
  if (f === 'session' && x.session && !x.time && S(x.session).gym) x.time = 'eve';
  commit();
});

function exportData() {
  try {
    downloadBlob(JSON.stringify(state, null, 1), `boulder-tracker-${todayStr()}.json`, 'application/json');
    state.meta.lastBackup = todayStr(); commit();
    toast('백업 파일을 저장했습니다');
  } catch (e) { toast('내보내기에 실패했습니다'); }
}
function importData(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const raw = JSON.parse(r.result);
      // 일부 기록 파일(partial): 지금 기록은 그대로 두고 그 날짜만 합칩니다
      if (raw && raw.partial && raw.days && typeof raw.days === 'object') {
        const ds = Object.keys(raw.days).sort();
        if (!confirm(`${ds.map(md).join(', ')} 기록을 추가합니다. 다른 날 기록은 그대로 둡니다. 계속할까요?`)) return;
        ds.forEach(d => { state.days[d] = Object.assign(state.days[d] || {}, raw.days[d]); });
        commit(); toast('기록을 추가했습니다');
        return;
      }
      const s = normalize(raw);
      if (!s) throw new Error('형식');
      if (!confirm(`백업에서 기록 ${Object.keys(s.days).length}일치를 불러옵니다. 지금 기록은 백업 내용으로 바뀝니다. 계속할까요?`)) return;
      state = s; applyTheme(); commit(); toast('불러왔습니다');
    } catch (e) { toast('이 파일은 트래커 백업이 아닙니다'); }
  };
  r.readAsText(file);
}

// 날짜가 바뀐 뒤 앱을 다시 열면 오늘로
let lastToday = todayStr();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && todayStr() !== lastToday) {
    lastToday = todayStr(); ui.date = lastToday; ui.recDate = lastToday; ui.weekMon = mondayOf(lastToday); render();
  }
});

// 모든 스크립트를 읽은 뒤 시작 (timer.js가 VIEWS.timer를 등록)
window.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
});
