#!/usr/bin/env python3
"""Gemini TTS로 한 번에 받은 녹음을 '내용'으로 조각과 말을 짝지음 (tools/make_voice.py가 부름)

Gemini TTS는 긴 목록을 읽을 때 줄을 건너뛰거나, 한 줄을 두 번에 나눠 읽기도 해서 무음 순서만 믿을 수 없습니다.
1) 무음으로 소리 덩어리를 찾고  2) 덩어리마다 앞에 '삐' 소리를 붙여 묶어서 Gemini 일반 모델(무료 티어 ·
음성 생성과 한도가 따로)에게 받아 적게 한 뒤  3) 읽은 순서를 단서로 말 목록과 받아 적은 글을 정렬합니다
(한 줄이 덩어리 2~3개로 나뉜 경우도 합쳐서 맞춤). 받아 적은 결과는 .voice-cache/에 남겨 다시 호출하지 않습니다.
"""
import array, base64, io, json, math, os, re, subprocess, sys, time, urllib.request, wave

SR = 24000
# 받아 적기 모델: 무료 한도가 차면(429) 다음 모델로. 모델마다 한도가 따로
MODELS = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite']
MODEL_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent'
_dead = set()  # 오늘 한도가 찬 모델
DIG = '영일이삼사오육칠팔구'
NATIVE = ['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열', '열하나', '열둘', '열셋', '열넷', '열다섯', '열여섯', '열일곱', '열여덟', '열아홉', '스물']


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
    """비교용: 숫자는 한자어 읽기로, 공백·문장부호 제거, 와이/티/더블유 통일"""
    s = re.sub(r'\d+', lambda m: num_ko(m.group(0)), s or '')
    s = s.upper().replace('Y', '와이').replace('T', '티').replace('W', '더블유').replace('V', '브이')
    return re.sub(r'[\s.,!?·~\-]', '', s)


def heard_forms(h):
    """받아 적은 글의 비교용 형태들. 숫자만 적혀 있으면 고유어(3 → 셋)로도 봄"""
    forms = {norm(h)}
    if re.fullmatch(r'\s*\d+\s*', h or '') and 1 <= int(h) <= 20:
        forms.add(NATIVE[int(h) - 1])
    return forms


def sim(a, b):
    """글자 2개 묶음 겹침(다이스) × 길이 비슷함"""
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    bg = lambda s: {s[i:i + 2] for i in range(len(s) - 1)} or {s}
    A, B = bg(a), bg(b)
    return (2 * len(A & B) / (len(A) + len(B))) * (min(len(a), len(b)) / max(len(a), len(b))) ** 0.5


def regions_of(pcm, thr=700, hold=25, min_len=0.05):
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
        if (j - i) / 100 >= min_len:  # 딸깍 같은 아주 짧은 잡음만 버림
            R.append((i * win, j * win))
        i = j
    return R


