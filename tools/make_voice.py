#!/usr/bin/env python3
"""고품질 음성 묶음 만들기 (voice/index.json + voice/<id>.mp3)

앱이 말하는 모든 조각(voice.js의 voiceVocab())을 Google Cloud Text-to-Speech 신경망 음성으로 녹음해
목소리마다 mp3 한 파일로 묶습니다. 앱은 문장을 이 조각으로 나눠 이어 붙여 재생합니다.

  python3 tools/make_voice.py --list            # 쓸 수 있는 한국어 음성 목록
  python3 tools/make_voice.py                   # VOICES에 적힌 목소리로 전부 만들기
  python3 tools/make_voice.py --fake            # API 없이 삐 소리로 만드는 시험용 (재생 엔진 점검)

API 키: 환경 변수 GOOGLE_API_KEY (없으면 헤더 없이 요청 — 네트워크 프록시가 키를 넣어 주는 환경용).
말 목록은 tools/voice_vocab.js가 앱을 브라우저로 열어 voiceVocab()을 읽어 옵니다 (Playwright 필요).
"""
import argparse, array, base64, hashlib, io, json, os, subprocess, sys, urllib.request, wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'voice')
CACHE = os.path.join(ROOT, '.voice-cache')  # 녹음 조각 캐시 (저장소에 올리지 않음)
SR = 24000
API = 'https://texttospeech.googleapis.com/v1'

# 앱에서 고를 수 있는 목소리. name은 --list로 확인한 Google 음성 이름
VOICES = [
    {'id': 'f1', 'label': '여성 · 차분', 'desc': '또렷하고 차분한 여성 코치 목소리', 'name': 'ko-KR-Chirp3-HD-Kore', 'rate': 1.05},
    {'id': 'f2', 'label': '여성 · 밝음', 'desc': '밝고 경쾌한 여성 코치 목소리', 'name': 'ko-KR-Chirp3-HD-Leda', 'rate': 1.05},
    {'id': 'm1', 'label': '남성 · 차분', 'desc': '낮고 안정적인 남성 코치 목소리', 'name': 'ko-KR-Chirp3-HD-Charon', 'rate': 1.05},
    {'id': 'm2', 'label': '남성 · 힘참', 'desc': '힘 있고 에너지 넘치는 남성 코치 목소리', 'name': 'ko-KR-Chirp3-HD-Fenrir', 'rate': 1.05},
]
# 글자 그대로 읽으면 어색한 것: 실제로 읽을 말
SAY = {
    'Y': '와이', 'T': '티', 'W': '더블유', 'V업': '브이업',
    '엎드려 Y·T·W 레이즈': '엎드려 와이 티 더블유 레이즈',
}
MARK_AT = 0.30   # 파일 맨 앞 기준 신호 위치(초). 앱이 이 신호를 찾아 mp3 앞 지연을 보정
GAP = 0.16       # 조각 사이 무음(초)
PAD = 0.02       # 조각 앞뒤로 남겨 둘 여유(초)


def req(path, body=None):
    key = os.environ.get('GOOGLE_API_KEY')
    r = urllib.request.Request(API + path, data=json.dumps(body).encode() if body else None,
                               headers={'Content-Type': 'application/json', **({'x-goog-api-key': key} if key else {})})
    with urllib.request.urlopen(r, timeout=60) as res:
        return json.load(res)


def vocab():
    out = subprocess.run(['node', os.path.join(ROOT, 'tools', 'voice_vocab.js')], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def speak_text(p):
    t = SAY.get(p, p).replace('·', ' ')
    return t


def synth(voice, phrase):
    """한 조각 녹음 → 16비트 모노 PCM (array). 캐시 사용"""
    os.makedirs(CACHE, exist_ok=True)
    h = hashlib.sha1(f"{voice['name']}|{voice['rate']}|{speak_text(phrase)}".encode()).hexdigest()[:16]
    fp = os.path.join(CACHE, h + '.wav')
    if not os.path.exists(fp):
        body = {'input': {'text': speak_text(phrase)},
                'voice': {'languageCode': 'ko-KR', 'name': voice['name']},
                'audioConfig': {'audioEncoding': 'LINEAR16', 'sampleRateHertz': SR, 'speakingRate': voice['rate']}}
        data = base64.b64decode(req('/text:synthesize', body)['audioContent'])
        with open(fp, 'wb') as f:
            f.write(data)
    with wave.open(fp) as w:
        assert w.getframerate() == SR and w.getsampwidth() == 2 and w.getnchannels() == 1, fp
        return array.array('h', w.readframes(w.getnframes()))


def fake(phrase):
    """API 없이 시험: 글자 수만큼 길이의 삐 소리"""
    import math
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


def build(voice, phrases, use_fake):
    sil = lambda sec: array.array('h', bytes(2 * int(sec * SR)))
    pcm = sil(MARK_AT)
    pcm.extend(array.array('h', [12000 if (i // 12) % 2 else -12000 for i in range(int(0.02 * SR))]))  # 기준 신호 20ms
    pcm.extend(sil(0.3))
    clips = {}
    for i, p in enumerate(phrases):
        c = trim(fake(p) if use_fake else synth(voice, p))
        clips[p] = [round(len(pcm) / SR, 4), round(len(c) / SR, 4)]
        pcm.extend(c)
        pcm.extend(sil(GAP))
        if not use_fake and (i + 1) % 25 == 0:
            print(f"  {voice['id']}: {i + 1}/{len(phrases)}", file=sys.stderr)
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    mp3 = os.path.join(OUT, voice['id'] + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'wav', '-i', '-', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '64k', mp3],
                   input=buf.getvalue(), check=True)
    return {'label': voice['label'], 'desc': voice['desc'], 'file': voice['id'] + '.mp3', 'mark': MARK_AT, 'clips': clips}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--fake', action='store_true')
    ap.add_argument('--only', help='이 id의 목소리만 (쉼표로 여러 개)')
    a = ap.parse_args()
    if a.list:
        for v in req('/voices?languageCode=ko-KR')['voices']:
            print(v['name'], v.get('ssmlGender'), v.get('naturalSampleRateHertz'))
        return
    phrases = vocab()
    os.makedirs(OUT, exist_ok=True)
    man_fp = os.path.join(OUT, 'index.json')
    man = json.load(open(man_fp)) if os.path.exists(man_fp) else {'voices': {}}
    for v in VOICES:
        if a.only and v['id'] not in a.only.split(','):
            continue
        print(f"{v['id']} {v['name']} · {len(phrases)}개", file=sys.stderr)
        man['voices'][v['id']] = build(v, phrases, a.fake)
    man['version'] = hashlib.sha1(json.dumps(man, sort_keys=True).encode()).hexdigest()[:8]
    with open(man_fp, 'w') as f:
        json.dump(man, f, ensure_ascii=False, separators=(',', ':'))
    print('완료:', man_fp, file=sys.stderr)


if __name__ == '__main__':
    main()
