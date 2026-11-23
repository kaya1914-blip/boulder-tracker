#!/usr/bin/env python3
"""Gemini TTS로 한 번에 받은 녹음을 '내용'으로 조각과 말을 짝지음 (tools/make_voice.py가 부름)

Gemini TTS는 긴 목록을 읽을 때 줄을 건너뛰거나 순서를 바꾸기도 해서, 무음으로 자른 순서만 믿을 수 없습니다.
그래서 자른 소리 덩어리마다 앞에 '삐' 소리를 붙여 30개씩 묶고, Gemini 일반 모델(무료 티어 · 음성 생성과
한도가 따로)에게 받아 적게 한 뒤, 받아 적은 글과 말 목록을 비교해 짝을 정합니다.
받아 적은 결과는 .voice-cache/에 남겨 두므로 다시 돌려도 호출하지 않습니다.
"""
import array, base64, io, json, math, os, re, subprocess, sys, time, urllib.request, wave

SR = 24000
MODEL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
BATCH = 30

DIG = '영일이삼사오육칠팔구'


def num_ko(n):
    """숫자 → 한자어 읽기 (3 → 삼, 15 → 십오, 30 → 삼십)"""
    n = int(n)
    if n == 0:
        return '영'
    out = ''
    if n >= 10:
        t = n // 10
        out += ('' if t == 1 else DIG[t]) + '십'
        n %= 10
    return out + (DIG[n] if n else '')


def norm(s):
    """비교용: 숫자는 한글 읽기로, 공백·문장부호 제거, 와이/티/더블유 등 통일"""
    s = re.sub(r'\d+', lambda m: num_ko(m.group(0)), s)
    s = s.replace('Y', '와이').replace('T', '티').replace('W', '더블유').replace('V', '브이')
    return re.sub(r'[\s.,!?·~\-]', '', s)


def sim(a, b):
    """글자 2개씩 묶음 겹침 + 길이 비슷함"""
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    bg = lambda s: {s[i:i + 2] for i in range(len(s) - 1)} or {s}
    A, B = bg(a), bg(b)
    return (2 * len(A & B) / (len(A) + len(B))) * (min(len(a), len(b)) / max(len(a), len(b))) ** 0.5


def regions_of(pcm, thr=700, hold=25, min_len=0.12):
    win = int(0.01 * SR)
    loud = [max(abs(x) for x in pcm[i:i + win]) > thr for i in range(0, len(pcm) - win, win)]
    R, i = [], 0
    while i < len(loud):
        if not loud[i]:
            i += 1
            continue
        j = i
        while j < len(loud) and (loud[j] or any(loud[j:j + hold])):
            j += 1
        if (j - i) / 100 >= min_len:  # 아주 짧은 잡음(딸깍·숨소리)은 버림
            R.append((i * win, j * win))
        i = j
    return R


def transcribe(pcm, regions, key, cache_fp):
    got = json.load(open(cache_fp)) if os.path.exists(cache_fp) else {}
    beep = array.array('h', (int(9000 * math.sin(2 * math.pi * 1500 * i / SR)) for i in range(int(0.12 * SR))))
    sil = lambda s: array.array('h', bytes(2 * int(s * SR)))
    for b0 in range(0, len(regions), BATCH):
        if str(b0) in got:
            continue
        part = regions[b0:b0 + BATCH]
        a = array.array('h')
        for (s, e) in part:
            a += sil(0.5) + beep + sil(0.35) + pcm[s:e]
        a += sil(0.5)
        buf = io.BytesIO()
        with wave.open(buf, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(a.tobytes())
        mp3 = subprocess.run(['ffmpeg', '-loglevel', 'error', '-f', 'wav', '-i', '-', '-b:a', '64k', '-f', 'mp3', '-'], input=buf.getvalue(), capture_output=True, check=True).stdout
        prompt = (f"이 오디오에는 '삐' 소리가 {len(part)}번 나오고, 삐 소리마다 바로 뒤에 짧은 한국어 말이 하나씩 나옵니다. "
                  f"삐 소리 순서대로 들린 말을 정확히 받아 적어 JSON 문자열 배열 하나로만 답하세요 (항목 {len(part)}개). "
                  "숫자는 들린 대로 아라비아 숫자로 쓰세요 (예: '3회', '1분'). 들리지 않으면 빈 문자열.")
        body = {'contents': [{'role': 'user', 'parts': [{'inlineData': {'mimeType': 'audio/mp3', 'data': base64.b64encode(mp3).decode()}}, {'text': prompt}]}],
                'generationConfig': {'responseMimeType': 'application/json', 'temperature': 0}}
        for attempt in range(4):
            try:
                r = urllib.request.Request(MODEL, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
                d = json.load(urllib.request.urlopen(r, timeout=300))
                arr = json.loads(d['candidates'][0]['content']['parts'][0]['text'])
                break
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < 3:
                    time.sleep(30); continue
                raise
        if len(arr) != len(part):
            print(f"  받아 적기 {b0}: {len(arr)}개 (기대 {len(part)}개) · 개수가 달라 이 묶음은 쓰지 않음", file=sys.stderr)
            arr = [''] * len(part)
        got[str(b0)] = arr
        json.dump(got, open(cache_fp, 'w'), ensure_ascii=False)
        print(f"  받아 적기 {b0 + len(part)}/{len(regions)}", file=sys.stderr)
        time.sleep(7)  # 무료 티어 분당 한도
    out = []
    for b0 in range(0, len(regions), BATCH):
        out += got[str(b0)]
    return out


def align(pcm, phrases, texts, key, cache_fp, min_sim=0.75):
    """말마다 가장 잘 맞는 소리 덩어리를 고름. 못 찾은 말은 빠짐 (앱이 그 문장만 폰 음성으로 읽음)"""
    R = regions_of(pcm)
    heard = transcribe(pcm, R, key, cache_fp)
    pairs = []
    for i, t in enumerate(texts):
        nt = norm(t)
        for k, h in enumerate(heard):
            sc = sim(nt, norm(h))
            if sc >= min_sim:
                pairs.append((sc, i, k))
    pairs.sort(reverse=True)
    used_p, used_r, pick = set(), set(), {}
    for sc, i, k in pairs:
        if i in used_p or k in used_r:
            continue
        used_p.add(i); used_r.add(k); pick[phrases[i]] = R[k]
    miss = [p for p in phrases if p not in pick]
    print(f"  짝 맞춤: {len(pick)}/{len(phrases)} · 못 찾음 {len(miss)}: {', '.join(miss[:20])}", file=sys.stderr)
    return pick, miss