def _ask(part_pcm, key):
    beep = array.array('h', (int(9000 * math.sin(2 * math.pi * 1500 * i / SR)) for i in range(int(0.12 * SR))))
    sil = lambda s: array.array('h', bytes(2 * int(s * SR)))
    a = array.array('h')
    for seg in part_pcm:
        a += sil(0.5) + beep + sil(0.35) + seg
    a += sil(0.5)
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(a.tobytes())
    mp3 = subprocess.run(['ffmpeg', '-loglevel', 'error', '-f', 'wav', '-i', '-', '-b:a', '64k', '-f', 'mp3', '-'],
                         input=buf.getvalue(), capture_output=True, check=True).stdout
    n = len(part_pcm)
    prompt = (f"이 오디오에는 '삐' 소리가 {n}번 나오고, 삐 소리마다 바로 뒤에 짧은 한국어 말(운동 안내)이 하나씩 나옵니다. "
              f"삐 소리 순서대로 들린 말을 그대로 받아 적어 JSON 문자열 배열 하나로만 답하세요. 항목은 정확히 {n}개. "
              "말이 소리 일부만 있으면 들린 부분만, 안 들리면 빈 문자열.")
    for m in MODELS:
        if m in _dead:
            continue
        cfg = {'responseMimeType': 'application/json', 'temperature': 0}
        if m == 'gemini-flash-latest':
            cfg['thinkingConfig'] = {'thinkingLevel': 'low'}
        body = {'contents': [{'role': 'user', 'parts': [{'inlineData': {'mimeType': 'audio/mp3', 'data': base64.b64encode(mp3).decode()}}, {'text': prompt}]}],
                'generationConfig': cfg}
        for attempt in range(3):
            try:
                r = urllib.request.Request(MODEL_URL.format(m), data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
                d = json.load(urllib.request.urlopen(r, timeout=300))
                return json.loads(d['candidates'][0]['content']['parts'][0]['text'])
            except urllib.error.HTTPError as e:
                msg = e.read()[:300].decode('utf-8', 'ignore')
                if e.code == 429 and ('PerDay' in msg or 'per day' in msg.lower() or attempt == 2):
                    print(f"  받아 적기 모델 {m}: 한도 참 → 다음 모델", file=sys.stderr); _dead.add(m); break
                if e.code in (429, 500, 503):
                    time.sleep(30); continue
                if e.code == 404:
                    _dead.add(m); break
                raise
            except (KeyError, json.JSONDecodeError):
                break  # 답이 비었거나 JSON이 아님 → 다음 모델
    raise SystemExit('받아 적기 모델 무료 한도를 모두 썼습니다 · 내일 --resplit으로 이어서 하면 됩니다')


def transcribe(pcm, regions, key, cache_fp):
    """덩어리마다 받아 적은 글 (캐시). 개수가 안 맞는 묶음은 더 작게 나눠 다시"""
    got = json.load(open(cache_fp)) if os.path.exists(cache_fp) else {}
    todo = [i for i in range(len(regions)) if str(i) not in got]
    for size in (30, 8, 1):
        if not todo:
            break
        if not key:
            raise SystemExit('받아 적기에 GEMINI_API_KEY가 필요합니다')
        left = []
        for b in range(0, len(todo), size):
            idx = todo[b:b + size]
            arr = _ask([pcm[regions[i][0]:regions[i][1]] for i in idx], key)
            if not isinstance(arr, list) or len(arr) != len(idx):
                left += idx
                continue
            for i, t in zip(idx, arr):
                got[str(i)] = str(t or '')
            json.dump(got, open(cache_fp, 'w'), ensure_ascii=False)
            print(f"  받아 적기 {len(got)}/{len(regions)}", file=sys.stderr)
            time.sleep(5)  # 무료 티어 분당 한도
        todo = left
    return [got.get(str(i), '') for i in range(len(regions))]


def _combos(lists):
    out = ['']
    for l in lists:
        out = [a + b for a in out for b in l]
    return out


def align(pcm, phrases, texts, key, cache_fp, accept=0.5):
    """읽은 순서를 단서로 말 목록 ↔ 덩어리를 정렬 (한 줄 = 덩어리 1~3개). 말 → (시작, 끝) 샘플, 못 찾은 말 목록"""
    R = regions_of(pcm)
    heard = transcribe(pcm, R, key, cache_fp)
    E = [norm(t) for t in texts]
    known = set(E)  # 받아 적은 글이 목록의 '다른' 말과 똑같으면 그 소리는 이 말이 아님 (풀업 ↔ 푸시업 같은 혼동 방지)
    n, m = len(E), len(R)
    NEG = -1e9
    dp = [[NEG] * (m + 1) for _ in range(n + 1)]
    bt = [[None] * (m + 1) for _ in range(n + 1)]
    dp[0][0] = 0.0
    for i in range(n + 1):
        for k in range(m + 1):
            cur = dp[i][k]
            if cur == NEG:
                continue
            if i < n and cur - 0.3 > dp[i + 1][k]:  # 이 줄은 읽지 않음
                dp[i + 1][k] = cur - 0.3; bt[i + 1][k] = (i, k, 0, 0.0)
            if k < m and cur - 0.3 > dp[i][k + 1]:  # 이 덩어리는 목록에 없는 소리
                dp[i][k + 1] = cur - 0.3; bt[i][k + 1] = (i, k, 0, 0.0)
            if i < n:
                for span in (1, 2, 3):
                    if k + span > m:
                        break
                    forms = _combos([heard_forms(heard[k + j]) for j in range(span)])
                    s = max(0.0 if (f in known and f != E[i]) else sim(E[i], f) for f in forms)
                    if span > 1:
                        s -= 0.05 * (span - 1)  # 합치기는 꼭 필요할 때만
                    if s < 0.3:
                        continue
                    v = cur + 2 * s - 0.6
                    if v > dp[i + 1][k + span]:
                        dp[i + 1][k + span] = v; bt[i + 1][k + span] = (i, k, span, s)
    i, k = n, max(range(m + 1), key=lambda kk: dp[n][kk])
    pick = {}
    while i > 0 or k > 0:
        b = bt[i][k]
        if b is None:
            break
        pi, pk, span, s = b
        if span and s >= accept:
            pick[phrases[pi]] = (R[pk][0], R[pk + span - 1][1])
        i, k = pi, pk
    # 덩어리 수 = 줄 수이고 대부분이 제자리에서 정확히 맞았다면, 순서가 그대로인 녹음 → 나머지도 위치로 판단
    if m == n:
        inplace = sum(1 for i in range(n) if E[i] in heard_forms(heard[i]))
        for i in range(n):
            if phrases[i] in pick:
                continue
            s_i = max(sim(E[i], f) for f in heard_forms(heard[i]))
            if (inplace >= 0.6 * n and s_i >= 0.3) or inplace >= n - 1:
                pick[phrases[i]] = R[i]
    miss = [p for p in phrases if p not in pick]
    print(f"  짝 맞춤: {len(pick)}/{len(phrases)} · 못 찾음 {len(miss)}: {', '.join(miss[:40])}{' …' if len(miss) > 40 else ''}", file=sys.stderr)
    return pick, miss
