#!/usr/bin/env python3
"""고품질 음성 묶음 만들기 (voice/index.json + voice/<id>.mp3)

앱이 말하는 모든 조각(voice.js의 voiceVocab())을 신경망 음성으로 녹음해 목소리마다 mp3 한 파일로 묶습니다.
앱은 문장을 이 조각으로 나눠 이어 붙여 재생합니다.

  GEMINI_API_KEY=... python3 tools/make_voice.py --only f1      # Gemini TTS (무료 티어) · 목소리 하나 = 호출 1번
  GEMINI_API_KEY=... python3 tools/make_voice.py --only f1 --fill   # 짝을 못 찾은 줄만 다시 읽히기 (TTS 호출 1번)
  GEMINI_API_KEY=... python3 tools/make_voice.py --resplit      # 받아 둔 녹음으로 다시 짝 맞추기만 (TTS 호출 없음)
  python3 tools/make_voice.py --fake                            # API 없이 삐 소리로 만드는 시험용 (재생 엔진 점검)
  GOOGLE_API_KEY=... python3 tools/make_voice.py --engine cloud # Cloud Text-to-Speech (조각마다 호출)

Gemini TTS 무료 티어는 하루 호출 수가 아주 적어서(약 10회) 조각마다 부르지 않고,
목소리 하나의 모든 조각을 한 번에 읽게 한 뒤 무음 구간에서 잘라 순서대로 붙입니다.
받은 녹음은 .voice-cache/에 남겨 두므로 자르기를 고쳐 다시 돌려도 호출을 더 쓰지 않습니다.
말 목록은 tools/voice_vocab.js가 앱을 브라우저로 열어 voiceVocab()을 읽어 옵니다 (Playwright 필요).
키는 파일에 적지 말고 환경 변수로만 넘기세요.
"""
import argparse, array, base64, hashlib, io, json, math, os, subprocess, sys, urllib.request, wave
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'voice')
CACHE = os.path.join(ROOT, '.voice-cache')  # 받은 녹음 (저장소에 올리지 않음)
SR = 24000
CLOUD = 'https://texttospeech.googleapis.com/v1'
GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent'

# 앱에서 고를 수 있는 목소리. gemini: Gemini TTS 음성 · style: 읽는 분위기 · name: Cloud TTS 음성(--engine cloud)
VOICES = [
    {'id': 'f1', 'label': '여성 · 차분', 'desc': '또렷하고 차분한 여성 코치 목소리', 'gemini': 'Kore', 'style': '차분하고 또렷하게', 'name': 'ko-KR-Chirp3-HD-Kore', 'rate': 1.05},
    {'id': 'f2', 'label': '여성 · 밝음', 'desc': '밝고 경쾌한 여성 코치 목소리', 'gemini': 'Laomedeia', 'style': '밝고 경쾌하게', 'name': 'ko-KR-Chirp3-HD-Leda', 'rate': 1.05},
    {'id': 'm1', 'label': '남성 · 차분', 'desc': '낮고 안정적인 남성 코치 목소리', 'gemini': 'Charon', 'style': '낮고 차분하게', 'name': 'ko-KR-Chirp3-HD-Charon', 'rate': 1.05},
    {'id': 'm2', 'label': '남성 · 힘참', 'desc': '힘 있고 에너지 넘치는 남성 코치 목소리', 'gemini': 'Fenrir', 'style': '힘 있고 에너지 넘치게', 'name': 'ko-KR-Chirp3-HD-Fenrir', 'rate': 1.05},
]
# 글자 그대로 읽으면 어색한 것: 실제로 읽을 말
SAY = {
    'Y': '와이', 'T': '티', 'W': '더블유', 'V업': '브이업',
    '엎드려 Y·T·W 레이즈': '엎드려 와이 티 더블유 레이즈',
}
# 초 세기(하나·둘·셋…)만 따로 다시 녹음할 때의 분위기 (--soft). 이 녹음이 전체 녹음보다 우선
# 템포에서 매초 나오는 말(초 세기·회차·구간 이름)은 짧은 목록으로 따로 다시 녹음(--soft, 호출 1번)해서 전체 녹음보다 우선.
# 10분짜리 한 번 녹음은 뒤로 갈수록 쇳소리 같은 잡음이 섞여서, 가장 자주 듣는 말은 짧고 깨끗한 녹음으로
SOFT_STYLE = '차분하고 또렷하게, 숫자는 힘을 빼고 부드럽게'
SOFT_WORDS = ['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'] + [f'{i}회' for i in range(1, 21)] + [
    '내려', '멈춤', '올려', '들어', '올라가', '내려가', '일어나', '숙여', '다시 올라가', '돌아와', '당겨', '풀어', '어깨 내려',
    '안쪽', '바깥', '위로', '아래로', '왼쪽', '오른쪽', '왼다리', '오른다리', '왼손', '오른손', '준비', '시작', '휴식']
