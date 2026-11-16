'use strict';
/* 훈련 엔진: 운동량·회복·컨디션 점수·오늘 추천·체중 대비 근력 평가.
   화면을 그리지 않고 계산만 합니다(tests.html에서 상황별로 검사). 숫자 기준은 plan.js의 recovery·tracks·bench. */

const RC = () => PLAN.recovery;
const DEF_RPE = PLAN.recovery.defRpe;
const trackOf = () => (PLAN.tracks[state.settings.track] ? state.settings.track : 'up');
const TR = () => PLAN.tracks[trackOf()];
const usesFingers = id => !!id && !!S(id) && (S(id).gym || id === 'homeC');

// ---------- 운동량: 시간(분) × 힘든 정도(RPE) ----------
function loadOf(d) {
  const x = day(d), s = S(x.session);
  if (!s || x.session === 'rest') return null;
  const min = isNum(x.dur) ? x.dur : s.min, rpe = isNum(x.rpe) ? x.rpe : DEF_RPE[s.intensity];
  const finger = usesFingers(x.session);
  return { id: x.session, min, rpe, au: min * rpe, finger, hard: s.intensity === 'high' || rpe >= RC().hardRpe || (finger && min >= RC().fingerHardMin), logged: isNum(x.dur) || isNum(x.rpe) };
}
function recovery(date) {
  const L = i => loadOf(addDays(date, -i));
  const y = L(1);
  let consec = 0; while (consec < 7 && L(consec + 1)) consec++;
  let lastHardFinger = null; for (let i = 1; i <= 7; i++) { const l = L(i); if (l && l.finger && l.hard) { lastHardFinger = i; break; } }
  let acute = 0, chronic = 0, span = 0;
  for (let i = 1; i <= 28; i++) { const l = L(i), au = l ? l.au : 0; if (i <= 7) acute += au; chronic += au; if (state.days[addDays(date, -i)]) span = i; }
  const base = span >= 14 ? chronic / span * 7 : null; // 기록이 2주 이상일 때만 비교
  const x = day(date), px = day(addDays(date, -1));
  return { y, consec, lastHardFinger, acute, ratio: base ? acute / base : null, pain: !!(x.finger || px.finger), elbow: !!(x.elbow || px.elbow), weak: !!x.weak };
}

// ---------- 컨디션 점수 0~100 ----------
// 수면·통증·근육통·힘 떨어짐·어제 운동량·연속 운동·7일 부하 급증을 합쳐 하나의 점수로
function readiness(date) {
  const x = day(date), rc = recovery(date), why = [];
  let sc = 100;
  const hit = (n, t) => { if (n > 0) { sc -= n; why.push(t); } };
  if (isNum(x.sleep)) hit(x.sleep < 5 ? 25 : x.sleep < 6 ? 15 : x.sleep < 7 ? 6 : 0, `수면 ${x.sleep}시간`);
  if (x.finger) hit(30, '손가락 통증');
  if (x.elbow) hit(20, '팔꿈치 통증');
  if (x.sore) hit(10, '근육통');
  if (x.weak) hit(15, '힘 떨어짐');
  if (rc.y) hit(Math.min(25, Math.round(rc.y.au / 60)), `어제 ${S(rc.y.id).short} ${rc.y.min}분·RPE ${rc.y.rpe}`);
  if (rc.consec >= 2) hit((rc.consec - 1) * 5, `${rc.consec}일 연속 운동`);
  if (rc.ratio && rc.acute >= RC().acwrMinLoad) hit(rc.ratio > RC().acwrMax ? 20 : rc.ratio > 1.3 ? 10 : 0, `7일 부하 평소의 ${rc.ratio.toFixed(1)}배`);
  sc = Math.max(0, Math.min(100, Math.round(sc)));
  const lv = sc >= 80 ? ['good', '좋음', '고강도 OK'] : sc >= RC().readyHigh ? ['ok', '보통', '계획대로'] : sc >= RC().readyLow ? ['low', '낮음', '가볍게'] : ['bad', '회복 필요', '쉬기'];
  return { score: sc, lv: lv[0], label: lv[1], advice: lv[2], why, logged: isNum(x.sleep) };
}

