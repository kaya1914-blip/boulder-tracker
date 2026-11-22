// 앱이 말하는 조각 목록(voice.js의 voiceVocab())을 JSON으로 출력합니다. tools/make_voice.py가 씁니다.
// 앱을 헤드리스 브라우저로 열어 읽으므로 Playwright가 필요합니다.
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.join(__dirname, '..', 'tests.html'));
  await p.waitForFunction(() => typeof voiceVocab === 'function');
  process.stdout.write(JSON.stringify(await p.evaluate(() => voiceVocab())));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