def short_takes(phrases):
    """모든 말을 50~60줄짜리 짧은 목록 여러 개로 나눔 (긴 목록은 건너뛰기·쇳소리가 늘어서)"""
    tempo = [p for p in SOFT_WORDS if p in phrases]
    cue_re = r'^(\d+(초|분|세트|회)|.*(기|하기)$|잘했어요|다음은|세트|라운드|끝|반대쪽|전환|절반|매달려|일시정지|10초 남았어요|.*\.\s.*)$'
    import re
    rest = [p for p in phrases if p not in tempo]
    cues = [p for p in rest if re.match(cue_re, p) and len(p) <= 16]
    names = [p for p in rest if p not in cues]
    half = (len(names) + 1) // 2
    return [('tempo', tempo), ('cues', cues), ('names1', names[:half]), ('names2', names[half:])]


# 빠진 줄을 다시 읽힐 때만 쓰는 발음 (전체 녹음의 캐시가 바뀌지 않게 SAY와 따로)
FILL_SAY = {'록오프': '락 오프'}
MARK_AT = 0.30   # 파일 맨 앞 기준 신호 위치(초). 앱이 이 신호를 찾아 mp3 앞 지연을 보정
GAP = 0.16       # 조각 사이 무음(초)
PAD = 0.02       # 조각 앞뒤로 남겨 둘 여유(초)


def speak_text(p):
    return SAY.get(p, p).replace('·', ' ')


def fill_text(p):
    t = speak_text(p)
    for a, b in FILL_SAY.items():
        t = t.replace(a, b)
    return t


