'use strict';
/* 식단: 끼니별로 실제 먹은 음식을 조합해 기록하고, 음식 DB로 칼로리·단백질을 계산합니다. */

const FOOD_MAP = Object.fromEntries(FOODS.map(f => [f.id, f]));
const myFoods = () => (state.foods = state.foods || []);
// 내 조합: 자주 먹는 음식 묶음 { id, n, items: [{f|n,k,p, q}] }
const myCombos = () => (state.combos = state.combos || []);
const comboTotals = c => sumItems(c.items);
function foodOf(it) {
  if (it.f) return FOOD_MAP[it.f] || myFoods().find(x => x.id === it.f) || { n: '(지운 음식)', u: '', k: 0, p: 0, s: 1 };
  return { n: it.n, u: it.u || '1회', k: it.k || 0, p: it.p || 0, s: 1 };
}
// 같은 음식인지: DB 음식은 id로, 직접 입력은 이름·칼로리·단백질로
function sameFoodItem(a, b) {
  if (a.f && b.f) return a.f === b.f;
  return !a.f && !b.f && a.n === b.n && a.k === b.k && a.p === b.p;
}
// 내 음식을 지워도 이미 기록한 날·조합의 칼로리는 남도록 값을 직접 적어 둠
function inlineDeletedFood(f) {
  const conv = list => (list || []).forEach(it => {
    if (it.f === f.id) { delete it.f; it.n = f.n; it.k = f.k; it.p = f.p; it.u = f.u || '1회'; }
  });
  Object.values(state.days || {}).forEach(d => { if (d && d.food) Object.values(d.food).forEach(conv); });
  myCombos().forEach(c => conv(c.items));
  if (ui.sheet && ui.sheet.pend) conv(ui.sheet.pend);
}
const r1 = v => Math.round(v * 100) / 100;
// 공기밥은 0.5인분 대신 ⅓ · ½ · ⅔ · 1 · 1⅓ · 1½ · 2공기로 움직임 (⅔에서 +0.5 하면 1⅙처럼 어색해서)
const RICE_STEPS = [1 / 3, 1 / 2, 2 / 3, 1, 4 / 3, 3 / 2, 2];
const isBowlRice = it => /공기/.test(foodOf(it).u || '') && /밥/.test(foodOf(it).n || '');
function stepQty(it, dir) {
  if (!isBowlRice(it)) return r1(it.q + 0.5 * dir); // 다른 음식은 0.5인분 단위
  const q = it.q, eps = 0.01;
  if (dir > 0) return RICE_STEPS.find(v => v > q + eps) || r1(q + 0.5);
  const lower = RICE_STEPS.filter(v => v < q - eps);
  return lower.length ? lower[lower.length - 1] : 0; // ⅓공기에서 −면 뺌
}
function qtyText(q) {
  const t = Math.round(q * 3);
  if (Math.abs(q * 3 - t) < 0.02 && t % 3 !== 0) { const w = Math.floor(t / 3), f = t % 3 === 1 ? '⅓' : '⅔'; return (w ? w : '') + f; }
  const h = Math.round(q * 2);
  if (Math.abs(q * 2 - h) < 0.02 && h % 2) return (h > 1 ? Math.floor(h / 2) : '') + '½';
  return String(r1(q)).replace(/\.0+$/, '');
}

// ---------- 그날의 끼니 구성 ----------
// 매일 같은 끼니 고정: { 끼니 id: [음식들] } (설정 · 사람마다)
const fixedMeals = () => (isObj(state.settings.fixedMeals) ? state.settings.fixedMeals : {});
const sameItems = (a, b) => a.length === b.length && a.every((x, i) => sameFoodItem(x, b[i]) && x.q === b[i].q);
function isGymDay(date) { const s = S(sessOn(date)); return !!(s && s.gym); }
// 암장 날 끼니 방식 (설정 · 사람마다): 운동 전에 못 먹으면 '퇴근 후' 구성
const afterWork = () => state.settings.preMeal === 'no';
const gymMealKey = () => (afterWork() ? 'gymAfterWork' : 'gym');
// 한 끼 밥 양을 직접 정했으면(설정 · 사람마다) 그 양, 아니면 목표 칼로리에 맞춰 자동
const myRice = () => (isNum(state.settings.riceBowl) && state.settings.riceBowl > 0 ? state.settings.riceBowl : null);
function riceQty(date) {
  if (myRice()) return myRice();
  const gym = isGymDay(date), m = PLAN.meals, k = gym ? 'gym' : 'rest';
  let q = m.rice[k];
  // 내 목표 칼로리와 기준 칼로리의 차이를 밥 양으로 맞춤 (밥이 들어가는 끼니 2번에 나눠서, 0.5공기 단위)
  const diff = targets(date)[k] - m.refKcal[gym ? gymMealKey() : 'rest'];
  q += diff / 2 / m.riceKcal;
  if (verdict(addDays(mondayOf(date), -7)).flags.plateau) {
    if (goalOf() === 'gain') q += 0.5;
    else if (goalOf() === 'cut' && !gym) q -= 0.5;
  }
  return Math.max(0, Math.min(2, Math.round(q * 2) / 2));
}
function dinnerDefault(date) {
  // 밥 양을 직접 정했으면 밥이 따로 붙는 메뉴만 돌려 가며 추천 (정식·국밥처럼 밥 1공기가 들어 있는 메뉴는 빼고)
  const idx = PLAN.dinners.map((d, i) => i).filter(i => !myRice() || PLAN.dinners[i].rice), n = idx.length;
  return idx[((diffDays(date, '2026-01-01') % n) + n) % n];
}
function dinnerItems(idx, date) {
  const d = PLAN.dinners[idx];
  const items = d.items.slice();
  if (d.rice && riceQty(date) > 0) items.push(['rice', riceQty(date)]);
  return items;
}
function slotsFor(date) {
  const sid = sessOn(date), s = S(sid), gym = isGymDay(date);
  const pf = verdict(addDays(mondayOf(date), -7)).flags;
  const dayTime = gym && day(date).time === 'day';
  const list = PLAN.meals[gym ? gymMealKey() : 'rest']
    .filter(m => !(m.longOnly && s.min < 120))
    .filter(m => !(dayTime && m.id === 'e'))
    .map(m => {
      let sug = m.sug === 'DINNER' ? dinnerItems(dinnerDefault(date), date) : (m.sug || []).map(([f, q]) => (f === 'RICE' ? ['rice', riceQty(date)] : [f, q])).filter(([, q]) => q > 0);
      let t = m.t, tip = m.tip || '', cafe = false;
      if (m.id === 'd') tip = `오늘 추천 · ${PLAN.dinners[dinnerDefault(date)].n}`;
      if (dayTime && m.id === 'l') { sug = PLAN.meals.dayWorkoutLunch.slice(); t = '점심 (운동 2시간 전)'; tip = '또는 김밥 2줄'; }
      else if (m.id === 'l' && cafeToday(date)) { sug = cafeItems(date); t = '점심 · 회사 급식'; tip = '안 먹은 건 ✕, 더 먹은 건 +'; cafe = true; }
      // 매일 같은 끼니로 고정해 둔 것 (급식 메뉴가 있는 점심은 급식이 먼저)
      const fx = fixedMeals()[m.id];
      let fixed = false;
      if (fx && fx.length && !cafe && !(dayTime && m.id === 'l')) { sug = fx.map(it => Object.assign({}, it, { q: it.q })); tip = '매일 이대로 (고정)'; fixed = true; }
      if (gym && pf.fast && m.id === (afterWork() ? 'i' : dayTime ? 'n' : 'e')) sug = sug.concat([PLAN.meals.fastLossExtra[afterWork() ? 'after' : 'pre']]);
      return { id: m.id, t, tip, sug, cafe, fixed };
    });
  // 예전 기록에만 있는 끼니 칸(운동 전 간식 등)은 기록이 있을 때만 그대로 보여 줌
  const fd = day(date).food || {}, ids = new Set(list.map(x => x.id));
  Object.keys(fd).filter(k => !ids.has(k) && (fd[k] || []).length).forEach(k => {
    list.splice(Math.max(0, list.length - 1), 0, { id: k, t: PLAN.meals.legacySlots[k] || k, tip: '', sug: [] });
  });
  return list;
}

