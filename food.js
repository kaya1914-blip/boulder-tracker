'use strict';
/* 식단: 끼니별로 실제 먹은 음식을 조합해 기록하고, 음식 DB로 칼로리·단백질을 계산합니다. */

const FOOD_MAP = Object.fromEntries(FOODS.map(f => [f.id, f]));
const myFoods = () => (state.foods = state.foods || []);
function foodOf(it) {
  if (it.f) return FOOD_MAP[it.f] || myFoods().find(x => x.id === it.f) || { n: '(지운 음식)', u: '', k: 0, p: 0, s: 1 };
  return { n: it.n, u: '1회', k: it.k || 0, p: it.p || 0, s: 1 };
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
  const gym = isGymDay(date);
  let q = PLAN.meals.rice[gym ? 'gym' : 'rest'];
  if (!gym && verdict(addDays(mondayOf(date), -7)).flags.plateau) q = Math.max(0, q - 1 / 3);
  return r1(q);
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
  if (gym && pf.fast) notes.push('지난주 판정(과감량·힘 떨어짐) → 운동 전 식빵 1장 추가');
  if (!gym && pf.plateau) notes.push('지난주 체중 정체 → 오늘은 끼니마다 밥 1/3공기 줄인 양으로 추천합니다');
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
  const pt = PLAN.meals.proteinTarget, kt = PLAN.meals.kcalTarget[gym ? 'gym' : 'rest'];
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
        <span class="fi-q"><button class="q-btn" data-act="f-q" data-date="${date}" data-slot="${sl.id}" data-i="${i}" data-d="-1" aria-label="줄이기">${ic('minus')}</button><b>${qtyText(it.q)}</b><button class="q-btn" data-act="f-q" data-date="${date}" data-slot="${sl.id}" data-i="${i}" data-d="1" aria-label="늘리기">${ic('plus')}</button></span>
        <span class="fi-k"><b>${Math.round(f.k * it.q)}</b><small>${Math.round(f.p * it.q * 10) / 10}g</small></span>
      </li>`;
    }).join('')}</ul>` : sl.sug.length ? `<button class="sug" data-act="f-sug" data-date="${date}" data-slot="${sl.id}">
        <span class="sug-t"><small>추천</small>${esc(sugText)}<em>${Math.round(sg.k)}kcal · ${Math.round(sg.p)}g${sl.tip && sl.id !== 'd' ? ' · ' + esc(sl.tip) : ''}</em></span>
        <span class="sug-b">${ic('check')}이대로</span></button>` : ''}
    <div class="slot-act">
      <button class="sa-btn" data-act="f-open" data-date="${date}" data-slot="${sl.id}">${ic('plus')}음식 추가</button>
      ${sl.id === 'd' ? `<button class="sa-btn" data-act="f-dinners" data-date="${date}">${ic('food')}추천 메뉴 보기</button>` : ''}
      ${items.length ? `<button class="sa-btn ghost" data-act="f-clear" data-date="${date}" data-slot="${sl.id}">비우기</button><button class="sa-btn fold" data-act="f-toggle" data-key="${key}" aria-expanded="true">${ic('check')}접기</button>` : ''}
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
function sheetList() {
  const sh = ui.sheet, q = (sh.q || '').trim().replace(/\s+/g, '');
  let list;
  if (q) list = FOODS.concat(myFoods()).filter(f => (f.n + ' ' + (f.a || '')).replace(/\s+/g, '').includes(q));
  else if (sh.cat === '자주') { list = recentFoods(); if (!list.length) list = FOODS.filter(f => f.c === '기본'); }
  else if (sh.cat === '내 음식') list = myFoods();
  else list = FOODS.filter(f => f.c === sh.cat);
  const added = {};
  ((day(sh.date).food || {})[sh.slot] || []).forEach(it => { if (it.f) added[it.f] = it.q; });
  if (!list.length) return `<p class="hint center">${q ? '검색 결과가 없습니다. 아래에서 직접 입력하세요.' : sh.cat === '내 음식' ? '저장한 음식이 없습니다. 아래 직접 입력에서 "내 음식으로 저장"을 켜세요.' : '음식이 없습니다.'}</p>`;
  return list.map(f => `<div class="frow ${added[f.id] ? 'on' : ''}">
    <button class="frow-main" data-act="f-add" data-f="${f.id}">
      <span class="fr-n"><b>${esc(f.n)}</b><small>${esc(f.u)}</small></span>
      <span class="fr-k"><b>${f.k}</b><small>kcal · ${f.p}g</small></span>
      <span class="fr-add">${added[f.id] ? qtyText(added[f.id]) : ic('plus')}</span>
    </button>${f.mine ? `<button class="fr-del" data-act="f-delfood" data-f="${f.id}" aria-label="${esc(f.n)} 지우기">${ic('close')}</button>` : ''}
  </div>`).join('');
}
function renderSheet() {
  const el = document.getElementById('sheet');
  const sh = ui.sheet;
  if (!sh) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
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
    <div class="sh-h"><h3>${esc(slotName)}<small>에 추가</small></h3><span class="sh-btns"><button class="sh-done" data-act="sheet-close">${ic('check')}완료</button><button class="sh-x" data-act="sheet-close" aria-label="닫기">${ic('close')}</button></span></div>
    <label class="search">${ic('target')}<input id="fSearch" type="search" placeholder="음식 검색 (예: 계란, 김밥)" value="${esc(sh.q || '')}" autocomplete="off"></label>
    <div class="cats">${cats.map(c => `<button class="${!sh.q && sh.cat === c ? 'on' : ''}" data-act="f-cat" data-c="${c}">${c === '자주' ? '자주 먹는' : c}</button>`).join('')}</div>
    <div class="sh-list" id="fList">${sheetList()}</div>
    <details class="custom" ${sh.custom ? 'open' : ''}>
      <summary>${ic('plus')}목록에 없는 음식 직접 입력</summary>
      <div class="cu-grid">
        <label class="field"><span>이름</span><input id="cuN" type="text" placeholder="예: 엄마표 김치볶음밥"></label>
        <label class="field"><span>칼로리 (kcal)</span><input id="cuK" type="number" inputmode="decimal" placeholder="예: 550"></label>
        <label class="field"><span>단백질 (g)</span><input id="cuP" type="number" inputmode="decimal" placeholder="모르면 비워두기"></label>
        <label class="field"><span>단위</span><input id="cuU" type="text" placeholder="예: 1인분"></label>
      </div>
      <label class="cu-save"><input id="cuS" type="checkbox" checked> 내 음식으로 저장 (다음에 바로 고르기)</label>
      <button class="btn primary wide" data-act="f-custom">${ic('plus')}추가</button>
    </details>
  </div>`;
}
function openSheet(s) { ui.sheet = s; document.body.classList.add('lock'); renderSheet(); }
function closeSheet() {
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
      return commit();
    }
    case 'f-clear': { const x = dayW(d); if (x.food) delete x.food[b.dataset.slot]; return commit(); }
    case 'f-q': {
      const list = slotItems(d, b.dataset.slot), it = list[+b.dataset.i];
      if (!it) return;
      const step = foodOf(it).s || 1;
      it.q = r1(it.q + step * +b.dataset.d);
      if (it.q <= 0.01) list.splice(+b.dataset.i, 1);
      if (!list.length) delete dayW(d).food[b.dataset.slot];
      return commit();
    }
    case 'f-open': openSlots().add(d + ':' + b.dataset.slot); return openSheet({ mode: 'food', date: d, slot: b.dataset.slot, cat: '자주', q: '' });
    case 'f-dinners': return openSheet({ mode: 'dinner', date: d, slot: 'd' });
    case 'f-cat': ui.sheet.cat = b.dataset.c; ui.sheet.q = ''; return renderSheet();
    case 'f-add': {
      const list = slotItems(d, ui.sheet.slot), f = b.dataset.f;
      const ex = list.find(it => it.f === f);
      if (ex) ex.q = r1(ex.q + 1); else list.push({ f, q: 1 });
      save(); render(); renderSheet();
      toast(`${foodOf({ f }).n} 추가`);
      return;
    }
    case 'f-custom': {
      const n = document.getElementById('cuN').value.trim(), k = parseFloat(document.getElementById('cuK').value);
      const p = parseFloat(document.getElementById('cuP').value), u = document.getElementById('cuU').value.trim() || '1회';
      if (!n || !isNum(k)) { toast('이름과 칼로리를 넣어주세요'); return; }
      const list = slotItems(d, ui.sheet.slot);
      if (document.getElementById('cuS').checked) {
        const id = 'my' + Date.now().toString(36);
        myFoods().push({ id, n, u, k, p: isNum(p) ? p : 0, c: '내 음식', s: 1, mine: true });
        list.push({ f: id, q: 1 });
      } else list.push({ n, k, p: isNum(p) ? p : 0, q: 1 });
      save(); render(); renderSheet();
      toast(`${n} 추가`);
      return;
    }
    case 'f-delfood': {
      const f = myFoods().find(x => x.id === b.dataset.f);
      if (f && confirm(`"${f.n}"을 내 음식에서 지울까요? 이미 기록한 날의 칼로리는 0으로 보입니다.`)) {
        state.foods = myFoods().filter(x => x.id !== f.id); save(); renderSheet();
      }
      return;
    }
    case 'f-dinner-pick': {
      const x = dayW(d); x.food = x.food || {};
      x.food.d = sugItems(dinnerItems(+b.dataset.i, d));
      toast(`저녁: ${PLAN.dinners[+b.dataset.i].n}`);
      closeSheet(); return commit();
    }
  }
});
document.addEventListener('input', e => {
  if (e.target.id !== 'fSearch' || !ui.sheet) return;
  ui.sheet.q = e.target.value;
  document.getElementById('fList').innerHTML = sheetList();
  document.querySelectorAll('.cats button').forEach(btn => btn.classList.toggle('on', !ui.sheet.q && btn.dataset.c === ui.sheet.cat));
});
document.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('custom') && ui.sheet) ui.sheet.custom = e.target.open; }, true);
