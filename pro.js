'use strict';
/* 시작 안내(유형·레벨·몸), 자연 바위 기록, 체력 측정, 데이터 보호(영구 저장·자동 스냅샷·공유 백업), 바코드 음식 찾기. */

const outs = () => (state.outdoor = state.outdoor || []);
const tests = () => (state.tests = state.tests || []);
// 인바디 이력: 저장할 때마다 쌓고, 가장 최근 값이 설정(칼로리 계산)에 들어감
const inbodies = () => (state.inbody = Array.isArray(state.inbody) ? state.inbody : []);
const byDateDesc = (a, b) => (b.date + (b.id || '')).localeCompare(a.date + (a.id || ''));
function syncInbodySettings() {
  const top = inbodies().slice().sort(byDateDesc)[0];
  if (!top) return;
  const st = state.settings;
  st.bodyFat = isNum(top.bodyFat) ? top.bodyFat : null;
  st.smm = isNum(top.smm) ? top.smm : null;
  st.inbodyBmr = isNum(top.bmr) ? top.bmr : null;
  st.inbodyDate = top.date || null;
}
function inbodyDelta(a, b) {
  const bits = [];
  if (isNum(a.bodyFat) && isNum(b.bodyFat)) { const d = a.bodyFat - b.bodyFat; bits.push(`체지방 ${d > 0 ? '+' : ''}${d.toFixed(1)}%p`); }
  if (isNum(a.smm) && isNum(b.smm)) { const d = a.smm - b.smm; bits.push(`골격근 ${d > 0 ? '+' : ''}${d.toFixed(1)}kg`); }
  if (isNum(a.bmr) && isNum(b.bmr)) { const d = a.bmr - b.bmr; bits.push(`기초대사량 ${d > 0 ? '+' : ''}${Math.round(d)}kcal`); }
  return bits.join(' · ');
}
function inbodySection() {
  const list = inbodies().slice().sort(byDateDesc), dl = list.length >= 2 ? inbodyDelta(list[0], list[1]) : '';
  return `<button class="btn wide ib-save" data-act="ib-add">${ic('plus')}지금 인바디 값을 기록에 저장</button>
    ${dl ? `<p class="ib-diff">직전(${md(list[1].date)}) 대비 · <b>${dl}</b></p>` : ''}
    ${list.length ? `<div class="tbl ib-hist"><table><thead><tr><th>날짜</th><th>체중</th><th>체지방</th><th>골격근</th><th>BMR</th><th></th></tr></thead><tbody>${list.map(x => `<tr><td>${md(x.date)}</td><td>${isNum(x.bw) ? x.bw.toFixed(1) : '—'}</td><td>${isNum(x.bodyFat) ? x.bodyFat + '%' : '—'}</td><td>${isNum(x.smm) ? x.smm + 'kg' : '—'}</td><td>${isNum(x.bmr) ? x.bmr : '—'}</td><td><button class="fr-del" data-act="ib-del" data-id="${x.id}" aria-label="삭제">${ic('close')}</button></td></tr>`).join('')}</tbody></table></div>` : ''}`;
}
const STYLE = { flash: '플래시', send: '완등', project: '프로젝트' };
const vOpts = (sel, max = 13) => Array.from({ length: max + 1 }, (_, v) => `<option value="${v}" ${v === sel ? 'selected' : ''}>V${v}</option>`).join('');
const vTxt = v => (isNum(v) ? 'V' + (Math.round(v * 10) / 10).toString().replace(/\.0$/, '') : '—');

