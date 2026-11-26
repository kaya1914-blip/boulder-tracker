'use strict';
/* 음성 안내
   ① 고품질 녹음 음성: 앱에서 쓰는 말(숫자·회·초·구간·운동 이름·안내 문장)을 신경망 음성으로 미리 녹음해 voice/ 폴더에 한 파일로 묶어 두고,
      문장을 그 조각들로 나눠 이어 붙여 재생합니다. 말이 나오기까지 지연이 거의 없어 템포 박자가 정확합니다.
   ② 폰 음성: 내 폰에 설치된 한국어 음성 중 고른 것으로 읽습니다 (아이폰 '유나(프리미엄)' 등).
   녹음 묶음에 없는 말이 섞인 문장, 묶음을 아직 못 받은 경우에는 ②로 읽습니다.
   녹음 묶음은 tools/make_voice.py로 만듭니다 (말 목록은 voiceVocab()). */

const VOICE_DIR = 'voice/';
const VC = { manifest: null, loading: null, ready: {}, decoding: {}, playing: [] };

// ---------- 녹음 묶음 불러오기 ----------
function loadVoicePack() {
  if (!VC.loading) {
    VC.loading = fetch(VOICE_DIR + 'index.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .then(m => { VC.manifest = m && m.voices ? m : null; })
      .catch(() => { VC.manifest = null; });
  }
  return VC.loading;
}
const clipVoices = () => (VC.manifest ? Object.entries(VC.manifest.voices) : []);
function curClipVoice() {
  const t = T(), vs = VC.manifest && VC.manifest.voices;
  if (!vs) return null;
  return vs[t.clipVoice] ? t.clipVoice : Object.keys(vs)[0] || null;
}
// 소리 엔진(actx)이 생긴 뒤에 고른 목소리 파일을 받아 풀어 둠 (타이머 시작·미리 듣기 때)
function prepareVoice() {
  return loadVoicePack().then(() => {
    const id = curClipVoice();
    if (!id || !actx || VC.ready[id] || VC.decoding[id]) return VC.decoding[id];
    const v = VC.manifest.voices[id];
    VC.decoding[id] = fetch(VOICE_DIR + v.file)
      .then(r => { if (!r.ok) throw new Error('voice file'); return r.arrayBuffer(); })
      .then(ab => new Promise((res, rej) => actx.decodeAudioData(ab, res, rej))) // 예전 사파리는 콜백 방식만 됨
      .then(b => {
        // mp3는 앞에 미세한 지연이 붙고 그 크기가 브라우저마다 달라서, 파일 맨 앞 기준 신호를 찾아 모든 조각 위치를 보정
        const d = b.getChannelData(0), lim = Math.min(d.length, Math.round(b.sampleRate * 1.5));
        let k = 0;
        while (k < lim && Math.abs(d[k]) < 0.15) k++;
        v.delta = k < lim ? Math.max(-0.2, Math.min(0.2, k / b.sampleRate - (v.mark || 0))) : 0;
        VC.ready[id] = b;
      })
      .catch(() => { VC.ready[id] = null; })
      .finally(() => { delete VC.decoding[id]; });
    return VC.decoding[id];
  });
}
const clipActive = () => T().voiceMode !== 'device' && !!VC.ready[curClipVoice()];

// ---------- 문장 → 녹음 조각 ----------
// 가장 긴 조각부터 맞춰 봄. 조각 뒤는 문장 끝·공백·문장부호여야 함 ('1회'가 '10회'의 앞부분으로 잘못 맞지 않게).
// 마침표 뒤는 0.25초, 쉼표 뒤는 0.15초, 띄어쓰기는 0.06초 쉼.
function clipTokens(text, v) {
  const keys = v._sorted || (v._sorted = Object.keys(v.clips).sort((a, b) => b.length - a.length));
  const out = [];
  let s = String(text).trim(), gap = 0;
  while (s) {
    const m = s.match(/^[\s.,!?~]+/);
    if (m) { gap = /[.!?]/.test(m[0]) ? 0.25 : /,/.test(m[0]) ? 0.15 : 0.06; s = s.slice(m[0].length); if (!s) break; }
    const k = keys.find(x => s.startsWith(x) && (s.length === x.length || /[\s.,!?~]/.test(s[x.length])));
    if (!k) return null; // 묶음에 없는 말 → 폰 음성으로
    out.push({ key: k, gap: out.length ? gap : 0 });
    s = s.slice(k.length); gap = 0;
  }
  return out.length ? out : null;
}
function stopClips() {
  VC.playing.forEach(src => { try { src.stop(); } catch (e) { /* 이미 끝남 */ } });
  VC.playing = [];
}
// 녹음 음성으로 말하기. 못 하면 false (→ 폰 음성)
function clipSay(text) {
  if (!clipActive() || !actx || actx.state !== 'running') return false;
  const id = curClipVoice(), v = VC.manifest.voices[id], buf = VC.ready[id];
  const toks = clipTokens(text, v);
  if (!toks) return false;
  stopClips();
  try { if ('speechSynthesis' in window && speechSynthesis.speaking) speechSynthesis.cancel(); } catch (e) { /* 미지원 */ }
  const g = actx.createGain();
  g.gain.value = T().vol === 'loud' ? 1 : 0.75;
  g.connect(actx.destination);
  let at = actx.currentTime + 0.005;
  toks.forEach(({ key, gap }) => {
    const [st, du] = v.clips[key];
    at += gap;
    // 조각마다 아주 짧게 부드럽게 들어가고 빠짐 (딸깍 소리·툭 끊김 방지).
    // 초 세기(둘·셋…)는 한 단어를 또박또박 읽은 녹음이라 문장 속 말보다 세게 들려서 소리를 낮추고 더 부드럽게
    const soft = KCOUNT.includes(key), peak = soft ? 0.68 : 1, fin = soft ? 0.035 : 0.012, fout = Math.min(du / 3, soft ? 0.08 : 0.03);
    const eg = actx.createGain();
    eg.gain.setValueAtTime(0.0001, at);
    eg.gain.linearRampToValueAtTime(peak, at + fin);
    eg.gain.setValueAtTime(peak, at + du - fout);
    eg.gain.linearRampToValueAtTime(0.0001, at + du);
    eg.connect(g);
    const src = actx.createBufferSource();
    src.buffer = buf; src.connect(eg); src.start(at, Math.max(0, st + (v.delta || 0)), du);
    VC.playing.push(src);
    at += du;
  });
  return true;
}

// ---------- 폰 음성 ----------
function koVoices() { try { return speechSynthesis.getVoices().filter(v => /^ko/i.test(v.lang)); } catch (e) { return []; } }
// 품질이 좋은 음성을 먼저: 프리미엄 > 향상됨 > 신경망·온라인 음성 > 기기 내장
const voiceScore = v => (/premium|프리미엄/i.test(v.name) ? 30 : 0) + (/enhanced|향상/i.test(v.name) ? 20 : 0) + (/neural|natural|online|google|samsung|wavenet/i.test(v.name) ? 10 : 0) + (v.localService ? 1 : 0);
const voiceTag = v => (/premium|프리미엄/i.test(v.name) ? '프리미엄' : /enhanced|향상/i.test(v.name) ? '향상됨' : /neural|natural|online|google|samsung|wavenet/i.test(v.name) ? '고품질' : '기본');
function deviceVoice() {
  const vs = koVoices(), want = T().deviceVoice;
  return (want && vs.find(v => v.voiceURI === want)) || vs.slice().sort((a, b) => voiceScore(b) - voiceScore(a))[0] || null;
}
if ('speechSynthesis' in window) {
  try { speechSynthesis.addEventListener('voiceschanged', () => { if (ui.tab === 'timer' && !(RUN && RUN.on)) render(); }); } catch (e) { /* 미지원 */ }
}

// ---------- 녹음할 말 목록 (tools/make_voice.py가 읽어 감) ----------
// 타이머가 실제로 말하는 문장을 이 조각들로 나눌 수 있어야 녹음 음성으로 나옵니다. 새 운동·문장을 넣으면 여기도 함께.
const VOICE_PHRASES = [
  '준비', '시작', '매달려', '휴식', '10초 남았어요', '절반', '일시정지', '완료. 수고했어요', '휴식 끝. 다시 시작하세요',
  '세션 완료. 수고했어요', '반대쪽', '전환', '잘했어요', '다음은', '직접 하고 완료를 누르세요', '세트', '라운드', '끝',
];
// 말로 읽는 시간: 90초 → "1분 30초" (화면의 1:30과 달리)
function durSpeak(sec) {
  sec = Math.round(sec);
  const m = Math.floor(sec / 60), s = sec % 60;
  return [m ? m + '분' : '', s ? s + '초' : ''].filter(Boolean).join(' ') || '0초';
}
// 다음 운동 이름을 말할 때: 괄호(덤벨 무게 등)는 빼고
const speakName = n => String(n || '').replace(/\s*\(.*?\)/g, '').replace(/\s*\{kg\}/g, '').replace(/\s+/g, ' ').trim();
function voiceVocab() {
  const v = new Set(VOICE_PHRASES);
  KCOUNT.forEach(w => v.add(w));
  for (let i = 1; i <= 30; i++) v.add(i + '회');
  for (let i = 1; i <= 10; i++) v.add(i + '세트');
  for (let i = 1; i <= 15; i++) v.add(i + '분');
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].forEach(i => v.add(i + '초'));
  Object.values(SPOKEN).forEach(w => v.add(w));
  ['Y', 'T', 'W', '왼쪽', '오른쪽'].forEach(w => v.add(w));
  // 계획 안의 모든 템포 구간 이름·운동 이름·단계 제목
  const walk = o => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o.tempo)) o.tempo.forEach(([l]) => { v.add(l); v.add(spoken(l)); });
    if (typeof o.n === 'string') v.add(speakName(o.n));
    if (typeof o.t === 'string' && !/\{/.test(o.t)) v.add(o.t.replace(/\s*\d+(?:~\d+)?\s*분.*$/, '').trim()); // 단계 제목 (연속 진행의 "다음은 …")
    Object.values(o).forEach(walk);
  };
  walk([PLAN.steps, PLAN.variants, PLAN.levelVariants, PLAN.equipAlt, PLAN.equipPlus]);
  // 등급별 처방에서 오는 단계 이름 (집 C의 행보드·록오프 등)
  PLAN.tiers.concat(PLAN.levels).forEach(t => {
    if (t.lock) v.add(speakName(t.lock.t));
    if (t.hangT) v.add(t.hangT.replace(/\s*\d+(?:~\d+)?\s*분.*$/, '').trim());
  });
  v.add('행보드');
  v.delete('');
  return [...v].sort();
}

