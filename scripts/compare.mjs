import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const reference = (await readFile(root + 'docs/screenshots/figma-desktop.png')).toString('base64');
const implementation = (await readFile(root + 'docs/screenshots/desktop-1280.png')).toString('base64');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
try {
  const page = await browser.newPage();
  const comparison = await page.evaluate(async ({ reference, implementation }) => {
    const load = async data => { const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode(); return image; };
    const [a, b] = await Promise.all([load(reference), load(implementation)]);
    const width = a.naturalWidth, height = a.naturalHeight;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(a, 0, 0); const pixelsA = ctx.getImageData(0, 0, width, height);
    ctx.clearRect(0, 0, width, height); ctx.drawImage(b, 0, 0); const pixelsB = ctx.getImageData(0, 0, width, height);
    const difference = ctx.createImageData(width, height);
    const regions = [{ name: 'hero', start: 0, end: 1080 }, { name: 'news', start: 1080, end: 1334 }, { name: 'philosophy', start: 1334, end: 2193 }, { name: 'craft', start: 2193, end: 3177 }, { name: 'works', start: 3177, end: 4416 }, { name: 'events', start: 4416, end: 5334 }, { name: 'contact', start: 5334, end: 5917 }, { name: 'footer', start: 5917, end: 6208 }];
    let total = 0, changed = 0;
    for (const region of regions) {
      let error = 0, mismatched = 0;
      for (let y = region.start; y < region.end; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const delta = (Math.abs(pixelsA.data[i] - pixelsB.data[i]) + Math.abs(pixelsA.data[i + 1] - pixelsB.data[i + 1]) + Math.abs(pixelsA.data[i + 2] - pixelsB.data[i + 2])) / 3;
        error += delta;
        if (delta > 24) { mismatched++; difference.data[i] = 206; difference.data[i + 1] = 50; difference.data[i + 2] = 50; }
        else { difference.data[i] = 250; difference.data[i + 1] = 249; difference.data[i + 2] = 246; }
        difference.data[i + 3] = 255;
      }
      total += error; changed += mismatched;
      const count = width * (region.end - region.start);
      region.meanAbsoluteChannelDifference = +(error / count).toFixed(4);
      region.pixelsOver24Percent = +(100 * mismatched / count).toFixed(3);
    }
    ctx.putImageData(difference, 0, 0);
    return { width, height, meanAbsoluteChannelDifference: +(total / (width * height)).toFixed(4), pixelsOver24Percent: +(100 * changed / (width * height)).toFixed(3), regions, difference: canvas.toDataURL('image/png').split(',')[1] };
  }, { reference, implementation });
  await writeFile(root + 'docs/screenshots/difference.png', Buffer.from(comparison.difference, 'base64'));
  delete comparison.difference;
  await writeFile(root + 'docs/visual-comparison.json', JSON.stringify(comparison, null, 2) + '\n');
  console.log(JSON.stringify(comparison, null, 2));
} finally { await browser.close(); }