// ---------- 회사 급식 (선택) ----------
// 설정에서 켜고 주간 메뉴를 붙여넣으면 그 날 점심 추천이 급식 메뉴로 바뀝니다. 끄면 지금처럼 직접 입력.
// state.cafe = { 'YYYY-MM-DD': [{ n, k, p, u, rice?, est?, unk?, auto? }] }
const cafeMenus = () => (state.cafe = isObj(state.cafe) ? state.cafe : {});
const cafeToday = date => !!state.settings.cafeOn && (cafeMenus()[date] || []).length > 0;
// 밥 종류(쌀밥·잡곡밥 등): 그날 밥 양(riceQty)으로 바꿔 넣음
const CAFE_RICE = /^(쌀|흰|흰쌀|백미|잡곡|현미|흑미|보리|기장|귀리|오곡|콩|찰|발아현미)?밥(\(.*\))?$/;
// 밥이 따로 안 나오는 한 그릇 메뉴
const CAFE_ONEBOWL = /라이스|덮밥|비빔밥|볶음밥|김밥|국밥|짜장|짬뽕|우동|국수|냉면|파스타|스파게티|리조또|오므라이스|주먹밥|떡볶이/;
function cafeItems(date) {
  // 그날 밥 양에서, 급식 반찬이 기본 반찬(회사 급식 반찬 1식)보다 무거운(가벼운) 만큼 밥을 0.5공기 단위로 줄임(늘림). 밥은 최소 0.5공기
  const list = cafeMenus()[date] || [], sidesK = list.filter(d => !d.rice).reduce((a, d) => a + (d.k || 0), 0);
  const adj = Math.round((sidesK - FOOD_MAP.sides.k) / PLAN.meals.riceKcal * 2) / 2;
  const rq = myRice() || Math.max(0.5, Math.min(2, riceQty(date) - adj)); // 밥 양을 직접 정했으면 그대로
  return list.map(d => ({ n: d.n, k: d.k, p: d.p, u: d.u || '1인분', q: d.rice ? rq : 1 })).filter(it => it.q > 0);
}
// 메뉴를 붙여넣을 주: 주말이면 다음 주, 평일이면 이번 주
function cafeDefaultMon(today = todayStr()) { const w = dow(today); return w === 0 || w === 6 ? addDays(mondayOf(today), 7) : mondayOf(today); }
const CAFE_WD = { 월: 0, 화: 1, 수: 2, 목: 3, 금: 4, 토: 5, 일: 6 };
// 한 줄 = 하루("월: 물만두국, 제육볶음 280/18") 또는 날짜 머리글 다음 줄부터 반찬 한 줄씩. 숫자는 "칼로리/단백질"(생략하면 음식 DB로 추정)
function parseCafe(text, mon) {
  const days = {}, skipped = [];
  let cur = null;
  const near = (mo, dd) => { // 연도 없는 날짜: 고른 주와 가장 가까운 해
    const y0 = +mon.slice(0, 4);
    return [y0 - 1, y0, y0 + 1].map(y => `${y}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}`).sort((a, b) => Math.abs(diffDays(a, mon)) - Math.abs(diffDays(b, mon)))[0];
  };
  (text || '').split(/\r?\n/).forEach(raw => {
    let line = raw.trim(), date = null, m;
    if (!line || line.startsWith('#')) return;
    if ((m = line.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})\.?/))) { date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; line = line.slice(m[0].length); }
    else if ((m = line.match(/^(\d{1,2})[/.](\d{1,2})(?!\d)\.?/))) { date = near(+m[1], +m[2]); line = line.slice(m[0].length); }
    // 요일: "월", "(월)", "월요일" 뒤에 공백·콜론·괄호·줄끝이 와야 함 (목살구이·수제비 같은 반찬 이름과 구분)
    m = line.match(/^\s*[(\[]?\s*([월화수목금토일])(요일)?(\s*[)\]])?(\s*)/);
    if (m && (m[2] || m[3] || m[4] || /^([:：\-–]|$)/.test(line.slice(m[0].length)))) {
      if (!date) date = addDays(mon, CAFE_WD[m[1]]);
      line = line.slice(m[0].length);
    }
    line = line.replace(/^\s*[:：\-–]\s*/, '').trim();
    if (date) { cur = date; days[cur] = days[cur] || []; }
    if (!line) return;
    if (!cur) { skipped.push(raw.trim()); return; }
    line.split(/[,，·、]/).map(cafeDish).filter(Boolean).forEach(d => days[cur].push(d));
  });
  // 밥이 메뉴에 없고 한 그릇 메뉴도 없으면 밥 1공기를 자동으로 더함 (그날 밥 양으로 바뀜)
  Object.values(days).forEach(list => {
    if (list.length && !list.some(d => d.rice || CAFE_ONEBOWL.test(d.n))) list.unshift({ n: '밥 (급식)', k: 310, p: 5.5, u: '1공기', rice: true, auto: true });
  });
  Object.keys(days).forEach(k => { if (!days[k].length) delete days[k]; });
  return { days, skipped };
}
// 급식 반찬 이름으로 대략 추정 (구내식당 1인분 기준). 위에서부터 먼저 맞는 규칙을 씀
// (콩나물제육볶음처럼 여러 말이 섞이면 단백질 재료가 먼저 잡히도록 고기·해물·생선을 나물보다 위에 둠)
const CAFE_GUESS = [
  [/카레|라이스|덮밥|비빔밥|볶음밥|국밥|짜장|짬뽕|오므라이스/, 600, 15, '한 그릇'],
  [/까스|가스|커틀릿|튀김|탕수/, 300, 12, '튀김'],
  [/(만두|수제비|떡|칼국수|라면|우동).*(국|탕)$|떡국|만둣국/, 250, 8, '탄수화물 국'],
  [/(소고기|쇠고기|갈비|돼지|닭|오리|사골).*(국|탕|찌개)$/, 180, 12, '고기 국'],
  [/(황태|북어|대구|동태|조개|바지락).*(국|탕|찌개)$/, 100, 10, '생선 국'],
  [/(국|탕|찌개|장국)$/, 70, 4, '국'],
  [/제육|불고기|닭갈비|닭볶음|찜닭|오리|돼지|소고기|쇠고기|갈비|수육|보쌈|함박|스테이크|떡갈비|목살|삼겹/, 280, 18, '고기'],
  [/쭈꾸미|주꾸미|오징어|낙지|새우|홍합|문어/, 170, 15, '해물'],
  [/고등어|갈치|삼치|임연수|연어|생선|코다리|가자미|조기|꽁치|동태|명태/, 200, 17, '생선'],
  [/^(배추|열무|총각|백)?김치$|깍두기|단무지|장아찌|피클|석박지/, 15, 1, '김치류'],
  [/나물|무침|겉절이|생채|샐러드|쌈/, 40, 2, '나물·무침'],
  [/계란|달걀|두부|메추리알/, 150, 11, '계란·두부'],
  [/어묵|오뎅/, 120, 6, '어묵'],
  [/햄|소시지|소세지|비엔나|스팸|베이컨/, 200, 8, '햄'],
  [/멸치|진미채|건새우|쥐포/, 90, 7, '멸치·진미'],
  [/잡채|떡|전$|부침|파전|감자채/, 200, 5, '전·잡채'],
  [/버섯|감자|연근|우엉|가지|호박|무조림|야채|채소|콩나물|숙주|브로콜리|곤약/, 70, 2, '채소 반찬'],
  [/과일|사과|귤|배$|바나나|요구르트|요플레|푸딩|주스/, 80, 1, '후식'],
];
function cafeGuess(n) {
  const q = n.replace(/\s+/g, '');
  // 급식 규칙이 먼저 (식당 1인분인 음식 DB보다 급식 양에 가까움), 그다음 음식 DB 같은 이름, 마지막에 비슷한 이름
  const g = CAFE_GUESS.find(([re]) => re.test(q));
  if (g) return { k: g[1], p: g[2], how: g[3] };
  const exact = FOODS.concat(myFoods()).find(f => normName(f.n) === q || (f.a || '').split(' ').includes(q));
  if (exact) return { k: exact.k, p: exact.p, how: exact.n };
  const f = estimateFood(n);
  return f ? { k: f.k, p: f.p, how: f.n } : null;
}
function cafeDish(raw) {
  const s0 = raw.trim();
  if (!s0) return null;
  const m = s0.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(?:kcal)?\s*(?:\/\s*(\d+(?:\.\d+)?)\s*g?)?$/i);
  const n = (m ? m[1] : s0).trim();
  let k = m ? +m[2] : null, p = m && m[3] != null ? +m[3] : null, est, unk;
  if (k == null || p == null) {
    const g = cafeGuess(n);
    if (k == null) { if (g) { k = g.k; p = g.p; est = g.how; } else { k = 0; p = 0; unk = true; } }
    else p = g && g.k ? Math.round(g.p * k / g.k * 10) / 10 : 0;
  }
  const d = { n, k: Math.round(k), p: Math.round(p * 10) / 10, u: '1인분' };
  if (CAFE_RICE.test(n.replace(/\s+/g, ''))) { d.rice = true; d.u = '1공기'; }
  if (est) d.est = est;
  if (unk) d.unk = true;
  return d;
}
function cafeDayLine(date, list) {
  const rq = myRice() || 1; // 미리보기 합계: 내 밥 양 기준 (자동이면 1공기 기준)
  const t = list.reduce((a, d) => { const q = d.rice ? rq : 1; return { k: a.k + d.k * q, p: a.p + d.p * q }; }, { k: 0, p: 0 });
  return `<li><div class="cf-h"><b>${md(date)} ${DOW[dow(date)]}</b><span>${Math.round(t.k).toLocaleString()}kcal · ${Math.round(t.p)}g <small>(밥 ${qtyText(rq)}공기 기준)</small></span></div>
    <small>${list.map(d => `${esc(d.n)} ${d.k}${d.unk ? ' <em class="bad">칼로리 모름 · 숫자를 붙여 주세요</em>' : d.auto ? ' <em>자동 추가</em>' : d.est && d.est !== d.n ? ` <em>추정·${esc(d.est.replace(/ \(.*\)$/, ''))}</em>` : ''}`).join(' · ')}</small></li>`;
}
// ---------- 메뉴판 사진 → 글 (선택 · 내 Gemini 키) ----------
// 앱이 공개돼 있어 키를 코드에 넣을 수 없으므로, 쓰는 사람이 자기 폰에 한 번 넣음. 키는 상태(state)와 따로 저장해 백업 파일에 들어가지 않음
const AI_KEY = 'bt.aikey';
// 무료 모델을 차례로: 한도가 차거나(429) 모델이 없어지면(404) 다음 모델로. 모델마다 무료 한도가 따로
const AI_MODELS = ['gemini-flash-latest', 'gemini-3.5-flash', 'gemini-flash-lite-latest'];
const aiUrl = m => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
const aiKey = () => { try { return localStorage.getItem(AI_KEY) || ''; } catch (e) { return ''; } };
function setAiKey(k) { try { if (k) localStorage.setItem(AI_KEY, k); else localStorage.removeItem(AI_KEY); } catch (e) { toast('이 브라우저에는 키를 저장할 수 없어요'); } }
// Gemini 앱(채팅)에 사진과 같이 보낼 요청문: 이 앱의 붙여넣기 형식 그대로, 칼로리·단백질까지 붙여 달라고
function geminiAsk(meal) {
  return `이 사진은 회사 구내식당 주간 식단표야. "${meal}" 메뉴만 요일별로 읽어서, 메뉴마다 구내식당 1인분 기준 칼로리와 단백질(g)을 대략 추정해 줘.
아래 형식 그대로, 설명 없이 결과만 코드 블록 하나로 줘. 한 줄에 하루씩, 메뉴는 쉼표로 구분, 메뉴 이름 뒤에 "칼로리/단백질" 숫자만.
월: 시락국 70/4, 열무된장무침 45/2, 돈육간장불고기 300/20
화: …
사진에 날짜가 있으면 요일 앞에 "11/23 월:"처럼 붙여 줘. 밥이 따로 적혀 있지 않으면 밥은 넣지 마. 원산지 표시는 빼.`;
}
function photoBox() {
  if (ui.cafeBusy) return `<div class="photo-box"><p class="hint">${ic('timer')}식단표를 읽는 중… 표를 꼼꼼히 보느라 1~2분 걸려요. 화면을 켜 둔 채 기다려 주세요.</p></div>`;
  const meal = ui.cafeMeal || '중식';
  const mealSeg = `<div class="seg" role="group" aria-label="읽을 끼니">${['조식', '중식', '석식'].map(m => `<button class="${meal === m ? 'on' : ''}" data-act="f-cafe-meal" data-v="${m}" aria-pressed="${meal === m}">${m}</button>`).join('')}</div>`;
  // 키 없이: Gemini 앱에 사진 + 요청문 → 받은 결과를 아래 칸에 붙여넣기
  const viaApp = `<h3 class="h3">Gemini 앱으로 (키 필요 없음)</h3>
    <p class="hint">① 아래 버튼으로 요청문을 복사 → ② Gemini 앱에 식단표 사진과 함께 붙여넣어 보내기 → ③ 받은 결과를 복사해 아래 "주간 메뉴" 칸에 붙여넣고 미리보기 · 저장. 칼로리·단백질까지 붙어서 옵니다.</p>
    <button class="btn wide" data-act="f-cafe-ask">${ic('copy')}Gemini에게 보낼 요청문 복사 (${meal})</button>`;
  if (!aiKey()) return `<div class="photo-box">${mealSeg}${viaApp}<h3 class="h3">앱에서 바로 사진 읽기 (선택)</h3>
    <p class="hint">Google AI Studio에서 받은 <b>Gemini API 키</b>를 넣으면 이 화면에서 사진을 찍어 바로 채웁니다(1~2분). 키는 <b>이 폰에만</b> 저장되고 백업 파일에는 들어가지 않습니다.</p>
    <label class="field"><span>Gemini API 키</span><input type="password" id="aiKey" autocomplete="off" placeholder="AI Studio에서 복사한 키"></label>
    <button class="btn" data-act="f-ai-key">${ic('check')}키 저장</button></div>`;
  return `<div class="photo-box">${mealSeg}<h3 class="h3">앱에서 바로 사진 읽기</h3>
    <label class="btn primary wide photo-btn">${ic('target')}식단표 사진 찍기 · 고르기<input type="file" id="cafePhoto" accept="image/*" hidden></label>
    <p class="hint">사진의 <b>${meal}</b> 메뉴를 요일별로 읽어 아래 칸에 채웁니다(칼로리·단백질은 구내식당 1인분 대략치). 저장 전에 미리보기로 확인하세요. 사진은 Google Gemini로 보내 읽습니다. <button class="link-sm" data-act="f-ai-key-del">키 지우기</button></p>${viaApp}</div>`;
}
// 사진을 1600px 이하 JPEG로 줄여 base64로
function shrinkImage(file, max = 1600) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const sc = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('사진을 열지 못했어요')); };
    img.src = url;
  });
}
// Gemini가 돌려준 JSON → 붙여넣기 형식 ("11/23 월: 물만두국 250/8, …")
function menuJsonToText(j) {
  return ((j && j.days) || []).filter(d => d && (d.dishes || []).length).map(d => {
    const dt = String(d.date || '').match(/\d{1,2}[/.]\d{1,2}/), wd = String(d.day || '').trim().charAt(0);
    const head = [dt ? dt[0] : '', /[월화수목금토일]/.test(wd) ? wd : ''].filter(Boolean).join(' ');
    const dishes = d.dishes.map(x => {
      const n = String((x && x.n) || '').replace(/[,:·\n]/g, ' ').replace(/\s+/g, ' ').trim(), k = Math.round(+x.k), pr = Math.round(+x.p);
      return n && (k > 0 ? `${n} ${k}/${pr > 0 ? pr : 0}` : n);
    }).filter(Boolean);
    return head && dishes.length ? `${head}: ${dishes.join(', ')}` : '';
  }).filter(Boolean).join('\n');
}
async function readMenuPhoto(file) {
  const key = aiKey();
  if (!file || !key) return;
  ui.cafeBusy = true; render();
  try {
    const data = await shrinkImage(file), meal = ui.cafeMeal || '중식';
    const prompt = `회사 구내식당 주간 식단표 사진입니다. "${meal}" 메뉴만 요일별로 읽어 주세요. 표의 열·행 구조를 보고 요일과 끼니를 정확히 구분하세요.
JSON으로만 답하세요: {"days":[{"day":"월","date":"사진에 날짜가 있으면 11/23 형식, 없으면 빈 문자열","dishes":[{"n":"메뉴 이름(사진 글자 그대로)","k":구내식당 1인분 추정 칼로리(정수),"p":단백질 추정 g(정수)}]}]}
규칙: 사진에 없는 메뉴는 넣지 마세요. 밥이 따로 적혀 있지 않으면 밥은 넣지 마세요. 원산지·알레르기 표시는 빼세요. 그 끼니가 없는 요일은 빼세요.`;
    const body = m => JSON.stringify({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data } }, { text: prompt }] }],
      generationConfig: Object.assign({ responseMimeType: 'application/json', temperature: 0 }, m === 'gemini-flash-latest' ? { thinkingConfig: { thinkingLevel: 'low' } } : {}) });
    let res = null;
    for (const m of AI_MODELS) {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 180000);
      try { res = await fetch(aiUrl(m), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: body(m), signal: ctl.signal }); }
      catch (err) { throw new Error(err && err.name === 'AbortError' ? '3분이 지나도 답이 없어요. 잠시 뒤 다시 해 주세요' : '인터넷 연결을 확인해 주세요'); }
      finally { clearTimeout(to); }
      if (res.status !== 429 && res.status !== 404) break;
    }
    if (!res.ok) throw new Error(res.status === 429 ? '오늘 무료 사용량을 다 썼어요. 내일 다시 하거나 직접 입력하세요' : res.status === 400 || res.status === 401 || res.status === 403 ? '키가 맞지 않아요. "키 지우기" 후 다시 넣어 주세요' : `메뉴판을 읽지 못했어요 (${res.status})`);
    const d = await res.json(), part = d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts[0];
    const text = menuJsonToText(JSON.parse((part && part.text) || '{}'));
    if (!text) throw new Error('메뉴를 찾지 못했어요. 식단표가 화면에 꽉 차고 글자가 잘 보이게 다시 찍어 주세요');
    ui.cafeMon = ui.cafeMon || cafeDefaultMon();
    ui.cafeDraft = text; ui.cafePrev = parseCafe(text, ui.cafeMon);
    toast(`${Object.keys(ui.cafePrev.days).length}일 메뉴를 읽었어요 · 확인하고 저장하세요`);
  } catch (e) { toast((e && e.message) || '메뉴판을 읽지 못했어요'); }
  ui.cafeBusy = false; render();
}
document.addEventListener('change', e => { if (e.target && e.target.id === 'cafePhoto') { const f = e.target.files[0]; e.target.value = ''; readMenuPhoto(f); } });

