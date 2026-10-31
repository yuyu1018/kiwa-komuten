import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Reuse an installed Playwright with PLAYWRIGHT_MODULE, or install Playwright locally.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = root + 'docs/screenshots/';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
});
const results = { viewports: [], interactions: [] };
const expectedAssets = JSON.parse(await readFile(root + 'docs/asset-geometry.json', 'utf8'));

try {
  for (const width of [1280, 1440, 1920, 900, 768, 390, 375, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      document.querySelectorAll('img').forEach(image => { image.loading = 'eager'; });
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode()));
    });
    const geometry = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      fontLoaded: document.fonts.check('14px "Noto Serif JP"'),
      assets: [...document.images].map(image => {
        const box = image.getBoundingClientRect();
        const parent = image.parentElement.getBoundingClientRect();
        return { file: image.getAttribute('src'), loaded: image.complete && image.naturalWidth > 0, x: box.x, y: box.y, width: box.width, height: box.height, slot: { x: parent.x, y: parent.y, width: parent.width, height: parent.height }, fit: getComputedStyle(image).objectFit };
      }),
      sections: Object.fromEntries(['.brand-visual', '.hero-photo', '.news', '.philosophy', '.craft', '.lower-content', '.works', '.events', '.contact', '.footer', '.primary-nav a', '.philosophy-copy', '.craft-list', '.works-more', '.contact-link', '.contact-phone', '.contact-intro', '.philosophy-body', '.news-more'].map(selector => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return [selector, { x: box.x, y: box.y, width: box.width, height: box.height }];
      }))
    }));
    assert.equal(geometry.scrollWidth, width, `Horizontal overflow at ${width}px`);
    assert(geometry.fontLoaded, 'The Figma font must be loaded');
    assert(geometry.assets.every(asset => asset.loaded), `Asset missing at ${width}px`);
    assert.deepEqual(errors, [], `Browser errors at ${width}px`);
    if ([1280, 768, 390].includes(width)) {
      const label = width <= 600 ? 'mobile' : width <= 900 ? 'tablet' : 'desktop';
      await page.screenshot({ path: `${output}${label}-${width}.png`, fullPage: true });
    }
    if (width === 1280) {
      assert.equal(geometry.height, 6208, 'Page height matches Figma');
      for (const asset of geometry.assets) {
        assert((await stat(root + 'dist/' + asset.file)).size > 0, `${asset.file} must exist locally`);
        const filename = asset.file.split('/').at(-1);
        if (filename.endsWith('.svg')) {
          const source = await readFile(root + 'dist/' + asset.file, 'utf8');
          const svgRoot = source.match(/<svg\b[^>]*>/)[0];
          for (const dimension of ['width', 'height']) {
            const expected = Number(svgRoot.match(new RegExp(`\\b${dimension}="([^"]+)"`))[1]);
            assert(Math.abs(asset[dimension] - expected) < .02, `Preserve SVG root ${dimension}: ${filename}`);
          }
        }
        const expected = expectedAssets[filename];
        if (expected) {
          for (const dimension of ['x', 'y', 'width', 'height']) {
            assert(Math.abs(asset.slot[dimension] - expected[dimension]) < 1, `Figma slot mismatch ${filename}: ${dimension}`);
          }
        }
      }
      results.interactions.push('13 photo/drawing slots match Figma within 1px; every SVG retains its exported dimensions');
      const initialTop = await page.locator('.sidebar').evaluate(node => node.getBoundingClientRect().top);
      await page.evaluate(() => scrollTo(0, 2400));
      assert.equal(await page.locator('.sidebar').evaluate(node => node.getBoundingClientRect().top), initialTop);
      results.interactions.push('PC sidebar remains fixed while scrolling');
      await page.evaluate(() => scrollTo(0, 0));
      for (const key of ['philosophy', 'craft', 'work-natural', 'work-light', 'work-renovation', 'works-list', 'open-house', 'consultation', 'news', 'news-list', 'story', 'about', 'blog', 'recruit', 'contact', 'privacy']) {
        const trigger = page.locator(`[data-dialog="${key}"]`).first();
        await trigger.click();
        assert(await page.locator('dialog').evaluate(node => node.open), `${key} dialog should open`);
        assert((await page.locator('#dialog-title').textContent()).length > 0);
        assert.equal(await page.locator('[id]').evaluateAll(nodes => new Set(nodes.map(node => node.id)).size), await page.locator('[id]').count(), 'No duplicate IDs');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('dialog').evaluate(node => node.open), false);
      }
      results.interactions.push('All 16 detail views open; Escape closes; no duplicate IDs');
    }
    if (width === 390) {
      const menu = page.locator('.menu-toggle');
      await menu.click();
      assert.equal(await menu.getAttribute('aria-expanded'), 'true');
      await page.locator('#primary-nav a[href="#craft"]').click();
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.evaluate(() => location.hash), '#craft');
      await menu.click();
      await page.keyboard.press('Escape');
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
      await menu.click();
      await page.locator('#primary-nav [data-dialog="about"]').click();
      assert(await page.locator('dialog').evaluate(node => node.open));
      await page.keyboard.press('Escape');
      await page.evaluate(() => scrollTo(0, 0));
      results.interactions.push('Mobile menu opens/closes, anchors navigate, Escape closes, detail view works');
    }
    results.viewports.push({ ...geometry, errors });
    await context.close();
  }
  await writeFile(root + 'docs/qa-results.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ viewports: results.viewports.map(({ width, height, scrollWidth, assets }) => ({ width, height, scrollWidth, assetsLoaded: assets.length })), interactions: results.interactions }, null, 2));
} finally {
  await browser.close();
}