function recLine(rc) {
  const bits = [rc.y ? `어제 ${S(rc.y.id).short} ${rc.y.min}분 · RPE ${rc.y.rpe}${rc.y.logged ? '' : ' (기본값)'}` : '어제 휴식'];
  if (rc.consec >= 2) bits.push(`${rc.consec}일 연속 운동`);
  if (rc.lastHardFinger) bits.push(`힘든 손가락 운동 ${rc.lastHardFinger * 24}시간 전`);
  if (rc.ratio) bits.push(`7일 부하 평소의 ${rc.ratio.toFixed(1)}배`);
  return bits.join(' · ');
}

// ---------- 오늘 세션 추천 (회복 기반) ----------
//  · 손가락 많이 쓴 다음 날은 손가락 고강도 금지 → 집 운동 또는 휴식 (힘줄·인대 회복 48시간)
//  · 고강도는 마지막 힘든 손가락 운동에서 highGapDays 이상 지나야
//  · 연속 운동·7일 부하 급증·통증·컨디션 점수 낮음 → 휴식/회복
//  · 주간 묶음(한계·근력·볼륨·집 A·집 B)은 남은 날 수에 맞춰 채움
//  · 클라이머 유형(입문·복귀·레벨업)별 추가 규칙
function recommend(date) {
  const mon = mondayOf(date), dates = weekDates(mon), st = state.settings, R = RC(), T = TR();
  const other = d => (d === date ? null : sessOn(d));
  const busy = !!(state.weeks[mon] && state.weeks[mon].busy);
  const req = busy ? PLAN.busySlots : PLAN.slots.map(s => s.id);
  const used = new Set(dates.map(other).map(slotOf).filter(Boolean));
  const remaining = req.filter(s => !used.has(s));
  const free = dates.filter(d => d >= date && !other(d));
  const slack = free.length - remaining.length;
  const rc = recovery(date), y = rc.y, rd = readiness(date);
  const yHigh = isHigh(other(addDays(date, -1))), tHigh = isHigh(other(addDays(date, 1)));
  const sleepBad = liveFlags(date).short >= st.shortSleepDays || verdict(addDays(mon, -7)).flags.sleep;
  const yClimb = !!(y && S(y.id).gym);
  const fingerOk = !rc.pain && !(y && y.finger && (y.hard || rc.consec >= 2)) && !(T.noBackToBackClimb && yClimb);
  const canHigh = fingerOk && rd.score >= R.readyHigh && !tHigh && !(rc.lastHardFinger && rc.lastHardFinger < R.highGapDays) && !(y && y.hard);
  const has = id => remaining.includes(slotOf(id));
  const allowed = id => has(id) && (!isHigh(id) || canHigh) && (!usesFingers(id) || fingerOk);
  const pickFrom = list => list.find(allowed);
  let id, why;
  if (rc.pain) {
    id = pickFrom(['homeB']) || 'rest';
    why = '손가락 통증 기록 → 손가락 쓰는 운동은 쉬고 ' + (id === 'rest' ? '휴식' : '코어·모빌리티만');
  } else if (!remaining.length) {
    id = 'rest'; why = busy ? '바쁜 주 필수 세션(한계·볼륨)을 다 채웠습니다' : '이번 주 세션을 다 채웠습니다 · 회복';
  } else if (rc.consec >= R.consecRest) {
    id = 'rest'; why = `${rc.consec}일 연속 운동 → 오늘은 완전 휴식 (피로 누적)`;
  } else if (rd.score < R.readyLow) {
    id = pickFrom(['homeB']) || 'rest'; why = `컨디션 ${rd.score}점 (${rd.why.slice(0, 2).join(', ')}) → 오늘은 회복`;
  } else if (rc.ratio && rc.ratio > R.acwrMax && rc.acute > R.acwrMinLoad) {
    id = pickFrom(['homeB']) || 'rest'; why = `최근 7일 운동량이 평소의 ${rc.ratio.toFixed(1)}배 → 부상 위험 구간, 오늘은 가볍게`;
  } else if (!fingerOk && y && y.finger) {
    // 어제 손가락을 많이 씀 → 오늘은 손가락 안 쓰는 집 운동 또는 휴식
    const veryHard = y.au >= R.veryHardLoad || rc.consec >= 2;
    id = pickFrom(veryHard ? ['homeB', 'homeA'] : ['homeA', 'homeB']);
    if (!id || (veryHard && rc.consec >= 2 && slack > 0)) id = 'rest';
    const cause = T.noBackToBackClimb && !y.hard ? '입문 단계는 이틀 연속 암장을 피합니다' : '손가락 힘줄은 48시간 회복 필요';
    why = `어제 ${S(y.id).short} ${y.min}분(RPE ${y.rpe}) → ${cause}. ` + (id === 'rest' ? '오늘은 휴식' : `오늘은 손가락 안 쓰는 ${S(id).short}${veryHard ? ' (가벼운 회복 운동)' : ''}`);
  } else if (canHigh && (has('limit') || has('strength'))) {
    id = has('limit') ? 'limit' : 'strength';
    why = rc.lastHardFinger ? `마지막 힘든 손가락 운동에서 ${rc.lastHardFinger * 24}시간 이상 회복 · 컨디션 ${rd.score}점 → 고강도 하기 좋은 날` : `충분히 쉬었고 컨디션 ${rd.score}점 → 고강도 하기 좋은 날`;
  } else {
    id = pickFrom(['volume', 'homeA', 'homeB', 'strength', 'limit']);
    why = !id ? '회복 중이라 오늘 맞는 세션이 없습니다 → 휴식'
      : rd.score < R.readyHigh ? `컨디션 ${rd.score}점 → 고강도 대신 ${S(id).short}`
      : yHigh ? '어제 고강도 → 오늘은 강도를 낮춰서' : tHigh ? '내일 고강도 예정 → 오늘은 강도를 낮춰서' : '회복 상태에 맞는 다음 세션';
    if (!id) id = 'rest';
    else if (slack > 1 && y && rc.consec >= 2 && !isHigh(id) && S(id).intensity !== 'low') { id = 'rest'; why = `${rc.consec}일 연속 운동 · 이번 주 여유 ${slack}일 → 오늘은 휴식`; }
  }
  if (id === 'limit' && sleepBad && has('volume')) { id = 'volume'; why = '수면 부족이 잦음 → 한계 대신 볼륨'; }
  if (id === 'limit' && rc.weak && has('volume')) { id = 'volume'; why = '오늘 힘 떨어짐 → 한계 대신 볼륨'; }
  if (id === 'limit' && T.noLimitWeek1 && weekNo(date) <= 1 && has('volume')) { id = 'volume'; why = '복귀 1주차 → 한계 대신 볼륨으로 감 되찾기'; }
  return { id, why, status: recLine(rc), rc, rd, remaining, busy, canHigh, fingerOk, yHigh, tHigh, slack, free };
}