// ---------- 설정 화면 (타이머 탭 · 알림 카드 안) ----------
function voiceSettings() {
  const t = T(), mode = t.voiceMode === 'device' ? 'device' : 'clip';
  const seg = (k, opts, cur) => `<div class="seg theme-seg">${opts.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" data-act="t-set" data-k="${k}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (mode === 'clip') {
    const vs = clipVoices();
    body = vs.length
      ? `${vs.length > 1 ? seg('clipVoice', vs.map(([id, v]) => [id, v.label]), curClipVoice()) : ''}<p class="hint">${esc((VC.manifest.voices[curClipVoice()] || {}).desc || '')} · 녹음 음성은 폰 무음 스위치와 상관없이 미디어 음량으로 나옵니다.</p>`
      : '<p class="hint">녹음 음성 파일이 아직 없어 폰 음성으로 안내합니다.</p>';
  } else {
    const vs = koVoices().sort((a, b) => voiceScore(b) - voiceScore(a)), cur = deviceVoice();
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    body = vs.length
      ? `<label class="field"><span>내 폰의 한국어 음성</span><select data-field="t:voice">${vs.map(v => `<option value="${esc(v.voiceURI)}" ${cur && cur.voiceURI === v.voiceURI ? 'selected' : ''}>${esc(v.name)} · ${voiceTag(v)}</option>`).join('')}</select></label>`
      : '<p class="hint">이 브라우저에서 한국어 음성을 찾지 못했습니다.</p>';
    body += `<h3 class="h3">말 속도</h3>${seg('voiceRate', [['1', '보통'], ['1.1', '조금 빠르게'], ['1.25', '빠르게']], String(t.voiceRate))}
      <p class="hint">${ios ? '<b>아이폰에서 더 좋은 음성 받기:</b> 설정 → 손쉬운 사용 → 읽기 및 말하기 → 음성 → 한국어 → <b>유나(프리미엄)</b> 또는 (향상됨)을 내려받은 뒤 여기서 고르세요.' : '<b>갤럭시에서 더 좋은 음성 받기:</b> 설정 → 일반 → 글자 읽어주기(TTS) → 기본 엔진에서 Google 또는 삼성 → 한국어 음성 데이터 설치(고품질) 후 여기서 고르세요.'}</p>`;
  }
  return `<h3 class="h3">음성</h3>${seg('voiceMode', [['clip', '고품질 녹음 음성'], ['device', '폰 음성']], mode)}${body}
    <button class="sa-btn" data-act="t-vtest">${ic('play', 'fill')}음성 미리 듣기</button>`;
}
function voiceTest() {
  unlockAudio();
  const go = () => say(`준비. 1회 내려, 둘, 셋, 멈춤, 올려. 잘했어요. 휴식 ${durSpeak(90)}. 다음은 푸시업`);
  if (T().voiceMode === 'device') return go();
  prepareVoice().then(go);
}

loadVoicePack(); // 설정 화면에 목소리 목록을 보여 주려고 목록만 먼저 받아 둠 (음성 파일은 타이머를 시작할 때)
