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
        prompt = (f"운동 코치 목소리로 {voice['style']}, 아래 줄을 위에서부터 한 줄씩 빠짐없이 한 번만 읽고 줄 사이마다 2초씩 쉬어 주세요:\n\n"
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


def gemini_batch(voice, phrases, resplit=False, fill=False):
    """목소리 하나의 조각들: 전체 녹음(호출 1번) + 빠진 줄만 다시 읽힌 녹음(--fill, 호출 1번씩)을 받아 적어 짝 맞춤"""
    import align_voice
    key = os.environ.get('GEMINI_API_KEY', '')
    texts = [speak_text(p) for p in phrases]
    by_text = dict(zip(texts, phrases))
    cut = lambda pcm, a, b: pcm[max(0, a - int(PAD * SR)): b + int(PAD * SR)]
    pcm, fp = gemini_record(voice, texts, '', resplit)
    if pcm is None:
        raise SystemExit(f"{voice['id']}: 받아 둔 녹음이 없습니다 (--resplit은 호출하지 않음)")
    # FILL_SAY에 있는 말(예: 록오프)은 원래 발음으로 읽힌 녹음에서는 받지 않음 — 발음이 불분명해서 다시 받는 말
    shaky = lambda t: any(k in t for k in FILL_SAY)
    pick, miss = align_voice.align(pcm, phrases, texts, key, fp[:-4] + '.heard2.json')
    out = {p: cut(pcm, a, b) for p, (a, b) in pick.items() if not shaky(speak_text(p))}
    # 예전에 받아 둔 '빠진 줄' 녹음들
    import glob
    for ffp in sorted(glob.glob(os.path.join(CACHE, f"gemini_{voice['id']}_fill*.pcm"))):
        ft = json.load(open(ffp[:-4] + '.texts.json'))
        by_fill = {fill_text(p): p for p in phrases}
        fphr = [by_text.get(t) or by_fill.get(t) for t in ft]
        if not all(fphr):
            continue
        fpcm = array.array('h', open(ffp, 'rb').read())
        fpick, _ = align_voice.align(fpcm, fphr, ft, key, ffp[:-4] + '.heard2.json')
        for p, (a, b) in fpick.items():
            if not shaky(ft[fphr.index(p)]):
                out.setdefault(p, cut(fpcm, a, b))
    miss = [p for p in phrases if p not in out]
    if fill and miss:
        if resplit:
            print(f"  {voice['id']}: 빠진 {len(miss)}개는 --fill로 다시 녹음해야 합니다 (--resplit은 호출하지 않음)", file=sys.stderr)
        else:
            ftexts = [fill_text(p) for p in miss]
            fpcm, ffp = gemini_record(voice, ftexts, 'fill', False)
            fpick, _ = align_voice.align(fpcm, miss, ftexts, key, ffp[:-4] + '.heard2.json')
            for p, (a, b) in fpick.items():
                out.setdefault(p, cut(fpcm, a, b))
    left = [p for p in phrases if p not in out]
    print(f"  {voice['id']}: 최종 {len(out)}/{len(phrases)}개" + (f" · 아직 빠짐 {len(left)}: {', '.join(left)}" if left else ''), file=sys.stderr)
    return out


def fake(phrase):
    """API 없이 시험: 글자 수만큼 길이의 삐 소리"""
    n = int(SR * min(1.2, 0.12 + 0.09 * len(phrase)))
    f = 300 + (int(hashlib.md5(phrase.encode()).hexdigest(), 16) % 600)
    return array.array('h', (int(8000 * math.sin(2 * math.pi * f * i / SR)) for i in range(n)))


def trim(pcm, thr=500):
    """앞뒤 무음 자르기 (PAD만큼 여유)"""
    idx = [i for i in range(0, len(pcm), 48) if abs(pcm[i]) > thr]
    if not idx:
        return pcm
    pad = int(PAD * SR)
    return pcm[max(0, idx[0] - pad): min(len(pcm), idx[-1] + 48 + pad)]


def build(voice, phrases, use_fake, engine, resplit, fill=False):
    sil = lambda sec: array.array('h', bytes(2 * int(sec * SR)))
    pcm = sil(MARK_AT)
    pcm.extend(array.array('h', [12000 if (i // 12) % 2 else -12000 for i in range(int(0.02 * SR))]))  # 기준 신호 20ms
    pcm.extend(sil(0.3))
    batch = gemini_batch(voice, phrases, resplit, fill) if engine == 'gemini' and not use_fake else None
    clips = {}
    for i, p in enumerate(phrases):
        if batch is not None and p not in batch:
            continue  # 녹음에서 못 찾은 말: 묶음에서 빼면 앱이 그 문장만 폰 음성으로 읽음
        c = trim(fake(p) if use_fake else batch[p] if batch is not None else cloud_synth(voice, p))
        clips[p] = [round(len(pcm) / SR, 4), round(len(c) / SR, 4)]
        pcm.extend(c)
        pcm.extend(sil(GAP))
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    mp3 = os.path.join(OUT, voice['id'] + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'wav', '-i', '-', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '64k', mp3],
                   input=buf.getvalue(), check=True)
    return {'label': voice['label'], 'desc': voice['desc'], 'file': voice['id'] + '.mp3', 'mark': MARK_AT, 'clips': clips}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', help='이 id의 목소리만 (쉼표로 여러 개)')
    ap.add_argument('--engine', choices=['gemini', 'cloud'], default='gemini')
    ap.add_argument('--resplit', action='store_true', help='받아 둔 Gemini 녹음으로 다시 짝 맞추기만 (TTS 호출 없음)')
    ap.add_argument('--fill', action='store_true', help='짝을 못 찾은 줄만 모아 TTS를 1번 더 호출해 채우기')
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
        man['voices'][v['id']] = build(v, phrases, a.fake, a.engine, a.resplit, a.fill)
    man['voices'] = {k: man['voices'][k] for k in [v['id'] for v in VOICES] if k in man['voices']}  # 고르는 순서 고정
    man['version'] = hashlib.sha1(json.dumps(man, sort_keys=True).encode()).hexdigest()[:8]
    with open(man_fp, 'w') as f:
        json.dump(man, f, ensure_ascii=False, separators=(',', ':'))
    print('완료:', man_fp, file=sys.stderr)


if __name__ == '__main__':
    main()