function cafeCard() {
  const on = !!state.settings.cafeOn;
  const head = `<section class="card" id="cafe"><div class="card-h"><h2>회사 급식</h2><span class="muted">${on ? '켜짐' : '꺼짐 · 직접 입력'}</span></div>
    <div class="seg" role="group" aria-label="회사 급식 메뉴 쓰기"><button class="${on ? 'on' : ''}" data-act="f-cafe-on" data-v="1" aria-pressed="${on}">급식 메뉴 쓰기</button><button class="${on ? '' : 'on'}" data-act="f-cafe-on" data-v="0" aria-pressed="${!on}">직접 입력만</button></div>`;
  if (!on) return head + '<p class="hint">회사 급식을 먹는다면 켜세요. 주간 메뉴를 붙여넣으면 그날 점심 추천이 급식 메뉴로 바뀌어 한 번에 기록하고, 안 먹은 반찬만 빼면 됩니다. 끄면 지금처럼 음식을 골라 직접 입력합니다.</p></section>';
  const mon = ui.cafeMon || cafeDefaultMon(), pv = ui.cafePrev;
  const saved = Object.keys(cafeMenus()).sort();
  const weeks = [...new Set(saved.map(mondayOf))].sort().reverse().slice(0, 4);
  return head + photoBox() + `
    <h3 class="h3">직접 붙여넣기 · 고치기</h3>
    <p class="hint">한 줄에 하루씩: <code>월: 물만두국, 콩나물제육볶음 300/19, 참나물무침</code>. 반찬 뒤 숫자는 <b>칼로리/단백질</b>이고, 없으면 음식 DB로 추정합니다. 날짜(<code>11/23</code>)를 앞에 써도 됩니다. 밥이 메뉴에 없으면 1공기를 자동으로 넣고, 그날 밥 양 추천에 맞춰 줄여 줍니다.</p>
    <label class="field"><span>요일만 쓴 줄은 이 주로 넣기 (월요일)</span><input type="date" id="cafeMon" value="${mon}"></label>
    <label class="field"><span>주간 메뉴</span><textarea id="cafeTxt" rows="7" placeholder="월: 물만두국, 참나물유자청무침, 콩나물제육볶음, 새송이버섯조림&#10;화: 황태해장국, 오이양파무침, 단호박카레라이스, 생선까스">${esc(ui.cafeDraft || '')}</textarea></label>
    <div class="btn-row"><button class="btn" data-act="f-cafe-prev">${ic('target')}미리보기</button>${pv && Object.keys(pv.days).length ? `<button class="btn primary" data-act="f-cafe-save">${ic('check')}${Object.keys(pv.days).length}일 저장</button>` : ''}</div>
    ${pv ? `<ul class="cafe-list">${Object.keys(pv.days).sort().map(d => cafeDayLine(d, pv.days[d])).join('') || '<li class="hint">읽은 메뉴가 없습니다. 줄 앞에 요일(월·화…)이나 날짜를 붙여 주세요.</li>'}</ul>${pv.skipped.length ? `<p class="warn">${ic('alert')}요일·날짜를 못 찾아 뺀 줄: ${pv.skipped.map(esc).join(' / ')}</p>` : ''}` : ''}
    ${weeks.length ? `<h3 class="h3">저장된 메뉴</h3>${weeks.map(m => { const ds = saved.filter(d => mondayOf(d) === m); return `<details class="cafe-wk"><summary>${md(m)} 주 · ${ds.length}일<button class="sa-btn ghost" data-act="f-cafe-del" data-mon="${m}">지우기</button></summary><ul class="cafe-list">${ds.map(d => cafeDayLine(d, cafeMenus()[d])).join('')}</ul></details>`; }).join('')}` : '<p class="hint">저장된 메뉴가 없습니다.</p>'}
  </section>`;
}
function dietNotes(date) {
  const gym = isGymDay(date), pf = verdict(addDays(mondayOf(date), -7)).flags, notes = [];
  if (gym && day(date).time === 'day') notes.push('낮 운동: 점심을 운동 2시간 전에 든든하게 먹고, 운동 전 계란은 뺍니다.');
  if (pf.protein) notes.push(`지난주 단백질 평균 ${pf.protein}g → 이번 주는 ${pf.proteinStep}g부터 (최종 목표 ${targets(date).protein}g) · 아침 계란 2개 + 운동 직후(쉬는 날은 오후) 단백질 음료·두유부터`);
  if (gym && pf.fast) notes.push(`지난주 판정(과감량·힘 떨어짐) → ${afterWork() ? '운동 중 바나나우유(또는 초코우유) 1팩 추가' : '운동 전 식빵 1장 추가'}`);
  if (state.settings.cafeOn && dow(date) >= 1 && dow(date) <= 5 && !cafeToday(date)) notes.push('이 날 급식 메뉴가 아직 없습니다 · 설정 → 회사 급식에서 붙여넣으면 점심을 한 번에 기록합니다');
  if (pf.plateau && goalOf() === 'gain') notes.push('지난주 체중이 늘지 않음 → 오늘은 끼니마다 밥 0.5공기 늘린 양으로 추천합니다');
  else if (!gym && pf.plateau && goalOf() === 'cut') notes.push('지난주 체중 정체 → 오늘은 끼니마다 밥 0.5공기 줄인 양으로 추천합니다');
  return notes;
}
const sumItems = items => items.reduce((a, it) => { const f = foodOf(it); a.k += f.k * it.q; a.p += f.p * it.q; return a; }, { k: 0, p: 0 });
// 추천 구성: [음식 id, 수량] 또는 급식처럼 값이 직접 적힌 { n, k, p, u, q }
const sugItems = sug => sug.map(x => (Array.isArray(x) ? { f: x[0], q: x[1] } : x.f ? { f: x.f, q: x.q } : { n: x.n, k: x.k, p: x.p, u: x.u, q: x.q }));
function foodTotals(date) {
  const fd = day(date).food || {};
  const all = Object.values(fd).flat();
  const t = sumItems(all);
  return { k: t.k, p: t.p, n: all.length, names: all.slice(0, 6).map(it => foodOf(it).n.replace(/ \(.*\)$/, '')).join(', ') + (all.length > 6 ? ' 외' : '') };
}