// ---------- 추천을 따랐는지 (피드백) ----------
// 날마다 추천과 실제 세션을 저장해 두고, 회복 권고를 무시한 뒤 통증이 생긴 경우를 찾아 알려줍니다.
function overrideStats(date, days = 28) {
  let n = 0, risky = 0, painAfter = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(date, -i), x = day(d);
    if (!x.rec || !x.session || x.rec === x.session) continue;
    n++;
    const ignoredRest = (x.rec === 'rest' || !usesFingers(x.rec)) && usesFingers(x.session);
    if (ignoredRest) {
      risky++;
      if ([1, 2].some(k => { const z = day(addDays(d, k)); return z.finger || z.elbow; })) painAfter++;
    }
  }
  return { n, risky, painAfter };
}

// ---------- 체중 대비 근력 (체력 측정) ----------
function interpV(tbl, pct) {
  if (!isNum(pct)) return null;
  if (pct <= tbl[0][0]) return tbl[0][1];
  for (let i = 1; i < tbl.length; i++) {
    const [p1, v1] = tbl[i - 1], [p2, v2] = tbl[i];
    if (pct <= p2) return v1 + (v2 - v1) * (pct - p1) / (p2 - p1);
  }
  const [pa, va] = tbl[tbl.length - 2], [pb, vb] = tbl[tbl.length - 1];
  return Math.min(13, vb + (pct - pb) * (vb - va) / (pb - pa));
}
// 측정 한 번 → 체중 대비 % 와 힘 기준 예상 등급
function benchOf(t) {
  if (!t || !isNum(t.bw)) return null;
  const hangPct = isNum(t.hang) ? (t.bw + t.hang) / t.bw * 100 : null;
  // 풀업: 추가무게 1회 최대가 있으면 그것, 없으면 맨몸 최대 횟수로 1회 최대 추정(Epley)
  const pull1 = isNum(t.pull) ? t.bw + t.pull : isNum(t.reps) && t.reps > 0 ? t.bw * (1 + t.reps / 30) : null;
  const pullPct = isNum(pull1) ? pull1 / t.bw * 100 : null;
  const vh = interpV(PLAN.bench.hang, hangPct), vp = interpV(PLAN.bench.pull, pullPct);
  const vs = [vh, vp].filter(isNum);
  const ht = isNum(t.height) ? t.height : state.settings.heightCm;
  return {
    hangPct, pullPct, vh, vp, v: vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null,
    bmi: isNum(ht) ? t.bw / (ht / 100) ** 2 : null,
    ape: isNum(t.span) && isNum(ht) ? t.span - ht : null,
  };
}
// 실제 완등 실력: 최근 180일 자연 바위 최고 완등과 설정 레벨 중 높은 쪽
function sendLevel(date = todayStr()) {
  const from = addDays(date, -180);
  const outs = (state.outdoor || []).filter(o => o.date >= from && o.date <= date && o.style !== 'project' && isNum(o.v));
  const best = outs.length ? Math.max(...outs.map(o => o.v)) : null;
  return { best, v: Math.max(isNum(best) ? best : -1, lvlSet() ? lvl() : -1), outdoor: best };
}
// 힘과 실력의 차이로 무엇이 부족한지
function diagnose(b, perfV) {
  if (!b || !isNum(b.v) || !isNum(perfV) || perfV < 0) return null;
  const gap = b.v - perfV;
  if (gap >= 1.5) return { k: 'tech', t: '힘은 충분 · 기술과 전략이 제한 요인', d: `힘 기준으로는 V${Math.round(b.v)} 수준인데 완등은 V${perfV}입니다. 볼륨 세션의 기술 드릴(발 위치, 몸 각도, 리딩)과 자연 바위 문제 수를 늘리고, 근력 세션 비중은 유지만 하세요.` };
  if (gap <= -1.5) return { k: 'str', t: '힘이 제한 요인', d: `완등은 V${perfV}인데 힘 기준은 V${Math.round(b.v)} 수준입니다. 근력 세션(행보드·무게 풀업)을 빠뜨리지 말고, 체중 대비 근력을 올리는 쪽(근력↑ 또는 체지방↓)이 등급 향상에 가장 빠릅니다.` };
  return { k: 'bal', t: '힘과 기술이 균형', d: `힘 기준 V${Math.round(b.v)} · 완등 V${perfV}로 비슷합니다. 지금 프로그램대로 한계 세션과 근력 세션을 고르게 가져가세요.` };
}
