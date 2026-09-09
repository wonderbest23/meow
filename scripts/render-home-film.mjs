import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';

const output = new URL('../public/home-film/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const [name, width, height] of [['desktop', 1280, 720], ['mobile', 720, 840]]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.setContent('<canvas id="film"></canvas>');
    await page.evaluate(({ width, height }) => {
      const canvas = document.querySelector('canvas');
      canvas.width = width; canvas.height = height;
      const c = canvas.getContext('2d');
      const mobile = width < 800;
      const center = width / 2;
      const ease = n => 1 - Math.pow(1 - Math.max(0, Math.min(1, n)), 3);
      const font = (size, weight = 500) => `${weight} ${size}px "Apple SD Gothic Neo", "Arial", sans-serif`;
      function text(value, x, y, size, weight = 500, color = '#202632', align = 'center') {
        c.font = font(size, weight); c.fillStyle = color; c.textAlign = align; c.fillText(value, x, y);
      }
      function rounded(x, y, w, h, radius, fill) { c.beginPath(); c.roundRect(x, y, w, h, radius); c.fillStyle = fill; c.fill(); }
      function typed(lines, time, y, size) {
        let remaining = Math.max(0, Math.floor(time * 18));
        const full = lines.join('').length;
        const count = Math.min(full, remaining);
        lines.forEach((line, index) => {
          const shown = line.slice(0, Math.max(0, remaining));
          c.font = font(size, 700);
          const totalWidth = c.measureText(line).width;
          const x = center - totalWidth / 2;
          text(shown, x, y + index * size * 1.45, size, 700, index === 1 ? '#3279e5' : '#202632', 'left');
          if (remaining >= 0 && remaining < line.length && Math.floor(time * 3) % 2 === 0) rounded(x + c.measureText(shown).width + 5, y + index * size * 1.45 - size * .78, 3, size, 1, '#3182f6');
          remaining -= line.length;
        });
        return count === full;
      }
      function paper(x, y, angle, label, title, body, main = false) {
        c.save(); c.translate(x, y); c.rotate(angle);
        const w = mobile ? 320 : 340, h = mobile ? 390 : 370;
        c.shadowColor = '#24395320'; c.shadowBlur = 35; c.shadowOffsetY = 15;
        rounded(-w / 2, 0, w, h, 5, '#fff'); c.shadowColor = 'transparent';
        c.strokeStyle = '#e3e8ef'; c.strokeRect(-w / 2 + .5, .5, w - 1, h - 1);
        const left = -w / 2 + 30;
        text(label, left, 40, 12, 600, '#74849b', 'left');
        title.forEach((line, i) => text(line, left, 83 + i * 32, 25, 700, '#222c3b', 'left'));
        rounded(left, 144, 30, 3, 1, main ? '#3182f6' : '#a5b3c7');
        body.forEach(([heading, line], i) => {
          text(heading, left, 181 + i * 54, 12, 700, '#3d5069', 'left');
          text(line, left, 202 + i * 54, 11, 500, '#7d8999', 'left');
        });
        text('오늘창업 · 가상 사업 예시', left, h - 24, 9, 500, '#9aa5b4', 'left');
        c.restore();
      }
      window.renderFrame = (time, encode = true) => {
        c.globalAlpha = 1; c.fillStyle = '#f8fafc'; c.fillRect(0, 0, width, height);
        const stage = time < 4.5 ? 0 : time < 8.5 ? 1 : 2;
        const local = time - [0, 4.5, 8.5][stage];
        const duration = [4.5, 4, 7.5][stage];
        c.globalAlpha = Math.min(1, (duration - local) / .45);
        if (stage < 2) {
          const y = mobile ? 290 : 285;
          text(stage === 0 ? '당신의 한마디' : '오늘창업의 제안', center, y - 92, mobile ? 18 : 17, 500, '#8a96a6');
          const lines = stage === 0 ? ['사진으로 시작할 수 있는', '사업이 있을까요?'] : ['동네 가게의 메뉴 사진,', '사업으로 만들어 볼까요?'];
          typed(lines, local + .3, y, mobile ? 42 : 58);
          c.globalAlpha *= ease((local - 2) / .7);
          text(stage === 0 ? '막연한 아이디어여도 괜찮아요.' : '상품과 고객, 비용과 운영을 함께 정리해요.', center, y + (mobile ? 190 : 185), mobile ? 18 : 21, 500, '#8190a3');
        } else {
          text('대화가 나만의 계획으로.', center, mobile ? 130 : 96, mobile ? 36 : 44, 700);
          text('읽고, 고치고, 다음 일을 시작하세요.', center, mobile ? 175 : 136, mobile ? 18 : 19, 500, '#8390a0');
          const appear = ease(local / 1.25);
          const spread = ease((local - .5) / 1.2);
          const y = (mobile ? 300 : 234) + (1 - appear) * 100;
          c.globalAlpha *= appear;
          paper(center - (mobile ? 125 : 220) * spread, y + 22, -.11 * spread, '02 운영 계획', ['무리하지 않는', '첫 운영 계획'], [['시간 배분', '촬영 · 보정 · 고객 응대'], ['운영 범위', '예약 가능한 시간부터 정하기']], false);
          paper(center + (mobile ? 125 : 220) * spread, y + 22, .11 * spread, '03 첫 실행', ['첫 상품부터', '하나씩 시작하기'], [['첫 준비', '직접 촬영한 샘플 만들기'], ['다음 할 일', '상품 구성과 가격 다듬기']], false);
          paper(center, y - 14, 0, '01 사업계획서', ['동네 가게', '메뉴 사진 제작'], [['상품과 고객', '음식점 · 카페의 사진과 소개글'], ['시험 상품 · 제안', '사진 2장 + 소개글'], ['가격 · 확인 전 가정', '메뉴 1개 6만 원']], true);
        }
        c.globalAlpha = 1;
        return encode ? canvas.toDataURL('image/png').split(',')[1] : null;
      };
    }, { width, height });
    const movie = await page.evaluate(() => new Promise((resolve, reject) => {
      const canvas = document.querySelector('canvas');
      window.renderFrame(0, false);
      const stream = canvas.captureStream(24);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1.42001E', videoBitsPerSecond: 3000000 });
      const chunks = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = event => reject(new Error(String(event.error)));
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(new Blob(chunks, { type: 'video/mp4' }));
      };
      recorder.start();
      const start = performance.now();
      const timer = setInterval(() => {
        const time = (performance.now() - start) / 1000;
        if (time >= 16) { clearInterval(timer); recorder.stop(); }
        else window.renderFrame(time, false);
      }, 1000 / 24);
    }));
    await writeFile(new URL(`${name}-v2.mp4`, output), Buffer.from(movie, 'base64'));
    for (const [label, time] of [['poster', 11], ['type', 2], ['proposal', 7]]) {
      const png = await page.evaluate(time => window.renderFrame(time), time);
      await writeFile(new URL(`${name}-${label}-v2.png`, output), Buffer.from(png, 'base64'));
    }
    await page.close();
    console.log(`${name}: 16s / 24fps rendered`);
  }
} finally { await browser.close(); }