// ---------- 식단 카드 ----------
function dietCard(date) {
  const gym = isGymDay(date), x = day(date), fd = x.food || {};
  const slots = slotsFor(date), tot = foodTotals(date);
  const tg = targets(date), pt = tg.protein, kt = tg[gym ? 'gym' : 'rest'];
  const k = Math.round(tot.k), p = Math.round(tot.p);
  return `<section class="card" id="diet">
    <div class="card-h"><h2>식단</h2><span class="pill ${gym ? 'i-high' : 'i-rest'}">${gym ? '암장 날' : '쉬는 날'} · 목표 ${kt.toLocaleString()}kcal</span></div>
    <div class="macro">
      ${ring(p / pt, 92, 9, 'r-prot', `<b>${p}</b><small>/${pt}g</small>`)}
      <div class="macro-txt"><div class="mx-k"><i class="dot prot"></i>단백질</div><div class="mx-v">${p >= pt ? '목표 달성' : `${pt - p}g 남음`}</div></div>
      ${ring(k / kt, 92, 9, `r-kcal ${k > kt ? 'over' : ''}`, `<b>${k.toLocaleString()}</b><small>kcal</small>`)}
      <div class="macro-txt"><div class="mx-k"><i class="dot kcal"></i>칼로리</div><div class="mx-v">${k > kt ? `${(k - kt).toLocaleString()} 초과` : `${(kt - k).toLocaleString()} 남음`}</div></div>
    </div>
    ${sessOn(date) ? '' : '<p class="hint">세션을 고르기 전이라 쉬는 날 기준으로 보여줍니다.</p>'}
    ${tg.auto.none ? `<button class="nag" data-act="tab" data-tab="settings">${ic('scale')}체중·키·나이를 넣으면 칼로리와 단백질 목표가 내 몸에 맞춰집니다 · 설정</button>` : ''}
    ${dietNotes(date).map(n => `<p class="note">${ic('spark')}${n}</p>`).join('')}
    ${(() => { const n = slots.filter(sl => sl.sug.length && !(fd[sl.id] || []).length).length; return n >= 2 ? `<button class="btn wide fill-all" data-act="f-fill-all" data-date="${date}">${ic('check')}남은 ${n}끼 한 번에 기록 <small>급식·고정·추천대로 · 다르게 먹은 끼니만 고치기</small></button>` : ''; })()}
    <div class="slots">${slots.map(sl => slotBlock(date, sl, fd[sl.id] || [])).join('')}</div>
    <p class="hint">칼로리는 음식 DB의 대략치입니다. 피할 것 · ${PLAN.avoid}</p>
  </section>`;
}
const openSlots = () => (ui.openSlots = ui.openSlots || new Set());
function slotBlock(date, sl, items) {
  const t = sumItems(items), sg = sumItems(sugItems(sl.sug));
  const sugText = sugItems(sl.sug).map(it => `${foodOf(it).n.replace(/ \(.*\)$/, '')} ${qtyText(it.q)}`).join(' + ');
  const key = date + ':' + sl.id, open = openSlots().has(key);
  if (!items.length && !open) { // 아직 안 먹은 끼니: 접어 두고, 추천(또는 급식·고정 끼니)대로 한 번에 기록하는 버튼
    const what = sl.cafe ? '급식' : sl.fixed ? '고정' : '추천';
    return `<div class="slot slot-min slot-empty">
      <button class="sm-main" data-act="f-open" data-date="${date}" data-slot="${sl.id}" aria-label="${sl.t} 음식 골라 기록하기">
        <span class="sm-l"><b>${sl.t}</b><small>${sl.sug.length ? `${what} ${Math.round(sg.k)}kcal · ${esc(sugText)}` : '아직 기록 안 함 · 눌러서 고르기'}</small></span></button>
      ${sl.sug.length ? `<button class="sm-quick" data-act="f-sug" data-date="${date}" data-slot="${sl.id}" aria-label="${sl.t} ${what}대로 기록">${ic('check')}${what}대로</button>`
        : `<button class="sm-todo" data-act="f-open" data-date="${date}" data-slot="${sl.id}">기록하기</button>`}
    </div>`;
  }
  if (items.length && !open) {
    const names = items.map(it => `${foodOf(it).n.replace(/ \(.*\)$/, '')}${it.q !== 1 ? ' ' + qtyText(it.q) : ''}`).join(' · ');
    return `<button class="slot slot-min" data-act="f-toggle" data-key="${key}" aria-expanded="false" aria-label="${sl.t} 펼쳐서 고치기">
      <span class="sm-l"><b>${sl.t}</b><small>${esc(names)}</small></span>
      <span class="sm-r"><b>${Math.round(t.k)}</b><small>kcal · ${Math.round(t.p)}g</small></span>
      <span class="sm-chev">${ic('chevR')}</span></button>`;
  }
  return `<div class="slot ${items.length ? 'has' : ''}">
    <div class="slot-h"><b>${sl.t}</b>${items.length ? `<span class="slot-sum">${Math.round(t.k)}kcal · ${Math.round(t.p)}g</span>` : ''}</div>
    ${items.length ? `<ul class="fitems">${items.map((it, i) => {
      const f = foodOf(it);
      return `<li>
        <span class="fi-n"><b>${esc(f.n)}</b><small>${esc(f.u)} 기준</small></span>
        <span class="fi-q"><button class="q-btn" data-act="f-q" data-date="${date}" data-slot="${sl.id}" data-i="${i}" data-d="-1" aria-label="줄이기">${ic('minus')}</button><b>${qtyText(it.q)}</b><button class="q-btn" data-act="f-q" data-date="${date}" data-slot="${sl.id}" data-i="${i}" data-d="1" aria-label="늘리기">${ic('plus')}</button><button class="q-btn del" data-act="f-del" data-date="${date}" data-slot="${sl.id}" data-i="${i}" aria-label="${esc(f.n)} 삭제">${ic('close')}</button></span>
        <span class="fi-k"><b>${Math.round(f.k * it.q)}</b><small>${Math.round(f.p * it.q * 10) / 10}g</small></span>
      </li>`;
    }).join('')}</ul>` : sl.sug.length ? `<button class="sug" data-act="f-sug" data-date="${date}" data-slot="${sl.id}">
        <span class="sug-t"><small>추천</small>${esc(sugText)}<em>${Math.round(sg.k)}kcal · ${Math.round(sg.p)}g${sl.tip && sl.id !== 'd' ? ' · ' + esc(sl.tip) : ''}</em></span>
        <span class="sug-b">${ic('check')}이대로</span></button>` : ''}
    <div class="slot-act">
      <button class="sa-btn" data-act="f-open" data-date="${date}" data-slot="${sl.id}">${ic('plus')}음식 추가</button>
      ${myCombos().length ? `<button class="sa-btn" data-act="f-combos" data-date="${date}" data-slot="${sl.id}">${ic('stack')}내 조합</button>` : ''}
      ${items.length ? `<button class="sa-btn ${fixedMeals()[sl.id] && sameItems(fixedMeals()[sl.id], items) ? 'on' : ''}" data-act="f-fix" data-date="${date}" data-slot="${sl.id}">${ic('target')}${fixedMeals()[sl.id] && sameItems(fixedMeals()[sl.id], items) ? '매일 이대로 (고정됨)' : '매일 이대로'}</button>` : ''}
      ${items.length ? `<button class="sa-btn" data-act="f-combo-save" data-date="${date}" data-slot="${sl.id}">${ic('copy')}조합 저장</button>` : ''}
      ${sl.id === 'd' ? `<button class="sa-btn" data-act="f-dinners" data-date="${date}">${ic('food')}추천 메뉴 보기</button>` : ''}
      ${items.length ? `<button class="sa-btn ghost" data-act="f-clear" data-date="${date}" data-slot="${sl.id}">비우기</button>` : ''}<button class="sa-btn fold" data-act="f-toggle" data-key="${key}" aria-expanded="true">${ic('check')}접기</button>
    </div>
  </div>`;
}

