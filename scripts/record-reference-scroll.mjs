import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';

const target = process.env.RECORD_URL || 'https://toss.im/';
const base = new URL(`../artifacts/${process.env.RECORD_FOLDER || 'toss-reference'}/`, import.meta.url);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--window-size=1500,1100', '--lang=ko-KR', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
try {
  for (const [name, width, height, mobile] of [['desktop', 1440, 900, false], ['mobile', 390, 844, true]]) {
    if (process.argv[2] && process.argv[2] !== name) continue;
    const folder = new URL(`${name}/`, base);
    await mkdir(folder, { recursive: true });
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9' });
    if (process.env.MOCK_API === '1') {
      await page.setRequestInterception(true);
      page.on('request', request => {
        if (new URL(request.url()).pathname.startsWith('/api/')) void request.respond({ status: 200, contentType: 'application/json', body: '{"texts":{},"hidden":[],"chat":{"conversation":null,"messages":[]}}' });
        else void request.continue();
      });
    }
    await page.goto(target, { waitUntil: 'networkidle2', timeout: 90000 });
    await pause(3000);
    const encoder = await browser.newPage();
    await encoder.setViewport({ width, height });
    await encoder.setContent('<canvas></canvas>');
    await encoder.evaluate(({ width, height }) => {
      const canvas = document.querySelector('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      const chunks = [];
      const stream = canvas.captureStream(24);
      const mimeType = 'video/mp4;codecs=avc1.42001E';
      if (!MediaRecorder.isTypeSupported(mimeType)) throw new Error('MP4 recording unavailable');
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2200000 });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      window.drawCapturedFrame = async data => {
        const image = new Image();
        image.src = 'data:image/jpeg;base64,' + data;
        await image.decode();
        ctx.drawImage(image, 0, 0, width, height);
      };
      window.finishRecording = () => new Promise(resolve => {
        recorder.onstop = () => {
          stream.getTracks().forEach(track => track.stop());
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(new Blob(chunks, { type: 'video/mp4' }));
        };
        recorder.stop();
      });
      recorder.start();
    }, { width, height });
    const cdp = await page.createCDPSession();
    let captured = 0;
    let recording = true;
    let pending = Promise.resolve();
    cdp.on('Page.screencastFrame', event => {
      if (!recording) return;
      pending = pending.then(async () => {
        await encoder.evaluate(data => window.drawCapturedFrame(data), event.data);
        captured++;
        await cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId });
      });
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 78, maxWidth: width, maxHeight: height, everyNthFrame: 1 });
    const observations = [];
    let atBottom = 0;
    await page.bringToFront();
    for (let index = 0; index < 240; index++) {
      await pause(index === 0 ? 2200 : 850);
      const state = await page.evaluate(() => {
        const visible = element => { const box = element.getBoundingClientRect(); return box.bottom > 0 && box.top < innerHeight && box.width > 0 && box.height > 0; };
        return {
          scrollY, viewport: { width: innerWidth, height: innerHeight }, total: document.documentElement.scrollHeight,
          headings: [...document.querySelectorAll('h1,h2,h3')].filter(visible).map(el => ({ text: el.textContent, top: Math.round(el.getBoundingClientRect().top) })),
          sections: [...document.querySelectorAll('section[id]')].filter(visible).map(el => ({ id: el.id, top: Math.round(el.getBoundingClientRect().top), height: Math.round(el.getBoundingClientRect().height) })),
          text: document.body.innerText.slice(-500),
          motion: [...document.querySelectorAll('section[id] [style]')].filter(visible).slice(0, 25).map(el => ({ tag: el.tagName, style: el.getAttribute('style')?.slice(0, 300) })),
        };
      });
      observations.push({ frame: index, recordedFrames: captured, ...state });
      await page.screenshot({ path: new URL(`frame-${String(index).padStart(3, '0')}.jpg`, folder).pathname, type: 'jpeg', quality: 78 });
      if (index % 10 === 0) console.log(name, index, Math.round(state.scrollY), state.total, state.headings.map(item => item.text).join(' | '));
      atBottom = state.scrollY + state.viewport.height >= state.total - 5 ? atBottom + 1 : 0;
      if (atBottom >= 3) break;
      if (mobile) {
        const x = Math.round(width * .6), y = Math.round(height * .72);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let step = 1; step <= 12; step++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - height * .4 * step / 12 }] });
          await pause(35);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
      else await page.mouse.wheel({ deltaY: Math.round(height * .4) });
    }
    recording = false;
    await cdp.send('Page.stopScreencast');
    await pending;
    const video = await encoder.evaluate(() => window.finishRecording());
    await writeFile(new URL(`${name}-full-scroll.mp4`, base), Buffer.from(video, 'base64'));
    await writeFile(new URL('observations.json', folder), JSON.stringify({ url: page.url(), capturedFrames: captured, reachedBottom: atBottom >= 3, observations }, null, 2));
    console.log(`${name}: ${captured} video frames, ${observations.length} checkpoints, bottom=${atBottom >= 3}`);
    if (atBottom < 3) throw new Error(`${name}: full-page scroll did not reach footer`);
    await encoder.close();
    await page.close();
  }
} finally { await browser.close(); }