// ---------- 시작 안내: 유형 → 레벨 → 몸 정보, 한 번에 하나씩 ----------
function trackCard(compact) {
  const cur = state.settings.track;
  return `<section class="card" id="track">
    <div class="card-h"><h2>${ic('target')}나는 어떤 클라이머?</h2><span class="muted">${cur ? PLAN.tracks[cur].name : '골라 주세요'}</span></div>
    <div class="trk">${Object.entries(PLAN.tracks).map(([k, t]) => `<button class="trk-btn ${cur === k ? 'on' : ''}" data-act="track" data-v="${k}" aria-pressed="${cur === k}"><b>${t.name}</b><small>${t.d}</small></button>`).join('')}</div>
    ${compact ? '' : '<p class="hint">유형에 따라 첫 몇 주의 강도와 쉬는 규칙이 달라집니다. 설정에서 언제든 바꿀 수 있습니다.</p>'}
  </section>`;
}
function onboardCard() {
  const st = state.settings;
  if (!PLAN.tracks[st.track]) return `<p class="ob-step">시작하기 1/3</p>` + trackCard(true);
  if (!lvlSet()) return `<p class="ob-step">시작하기 2/3</p>` + levelCard();
  if (!profileSet()) {
    const n = (k, l, step, ph) => `<label class="field"><span>${l}</span><input type="number" inputmode="decimal" step="${step}" data-field="set:${k}" value="${isNum(st[k]) ? st[k] : ''}" placeholder="${ph}"></label>`;
    return `<p class="ob-step">시작하기 3/3</p><section class="card"><div class="card-h"><h2>${ic('scale')}내 몸 정보</h2><span class="muted">칼로리·체력 평가에 사용</span></div>
      <div class="seg theme-seg" role="group">${[['m', '남성'], ['f', '여성']].map(([v, l]) => `<button class="${st.sex === v ? 'on' : ''}" data-act="set-v" data-k="sex" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="fields2">${n('age', '나이', 1, '예: 30')}${n('heightCm', '키 (cm)', 0.5, '예: 172')}${n('startWeight', '체중 (kg)', 0.1, '예: 68')}</div>
      <p class="hint">인바디 결과(체지방률·골격근량·기초대사량)가 있으면 설정에 넣으세요. 칼로리 계산이 더 정확해집니다. 체중 목표(감량·증량)도 설정에서 정합니다.</p></section>`;
  }
  return '';
}

// ---------- 내 운동 기구: 집 운동이 이 기구에 맞춰 바뀜 ----------
function equipCard() {
  const e = equip(), has = e.db || [];
  const tog = (k, l, d) => `<button class="trk-btn ${e[k] ? 'on' : ''}" data-act="eq-tog" data-k="${k}" aria-pressed="${!!e[k]}"><b>${l}</b><small>${d}</small></button>`;
  return `<section class="card" id="equip">
    <div class="card-h"><h2>${ic('dumbbell')}내 운동 기구</h2><span class="muted">${state.settings.equip ? '집 운동에 반영 중' : '기본값 사용 중'}</span></div>
    <p class="hint">가진 덤벨 무게를 모두 누르세요. 운동마다 맞는 무게를 골라 주고, 없는 기구가 필요한 운동은 대체 운동으로 바뀝니다.</p>
    <div class="eq-db" role="group" aria-label="덤벨 무게">${PLAN.dbChoices.map(k => `<button class="chipbtn ${has.includes(k) ? 'on' : ''}" data-act="eq-db" data-v="${k}" aria-pressed="${has.includes(k)}">${k}kg</button>`).join('')}</div>
    <div class="trk">${tog('bar', '문틀 철봉', '풀업·매달리기·록오프 · 없으면 덤벨 로우 등으로 대체')}${tog('hangboard', '행보드', '집 C(근력 대체)에 행보드 세트 추가')}${tog('band', '저항 밴드', '워밍업 풀어파트 · 입문 단계 밴드 보조 풀업')}</div>
    ${e.bar ? '' : '<p class="hint">클라이밍에는 당기기 근력이 가장 중요합니다. 문틀 철봉(1~3만 원)이 생기면 켜 주세요. 풀업·매달리기·록오프가 들어갑니다.</p>'}
  </section>`;
}

// ---------- 기록 탭 안의 화면 고르기 ----------
function recSeg() {
  const v = ui.recView || 'day';
  return `<div class="seg wide rec-seg" role="group" aria-label="기록 종류">${[['day', '일별'], ['out', '자연 바위'], ['bench', '체력 측정']].map(([k, l]) => `<button class="${v === k ? 'on' : ''}" data-act="rec-view" data-v="${k}" aria-pressed="${v === k}">${l}</button>`).join('')}</div>`;
}

// ---------- 자연 바위 기록 ----------
// 지역·문제는 스크롤 목록에서 고르고, 없으면 "+ 직접 입력"
const NEW = '__new__';
const probs = () => (state.probs = state.probs || []); // 붙여넣어 만든 문제 목록 [{area, name, v}]
const curArea = last => (ui.ouArea != null ? ui.ouArea : last.area || '');
function cragOptions(sel) {
  const mine = [...new Set(outs().map(o => o.area).filter(Boolean))];
  const lib = [...new Set(probs().map(p => p.area))].filter(c => !mine.includes(c));
  const grp = (label, list) => list.length ? `<optgroup label="${esc(label)}">${list.map(c => `<option value="${esc(c)}" ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('')}</optgroup>` : '';
  return `<option value="" ${!sel ? 'selected' : ''}>지역 고르기</option>` + grp('내가 간 곳', mine) + grp('내 문제 목록', lib) +
    Object.entries(PLAN.crags).map(([r, l]) => grp(r, l.filter(c => !mine.includes(c) && !lib.includes(c)))).join('') +
    `<option value="${NEW}" ${sel === NEW ? 'selected' : ''}>+ 목록에 없는 곳 직접 입력</option>`;
}
// 붙여넣기 해석. 한 줄에 "지역, 문제, 등급" 또는 "문제, 등급"(바로 위 지역 줄 / 고른 지역)
// 등급만 없는 한 단어 줄 = 지역 머리글. 구분은 쉼표·탭·| (엑셀 복사 가능)
const gradeOf = s => { const m = /^v?\s*(b|\d{1,2})(?:\s*[-~/+]\s*\d*)?\+?$/i.exec(String(s).trim()); return m ? (m[1].toLowerCase() === 'b' ? 0 : +m[1]) : undefined; };
function parseProblems(text, defArea) {
  let area = defArea || '';
  const out = [];
  String(text).split(/\r?\n/).forEach(raw => {
    let line = raw.trim();
    if (!line || line.startsWith('//')) return;
    let parts = line.split(/\t|,|\|/).map(s => s.trim()).filter(Boolean);
    if (parts.length === 1) { // "슬랩 왕 V3" 처럼 쉼표 없이 등급이 붙은 경우
      const m = /^(.*\S)\s+(v\s*(?:b|\d{1,2})\S*)$/i.exec(parts[0]);
      if (m && gradeOf(m[2]) !== undefined) parts = [m[1], m[2]];
      else { area = parts[0].replace(/^[#\[]+\s*|\s*\]$/g, ''); return; }
    }
    const g = gradeOf(parts[parts.length - 1]), v = g === undefined ? null : g;
    const rest = g === undefined ? parts : parts.slice(0, -1);
    const a = rest.length >= 2 ? rest[0] : area, name = rest.length >= 2 ? rest.slice(1).join(' ') : rest[0];
    if (a && name) out.push({ area: a, name, v: v != null && v <= 17 ? v : null });
  });
  return out;
}
function importProblems(list) {
  let add = 0, upd = 0;
  list.forEach(p => {
    const o = probs().find(x => x.area === p.area && x.name === p.name);
    if (!o) { probs().push(p); add++; } else if (p.v != null && o.v !== p.v) { o.v = p.v; upd++; }
  });
  return { add, upd };
}
// 그 지역에서 내가 기록한 문제들 (최근 순) + 붙여넣은 목록, 등급 함께
function problemOptions(area) {
  const seen = new Map();
  outs().filter(o => o.area === area && o.name).sort((a, b) => b.date.localeCompare(a.date)).forEach(o => { if (!seen.has(o.name)) seen.set(o.name, o); });
  probs().filter(p => p.area === area && !seen.has(p.name)).sort((a, b) => (a.v ?? 99) - (b.v ?? 99) || a.name.localeCompare(b.name, 'ko')).forEach(p => seen.set(p.name, p));
  const sel = ui.ouProb;
  return [...seen.values()].map(o => `<option value="${esc(o.name)}" ${isNum(o.v) ? `data-v="${o.v}"` : ''} ${o.name === sel ? 'selected' : ''}>${esc(o.name)}${isNum(o.v) ? ' · V' + o.v : ''}${o.style === 'project' ? ' (프로젝트)' : ''}</option>`).join('') +
    `<option value="${NEW}" ${!seen.size || sel === NEW || !seen.has(sel) ? 'selected' : ''}>+ 새 문제 입력</option>`;
}
const probNew = area => { const o = document.getElementById('ouN'); return o ? o.value === NEW : !outs().some(x => x.area === area && x.name === ui.ouProb); };
document.addEventListener('change', e => {
  const id = e.target.id;
  if (id === 'ouA') {
    ui.ouArea = e.target.value; ui.ouProb = null;
    document.getElementById('ouAnewF').classList.toggle('hide', e.target.value !== NEW);
    document.getElementById('ouN').innerHTML = problemOptions(e.target.value);
    document.getElementById('ouNnewF').classList.toggle('hide', document.getElementById('ouN').value !== NEW);
  } else if (id === 'ouN') {
    ui.ouProb = e.target.value;
    document.getElementById('ouNnewF').classList.toggle('hide', e.target.value !== NEW);
    const v = e.target.selectedOptions[0] && e.target.selectedOptions[0].dataset.v; // 다시 시도하는 문제면 등급 자동
    if (v != null) document.getElementById('ouV').value = v;
  } else if (id === 'ouFarea') {
    ui.ouFilterArea = e.target.value;
    render();
  }
});
function outdoorView() {
  const list = outs().slice().sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  const sends = list.filter(o => o.style !== 'project');
  const sl = sendLevel();
  const best = sends.length ? Math.max(...sends.map(o => o.v)) : null;
  const top = isNum(best) ? best : lvl();
  const pyr = [];
  for (let v = top; v >= Math.max(0, top - 4); v--) pyr.push([v, sends.filter(o => o.v === v).length, list.filter(o => o.v === v && o.style === 'project').length]);
  const mx = Math.max(1, ...pyr.map(p => p[1] + p[2]));
  const last = list[0] || {};
  // 고치는 중인 기록이 있으면 폼에 그 값을 채움
  const ed = ui.ouEditId ? list.find(o => o.id === ui.ouEditId) : null;
  const formArea = ed ? (ed.area || '') : (ui.ouArea ?? last.area ?? '');
  const formStyle = ed ? ed.style : (ui.ouStyle || 'send');
  const areas = [...new Set(list.map(o => o.area).filter(Boolean))];
  const fStyle = ui.ouFilterStyle || 'all', fArea = areas.includes(ui.ouFilterArea) ? ui.ouFilterArea : '';
  const shown = list.filter(o => (fStyle === 'all' || (fStyle === 'project' ? o.style === 'project' : o.style !== 'project')) && (!fArea || o.area === fArea));
  return `<section class="card" id="ouForm">
      <div class="card-h"><h2>${ic(ed ? 'swap' : 'plus')}${ed ? '기록 고치기' : '완등·시도 기록'}</h2>${ed ? '<button class="sa-btn ghost" data-act="ou-edit-cancel">취소</button>' : ''}</div>
      <div class="fields2">
        <label class="field"><span>날짜</span><input type="date" id="ouD" value="${ed ? ed.date : todayStr()}"></label>
        <label class="field"><span>등급</span><select id="ouV">${vOpts(ed ? ed.v : (isNum(last.v) ? last.v : lvl()))}</select></label>
        <label class="field"><span>지역 · 바위</span><select id="ouA">${cragOptions(formArea)}</select></label>
        <label class="field ${formArea === NEW ? '' : 'hide'}" id="ouAnewF"><span>새 지역 이름</span><input type="text" id="ouAnew" placeholder="예: 북한산 · 인수봉 아래"></label>
        <label class="field"><span>문제 이름</span><select id="ouN">${problemOptions(formArea)}</select></label>
        <label class="field ${probNew(formArea) ? '' : 'hide'}" id="ouNnewF"><span>새 문제 이름</span><input type="text" id="ouNnew" placeholder="예: 슬랩 왕"></label>
        <label class="field"><span>시도 횟수</span><input type="number" inputmode="numeric" id="ouT" placeholder="예: 3" value="${ed && isNum(ed.tries) ? ed.tries : ''}"></label>
      </div>
      <div class="seg theme-seg" role="group" aria-label="결과">${Object.entries(STYLE).map(([k, l]) => `<button class="${formStyle === k ? 'on' : ''}" data-act="ou-style" data-v="${k}">${l}</button>`).join('')}</div>
      <label class="field"><span>메모</span><input type="text" id="ouM" placeholder="홀드·베타·컨디션" value="${ed ? esc(ed.note || '') : ''}"></label>
      <button class="btn primary wide" data-act="ou-add">${ic('check')}${ed ? '고친 내용 저장' : '기록하기'}</button>
      <p class="hint">플래시 = 첫 시도 완등(남의 베타를 봤어도 포함) · 완등 = 여러 번 만에 완등 · 프로젝트 = 아직 못 함</p>
    </section>
    <details class="card ou-imp"${ui.ouImpOpen ? ' open' : ''}>
      <summary class="card-h"><h2>${ic('plus')}문제 목록 붙여넣기</h2><span class="muted">${probs().length ? `${probs().length}개 · ${new Set(probs().map(p => p.area)).size}곳` : '한 번에 추가'}</span></summary>
      <p class="hint">한 줄에 문제 하나. 쉼표·탭으로 나눕니다(엑셀에서 복사해도 됨). 지역 이름만 있는 줄 아래 문제들은 그 지역으로 들어갑니다. 지역 줄이 없으면 위에서 고른 지역으로 들어갑니다.</p>
      <textarea id="ouImp" rows="7" placeholder="무등산 · 장불재&#10;슬랩 왕, V3&#10;크림프 라인, V5&#10;&#10;또는: 불암산, 모서리, V2"></textarea>
      <div class="row-btns"><button class="btn primary" data-act="ou-imp">${ic('check')}목록에 추가</button>${probs().length ? '<button class="btn" data-act="ou-imp-clear">붙여넣은 목록 비우기</button>' : ''}</div>
    </details>
    <section class="stats">
      <div class="stat num"><b>${vTxt(best)}</b><span>최고 완등</span><small>${isNum(sl.outdoor) ? '최근 180일 ' + vTxt(sl.outdoor) : ''}</small></div>
      <div class="stat num"><b>${sends.length}</b><span>완등</span><small>플래시 ${sends.filter(o => o.style === 'flash').length}</small></div>
      <div class="stat num"><b>${list.filter(o => o.style === 'project').length}</b><span>프로젝트</span><small>진행 중</small></div>
      <div class="stat num"><b>${new Set(list.map(o => o.date)).size}</b><span>바위 간 날</span><small>${areas.length}곳</small></div>
    </section>
    <section class="card"><div class="card-h"><h2>등급 피라미드</h2><span class="muted">완등 · 프로젝트</span></div>
      ${list.length ? `<div class="pyr">${pyr.map(([v, s, p]) => `<div class="py-row"><span class="py-v">V${v}</span><span class="py-bar"><i class="s" style="width:${s / mx * 100}%"></i><i class="p" style="width:${p / mx * 100}%"></i></span><span class="py-n">${s}${p ? ` <small>+${p}</small>` : ''}</span></div>`).join('')}</div>
      <p class="hint">한 단계 아래 등급 완등이 위 등급의 2~3배쯤 쌓이면 다음 등급에 도전할 기반이 있다고 봅니다.</p>` : '<p class="hint">아직 기록이 없습니다. 자연 바위 완등을 적으면 실제 실력이 체력 측정의 "완등 등급"에 반영됩니다.</p>'}
    </section>
    ${list.length ? `<section class="card"><div class="card-h"><h2>기록</h2><span class="muted">${shown.length}${shown.length !== list.length ? '/' + list.length : ''}개</span></div>
      <div class="ou-filters">
        <div class="cats">${[['all', '전체'], ['sent', '완등'], ['project', '프로젝트']].map(([k, l]) => `<button class="${fStyle === k ? 'on' : ''}" data-act="ou-fstyle" data-v="${k}">${l}</button>`).join('')}</div>
        ${areas.length >= 2 ? `<select id="ouFarea" class="ou-farea" aria-label="지역 필터"><option value="">전체 지역</option>${areas.map(a => `<option value="${esc(a)}" ${fArea === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>` : ''}
      </div>
      ${shown.length ? `<ul class="hist ou-list">${shown.slice(0, 60).map(o => `<li>
        <span class="ou-v s-${o.style}">V${o.v}</span>
        <span class="ou-m"><b>${esc(o.name || '이름 없음')}</b><small>${md(o.date)} · ${esc(o.area || '')} · ${STYLE[o.style]}${isNum(o.tries) ? ` · ${o.tries}번` : ''}${o.note ? ' · ' + esc(o.note) : ''}</small></span>
        <span class="ou-acts">
          ${o.style === 'project' ? `<button class="ou-btn" data-act="ou-try" data-id="${o.id}" aria-label="시도 1번 추가">+1</button><button class="ou-btn ok" data-act="ou-send" data-id="${o.id}">완등</button>` : ''}
          <button class="fr-del" data-act="ou-edit" data-id="${o.id}" aria-label="고치기">${ic('swap')}</button>
          <button class="fr-del" data-act="ou-del" data-id="${o.id}" aria-label="삭제">${ic('close')}</button>
        </span>
      </li>`).join('')}</ul>` : '<p class="hint center">조건에 맞는 기록이 없습니다.</p>'}
    </section>` : ''}`;
}

// ---------- 체력 측정: 체중 대비 근력 ----------
// 행보드·풀업 체중 대비 %의 추이 (측정 2번 이상일 때)
function benchChart(ts) {
  const chron = ts.slice().reverse().map(x => ({ x, b: benchOf(x) })).filter(o => o.b && (isNum(o.b.hangPct) || isNum(o.b.pullPct)));
  if (chron.length < 2) return '';
  const nextV = Math.min(10, lvl() + 1), refRow = PLAN.bench.hang.find(([, v]) => v === nextV), refPct = refRow ? refRow[0] : null;
  const vals = chron.flatMap(o => [o.b.hangPct, o.b.pullPct]).filter(isNum).concat(isNum(refPct) ? [refPct] : []);
  const y0 = Math.floor((Math.min(...vals) - 8) / 10) * 10, y1 = Math.ceil((Math.max(...vals) + 8) / 10) * 10;
  const W = 340, H = 190, L = 34, R = 14, T = 14, B = 24;
  const X = i => +(L + (i / (chron.length - 1)) * (W - L - R)).toFixed(1);
  const Y = v => +(T + ((y1 - v) / Math.max(10, y1 - y0)) * (H - T - B)).toFixed(1);
  let g = '';
  const stepY = y1 - y0 > 60 ? 20 : 10;
  for (let v = y0; v <= y1; v += stepY) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="c-grid"/><text x="${L - 5}" y="${Y(v) + 3.5}" class="c-lbl" text-anchor="end">${v}%</text>`;
  if (isNum(refPct)) g += `<line x1="${L}" x2="${W - R}" y1="${Y(refPct)}" y2="${Y(refPct)}" class="c-goal"/><text x="${W - R}" y="${Y(refPct) - 4}" class="c-goal-lbl" text-anchor="end">V${nextV} 행보드 기준 ${refPct}%</text>`;
  const every = chron.length > 6 ? Math.ceil(chron.length / 5) : 1;
  chron.forEach((o, i) => { if (i % every === 0 || i === chron.length - 1) g += `<text x="${X(i)}" y="${H - 6}" class="c-lbl" text-anchor="middle">${md(o.x.date)}</text>`; });
  const series = (key, cls) => {
    const pts = chron.map((o, i) => (isNum(o.b[key]) ? { x: X(i), y: Y(o.b[key]), v: o.b[key], d: o.x.date } : null)).filter(Boolean);
    if (pts.length >= 2) g += `<polyline points="${pts.map(p => `${p.x},${p.y}`).join(' ')}" class="${cls}"/>`;
    pts.forEach(p => { g += `<circle cx="${p.x}" cy="${p.y}" r="3.6" class="${cls}-dot"><title>${md(p.d)} ${p.v.toFixed(0)}%</title></circle>`; });
  };
  series('hangPct', 'c-hang'); series('pullPct', 'c-pull');
  return `<section class="card"><div class="card-h"><h2>근력 추이 (체중 대비)</h2><span class="muted">${chron.length}회 측정</span></div>
    <svg viewBox="0 0 ${W} ${H}" class="chart bench-chart" role="img" aria-label="행보드와 풀업 체중 대비 근력 추이">${g}</svg>
    <div class="legend"><span><i class="lg-hang"></i>행보드</span><span><i class="lg-pull"></i>풀업</span>${isNum(refPct) ? `<span><i class="lg-goal"></i>V${nextV} 기준</span>` : ''}</div>
  </section>`;
}
function benchView() {
  const ts = tests().slice().sort(byDateDesc);
  const t = ts[0], b = benchOf(t), pb = ts[1] ? benchOf(ts[1]) : null, sl = sendLevel(), dg = diagnose(b, sl.v);
  const delta = (cur, prev) => { if (!isNum(cur) || !isNum(prev)) return ''; const d = Math.round(cur - prev); return d ? ` <em class="bm-d ${d > 0 ? 'pos' : 'neg'}">${d > 0 ? '+' : ''}${d}%p</em>` : ''; };
  const wNow = curWeight(todayStr());
  const bar = (label, v, cls) => `<div class="bm-row"><span>${label}</span><span class="bm-track">${Array.from({ length: 11 }, (_, i) => `<i style="left:${i * 10}%"></i>`).join('')}${isNum(v) ? `<b class="${cls}" style="left:${Math.max(0, Math.min(100, v * 10))}%">${vTxt(v)}</b>` : ''}</span></div>`;
  let whatIf = '';
  if (b && isNum(t.hang) && t.bw > 30) {
    const load = t.bw + t.hang, m2 = (load / (t.bw - 2)) * 100, v2 = interpV(PLAN.bench.hang, m2);
    whatIf = `<li><span>체중 -2kg이면</span>같은 힘으로 행보드 ${m2.toFixed(0)}% → ${vTxt(v2)} (지금 ${vTxt(b.vh)})</li>`;
  }
  return `<section class="card">
      <div class="card-h"><h2>${ic('finger')}측정하기</h2><span class="muted">4~8주마다</span></div>
      <p class="hint">충분히 워밍업한 뒤 측정하세요. 손가락·팔꿈치 통증이 있으면 하지 마세요.<br>
      <b>행보드</b>: <b>비스트메이커 1000 · 4손가락 엣지 20mm</b>, 양손 하프크림프, 10초 버틸 수 있는 최대 추가 무게(보조 도르래를 쓰면 마이너스). 매번 같은 홀드·같은 그립으로 재야 기록끼리 비교됩니다. <b>풀업</b>: 1회 최대 추가 무게, 모르면 맨몸 최대 횟수만.</p>
      <div class="fields2">
        <label class="field"><span>날짜</span><input type="date" id="bnD" value="${todayStr()}"></label>
        <label class="field"><span>체중 (kg)</span><input type="number" inputmode="decimal" id="bnW" value="${isNum(wNow) ? Math.round(wNow * 10) / 10 : ''}"></label>
        <label class="field"><span>BM1000 20mm 추가 무게 (kg)</span><input type="number" inputmode="decimal" id="bnH" placeholder="예: 10 / 보조 -5"></label>
        <label class="field"><span>풀업 1회 추가 무게 (kg)</span><input type="number" inputmode="decimal" id="bnP" placeholder="예: 20"></label>
        <label class="field"><span>또는 맨몸 풀업 최대 횟수</span><input type="number" inputmode="numeric" id="bnR" placeholder="예: 12"></label>
        <label class="field"><span>양팔 벌린 길이 (cm)</span><input type="number" inputmode="decimal" id="bnS" value="${t && isNum(t.span) ? t.span : ''}" placeholder="윙스팬, 선택"></label>
      </div>
      <button class="btn primary wide" data-act="bn-add">${ic('check')}측정 저장</button>
    </section>
    ${b ? `<section class="card"><div class="card-h"><h2>내 수준 · ${md(t.date)} 측정</h2><span class="muted">체중 ${t.bw}kg</span></div>
      <div class="bm">
        ${bar('손가락 힘', b.vh, 'h')}${bar('당기는 힘', b.vp, 'p')}${bar('힘 종합', b.v, 'v')}${bar('완등 실력', sl.v >= 0 ? sl.v : null, 's')}
      </div>
      <ul class="plain">
        ${isNum(b.hangPct) ? `<li><span>BM1000 20mm</span>체중의 <b>${b.hangPct.toFixed(0)}%</b>${delta(b.hangPct, pb && pb.hangPct)} (${(t.bw + t.hang).toFixed(1)}kg) → 힘 기준 ${vTxt(b.vh)}</li>` : ''}
        ${isNum(b.pullPct) ? `<li><span>풀업</span>체중의 <b>${b.pullPct.toFixed(0)}%</b>${delta(b.pullPct, pb && pb.pullPct)}${isNum(t.pull) ? '' : ' (횟수로 추정)'} → 힘 기준 ${vTxt(b.vp)}</li>` : ''}
        <li><span>완등</span>${sl.v >= 0 ? `V${sl.v}` : '—'} ${isNum(sl.outdoor) ? `(자연 바위 최근 180일 최고 ${vTxt(sl.outdoor)})` : '(설정한 레벨 · 자연 바위 기록을 넣으면 반영)'}</li>
        ${isNum(state.settings.bodyFat) || isNum(state.settings.smm) ? `<li><span>인바디</span>${isNum(state.settings.bodyFat) ? `체지방률 ${state.settings.bodyFat}% · 제지방량 ${(t.bw * (1 - state.settings.bodyFat / 100)).toFixed(1)}kg` : ''}${isNum(state.settings.smm) ? ` · 골격근량 ${state.settings.smm}kg` : ''}${isNum(state.settings.bodyFat) && isNum(t.hang) ? `<br>체지방만 2kg 줄이면 행보드 ${((t.bw + t.hang) / (t.bw - 2) * 100).toFixed(0)}% (근육은 그대로일 때)` : ''}</li>` : ''}
        ${isNum(b.bmi) ? `<li><span>체격</span>BMI ${b.bmi.toFixed(1)}${isNum(b.ape) ? ` · 리치 지수 ${b.ape > 0 ? '+' : ''}${b.ape}cm (${b.ape >= 3 ? '팔이 긴 편, 먼 홀드에 유리' : b.ape <= -3 ? '팔이 짧은 편, 발·몸 위치로 거리 보완' : '보통'})` : ''}</li>` : ''}
        ${whatIf}
      </ul>
      ${dg ? `<div class="vcard ${dg.k === 'bal' ? 'ok' : 'info'}"><span class="v-ic">${ic('spark')}</span><div><b>${dg.t}</b><p>${dg.d}</p></div></div>` : ''}
      <p class="hint">등급 대응은 공개된 클라이머 근력 조사 경향을 단순화한 대략치입니다. 같은 힘이라도 기술·체형·스타일(슬랩·오버행)에 따라 2등급 이상 차이 날 수 있습니다.</p>
    </section>` : '<section class="card"><p class="hint">측정을 저장하면 체중 대비 손가락·당기는 힘으로 예상 등급을 계산하고, 실제 완등 등급과 비교해 힘과 기술 중 무엇이 부족한지 알려 줍니다.</p></section>'}
    ${benchChart(ts)}
    ${ts.length ? `<section class="card"><div class="card-h"><h2>측정 기록</h2><span class="muted">${ts.length}회</span></div><div class="tbl"><table><thead><tr><th>날짜</th><th>체중</th><th>행보드</th><th>풀업</th><th>힘 기준</th><th></th></tr></thead><tbody>${ts.map(x => { const y = benchOf(x); return `<tr><td>${md(x.date)}</td><td>${x.bw}</td><td>${isNum(y.hangPct) ? y.hangPct.toFixed(0) + '%' : '—'}</td><td>${isNum(y.pullPct) ? y.pullPct.toFixed(0) + '%' : '—'}</td><td>${vTxt(y.v)}</td><td><button class="fr-del" data-act="bn-del" data-id="${x.id}" aria-label="삭제">${ic('close')}</button></td></tr>`; }).join('')}</tbody></table></div></section>` : ''}`;
}

// 주간 리포트에 넣을 자연 바위·체력 요약
function reportExtra(mon) {
  const L = [], sun = addDays(mon, 6), st = state.settings;
  if (isNum(st.bodyFat) || isNum(st.smm) || isNum(st.inbodyBmr)) {
    const ibs = inbodies().filter(x => x.date <= sun).sort(byDateDesc), dl = ibs.length >= 2 ? inbodyDelta(ibs[0], ibs[1]) : '';
    L.push(`- 인바디${st.inbodyDate ? `(${st.inbodyDate})` : ''}: ${[isNum(st.bodyFat) ? `체지방률 ${st.bodyFat}%` : '', isNum(st.smm) ? `골격근량 ${st.smm}kg` : '', isNum(st.inbodyBmr) ? `기초대사량 ${st.inbodyBmr}kcal` : ''].filter(Boolean).join(' · ')}${dl ? ` (직전 ${ibs[1].date} 대비 ${dl})` : ''}`);
  }
  const wk = outs().filter(o => o.date >= mon && o.date <= sun);
  if (wk.length) L.push(`- 이번 주 자연 바위: ${wk.map(o => `${o.area || ''} ${o.name || ''} V${o.v} ${STYLE[o.style]}${isNum(o.tries) ? ` ${o.tries}번` : ''}`.trim()).join(' / ')}`);
  const sl = sendLevel(sun);
  if (isNum(sl.outdoor)) L.push(`- 자연 바위 최근 180일 최고 완등: V${sl.outdoor}`);
  const t = tests().filter(x => x.date <= sun).sort((a, b) => b.date.localeCompare(a.date))[0], b = benchOf(t);
  if (b) {
    const dg = diagnose(b, sl.v);
    L.push(`- 체력 측정(${t.date}, 체중 ${t.bw}kg): 행보드(비스트메이커 1000 4손가락 20mm, 하프크림프) 10초 ${isNum(b.hangPct) ? b.hangPct.toFixed(0) + '%BW → ' + vTxt(b.vh) : '-'} · 풀업 1RM ${isNum(b.pullPct) ? b.pullPct.toFixed(0) + '%BW → ' + vTxt(b.vp) : '-'} · 힘 종합 ${vTxt(b.v)} vs 완등 V${sl.v}${dg ? ' → ' + dg.t : ''}`);
  }
  const os = overrideStats(sun);
  if (os.n) L.push(`- 최근 4주 추천과 다르게 한 날 ${os.n}일 (회복 권고 무시 ${os.risky}일, 그 뒤 통증 ${os.painAfter}회)`);
  return L;
}

// ---------- 데이터 보호 ----------
// 1) 브라우저에 "이 사이트 데이터는 지우지 마" 요청 (iOS·안드로이드가 오래 안 쓴 사이트 데이터를 지우는 것 방지)
// 2) 하루 한 번 자동 스냅샷(최근 14일)을 IndexedDB에 따로 저장 → 실수로 지우거나 잘못 불러와도 되돌리기
// 3) 공유 백업: 파일을 카톡·구글 드라이브 등으로 바로 보내기
function idb() {
  return new Promise((res, rej) => { const r = indexedDB.open('bt-snap', 1); r.onupgradeneeded = () => r.result.createObjectStore('s'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
const idbReq = (db, mode, fn) => new Promise((res, rej) => { const tx = db.transaction('s', mode), q = fn(tx.objectStore('s')); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); });
// 'YYYY-MM-DD' = 그날 처음 연 상태 · 'YYYY-MM-DD-pre' = 불러오기·전체 지우기 직전 상태
const snapLabel = k => (k.endsWith('-pre') ? `${md(k.slice(0, 10))} 변경 직전` : md(k));
async function snapTake() {
  let db;
  try {
    if (!Object.keys(state.days).length) return;
    db = await idb();
    const k = todayStr();
    const keys = await idbReq(db, 'readonly', s => s.getAllKeys());
    if (!keys.includes(k)) await idbReq(db, 'readwrite', s => s.put(JSON.stringify(state), k));
    const all = (await idbReq(db, 'readonly', s => s.getAllKeys())).sort();
    for (const old of all.slice(0, Math.max(0, all.length - 16))) await idbReq(db, 'readwrite', s => s.delete(old));
    ui.snaps = all.slice(-16).reverse();
  } catch (e) { ui.snaps = null; }
  finally { if (db) db.close(); }
}
async function snapForce() {
  let db;
  try {
    if (!Object.keys(state.days).length) return;
    db = await idb();
    await idbReq(db, 'readwrite', s => s.put(JSON.stringify(state), todayStr() + '-pre'));
    ui.snaps = (await idbReq(db, 'readonly', s => s.getAllKeys())).sort().slice(-16).reverse();
  } catch (e) { /* 저장 공간이 막혀도 진행 */ }
  finally { if (db) db.close(); }
}
async function snapRestore(k) {
  let db;
  try {
    db = await idb();
    const raw = await idbReq(db, 'readonly', s => s.get(k)), s = normalize(JSON.parse(raw));
    if (!s) throw new Error('형식');
    if (!confirm(`${snapLabel(k)} 상태(기록 ${Object.keys(s.days).length}일치)로 되돌립니다. 그 뒤에 적은 내용은 사라집니다. 계속할까요?`)) return;
    state = s; applyTheme(); commit(); toast(`${snapLabel(k)} 상태로 되돌렸어요`);
  } catch (e) { toast('스냅샷을 읽지 못했습니다'); }
  finally { if (db) db.close(); }
}
async function askPersist() {
  try { if (navigator.storage && navigator.storage.persist) ui.persist = (await navigator.storage.persisted()) || (await navigator.storage.persist()); } catch (e) { ui.persist = false; }
}
async function shareBackup() {
  const name = `boulder-tracker-${todayStr()}.json`, file = new File([JSON.stringify(state, null, 1)], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '볼더링 트래커 백업' });
      state.meta.lastBackup = todayStr(); commit(); toast('백업을 보냈습니다');
    } else exportData();
  } catch (e) { if (e && e.name !== 'AbortError') exportData(); }
}
function protectBox() {
  const p = ui.persist, sn = ui.snaps;
  return `<div class="protect">
    <p class="hint">${p === true ? `${ic('check')}이 기기에 영구 저장이 허용되어 있습니다.` : p === false ? `${ic('alert')}브라우저가 영구 저장을 허용하지 않았습니다. 홈 화면에 추가해서 쓰면 허용될 가능성이 높고, 주 1회 백업을 꼭 하세요.` : '영구 저장 상태 확인 중…'}</p>
    <button class="btn wide" data-act="share-backup">${ic('share')}백업 파일 보내기 (카톡·드라이브 등)</button>
    <h3 class="h3">자동 스냅샷 <small class="muted">하루 한 번 · 최근 14일</small></h3>
    ${sn && sn.length ? `<div class="chips">${sn.map(k => `<button class="chipbtn" data-act="snap-restore" data-k="${k}">${snapLabel(k)}</button>`).join('')}</div><p class="hint">누르면 그날 앱을 처음 열었을 때 상태로 되돌립니다. 같은 기기 안에 저장되므로 기기를 잃어버리면 함께 사라집니다.</p>` : '<p class="hint">아직 스냅샷이 없습니다. 기록이 생기면 매일 자동으로 만듭니다.</p>'}
  </div>`;
}

// ---------- 바코드로 음식 찾기 (Open Food Facts 공개 DB) ----------
async function lookupBarcode(code) {
  if (!/^\d{8,14}$/.test(code)) { toast('바코드 숫자를 확인해 주세요'); return; }
  toast('제품을 찾는 중…');
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_ko,brands,nutriments,serving_size,quantity`);
    const j = await r.json(), p = j && j.product;
    if (!p || j.status !== 1) { toast('이 바코드 제품이 공개 DB에 없습니다. 포장지 값을 직접 넣어 주세요'); return; }
    const n = p.nutriments || {}, srv = isNum(n['energy-kcal_serving']);
    const k = srv ? n['energy-kcal_serving'] : n['energy-kcal_100g'], pr = srv ? n.proteins_serving : n.proteins_100g;
    const set = (id, v) => { const e = document.getElementById(id); if (e && v != null) e.value = v; };
    const det = document.querySelector('details.custom'); if (det) det.open = true;
    set('cuN', [p.brands && p.brands.split(',')[0], p.product_name_ko || p.product_name].filter(Boolean).join(' ') || `바코드 ${code}`);
    set('cuK', isNum(k) ? Math.round(k) : '');
    set('cuP', isNum(pr) ? Math.round(pr * 10) / 10 : '');
    set('cuU', srv ? (p.serving_size || '1회 제공량') : '100g');
    if (typeof renderEst === 'function') renderEst();
    toast(isNum(k) ? '제품을 찾았어요 · 확인 후 담기' : '제품은 찾았지만 칼로리 정보가 없습니다');
  } catch (e) { toast('인터넷 연결을 확인해 주세요'); }
}
async function scanBarcode() {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices) {
    const c = prompt('이 기기는 카메라 바코드 인식을 지원하지 않습니다(아이폰 등). 바코드 아래 숫자를 입력하세요.');
    if (c) lookupBarcode(c.replace(/\D/g, ''));
    return;
  }
  const ov = document.createElement('div');
  ov.className = 'scan';
  ov.innerHTML = '<video playsinline muted></video><div class="scan-box"></div><p>바코드를 네모 안에 맞추세요</p><button class="btn" data-scan="type">숫자로 입력</button><button class="sh-x" data-scan="close" aria-label="닫기">' + ic('close') + '</button>';
  document.body.appendChild(ov);
  syncBack();
  let stream, timer, done = false;
  const stop = () => { done = true; clearInterval(timer); if (stream) stream.getTracks().forEach(t => t.stop()); ov.remove(); };
  ov.addEventListener('click', e => {
    const a = e.target.closest('[data-scan]'); if (!a) return;
    if (a.dataset.scan === 'type') { stop(); const c = prompt('바코드 아래 숫자'); if (c) lookupBarcode(c.replace(/\D/g, '')); }
    else stop();
  });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const v = ov.querySelector('video'); v.srcObject = stream; await v.play();
    const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    timer = setInterval(async () => {
      if (done) return;
      try { const r = await det.detect(v); if (r.length && !done) { const code = r[0].rawValue; stop(); lookupBarcode(code); } } catch (e) { /* 다음 프레임 */ }
    }, 350);
  } catch (e) { stop(); toast('카메라를 열 수 없습니다. 숫자로 입력해 주세요'); }
}

// ---------- 이벤트 ----------
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act;
  const val = id => (document.getElementById(id) || {}).value || '';
  const num = id => { const v = parseFloat(val(id)); return isNum(v) ? v : null; };
  switch (a) {
    case 'eq-open': ui.tab = 'settings'; render(); setTimeout(() => { const el = document.getElementById('equip'); if (el) el.scrollIntoView({ block: 'start' }); }, 0); return;
    case 'eq-tog': { const e = state.settings.equip = Object.assign({}, equip(), { db: (equip().db || []).slice() }); e[b.dataset.k] = !e[b.dataset.k]; return commit(); }
    case 'eq-db': { const e = state.settings.equip = Object.assign({}, equip(), { db: (equip().db || []).slice() }), k = +b.dataset.v; e.db = e.db.includes(k) ? e.db.filter(x => x !== k) : e.db.concat(k); return commit(); }
    case 'track': state.settings.track = b.dataset.v; commit(); return toast(`${PLAN.tracks[b.dataset.v].name} 프로그램으로 맞췄어요`);
    case 'rec-view': ui.recView = b.dataset.v; window.scrollTo(0, 0); return render();
    case 'ou-style': ui.ouStyle = b.dataset.v; document.querySelectorAll('[data-act="ou-style"]').forEach(x => x.classList.toggle('on', x === b)); return;
    case 'ou-fstyle': ui.ouFilterStyle = b.dataset.v; return render();
    case 'ou-try': {
      const o = outs().find(x => x.id === b.dataset.id); if (!o) return;
      o.tries = (isNum(o.tries) ? o.tries : 0) + 1;
      commit(); return toast(`${o.name || '프로젝트'} · 시도 ${o.tries}번`);
    }
    case 'ou-send': {
      const o = outs().find(x => x.id === b.dataset.id); if (!o) return;
      o.style = 'send'; o.date = todayStr();
      commit(); return toast(`V${o.v} ${o.name || '문제'} 완등!`);
    }
    case 'ou-edit': {
      const o = outs().find(x => x.id === b.dataset.id); if (!o) return;
      ui.ouEditId = o.id; ui.ouArea = o.area || ''; ui.ouProb = o.name || NEW; ui.ouStyle = o.style;
      render();
      const el = document.getElementById('ouForm'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    case 'ou-edit-cancel': ui.ouEditId = null; return render();
    case 'ou-add': {
      const date = val('ouD') || todayStr(), v = +val('ouV');
      const area = (val('ouA') === NEW ? val('ouAnew') : val('ouA')).trim(), name = (val('ouN') === NEW ? val('ouNnew') : val('ouN')).trim();
      if (val('ouA') === NEW && !area) { toast('새 지역 이름을 넣어 주세요'); return; }
      ui.ouArea = area || ui.ouArea;
      const sty = ui.ouStyle || 'send', rec = { date, v, area, name, tries: num('ouT'), style: sty, note: val('ouM').trim() };
      if (ui.ouEditId) {
        const o = outs().find(x => x.id === ui.ouEditId);
        if (o) Object.assign(o, rec);
        ui.ouEditId = null;
        commit(); return toast(`V${v} 기록을 고쳤어요`);
      }
      outs().push(Object.assign({ id: 'o' + Date.now().toString(36) }, rec));
      commit(); return toast(`V${v} ${STYLE[sty]} 기록`);
    }
    case 'ib-add': {
      const st = state.settings;
      if (!isNum(st.bodyFat) && !isNum(st.smm) && !isNum(st.inbodyBmr)) { toast('체지방률·골격근량·기초대사량 중 하나를 먼저 넣어 주세요'); return; }
      const date = st.inbodyDate || todayStr();
      inbodies().push({ id: 'ib' + Date.now().toString(36), date, bw: curWeight(date), bodyFat: st.bodyFat, smm: st.smm, bmr: st.inbodyBmr });
      syncInbodySettings();
      commit(); return toast('인바디 기록을 저장했어요');
    }
    case 'ib-del': if (confirm('이 인바디 기록을 지울까요?')) { state.inbody = inbodies().filter(x => x.id !== b.dataset.id); syncInbodySettings(); commit(); } return;
    case 'ou-imp': {
      const sel = val('ouA') === NEW ? val('ouAnew').trim() : val('ouA');
      const list = parseProblems(val('ouImp'), sel);
      if (!list.length) { toast(sel ? '읽을 수 있는 줄이 없어요' : '지역을 고르거나 첫 줄에 지역 이름을 적어 주세요'); return; }
      const r = importProblems(list);
      ui.ouImpOpen = true; ui.ouArea = list[0].area; ui.ouProb = null;
      commit(); return toast(`${r.add}개 추가${r.upd ? ` · ${r.upd}개 등급 수정` : ''}`);
    }
    case 'ou-imp-clear': if (confirm(`붙여넣은 문제 ${probs().length}개를 지울까요? 완등 기록은 그대로 남습니다.`)) { state.probs = []; commit(); } return;
    case 'ou-del': if (confirm('이 기록을 지울까요?')) { if (ui.ouEditId === b.dataset.id) ui.ouEditId = null; state.outdoor = outs().filter(o => o.id !== b.dataset.id); commit(); } return;
    case 'bn-add': {
      const bw = num('bnW');
      if (!isNum(bw) || bw < 25) { toast('체중을 넣어 주세요'); return; }
      const t = { id: 't' + Date.now().toString(36), date: val('bnD') || todayStr(), board: 'bm1000-20', bw, hang: num('bnH'), pull: num('bnP'), reps: num('bnR'), span: num('bnS'), height: state.settings.heightCm };
      if (!isNum(t.hang) && !isNum(t.pull) && !isNum(t.reps)) { toast('행보드나 풀업 중 하나는 넣어 주세요'); return; }
      tests().push(t); commit(); return toast('측정을 저장했어요');
    }
    case 'bn-del': if (confirm('이 측정을 지울까요?')) { state.tests = tests().filter(x => x.id !== b.dataset.id); commit(); } return;
    case 'share-backup': return shareBackup();
    case 'snap-restore': return snapRestore(b.dataset.k);
    case 'f-barcode': return scanBarcode();
  }
});
// ---------- 휴대폰 뒤로가기: 한 단계씩 닫고, 오늘 화면에서만 앱이 꺼지게 ----------
// 오늘 화면(첫 화면)이 아니면 history에 표시 하나를 넣어 두고, 뒤로가기가 오면 가장 위의 것부터 하나씩 닫습니다.
const isRootView = () => ui.tab === 'today' && ui.date === todayStr() && !ui.sheet && ui.focus == null && !ui.guide && !ui.picking
  && !document.querySelector('.scan') && document.getElementById('runner').hidden;
let backArmed = false;
function syncBack() { if (!backArmed && !isRootView()) { try { history.pushState({ bt: 1 }, ''); backArmed = true; } catch (e) { /* 무시 */ } } }
function stepBack() {
  const scan = document.querySelector('.scan');
  if (scan) return scan.querySelector('[data-scan="close"]').click();
  if (!document.getElementById('runner').hidden) {
    if (typeof RUN !== 'undefined' && RUN.done) { closeRunner(); return; }
    const was = typeof RUN !== 'undefined' && RUN.on && !RUN.paused;
    if (was) togglePause(); // 묻는 동안 멈춤
    if (confirm('타이머를 끝낼까요?')) closeRunner();
    else if (was) togglePause();
    return;
  }
  if (ui.guide) { ui.guide = null; return renderGuide(); }
  if (ui.sheet) return closeSheet(); // 담은 음식이 있으면 확인을 받음
  if (ui.focus != null) { ui.focus = null; document.body.classList.remove('lock'); return render(); }
  if (ui.picking) { ui.picking = false; return render(); }
  if (ui.tab === 'record' && ui.recView && ui.recView !== 'day') { ui.recView = 'day'; return render(); }
  if (ui.tab !== 'today') { ui.tab = 'today'; ui.date = todayStr(); window.scrollTo(0, 0); return render(); }
  if (ui.date !== todayStr()) { ui.date = todayStr(); return render(); }
}
if (!window.BT_TEST) {
  window.addEventListener('popstate', () => { backArmed = false; stepBack(); syncBack(); });
  window.addEventListener('DOMContentLoaded', () => {
    // 화면을 그리는 함수가 끝날 때마다 뒤로가기 표시를 맞춤
    ['render', 'renderSheet', 'renderGuide', 'renderFocus', 'startRun'].forEach(n => {
      const f = window[n];
      if (typeof f === 'function') window[n] = function (...a) { const r = f.apply(this, a); syncBack(); return r; };
    });
  });
}

if (!window.BT_TEST) window.addEventListener('DOMContentLoaded', () => { askPersist().then(() => snapTake()).then(() => { if (ui.tab === 'settings') render(); }); });