// ---------- 음식 고르기 시트 ----------
function recentFoods() {
  const cnt = {};
  for (let i = 0; i < 30; i++) {
    const fd = day(addDays(todayStr(), -i)).food || {};
    Object.values(fd).flat().forEach(it => { if (it.f) cnt[it.f] = (cnt[it.f] || 0) + 1; });
  }
  return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 15).map(id => FOOD_MAP[id] || myFoods().find(f => f.id === id)).filter(Boolean);
}
// ---------- 검색: 띄어쓰기 무시 · 초성(ㄷㄱㅅ) · 글자 순서만 맞아도 · 자주 먹는 것 먼저 ----------
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const choOf = s => Array.from(s, c => { const k = c.charCodeAt(0) - 0xAC00; return k >= 0 && k < 11172 ? CHO[Math.floor(k / 588)] : c; }).join('');
const inOrder = (q, n) => { let i = 0; for (const c of n) if (c === q[i]) i++; return i === q.length; };
function searchFoods(raw) {
  const q = raw.replace(/\s+/g, '').toLowerCase(), cho = /^[ㄱ-ㅎ]+$/.test(q), freq = foodFreq();
  const out = [];
  FOODS.concat(myFoods()).forEach(f => {
    const n = f.n.replace(/\(.*?\)/g, '').replace(/\s+/g, '').toLowerCase(), a = (f.a || '').replace(/\s+/g, '').toLowerCase(); // 괄호 속 단위는 빼고 비교
    let sc = 0;
    if (cho) { const cn = f._cho || (f._cho = choOf(n)); sc = cn.startsWith(q) ? 70 : cn.includes(q) ? 50 : choOf(a).includes(q) ? 30 : 0; }
    else sc = n === q ? 100 : n.startsWith(q) ? 80 : n.includes(q) ? 60 : a.includes(q) ? 45 : q.length >= 2 && inOrder(q, n) ? 20 : 0;
    if (sc) out.push([sc + Math.min(15, (freq[f.id] || 0) * 2) - n.length * 0.1, f]);
  });
  return out.sort((x, y) => y[0] - x[0]).map(x => x[1]);
}
function foodFreq() {
  const cnt = {};
  for (let i = 0; i < 30; i++) Object.values(day(addDays(todayStr(), -i)).food || {}).flat().forEach(it => { if (it.f) cnt[it.f] = (cnt[it.f] || 0) + 1; });
  return cnt;
}
// 한 번에 채우기: 추천 · 최근 같은 끼니(어제 등) · 내 조합 → 담기 목록에 통째로
function quickSets(sh) {
  const sl = slotsFor(sh.date).find(s => s.id === sh.slot) || { sug: [] }, out = [], seen = new Set();
  const key = items => items.map(it => (it.f || it.n) + ':' + it.q).sort().join('|');
  for (let i = 1; i <= 30 && out.length < 3; i++) {
    const d = addDays(sh.date, -i), items = ((day(d).food || {})[sh.slot] || []).filter(it => it.f);
    if (!items.length || seen.has(key(items))) continue;
    seen.add(key(items)); out.push({ t: i === 1 ? '어제 그대로' : `${md(d)} 그대로`, items });
  }
  if (sl.sug && sl.sug.length) {
    const items = sugItems(sl.sug);
    if (!seen.has(key(items))) {
      if (sl.cafe) out.unshift({ t: `오늘 급식 (${md(sh.date)})`, items }); // 급식은 맨 위에
      else out.push({ t: '앱 추천', items });
    }
  }
  myCombos().forEach(c => out.push({ t: '내 조합 · ' + c.n, items: c.items }));
  return out;
}
function quickHtml(sh) {
  sh.quick = quickSets(sh);
  if (!sh.quick.length && sh.slot !== 'd') return '';
  return `<div class="quick"><p class="quick-h">한 번에 채우기</p>${sh.quick.map((qs, i) => { const t = sumItems(qs.items); return `<button class="qrow" data-act="f-quick" data-i="${i}">
      <span class="fr-n"><b>${esc(qs.t)}</b><small>${esc(qs.items.map(it => `${foodOf(it).n.replace(/ \(.*\)$/, '')}${it.q !== 1 ? ' ' + qtyText(it.q) : ''}`).join(' · '))}</small></span>
      <span class="fr-k"><b>${Math.round(t.k)}</b><small>kcal · ${Math.round(t.p)}g</small></span><span class="fr-add">${ic('plus')}</span></button>`; }).join('')}
    ${sh.slot === 'd' ? `<button class="qrow qlink" data-act="f-dinners">${ic('food')}<span class="fr-n"><b>추천 저녁 메뉴에서 고르기</b></span></button>` : ''}</div><p class="quick-h">음식 하나씩</p>`;
}
function sheetList() {
  const sh = ui.sheet, raw = (sh.q || '').trim(), q = raw.replace(/\s+/g, '');
  let list, head = '';
  if (q) {
    list = searchFoods(raw);
    // 정확히 같은 이름이 없으면: 입력한 이름 그대로 한 번에 담기 (비슷한 음식 칼로리로 추정)
    if (!/^[ㄱ-ㅎ]+$/.test(q) && !list.some(f => f.n.replace(/\s+/g, '') === q)) {
      const e = estimateFood(raw);
      head = `<button class="qrow qest" data-act="f-qest">${ic('plus')}<span class="fr-n"><b>"${esc(raw)}" 그대로 담기</b><small>${e ? `비슷한 음식 ${esc(e.n)} 기준 · 내 음식에 저장됨` : '칼로리를 몰라 직접 입력 칸을 엽니다'}</small></span>${e ? `<span class="fr-k"><b>${e.k}</b><small>kcal · ${e.p}g</small></span>` : ''}</button>`;
    }
  }
  else if (sh.cat === '자주') { list = recentFoods(); if (!list.length) list = FOODS.filter(f => f.c === '기본'); }
  else if (sh.cat === '내 음식') list = myFoods();
  else list = FOODS.filter(f => f.c === sh.cat);
  const added = {}, pend = {};
  ((day(sh.date).food || {})[sh.slot] || []).forEach(it => { if (it.f) added[it.f] = it.q; });
  sh.pend.forEach((it, i) => { if (it.f) pend[it.f] = i; });
  if (!list.length) return head + `<p class="hint center">${q ? '검색 결과가 없습니다. 아래 "목록에 없는 음식"에 이름이나 재료를 넣으면 칼로리를 계산해 줍니다.' : sh.cat === '내 음식' ? '저장한 음식이 없습니다. 아래 직접 입력에서 "내 음식으로 저장"을 켜세요.' : '음식이 없습니다.'}</p>`;
  return (!q && sh.cat === '자주' ? quickHtml(sh) : '') + head + list.slice(0, 300).map(f => {
    const pi = pend[f.id], on = pi != null;
    return `<div class="frow ${on ? 'on' : ''}">
    <button class="frow-main" data-act="f-pick" data-f="${f.id}">
      <span class="fr-n"><b>${esc(f.n)}</b><small>${esc(f.u)}${added[f.id] ? ` · <em class="fr-in">이미 ${qtyText(added[f.id])} 기록</em>` : ''}${f.est ? ' · 자동 계산' : ''}</small></span>
      <span class="fr-k"><b>${f.k}</b><small>kcal · ${f.p}g</small></span>
      ${on ? '' : `<span class="fr-add">${ic('plus')}</span>`}
    </button>${on ? qStep(pi, sh.pend[pi].q, f.n) : ''}${f.mine && !on ? `<button class="fr-del" data-act="f-delfood" data-f="${f.id}" aria-label="${esc(f.n)} 지우기">${ic('close')}</button>` : ''}
  </div>`;
  }).join('') + (list.length > 300 ? `<p class="hint center">${list.length - 300}개 더 있음 · 검색으로 좁혀 보세요</p>` : '');
}
// 담는 중 수량 조절: −, 수량, +, ✕(빼기). 0.5인분 단위
const qStep = (i, q, n) => `<span class="fi-q pq"><button class="q-btn" data-act="f-pq" data-i="${i}" data-d="-1" aria-label="${esc(n)} 0.5인분 줄이기">${ic('minus')}</button><b>${qtyText(q)}</b><button class="q-btn" data-act="f-pq" data-i="${i}" data-d="1" aria-label="${esc(n)} 0.5인분 늘리기">${ic('plus')}</button><button class="q-btn del" data-act="f-px" data-i="${i}" aria-label="${esc(n)} 빼기">${ic('close')}</button></span>`;
function pendBar() {
  const sh = ui.sheet, t = sumItems(sh.pend);
  if (!sh.pend.length) return '<p class="hint pend-empty">음식을 누르면 여기에 담깁니다. −/+로 0.5인분씩 조절하고 <b>완료</b>를 눌러야 끼니에 들어갑니다.</p>';
  return `<div class="pend"><div class="pend-h"><b>담는 중 ${sh.pend.length}개</b><span>${Math.round(t.k).toLocaleString()}kcal · ${Math.round(t.p)}g</span></div>
    <ul class="fitems">${sh.pend.map((it, i) => { const f = foodOf(it); return `<li><span class="fi-n"><b>${esc(f.n)}</b><small>${esc(f.u)} · ${Math.round(f.k * it.q)}kcal</small></span>${qStep(i, it.q, f.n)}</li>`; }).join('')}</ul></div>`;
}
const commitLabel = () => { const p = ui.sheet.pend, t = sumItems(p); return `${ic('check')}완료${p.length ? ` · ${p.length}개 ${Math.round(t.k).toLocaleString()}kcal 넣기` : ''}`; };
function refreshSheet() {
  const box = document.getElementById('fList'), st = box ? box.scrollTop : 0;
  if (box) { box.innerHTML = sheetList(); box.scrollTop = st; }
  const pb = document.getElementById('fPend'); if (pb) pb.innerHTML = pendBar();
  const btn = document.getElementById('fCommit'); if (btn) btn.innerHTML = commitLabel();
}

