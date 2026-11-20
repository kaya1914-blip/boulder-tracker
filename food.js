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
function qtyText(q) {
  const t = Math.round(q * 3);
  if (Math.abs(q * 3 - t) < 0.02 && t % 3 !== 0) { const w = Math.floor(t / 3), f = t % 3 === 1 ? '⅓' : '⅔'; return (w ? w : '') + f; }
  return String(r1(q)).replace(/\.0+$/, '');
}

// ---------- 그날의 끼니 구성 ----------
function isGymDay(date) { const s = S(sessOn(date)); return !!(s && s.gym); }
function riceQty(date) {
  const gym = isGymDay(date), m = PLAN.meals, k = gym ? 'gym' : 'rest';
  let q = m.rice[k];
  // 내 목표 칼로리와 기준 칼로리의 차이를 밥 양으로 맞춤 (밥이 들어가는 끼니 2번에 나눠서, 0.5공기 단위)
  const diff = targets(date)[k] - m.refKcal[k];
  q += diff / 2 / m.riceKcal;
  if (verdict(addDays(mondayOf(date), -7)).flags.plateau) {
    if (goalOf() === 'gain') q += 0.5;
    else if (goalOf() === 'cut' && !gym) q -= 0.5;
  }
  return Math.max(0, Math.min(2, Math.round(q * 2) / 2));
}
function dinnerDefault(date) {
  const n = PLAN.dinners.length;
  return ((diffDays(date, '2026-01-01') % n) + n) % n;
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
  return PLAN.meals[gym ? 'gym' : 'rest']
    .filter(m => !(m.longOnly && s.min < 120))
    .filter(m => !(dayTime && m.id === 'e'))
    .map(m => {
      let sug = m.sug === 'DINNER' ? dinnerItems(dinnerDefault(date), date) : (m.sug || []).map(([f, q]) => (f === 'RICE' ? ['rice', riceQty(date)] : [f, q])).filter(([, q]) => q > 0);
      let t = m.t, tip = m.tip || '';
      if (m.id === 'd') tip = `오늘 추천 · ${PLAN.dinners[dinnerDefault(date)].n}`;
      if (dayTime && m.id === 'l') { sug = PLAN.meals.dayWorkoutLunch.slice(); t = '점심 (운동 2시간 전)'; tip = '또는 김밥 2줄'; }
      if (gym && pf.fast && m.id === (dayTime ? 'n' : 'e')) sug = sug.concat([PLAN.meals.fastLossExtra]);
      return { id: m.id, t, tip, sug };
    });
}
function dietNotes(date) {
  const gym = isGymDay(date), pf = verdict(addDays(mondayOf(date), -7)).flags, notes = [];
  if (gym && day(date).time === 'day') notes.push('낮 운동: 점심을 운동 2시간 전에 든든하게 먹고, 운동 전 계란은 뺍니다.');
  if (pf.protein) notes.push(`지난주 단백질 평균 ${pf.protein}g으로 부족 → 끼니마다 단백질 반찬(계란·두부·닭가슴살·생선) 하나씩 더`);
  if (gym && pf.fast) notes.push('지난주 판정(과감량·힘 떨어짐) → 운동 전 식빵 1장 추가');
  if (pf.plateau && goalOf() === 'gain') notes.push('지난주 체중이 늘지 않음 → 오늘은 끼니마다 밥 0.5공기 늘린 양으로 추천합니다');
  else if (!gym && pf.plateau && goalOf() === 'cut') notes.push('지난주 체중 정체 → 오늘은 끼니마다 밥 0.5공기 줄인 양으로 추천합니다');
  return notes;
}
const sumItems = items => items.reduce((a, it) => { const f = foodOf(it); a.k += f.k * it.q; a.p += f.p * it.q; return a; }, { k: 0, p: 0 });
const sugItems = sug => sug.map(([f, q]) => ({ f, q }));
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
    <div class="slots">${slots.map(sl => slotBlock(date, sl, fd[sl.id] || [])).join('')}</div>
    <p class="hint">칼로리는 음식 DB의 대략치입니다. 피할 것 · ${PLAN.avoid}</p>
  </section>`;
}
const openSlots = () => (ui.openSlots = ui.openSlots || new Set());
function slotBlock(date, sl, items) {
  const t = sumItems(items), sg = sumItems(sugItems(sl.sug));
  const sugText = sl.sug.map(([f, q]) => `${foodOf({ f }).n.replace(/ \(.*\)$/, '')} ${qtyText(q)}`).join(' + ');
  const key = date + ':' + sl.id, open = openSlots().has(key);
  if (!items.length && !open) { // 아직 안 먹은 끼니: 접어 두고 미기록 표시
    return `<button class="slot slot-min slot-empty" data-act="f-open" data-date="${date}" data-slot="${sl.id}" aria-label="${sl.t} 기록하기">
      <span class="sm-l"><b>${sl.t}</b><small>${sl.sug.length ? `아직 기록 안 함 · 추천 ${Math.round(sg.k)}kcal` : '아직 기록 안 함'}</small></span>
      <span class="sm-todo">기록하기</span>
      <span class="sm-chev">${ic('chevR')}</span></button>`;
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
  if (sl.sug && sl.sug.length) { const items = sugItems(sl.sug); if (!seen.has(key(items))) out.push({ t: '앱 추천', items }); }
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
    case 'f-sug': {
      const sl = slotsFor(d).find(s => s.id === b.dataset.slot);
      dayW(d).food = Object.assign(day(d).food || {}, { [sl.id]: sugItems(sl.sug) });
      openSlots().delete(d + ':' + sl.id); // 기록하면 접힘
      return commit();
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
      it.q = r1(it.q + 0.5 * +b.dataset.d); // 모든 음식 0.5인분 단위
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
      it.q = r1(it.q + 0.5 * +b.dataset.d);
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