def vocab():
    out = subprocess.run(['node', os.path.join(ROOT, 'tools', 'voice_vocab.js')], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


# ---------- Cloud Text-to-Speech (조각마다 호출) ----------
def cloud_req(path, body=None):
    key = os.environ.get('GOOGLE_API_KEY')
    r = urllib.request.Request(CLOUD + path, data=json.dumps(body).encode() if body else None,
                               headers={'Content-Type': 'application/json', **({'x-goog-api-key': key} if key else {})})
    with urllib.request.urlopen(r, timeout=60) as res:
        return json.load(res)


def cloud_synth(voice, phrase):
    os.makedirs(CACHE, exist_ok=True)
    h = hashlib.sha1(f"{voice['name']}|{voice['rate']}|{speak_text(phrase)}".encode()).hexdigest()[:16]
    fp = os.path.join(CACHE, h + '.wav')
    if not os.path.exists(fp):
        body = {'input': {'text': speak_text(phrase)}, 'voice': {'languageCode': 'ko-KR', 'name': voice['name']},
                'audioConfig': {'audioEncoding': 'LINEAR16', 'sampleRateHertz': SR, 'speakingRate': voice['rate']}}
        with open(fp, 'wb') as f:
            f.write(base64.b64decode(cloud_req('/text:synthesize', body)['audioContent']))
    with wave.open(fp) as w:
        return array.array('h', w.readframes(w.getnframes()))


# ---------- Gemini TTS (목소리 하나 = 호출 1번, 무음에서 자르기) ----------
def gemini_record(voice, texts, tag, resplit):
    """Gemini TTS 호출 1번으로 여러 줄을 읽게 해 받은 녹음(PCM). 캐시가 있으면 호출하지 않음"""
    os.makedirs(CACHE, exist_ok=True)
    h = hashlib.sha1(json.dumps([voice['gemini'], voice['style'], texts], ensure_ascii=False).encode()).hexdigest()[:12]
    fp = os.path.join(CACHE, f"gemini_{voice['id']}_{tag}{h}.pcm")
    if not os.path.exists(fp):
        if resplit:
            return None, fp
        key = os.environ.get('GEMINI_API_KEY')
        if not key:
            raise SystemExit('GEMINI_API_KEY 환경 변수가 필요합니다')
        style = SOFT_STYLE if tag == 'tempo' else voice['style']
        if tag.startswith('names'):
            style += ', 운동 이름이니 또박또박'
        prompt = (f"운동 코치 목소리로 {style}, 아래 줄을 위에서부터 한 줄씩 빠짐없이 한 번만 읽고 줄 사이마다 2초씩 쉬어 주세요. "
                  "숫자를 세는 줄(하나, 둘, 셋…)은 힘을 빼고 부드럽게, 리듬을 타듯 가볍게 읽어 주세요:\n\n"
                  + '\n\n'.join(texts))
        body = {'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
                'generationConfig': {'responseModalities': ['AUDIO'],
                                     'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice['gemini']}}}}}
        r = urllib.request.Request(GEMINI, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
        print(f"  {voice['id']}: Gemini TTS 호출 1회 ({len(texts)}줄)", file=sys.stderr)
        d = json.load(urllib.request.urlopen(r, timeout=900))
        c = d['candidates'][0]
        if 'content' not in c:
            raise SystemExit(f"{voice['id']}: 음성이 비어서 왔습니다 (finishReason={c.get('finishReason')})")
        with open(fp, 'wb') as f:
            f.write(base64.b64decode(c['content']['parts'][0]['inlineData']['data']))
        json.dump(texts, open(fp[:-4] + '.texts.json', 'w'), ensure_ascii=False)
    return array.array('h', open(fp, 'rb').read()), fp


def gemini_batch(voice, phrases, resplit=False, fill=False, soft=False):
    """목소리 하나의 조각들: 전체 녹음(호출 1번) + 빠진 줄만 다시 읽힌 녹음(--fill, 호출 1번씩)을 받아 적어 짝 맞춤"""
    import align_voice
    key = os.environ.get('GEMINI_API_KEY', '')
    texts = [speak_text(p) for p in phrases]
    by_text = dict(zip(texts, phrases))
    cut = lambda pcm, a, b: pcm[max(0, a - int(PAD * SR)): b + int(PAD * SR)]
    pcm, fp = gemini_record(voice, texts, '', resplit)
    if pcm is not None:
        pcm = match_pitch(pcm, '전체 녹음')
    if pcm is None:
        raise SystemExit(f"{voice['id']}: 받아 둔 녹음이 없습니다 (--resplit은 호출하지 않음)")
    # FILL_SAY에 있는 말(예: 록오프)은 원래 발음으로 읽힌 녹음에서는 받지 않음 — 발음이 불분명해서 다시 받는 말
    shaky = lambda t: any(k in t for k in FILL_SAY)
    pick, miss = align_voice.align(pcm, phrases, texts, key, fp[:-4] + '.heard2.json')
    out = {p: cut(pcm, a, b) for p, (a, b) in pick.items() if not shaky(speak_text(p))}
    src = {p: 'main' for p in out}  # 말마다 어느 녹음에서 왔는지
    # 예전에 받아 둔 '빠진 줄' 녹음들
    import glob
    for ffp in sorted(glob.glob(os.path.join(CACHE, f"gemini_{voice['id']}_fill*.pcm"))):
        ft = json.load(open(ffp[:-4] + '.texts.json'))
        by_fill = {fill_text(p): p for p in phrases}
        fphr = [by_text.get(t) or by_fill.get(t) for t in ft]
        if not all(fphr):
            continue
        fpcm = match_pitch(array.array('h', open(ffp, 'rb').read()), os.path.basename(ffp))
        fpick, _ = align_voice.align(fpcm, fphr, ft, key, ffp[:-4] + '.heard2.json')
        for p, (a, b) in fpick.items():
            if not shaky(ft[fphr.index(p)]) and src.get(p) in (None, 'main'):
                out[p] = cut(fpcm, a, b); src[p] = 'fill'  # 짧은 '빠진 줄' 녹음이 긴 녹음보다 깨끗
    # 짧은 녹음들(--soft로 받음): 있으면 긴 전체 녹음보다 우선. 긴 녹음은 뒤로 갈수록 쇳소리가 섞여서
    #   tempo: 템포에서 매초 나오는 말 · cues: 안내 문장·구간 이름·시간 · names1/2: 운동 이름
    def take(tag, words, say):
        tpcm, tfp = gemini_record(voice, [say(p) for p in words], tag, resplit or not soft)
        if tpcm is None:
            return
        tpcm = match_pitch(tpcm, tag)
        tpick, _ = align_voice.align(tpcm, words, [say(p) for p in words], key, tfp[:-4] + '.heard2.json')
        for p, (a, b) in tpick.items():
            out[p] = cut(tpcm, a, b); src[p] = tag
    for tag, words in short_takes(phrases):
        take(tag, words, speak_text)
    # 짧은 녹음에서 못 찾아 아직 긴 녹음에서 오는 말 + 빠진 말 → 마지막 짧은 녹음 하나로 (--soft, 호출 1번)
    extra = [p for p in phrases if src.get(p, 'main') == 'main']
    if extra:
        take('extra', extra, fill_text)
    miss = [p for p in phrases if p not in out]
    if fill and miss:
        if resplit:
            print(f"  {voice['id']}: 빠진 {len(miss)}개는 --fill로 다시 녹음해야 합니다 (--resplit은 호출하지 않음)", file=sys.stderr)
        else:
            ftexts = [fill_text(p) for p in miss]
            fpcm, ffp = gemini_record(voice, ftexts, 'fill', False)
            fpick, _ = align_voice.align(fpcm, miss, ftexts, key, ffp[:-4] + '.heard2.json')
            for p, (a, b) in fpick.items():
                if p not in out:
                    out[p] = cut(fpcm, a, b); src[p] = 'fill'
    left = [p for p in phrases if p not in out]
    from collections import Counter
    print(f"  {voice['id']}: 녹음별 조각 수 {dict(Counter(src[p] for p in out))}", file=sys.stderr)
    print(f"  {voice['id']}: 최종 {len(out)}/{len(phrases)}개" + (f" · 아직 빠짐 {len(left)}: {', '.join(left)}" if left else ''), file=sys.stderr)
    return out


def fake(phrase):
    """API 없이 시험: 글자 수만큼 길이의 삐 소리"""
    n = int(SR * min(1.2, 0.12 + 0.09 * len(phrase)))
    f = 300 + (int(hashlib.md5(phrase.encode()).hexdigest(), 16) % 600)
    return array.array('h', (int(8000 * math.sin(2 * math.pi * f * i / SR)) for i in range(n)))


def deess(pcm):
    """'ㅅ·ㅊ·ㅎ' 같은 바람 소리가 나는 순간만 3.5kHz 위를 크게(최대 약 14dB) 줄이고, 7kHz 위는 늘 줄임.
    신경망 음성은 이 바람 소리를 금속성으로 떨리게 만들기 쉬워서(쇳소리), 모음 등 나머지는 그대로 두고 그 순간만 누름"""
    try:
        import numpy as np
    except ImportError:
        return pcm
    x = np.asarray(pcm, dtype=float)
    n, hop = 512, 128
    if len(x) < n:
        return pcm
    win = np.hanning(n)
    pad = np.concatenate([np.zeros(n), x, np.zeros(n)])
    f = np.fft.rfftfreq(n, 1 / SR)
    out = np.zeros_like(pad); norm = np.zeros_like(pad)
    hi, top = f >= 3500, f >= 7000
    for i in range(0, len(pad) - n, hop):
        spec = np.fft.rfft(pad[i:i + n] * win)
        e = np.abs(spec) ** 2
        ratio = e[f >= 4000].sum() / (e.sum() + 1e-9)
        g = np.ones_like(f)
        cut = min(1.0, max(0.0, (ratio - 0.25) / 0.35))  # 바람 소리가 셀수록 더 줄임
        g[hi] = 1 - 0.8 * cut
        g[top] *= 0.2
        out[i:i + n] += np.fft.irfft(spec * g, n) * win
        norm[i:i + n] += win ** 2
    y = out[n:n + len(x)] / np.maximum(norm[n:n + len(x)], 1e-6)
    return array.array('h', np.clip(y, -32767, 32767).astype(np.int16).tobytes())


TARGET_F0 = 185.0  # 녹음마다 목소리 높이가 조금씩 달라(176~194Hz) 문장 안에서 높낮이가 튀지 않게 이 높이로 맞춤


def median_f0(pcm):
    import numpy as np
    x = np.asarray(pcm, dtype=float); w = 960; out = []
    for i in range(0, len(x) - w, w):
        fr = x[i:i + w]
        if np.sqrt(np.mean(fr ** 2)) < 1500:
            continue
        fr = fr - fr.mean(); ac = np.correlate(fr, fr, 'full')[w - 1:]; lo, hi = SR // 400, SR // 80
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] > 0.4 * ac[0]:
            out.append(SR / k)
    return float(np.median(out)) if out else None


def match_pitch(pcm, name=''):
    """녹음 하나 전체의 목소리 높이를 TARGET_F0로 (음색 유지 · 길이 그대로라 자르는 위치도 그대로)"""
    try:
        f0 = median_f0(pcm)
    except ImportError:
        return pcm
    if not f0 or abs(12 * math.log2(TARGET_F0 / f0)) < 0.2:
        return pcm
    ratio = TARGET_F0 / f0
    out = subprocess.run(['ffmpeg', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-',
                          '-af', f'rubberband=pitch={ratio:.4f}:formant=preserved:pitchq=quality', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-'],
                         input=pcm.tobytes(), capture_output=True, check=True).stdout
    y = array.array('h', out)
    if len(y) < len(pcm):
        y.extend(array.array('h', bytes(2 * (len(pcm) - len(y)))))
    print(f"  {name}: 목소리 높이 {f0:.0f}Hz → {TARGET_F0:.0f}Hz", file=sys.stderr)
    return y[:len(pcm)]


LOUD_DB = -14.0  # 조각마다 맞출 말소리 크기 (dBFS). 녹음마다 크기가 달라 문장 안에서 소리가 튀지 않게


def normalize(pcm, target=LOUD_DB):
    """말소리가 나는 부분(조용한 앞뒤 제외)의 평균 크기를 target에 맞춤. 최대치는 -1dB를 넘지 않게"""
    try:
        import numpy as np
    except ImportError:
        return pcm
    x = np.asarray(pcm, dtype=float)
    w = int(0.02 * SR)
    fr = [x[i:i + w] for i in range(0, len(x) - w, w)]
    rms = np.array([np.sqrt(np.mean(f ** 2)) for f in fr]) if fr else np.array([0.0])
    act = rms[rms > rms.max() * 0.1] if rms.max() > 0 else rms
    cur = 20 * np.log10(np.sqrt(np.mean(act ** 2)) / 32768 + 1e-9)
    g = 10 ** ((target - cur) / 20)
    peak = np.abs(x).max() * g
    if peak > 32768 * 0.89:
        g *= 32768 * 0.89 / peak
    return array.array('h', np.clip(x * g, -32767, 32767).astype(np.int16).tobytes())


def trim(pcm, thr=500):
    """앞뒤 무음 자르기 (PAD만큼 여유)"""
    idx = [i for i in range(0, len(pcm), 48) if abs(pcm[i]) > thr]
    if not idx:
        return pcm
    pad = int(PAD * SR)
    return pcm[max(0, idx[0] - pad): min(len(pcm), idx[-1] + 48 + pad)]


def build(voice, phrases, use_fake, engine, resplit, fill=False, soft=False):
    sil = lambda sec: array.array('h', bytes(2 * int(sec * SR)))
    pcm = sil(MARK_AT)
    pcm.extend(array.array('h', [12000 if (i // 12) % 2 else -12000 for i in range(int(0.02 * SR))]))  # 기준 신호 20ms
    pcm.extend(sil(0.3))
    batch = gemini_batch(voice, phrases, resplit, fill, soft) if engine == 'gemini' and not use_fake else None
    clips = {}
    for i, p in enumerate(phrases):
        if batch is not None and p not in batch:
            continue  # 녹음에서 못 찾은 말: 묶음에서 빼면 앱이 그 문장만 폰 음성으로 읽음
        c = trim(fake(p) if use_fake else batch[p] if batch is not None else cloud_synth(voice, p))
        if not use_fake:
            c = normalize(deess(c))
        clips[p] = [round(len(pcm) / SR, 4), round(len(c) / SR, 4)]
        pcm.extend(c)
        pcm.extend(sil(GAP))
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    mp3 = os.path.join(OUT, voice['id'] + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'wav', '-i', '-', '-ac', '1',
                    # 바람 소리는 deess()에서 이미 눌렀고, 7.5kHz 위만 잘라 mp3가 높은 대역에 비트를 쓰지 않게
                    '-af', 'lowpass=f=7500', '-codec:a', 'libmp3lame', '-b:a', '112k', mp3],
                   input=buf.getvalue(), check=True)
    return {'label': voice['label'], 'desc': voice['desc'], 'file': voice['id'] + '.mp3', 'mark': MARK_AT, 'clips': clips}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', help='이 id의 목소리만 (쉼표로 여러 개)')
    ap.add_argument('--engine', choices=['gemini', 'cloud'], default='gemini')
    ap.add_argument('--resplit', action='store_true', help='받아 둔 Gemini 녹음으로 다시 짝 맞추기만 (TTS 호출 없음)')
    ap.add_argument('--fill', action='store_true', help='짝을 못 찾은 줄만 모아 TTS를 1번 더 호출해 채우기')
    ap.add_argument('--drop', help='묶음에서 뺄 목소리 id (쉼표로 여러 개)')
    ap.add_argument('--soft', action='store_true', help='초 세기(하나·둘…)만 부드럽게 다시 녹음 (TTS 호출 1번)')
    ap.add_argument('--fake', action='store_true')
    a = ap.parse_args()
    phrases = vocab()
    os.makedirs(OUT, exist_ok=True)
    man_fp = os.path.join(OUT, 'index.json')
    man = json.load(open(man_fp)) if os.path.exists(man_fp) else {'voices': {}}
    for v in VOICES:
        if a.only and v['id'] not in a.only.split(','):
            continue
        print(f"{v['id']} · {len(phrases)}개", file=sys.stderr)
        man['voices'][v['id']] = build(v, phrases, a.fake, a.engine, a.resplit, a.fill, a.soft)
    for d in (a.drop or '').split(','):
        if d and man['voices'].pop(d, None):
            fp = os.path.join(OUT, d + '.mp3')
            if os.path.exists(fp):
                os.remove(fp)
            print(f'{d}: 묶음에서 뺌', file=sys.stderr)
    man['voices'] = {k: man['voices'][k] for k in [v['id'] for v in VOICES] if k in man['voices']}  # 고르는 순서 고정
    man['version'] = hashlib.sha1(json.dumps(man, sort_keys=True).encode()).hexdigest()[:8]
    with open(man_fp, 'w') as f:
        json.dump(man, f, ensure_ascii=False, separators=(',', ':'))
    print('완료:', man_fp, file=sys.stderr)


if __name__ == '__main__':
    main()