// ---------- 직접 입력 분석: 이름·재료로 칼로리 추정 ----------
const normName = s => (s || '').replace(/\(.*?\)/g, '').replace(/[\s·,]/g, '');
function lcs(a, b) { // 가장 긴 공통 부분 문자열 길이
  let best = 0; const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) for (let j = b.length; j >= 1; j--) { dp[j] = a[i - 1] === b[j - 1] ? dp[j - 1] + 1 : 0; if (dp[j] > best) best = dp[j]; }
  return best;
}
// 이름이 가장 비슷한 음식: 완전 일치 > 별칭 > 이름 포함 > 공통 글자
function estimateFood(name) {
  const q = normName(name);
  if (!q) return null;
  let best = null, bs = 0;
  FOODS.concat(myFoods()).forEach(f => {
    const n = normName(f.n); if (!n) return;
    const al = (f.a || '').split(' ').filter(Boolean);
    let sc = n === q ? 100 : al.includes(q) ? 90 : q.includes(n) ? n.length * 3 : n.includes(q) ? q.length * 3 + (n.endsWith(q) ? 1 : 0) - (n.length - q.length) * 0.1 : lcs(q, n) * 2 - Math.abs(n.length - q.length) * 0.2;
    if (n.length < 2 && n !== q) sc = Math.min(sc, 1);
    if (sc > bs) { bs = sc; best = f; }
  });
  return bs >= 3 ? best : null;
}
// "밥 1공기, 계란 2개, 스팸 50g" → 음식별 수량으로 바꿔 합계
function parseIngredients(text) {
  const rows = (text || '').split(/[\n,+]/).map(s => s.trim()).filter(Boolean).map(line => {
    const m = line.match(/^(.*?)\s*(\d+(?:\.\d+)?|\d+\/\d+|반)?\s*(kg|g|ml|개|공기|인분|장|줄|그릇|큰술|숟가락|컵|접시|마리|봉|팩|캔|조각|알|토막|쪽|줌)?\s*$/i);
    const nm = (m && m[1]) || line, raw = m && m[2], unit = ((m && m[3]) || '').toLowerCase();
    let amt = 1;
    if (raw === '반') amt = 0.5;
    else if (raw && raw.includes('/')) {
      const [num, den] = raw.split('/').map(Number);
      amt = isNum(num) && isNum(den) && den > 0 ? num / den : 1; // 1/0 같은 입력 방어
    } else if (raw) {
      const v = +raw;
      amt = isNum(v) && v >= 0 ? v : 1;
    }
    const f = estimateFood(nm);
    if (!f) return { line, f: null, q: 0 };
    let q = amt;
    if (unit === 'g' || unit === 'ml' || unit === 'kg') {
      const g = unit === 'kg' ? amt * 1000 : amt, base = f.u.match(/(\d+(?:\.\d+)?)\s*(g|ml)/i);
      q = g / (base ? +base[1] : 100); // 단위에 g가 없으면 1인분 ≈ 100g으로 봄
    }
    return { line, f, q: r1(q) };
  });
  const ok = rows.filter(r => r.f);
  return { rows, k: Math.round(ok.reduce((a, r) => a + r.f.k * r.q, 0)), p: Math.round(ok.reduce((a, r) => a + r.f.p * r.q, 0) * 10) / 10 };
}
function customEst() {
  const v = id => (document.getElementById(id) || {}).value || '';
  const ing = v('cuI').trim() ? parseIngredients(v('cuI')) : null;
  if (ing && ing.rows.some(r => r.f)) return { k: ing.k, p: ing.p, from: 'ing', ing };
  const f = v('cuN').trim() ? estimateFood(v('cuN')) : null;
  return f ? { k: f.k, p: f.p, from: 'name', f } : null;
}
function renderEst() {
  const el = document.getElementById('cuEst'); if (!el) return;
  const e = customEst(), k = document.getElementById('cuK'), p = document.getElementById('cuP');
  if (!e) { el.innerHTML = '<span class="muted">이름이나 재료를 넣으면 음식 DB로 칼로리를 계산합니다. 칼로리 칸을 비워 두면 계산값이 들어갑니다.</span>'; k.placeholder = '비우면 계산값'; p.placeholder = '비우면 계산값'; return; }
  el.innerHTML = e.from === 'ing'
    ? `<b>재료 합계 ${e.k.toLocaleString()}kcal · 단백질 ${e.p}g</b><ul>${e.ing.rows.map(r => `<li>${esc(r.line)} → ${r.f ? `${esc(r.f.n)} ×${qtyText(r.q)} = ${Math.round(r.f.k * r.q)}kcal` : '<em>못 찾음 (빼고 계산)</em>'}</li>`).join('')}</ul>`
    : `<b>비슷한 음식: ${esc(e.f.n)}</b> (${esc(e.f.u)}) · ${e.k}kcal · ${e.p}g<br><small>더 정확히 하려면 재료 칸에 들어간 재료를 적으세요.</small>`;
  k.placeholder = `계산값 ${e.k}`; p.placeholder = `계산값 ${e.p}`;
}
function renderSheet() {
  const el = document.getElementById('sheet');
  const sh = ui.sheet;
  if (!sh) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  if (sh.mode === 'combo') {
    const slotName = (slotsFor(sh.date).find(x => x.id === sh.slot) || {}).t || '';
    const list = myCombos();
    el.innerHTML = `<div class="sh-back" data-act="sheet-close"></div><div class="sh-panel" role="dialog" aria-label="내 조합 불러오기">
      <div class="sh-grab"></div>
      <div class="sh-h"><h3>내 조합<small>${slotName ? ' → ' + esc(slotName) : ''}</small></h3><button class="sh-x" data-act="sheet-close" aria-label="닫기">${ic('close')}</button></div>
      <p class="hint">누르면 이 끼니에 조합의 음식이 한 번에 들어갑니다. 끼니에 음식을 담고 "조합 저장"을 누르면 여기에 추가됩니다.</p>
      <div class="sh-list">${list.length ? list.map(c => { const t = comboTotals(c); return `<div class="frow">
        <button class="frow-main" data-act="f-combo-add" data-id="${c.id}">
          <span class="fr-n"><b>${esc(c.n)}</b><small>${esc(c.items.map(it => `${foodOf(it).n.replace(/ \(.*\)$/, '')}${it.q !== 1 ? ' ' + qtyText(it.q) : ''}`).join(' · '))}</small></span>
          <span class="fr-k"><b>${Math.round(t.k)}</b><small>kcal · ${Math.round(t.p)}g</small></span>
          <span class="fr-add">${ic('plus')}</span>
        </button><button class="fr-del" data-act="f-combo-del" data-id="${c.id}" aria-label="${esc(c.n)} 조합 지우기">${ic('close')}</button>
      </div>`; }).join('') : '<p class="hint center">저장한 조합이 없습니다.</p>'}</div></div>`;
    return;
  }
  if (sh.mode === 'dinner') {
    const cur = JSON.stringify((day(sh.date).food || {}).d || []);
    el.innerHTML = `<div class="sh-back" data-act="sheet-close"></div><div class="sh-panel" role="dialog" aria-label="저녁 메뉴 고르기">
      <div class="sh-grab"></div>
      <div class="sh-h"><h3>저녁 메뉴 고르기</h3><button class="sh-x" data-act="sheet-close" aria-label="닫기">${ic('close')}</button></div>
      <p class="hint">고르면 저녁 칸이 그 구성으로 채워집니다. 밥 양은 오늘 기준(${qtyText(riceQty(sh.date))}공기)으로 넣습니다.</p>
      <div class="sh-list">${PLAN.dinners.map((dn, i) => {
        const items = dinnerItems(i, sh.date), t = sumItems(sugItems(items));
        const on = cur === JSON.stringify(sugItems(items));
        return `<button class="drow ${on ? 'on' : ''} ${i === dinnerDefault(sh.date) ? 'today' : ''}" data-act="f-dinner-pick" data-i="${i}">
          <span class="dr-n"><b>${esc(dn.n)}${i === dinnerDefault(sh.date) ? ' <em>오늘 추천</em>' : ''}</b><small>${items.map(([f, q]) => `${foodOf({ f }).n.replace(/ \(.*\)$/, '')} ${qtyText(q)}`).join(' · ')}</small></span>
          <span class="fr-k"><b>${Math.round(t.k)}</b><small>kcal · ${Math.round(t.p)}g</small></span></button>`;
      }).join('')}</div></div>`;
    return;
  }
  const slotName = (slotsFor(sh.date).find(s => s.id === sh.slot) || {}).t || '';
  const cats = ['자주', ...FOOD_CATS, '내 음식'];
  el.innerHTML = `<div class="sh-back" data-act="sheet-close"></div><div class="sh-panel" role="dialog" aria-label="${esc(slotName)}에 음식 추가">
    <div class="sh-grab"></div>
    <div class="sh-h"><h3>${esc(slotName)}<small>에 추가</small></h3><span class="sh-btns"><button class="sh-x" data-act="sheet-close" aria-label="닫기">${ic('close')}</button></span></div>
    <label class="search">${ic('target')}<input id="fSearch" type="search" placeholder="음식 검색 (예: 계란, ㄱㄹ, 김볶)" value="${esc(sh.q || '')}" autocomplete="off"></label>
    <div class="cats">${cats.map(c => `<button class="${!sh.q && sh.cat === c ? 'on' : ''}" data-act="f-cat" data-c="${c}">${c === '자주' ? '자주 먹는' : c}</button>`).join('')}</div>
    <div class="sh-list" id="fList">${sheetList()}</div>
    <details class="custom" ${sh.custom ? 'open' : ''}>
      <summary>${ic('plus')}목록에 없는 음식 직접 입력 · 칼로리 자동 계산</summary>
      <button class="btn wide cu-bar" data-act="f-barcode">${ic('target')}바코드로 제품 찾기</button>
      <div class="cu-grid">
        <label class="field"><span>이름</span><input id="cuN" type="text" placeholder="예: 엄마표 김치볶음밥"></label>
        <label class="field cu-ing"><span>재료 (선택 · 쉼표나 줄바꿈으로 구분)</span><textarea id="cuI" rows="2" placeholder="예: 밥 1공기, 계란 2개, 스팸 50g, 김치 1접시"></textarea></label>
        <label class="field"><span>칼로리 (kcal)</span><input id="cuK" type="number" inputmode="decimal" placeholder="비우면 계산값"></label>
        <label class="field"><span>단백질 (g)</span><input id="cuP" type="number" inputmode="decimal" placeholder="비우면 계산값"></label>
        <label class="field"><span>단위</span><input id="cuU" type="text" placeholder="예: 1인분"></label>
      </div>
      <div class="cu-est" id="cuEst"></div>
      <label class="cu-save"><input id="cuS" type="checkbox" checked> 내 음식으로 저장 (다음에 바로 고르기)</label>
      <button class="btn wide" data-act="f-custom">${ic('plus')}담기</button>
    </details>
    <div class="pend-box" id="fPend">${pendBar()}</div>
    <button class="btn primary wide sh-commit" id="fCommit" data-act="f-commit">${commitLabel()}</button>
  </div>`;
  renderEst();
}
function clearSearch() {
  ui.sheet.q = '';
  const el = document.getElementById('fSearch'); if (el) { el.value = ''; el.focus(); }
  document.querySelectorAll('.cats button').forEach(btn => btn.classList.toggle('on', btn.dataset.c === ui.sheet.cat));
}
function openSheet(s) { ui.sheet = s; document.body.classList.add('lock'); renderSheet(); }
function closeSheet(force) {
  if (!force && ui.sheet && ui.sheet.pend && ui.sheet.pend.length && !confirm(`담은 ${ui.sheet.pend.length}개를 넣지 않고 닫을까요?`)) return;
  if (ui.sheet && ui.sheet.slot) openSlots().delete(ui.sheet.date + ':' + ui.sheet.slot); // 다 고르면 그 끼니는 접힘
  ui.sheet = null;
  render();
  if (ui.focus == null && !(typeof RUN !== 'undefined' && RUN.on)) document.body.classList.remove('lock');
  renderSheet();
}

