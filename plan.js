// 계획 데이터. 운동·식단·진행표·타이머 프리셋을 바꿀 때는 이 파일만 고치면 됩니다.
'use strict';

const PLAN = {
  defaults: {
    startDate: '2026-11-16',   // 1주차 월요일
    startWeight: 65,
    targetWeight: 63,
    targetDate: '2026-12-13',
    plateauKg: 0.2,            // 주 평균 변화가 이 값 이내(또는 증가)면 정체
    fastLossKg: 0.8,           // 주 평균 감량이 이 값 초과면 과감량
    shortSleepH: 6,
    shortSleepDays: 3,
  },

  // 한 주에 채울 세션 묶음 (str 슬롯은 근력 또는 집 C)
  slots: [
    { id: 'limit', label: '한계 볼더링' },
    { id: 'str', label: '근력 (암장 또는 집 C)' },
    { id: 'volume', label: '볼륨 볼더링' },
    { id: 'homeA', label: '집 A (밀기·어깨·손목)' },
    { id: 'homeB', label: '집 B (코어·모빌리티)' },
  ],
  busySlots: ['limit', 'volume'],
  // 요일별 기본 배치 (0=일 ... 6=토). 추천의 출발점일 뿐 강제가 아님.
  baseByWeekday: { 0: 'homeB', 1: 'rest', 2: 'limit', 3: 'homeA', 4: 'strength', 5: 'rest', 6: 'volume' },
  order: ['limit', 'homeA', 'strength', 'volume', 'homeB'],

  sessions: {
    limit: { name: '한계 볼더링', short: '한계', desc: '어려운 문제 집중 공략', place: '암장', min: 120, intensity: 'high', slot: 'limit', gym: true, icon: 'bolt' },
    strength: { name: '손가락 + 당기기 근력', short: '근력', desc: '행보드 · 풀업 · 록오프', place: '암장', min: 90, intensity: 'high', slot: 'str', gym: true, icon: 'finger' },
    volume: { name: '볼륨 볼더링', short: '볼륨', desc: '갈색 많이 + 지구력', place: '암장', min: 150, intensity: 'mid', slot: 'volume', gym: true, icon: 'stack' },
    homeA: { name: '집 A · 밀기·어깨·손목', short: '집 A', desc: '푸시업 · 파이크 · Y·T·W · 손목 · 코어', place: '집', min: 40, intensity: 'mid', slot: 'homeA', gym: false, icon: 'dumbbell' },
    homeB: { name: '집 B · 코어 + 모빌리티', short: '집 B', desc: '하체 · 코어 · 고관절·흉추 풀기', place: '집', min: 35, intensity: 'low', slot: 'homeB', gym: false, icon: 'leaf' },
    homeC: { name: '집 C · 근력 대체', short: '집 C', desc: '풀업 · 록오프 · 네거티브 (근력 대체)', place: '집', min: 50, intensity: 'high', slot: 'str', gym: false, icon: 'pull' },
    rest: { name: '휴식', short: '휴식', desc: '완전 휴식 · 회복', place: '회복', min: 0, intensity: 'rest', slot: null, gym: false, icon: 'moon' },
  },

  // 주차별 진행 (1~4주, 5주 이후는 phase2)
  weeks: {
    1: { goal: '갈색 6~8, 흰색 동작 파악', hang: 0, pull: '4×5', home: 'base' },
    2: { goal: '갈색 7~8', hang: 1, pull: '4×5 (마지막 세트 6회)', home: 'reps' },
    3: { goal: '갈색 8+, 흰색 시도', hang: 2, pull: '5×5', home: 'sets' },
    4: { goal: '회복 주간 · 볼륨 절반', hang: null, pull: '3×4', home: 'deload', recovery: true },
    5: { goal: '흰색 1~2개 도전', hang: 3, pull: '5×5 (+2.5kg 시도)', home: 'sets' },
    6: { goal: '흰색 1~2개 도전', hang: 3, pull: '5×5 +2.5kg', home: 'sets' },
    7: { goal: '흰색 1~2개', hang: 4, pull: '5×5 +2.5~5kg', home: 'sets' },
    8: { goal: '흰색 1~2개 (이전 수준 회복)', hang: 4, pull: '5×5 +5kg', home: 'sets' },
  },
  hangLevels: ['발 지지 · 70% 힘', '발 지지 줄여 · 85% 힘', '맨몸 7초', '맨몸 10초', '맨몸 +2.5kg'],
  hangSeconds: [7, 7, 7, 10, 10],

  // 세션 단계. {hang} {pull}은 주차에 맞게 바뀝니다.
  // tm: 단계 옆 타이머 버튼 — rest(초) / interval / hang. ex 단계는 휴식·초 단위 횟수에서 자동으로 만듭니다.
  steps: {
    limit: [
      { id: 'w', t: '워밍업 25분', d: '보라 이하 6~8문제 · 큰 홀드 5초 매달리기 3회', tm: { kind: 'interval', title: '큰 홀드 매달리기', work: 5, rest: 25, reps: 3, sets: 1 } },
      { id: 'm', t: '본운동 60분', d: '갈색·흰색 2~3문제 · 문제당 4~6회 · 시도 간 3분 · 총 15~20회', deload: '갈색 2문제 · 총 8~10회로 절반', tm: { kind: 'rest', work: 180, title: '시도 간 휴식' } },
      { id: 'c', t: '코어 10분', d: '행잉 레그레이즈 3×10 · 플랭크 3×1분', tm: { kind: 'interval', title: '플랭크', work: 60, rest: 30, reps: 1, sets: 3, setRest: 30 } },
      { id: 'x', t: '정리 10분', d: '폼롤러 · 전완·어깨 스트레칭' },
    ],
    strength: [
      { id: 'w', t: '워밍업 20분', d: '쉬운 문제 + 큰 홀드 매달리기' },
      { id: 'h', t: '행보드 15분', d: '20mm · 7초×5 · 휴식 2~3분 · 단계: {hang}', tag: 'hang', tm: { kind: 'hang' } },
      { id: 'p', t: '풀업 {pull}', d: '세트 간 2~3분', tag: 'pull', tm: { kind: 'rest', work: 150, title: '풀업 세트 휴식' } },
      { id: 'l', t: '록오프', d: '90° 5초 · 좌우 3회 × 3세트', tag: 'pull', tm: { kind: 'interval', title: '록오프 90°', work: 5, rest: 10, reps: 6, sets: 3, setRest: 120 } },
      { id: 'e', t: '가벼운 등반 20분', d: '보라~쉬운 갈색 5~6문제' },
      { id: 'x', t: '정리 10분', d: '폼롤러 · 전완 스트레칭' },
    ],
    volume: [
      { id: 'w', t: '워밍업 30분', d: '보라 이하로 몸 풀기' },
      { id: 'b', t: '갈색 쌓기 70분', d: '문제당 최대 3회 · 완등 개수 기록', deload: '35분으로 절반', tm: { kind: 'rest', work: 120, title: '시도 간 휴식' } },
      { id: 'n', t: '지구력 20분', d: '보라 4문제 연속(사이 1분) × 3라운드 · 라운드 간 4분', deload: '2라운드', tm: { kind: 'interval', title: '지구력 서킷', work: 45, rest: 60, reps: 4, sets: 3, setRest: 240, workLabel: '등반' } },
      { id: 'x', t: '정리 15분', d: '폼롤러 · 전완·어깨 스트레칭' },
    ],
    // 집 운동 장비: 맨몸 + 5kg 덤벨 1개 + 문틀 철봉 (+ 의자·벽). 순서: 워밍업 → 큰 근육·복합 → 작은 근육·안정화 → 코어 → 정리
    // ex 옵션: reps(2주차·3주차 +2회 대상) · side(초 단위 좌우 운동: 타이머가 좌·우 한 번씩 = 1세트) · tip(요령, 휴식 옆에 표시)
    homeA: [
      { id: 'w', t: '워밍업 5분', d: '팔·손목 돌리기 · 고양이-소 8회 · 스캡 푸시업 2×10' },
      { id: 'pu', ex: { n: '푸시업', s: 3, r: '10~12', rest: '90초', reps: true, tip: '3초 내리기 · 바닥 1초 정지' } },
      { id: 'pk', ex: { n: '파이크 푸시업', s: 3, r: '6~8', rest: '90초', reps: true, tip: '머리가 손 사이 앞으로' } },
      { id: 'yt', ex: { n: '엎드려 Y·T·W 레이즈', s: 3, r: '각 6', rest: '45초', tip: '맨손 · Y→T→W 이어서 · 매회 2초 정지' } },
      { id: 'rc', ex: { n: '리버스 리스트컬 좌우', s: 3, r: '10~12', rest: '45초', tip: '5kg · 3초 내리기 · 무거우면 내릴 때만' } },
      { id: 'ts', ex: { n: '플랭크 숄더탭', s: 3, r: '좌우 10', rest: '45초', reps: true, tip: '골반 흔들림 없이' } },
      { id: 'll', ex: { n: '행잉 니레이즈 → 레그레이즈', s: 3, r: '8~10', rest: '60초' } },
      { id: 'x', t: '정리 3분', d: '문틀 가슴 스트레칭 · 전완 스트레칭 각 30초' },
    ],
    homeB: [
      { id: 'w', t: '몸풀기 5분', d: '고양이-소 10 · 오픈북 좌우 8 · 맨몸 스쿼트 10' },
      { id: 'gs', ex: { n: '고블릿 스쿼트', s: 3, r: '10', rest: '60초', reps: true, tip: '5kg · 3초 내려가 바닥 2초 정지' } },
      { id: 'rd', ex: { n: '한 발 루마니안 데드리프트 좌우', s: 3, r: '8', rest: '45초', reps: true, tip: '5kg 반대 손 · 3초 내리기' } },
      { id: 'db', ex: { n: '데드버그', s: 3, r: '좌우 8', rest: '30초', reps: true, tip: '뻗을 때 길게 내쉬기' } },
      { id: 'sp', ex: { n: '사이드 플랭크 좌우', s: 3, r: '30초', rest: '30초', side: true } },
      { id: 'hh', ex: { n: '할로우 홀드', s: 3, r: '20~30초', rest: '30초' } },
      { id: 'st', t: '개구리·피전 스트레칭', d: '개구리 1분 → 피전 왼쪽 1분 → 오른쪽 1분 · 2바퀴', tm: { kind: 'interval', title: '개구리·피전', work: 60, rest: 10, reps: 3, sets: 2, setRest: 15 } },
      { id: 'dh', ex: { n: '데드행', s: 2, r: '30초', rest: '30초', tip: '어깨 힘 빼고 늘어뜨리기 (척추 풀기)' } },
      { id: 'x', t: '흉추·전완 정리 5분', d: '의자 흉추 젖히기 · 문틀 가슴 스트레칭 · 전완 스트레칭' },
    ],
    homeC: [
      { id: 'w', t: '워밍업 10분', d: '팔 돌리기 · 스캡 풀업 2×8 · 데드행 20초 · 쉬운 풀업 2×3' },
      { id: 'p', ex: { n: '풀업', s: 5, r: '5', rest: '2~3분', tip: '턱 위 1초 정지 · 2초 내리기' }, tag: 'pull' },
      { id: 'l', t: '록오프', d: '90°·120° 각 5초 × 3 · 3세트 · 휴식 2분', tag: 'pull', tm: { kind: 'interval', title: '록오프 90°·120°', work: 5, rest: 10, reps: 6, sets: 3, setRest: 120 } },
      { id: 'ng', ex: { n: '5초 네거티브 풀업', s: 3, r: '3', rest: '2분' }, tag: 'pull' },
      { id: 'po', ex: { n: '덤벨 풀오버 (바닥)', s: 3, r: '12', rest: '60초', tip: '5kg 양손 · 3초 내리기' } },
      { id: 'sc', ex: { n: '스캡 풀업', s: 3, r: '8', rest: '60초', tip: '아래·위 각 2초 정지' } },
      { id: 'll', ex: { n: '행잉 레그레이즈', s: 3, r: '8', rest: '60초' } },
      { id: 'x', t: '정리 5분', d: '광배·전완 스트레칭 · 가슴 스트레칭' },
    ],
    rest: [
      { id: 'r', t: '완전 휴식', d: '가벼운 걷기 · 스트레칭은 자유' },
    ],
  },

  // 행보드 타이머
  // 보드별 그립 목록 (def = 기본 그립). 깊이(mm)는 리뷰 실측값 기준이며 보드마다 ±1~2mm 차이가 납니다.
  boards: {
    bm1000: {
      name: '비스트메이커 1000', short: 'BM 1000', def: '4손가락 엣지 20mm',
      grips: ['저그 (양끝)', '슬로퍼 20°', '슬로퍼 35°',
        '4손가락 엣지 50mm (가운데, 아주 깊음)', '4손가락 엣지 45mm', '4손가락 엣지 20mm', '4손가락 엣지 15mm (가장 작음)',
        '3손가락 포켓 45mm', '3손가락 엣지 30mm', '3손가락 포켓 20mm',
        '2손가락 포켓 50mm', '2손가락 포켓 25mm'],
    },
    bm2000: {
      name: '비스트메이커 2000', short: 'BM 2000', def: '4손가락 엣지 22mm (가운데 레일)',
      grips: ['마우스 저그 (가운데 위)', '슬로퍼 20°', '슬로퍼 35°', '슬로퍼 45°',
        '4손가락 엣지 50mm (가운데)', '4손가락 엣지 32mm', '4손가락 엣지 25mm (가운데)', '4손가락 엣지 22mm (가운데 레일)', '4손가락 엣지 14mm (가장 작음)',
        '3손가락 포켓 38mm', '3손가락 포켓 19mm',
        '2손가락 포켓 35mm', '2손가락 포켓 32mm', '2손가락 포켓 22mm (경사)', '2손가락 포켓 19mm', '뒤 2손가락 포켓 (약지·새끼)',
        '모노 포켓 (깊음)', '모노 포켓 (경사)'],
    },
    other: {
      name: '기타 행보드', short: '기타', def: '20mm 하프크림프',
      grips: ['20mm 하프크림프', '20mm 오픈핸드', '20mm 앞 3손가락', '25mm 엣지', '15mm 엣지', '3손가락 포켓', '앞 2손가락 포켓', '슬로퍼 20°', '슬로퍼 35°', '저그'],
    },
  },
  hangPresets: [
    { id: 'today', name: '오늘 권장', sub: '계획 진행표 기준' },
    { id: 'max10', name: '맥스 행', sub: '10초 × 5 · 휴식 3분', cfg: { prep: 10, work: 10, rest: 0, reps: 1, sets: 5, setRest: 180 } },
    { id: 'rep73', name: '리피터 7/3', sub: '7초 매달리고 3초 × 6 · 3세트', cfg: { prep: 10, work: 7, rest: 3, reps: 6, sets: 3, setRest: 180 } },
    { id: 'end105', name: '지구력 10/5', sub: '10초/5초 × 5 · 4세트', cfg: { prep: 10, work: 10, rest: 5, reps: 5, sets: 4, setRest: 120 } },
  ],
  intervalPresets: [
    { id: 'circuit', name: '지구력 서킷', sub: '등반 45초 / 1분 × 4 · 3라운드', cfg: { prep: 5, work: 45, rest: 60, reps: 4, sets: 3, setRest: 240, workLabel: '등반' } },
    { id: 'plank', name: '플랭크', sub: '1분 × 3', cfg: { prep: 5, work: 60, rest: 30, reps: 1, sets: 3, setRest: 30 } },
    { id: 'deadhang', name: '데드행', sub: '20초 × 3', cfg: { prep: 5, work: 20, rest: 40, reps: 1, sets: 3, setRest: 40 } },
    { id: 'lockoff', name: '록오프', sub: '5초 × 6 · 3세트', cfg: { prep: 5, work: 5, rest: 10, reps: 6, sets: 3, setRest: 120 } },
  ],
  restPresets: [60, 90, 120, 150, 180, 240, 300],

  // 식단: 끼니별 추천 구성 [음식 id, 수량]. 음식 칼로리는 foods.js에 있습니다.
  // 'RICE'는 그날 밥 양(암장 날 2/3공기, 쉬는 날 1/3공기)으로 바뀝니다.
  meals: {
    gym: [
      { id: 'b', t: '아침', sug: [['juice', 1], ['egg', 2]] },
      { id: 'l', t: '점심', sug: [['sides', 1], ['RICE', 1]], tip: '단백질 반찬 먼저' },
      { id: 'e', t: '운동 1~1.5시간 전', sug: [['egg', 2]] },
      { id: 'n', t: '운동 30분~1시간 전', sug: [['banana', 1]] },
      { id: 'i', t: '운동 중', sug: [['sportsdrink', 1]], longOnly: true, tip: '또는 양갱 1개' },
      { id: 'a', t: '운동 직후', sug: [['protein', 1]], tip: '또는 두유 1팩' },
      { id: 'd', t: '저녁', sug: 'DINNER' },
      { id: 'o', t: '기타 · 간식', sug: [] },
    ],
    rest: [
      { id: 'b', t: '아침', sug: [['juice', 1], ['egg', 2]] },
      { id: 'l', t: '점심', sug: [['sides', 1], ['RICE', 1]], tip: '밥 조금, 반찬 위주' },
      { id: 's', t: '오후 간식', sug: [['protein', 1], ['nuts', 1]], tip: '단백질 음료 대신 두유도 OK' },
      { id: 'd', t: '저녁', sug: 'DINNER' },
      { id: 'o', t: '기타 · 간식', sug: [] },
    ],
    dayWorkoutLunch: [['rice', 1], ['egg', 2], ['tofu', 1]],
    fastLossExtra: ['bread', 1],
    rice: { gym: 2 / 3, rest: 1 / 3 },
    proteinTarget: 120,
    kcalTarget: { gym: 1950, rest: 1650 },
  },
  // 저녁 추천 메뉴. rice: true면 그날 밥 양을 함께 넣습니다.
  dinners: [
    { n: '닭가슴살 스테이크 + 샐러드', items: [['chstk', 1.5], ['salad', 1]], rice: true },
    { n: '제육볶음 + 쌈', items: [['jeyuk', 1], ['ssam', 1]], rice: true },
    { n: '두부 + 계란 + 김치찌개', items: [['tofu', 1], ['egg', 2], ['kimchistew', 1]], rice: true },
    { n: '연어 구이 + 된장국', items: [['salmon', 1.5], ['doenjang', 1]], rice: true },
    { n: '고등어 구이 + 된장국', items: [['mackerel', 1], ['doenjang', 1]], rice: true },
    { n: '소불고기 + 김치', items: [['bulgogi', 1], ['kimchi', 1]], rice: true },
    { n: '돼지국밥', items: [['gukbap', 1]] },
    { n: '생선구이 정식', items: [['fishset', 1]] },
    { n: '소고기 샤브샤브 (죽·면 생략)', items: [['shabu', 1]] },
    { n: '포케 (소스 반)', items: [['poke', 1]] },
    { n: '보쌈 (막국수 제외)', items: [['bossam', 1], ['ssam', 1], ['kimchi', 1]], rice: true },
  ],
  avoid: '치킨 · 튀김 · 단 음료 · 운동 후 야식 · 면+밥 조합 · 술은 주 1회 이하, 암장 날 금지',

  sundayPrep: [
    { id: 'eg', t: '계란 8~10개 삶기 (9분)' },
    { id: 'pd', t: '단백질 음료를 회사 서랍·가방에 넣어두기' },
    { id: 'sn', t: '운동 가방에 바나나·양갱·스포츠음료 챙기기' },
    { id: 'mn', t: '평일 집밥 2번 메뉴 정하기' },
    { id: 'sh', t: '장보기 (아래 목록)' },
  ],
  shopping: '계란 15~20 · 바나나 1송이 · 단백질 음료 6 · 두유 4 · 냉동 닭가슴살 4 · 생선 2토막 · 두부 1모 · 견과류 4봉 · 햇반 4 (약 4~5만 원)',
};