// ---------- 이벤트 ----------
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act;
  if (!a.startsWith('f-') && a !== 'sheet-close') return;
  if (a === 'f-move' || a === 'f-close' || a === 'f-done') return; // 포커스 모드(app.js)
  const d = b.dataset.date || (ui.sheet && ui.sheet.date);
  const slotItems = (date, slot) => { const x = dayW(date); x.food = x.food || {}; return (x.food[slot] = x.food[slot] || []); };
  switch (a) {
    case 'sheet-close': return closeSheet();
    case 'f-toggle': { const k = b.dataset.key, o = openSlots(); o.has(k) ? o.delete(k) : o.add(k); return render(); }
    case 'f-fill-all': {
      const x = dayW(d); x.food = x.food || {};
      const before = JSON.stringify(x.food);
      let n = 0, kc = 0;
      slotsFor(d).forEach(sl => { if (sl.sug.length && !(x.food[sl.id] || []).length) { x.food[sl.id] = sugItems(sl.sug); n++; kc += sumItems(x.food[sl.id]).k; } });
      commit();
      return toast(`${n}끼 ${Math.round(kc).toLocaleString()}kcal 기록됨`, { label: '되돌리기', fn: () => { dayW(d).food = JSON.parse(before); commit(); toast('되돌렸어요'); } });
    }
    case 'f-fix': {
      const items = ((day(d).food || {})[b.dataset.slot] || []).map(it => Object.assign({}, it));
      const fm = Object.assign({}, fixedMeals()), name = (slotsFor(d).find(x => x.id === b.dataset.slot) || {}).t || '';
      if (fm[b.dataset.slot] && sameItems(fm[b.dataset.slot], items)) { delete fm[b.dataset.slot]; toast(`${name} 고정을 풀었어요`); }
      else { fm[b.dataset.slot] = items; toast(`${name}: 다음부터 "고정대로" 한 번에 기록돼요`); }
      state.settings.fixedMeals = fm;
      return commit();
    }
    case 'f-sug': {
      const sl = slotsFor(d).find(s => s.id === b.dataset.slot);
      const before = JSON.stringify(day(d).food || {});
      dayW(d).food = Object.assign(day(d).food || {}, { [sl.id]: sugItems(sl.sug) });
      openSlots().delete(d + ':' + sl.id); // 기록하면 접힘
      commit();
      return toast(`${sl.t} ${Math.round(sumItems(day(d).food[sl.id]).k)}kcal 기록`, { label: '되돌리기', fn: () => { dayW(d).food = JSON.parse(before); commit(); } });
    }
    case 'f-clear': { const x = dayW(d); if (x.food) delete x.food[b.dataset.slot]; return commit(); }
    case 'f-del': {
      const list = slotItems(d, b.dataset.slot), it = list[+b.dataset.i];
      if (!it) return;
      list.splice(+b.dataset.i, 1);
      if (!list.length) delete dayW(d).food[b.dataset.slot];
      toast(`${foodOf(it).n.replace(/ \(.*\)$/, '')} 삭제`);
      return commit();
    }
    case 'f-combos': return openSheet({ mode: 'combo', date: d, slot: b.dataset.slot });
    case 'f-combo-save': {
      const items = ((day(d).food || {})[b.dataset.slot] || []).map(it => Object.assign({}, it));
      if (!items.length) return;
      const def = items.map(it => foodOf(it).n.replace(/ \(.*\)$/, '')).slice(0, 3).join('+');
      const n = (prompt('조합 이름을 정해 주세요', def) || '').trim();
      if (!n) return;
      myCombos().push({ id: 'cb' + Date.now().toString(36), n, items });
      toast(`"${n}" 조합을 저장했어요`);
      return commit();
    }
    case 'f-combo-add': {
      const c = myCombos().find(x => x.id === b.dataset.id);
      if (!c) return;
      const list = slotItems(d, ui.sheet.slot);
      c.items.forEach(ci => {
        const ex = list.find(it => sameFoodItem(it, ci));
        if (ex) ex.q = r1(ex.q + ci.q); else list.push(Object.assign({}, ci));
      });
      toast(`${c.n} 추가`);
      closeSheet(true); return commit();
    }
    case 'f-combo-del': {
      const c = myCombos().find(x => x.id === b.dataset.id);
      if (c && confirm(`"${c.n}" 조합을 지울까요?`)) { state.combos = myCombos().filter(x => x.id !== c.id); save(); renderSheet(); render(); }
      return;
    }
    case 'f-q': {
      const list = slotItems(d, b.dataset.slot), it = list[+b.dataset.i];
      if (!it) return;
      it.q = stepQty(it, +b.dataset.d);
      if (it.q <= 0.01) list.splice(+b.dataset.i, 1);
      if (!list.length) delete dayW(d).food[b.dataset.slot];
      return commit();
    }
    case 'f-open': openSlots().add(d + ':' + b.dataset.slot); return openSheet({ mode: 'food', date: d, slot: b.dataset.slot, cat: '자주', q: '', pend: [] });
    case 'f-dinners': return openSheet({ mode: 'dinner', date: d, slot: 'd' });
    case 'f-cat': { // 분류만 바꾸고 목록만 새로 그림 (직접 입력 칸에 적던 내용 유지)
      ui.sheet.cat = b.dataset.c; ui.sheet.q = '';
      const inp = document.getElementById('fSearch'); if (inp) inp.value = '';
      document.querySelectorAll('.cats button').forEach(btn => btn.classList.toggle('on', btn.dataset.c === ui.sheet.cat));
      return refreshSheet();
    }
    case 'f-pick': { // 담기만 하고, 완료를 눌러야 끼니에 들어감
      const p = ui.sheet.pend, f = b.dataset.f, ex = p.find(it => it.f === f);
      if (ex) ex.q = r1(ex.q + 0.5); else p.push({ f, q: 1 });
      if (ui.sheet.q) clearSearch(); // 검색해서 담았으면 검색어를 지워 다음 음식을 바로 찾게
      return refreshSheet();
    }
    case 'f-quick': {
      const qs = (ui.sheet.quick || [])[+b.dataset.i]; if (!qs) return;
      const p = ui.sheet.pend;
      qs.items.forEach(it => { const ex = p.find(x => sameFoodItem(x, it)); if (ex) ex.q = r1(ex.q + it.q); else p.push(Object.assign({}, it)); });
      toast(`${qs.t} 담음 · 완료를 누르면 들어가요`);
      return refreshSheet();
    }
    case 'f-qest': {
      const n = (ui.sheet.q || '').trim(), e = estimateFood(n);
      if (!e) { ui.sheet.custom = true; renderSheet(); const el = document.getElementById('cuN'); if (el) { el.value = n; el.focus(); renderEst(); } return; }
      const id = 'my' + Date.now().toString(36);
      myFoods().push({ id, n, u: e.u, k: e.k, p: e.p, c: '내 음식', s: 0.5, mine: true, a: '', est: 'name' });
      ui.sheet.pend.push({ f: id, q: 1 }); save();
      clearSearch(); toast(`${n} ${e.k}kcal 담음 (${e.n} 기준)`);
      return refreshSheet();
    }
    case 'f-pq': {
      const p = ui.sheet.pend, it = p[+b.dataset.i];
      if (!it) return;
      it.q = stepQty(it, +b.dataset.d);
      if (it.q <= 0.01) p.splice(+b.dataset.i, 1);
      return refreshSheet();
    }
    case 'f-px': ui.sheet.pend.splice(+b.dataset.i, 1); return refreshSheet();
    case 'f-commit': {
      const p = ui.sheet.pend;
      if (!p.length) return closeSheet(true);
      const list = slotItems(d, ui.sheet.slot), t = sumItems(p);
      p.forEach(it => { const ex = list.find(x => sameFoodItem(x, it)); if (ex) ex.q = r1(ex.q + it.q); else list.push(Object.assign({}, it)); });
      toast(`${p.length}개 · ${Math.round(t.k).toLocaleString()}kcal 넣었어요`);
      closeSheet(true); return commit();
    }
    case 'f-custom': {
      const v = id => document.getElementById(id).value;
      const n = v('cuN').trim(), e = customEst(), typedK = parseFloat(v('cuK'));
      let k = typedK, p = parseFloat(v('cuP'));
      const u = v('cuU').trim() || '1인분', ing = v('cuI').trim();
      if (!isNum(k) && e) k = e.k;
      if (!isNum(p) && e) p = e.p;
      if (!n) { toast('이름을 넣어주세요'); return; }
      if (!isNum(k)) { toast('비슷한 음식을 못 찾았어요. 칼로리를 넣거나 재료를 적어주세요'); return; }
      if (k < 0) { toast('칼로리는 0 이상으로 넣어 주세요'); return; }
      p = isNum(p) && p >= 0 ? p : 0;
      if (document.getElementById('cuS').checked) {
        const id = 'my' + Date.now().toString(36);
        myFoods().push({ id, n, u, k, p, c: '내 음식', s: 0.5, mine: true, a: ing.replace(/\s+/g, ' '), est: !isNum(typedK) && e ? e.from : undefined });
        ui.sheet.pend.push({ f: id, q: 1 });
        save();
      } else ui.sheet.pend.push({ n, k, p, q: 1 });
      ['cuN', 'cuI', 'cuK', 'cuP', 'cuU'].forEach(id => { document.getElementById(id).value = ''; });
      renderEst(); refreshSheet();
      toast(`${n} ${k}kcal 담음 · 완료를 누르면 들어가요`);
      return;
    }
    case 'f-delfood': {
      const f = myFoods().find(x => x.id === b.dataset.f);
      if (f && confirm(`"${f.n}"을 내 음식 목록에서 지울까요? 이미 기록한 날과 조합의 칼로리·단백질은 그대로 남습니다.`)) {
        inlineDeletedFood(f);
        state.foods = myFoods().filter(x => x.id !== f.id); save(); refreshSheet(); render();
      }
      return;
    }
    case 'f-cafe-on': state.settings.cafeOn = b.dataset.v === '1'; return commit();
    case 'f-ai-key': {
      const k = ((document.getElementById('aiKey') || {}).value || '').trim();
      if (k.length < 20) { toast('키를 확인해 주세요'); return; }
      setAiKey(k); toast('키를 이 폰에 저장했어요'); return render();
    }
    case 'f-ai-key-del': if (confirm('이 폰에 저장한 Gemini 키를 지울까요?')) { setAiKey(''); render(); } return;
    case 'f-cafe-meal': ui.cafeMeal = b.dataset.v; return render();
    case 'f-rice': {
      const v = +b.dataset.v;
      state.settings.riceBowl = v > 0 ? v : null;
      toast(v > 0 ? `한 끼 밥 ${qtyText(v)}공기로 추천·기록합니다` : '밥 양을 목표 칼로리에 맞춰 자동으로 정합니다');
      return commit();
    }
    case 'f-cafe-ask': {
      const t = geminiAsk(ui.cafeMeal || '중식');
      const done = () => toast('요청문을 복사했어요 · Gemini 앱에 사진과 함께 붙여넣으세요');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done).catch(() => prompt('아래 글을 복사하세요', t));
      else prompt('아래 글을 복사하세요', t);
      return;
    }
    case 'f-cafe-prev': {
      const txt = (document.getElementById('cafeTxt') || {}).value || '', mv = (document.getElementById('cafeMon') || {}).value;
      ui.cafeMon = mv ? mondayOf(mv) : cafeDefaultMon();
      ui.cafeDraft = txt; ui.cafePrev = parseCafe(txt, ui.cafeMon);
      return render();
    }
    case 'f-cafe-save': {
      const pv = ui.cafePrev; if (!pv) return;
      Object.assign(cafeMenus(), JSON.parse(JSON.stringify(pv.days)));
      const n = Object.keys(pv.days).length;
      ui.cafePrev = null; ui.cafeDraft = '';
      toast(`급식 메뉴 ${n}일 저장 · 그날 점심 추천에 나옵니다`);
      return commit();
    }
    case 'f-cafe-del': {
      e.preventDefault();
      const m = b.dataset.mon;
      if (!confirm(`${md(m)} 주 급식 메뉴를 지울까요? 이미 기록한 점심은 그대로 남습니다.`)) return;
      Object.keys(cafeMenus()).filter(d => mondayOf(d) === m).forEach(d => delete state.cafe[d]);
      return commit();
    }
    case 'f-dinner-pick': {
      const x = dayW(d); x.food = x.food || {};
      x.food.d = sugItems(dinnerItems(+b.dataset.i, d));
      toast(`저녁: ${PLAN.dinners[+b.dataset.i].n}`);
      closeSheet(true); return commit();
    }
  }
});
document.addEventListener('input', e => {
  if ((e.target.id === 'cuN' || e.target.id === 'cuI') && ui.sheet) return renderEst();
  if (e.target.id !== 'fSearch' || !ui.sheet) return;
  ui.sheet.q = e.target.value;
  document.getElementById('fList').innerHTML = sheetList();
  document.querySelectorAll('.cats button').forEach(btn => btn.classList.toggle('on', !ui.sheet.q && btn.dataset.c === ui.sheet.cat));
});
document.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('custom') && ui.sheet) ui.sheet.custom = e.target.open; }, true);
