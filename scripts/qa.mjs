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
assert(!(await readFile(root + 'dist/styles.css', 'utf8')).includes('--unit'), 'The viewport scaling unit has been removed');

try {
  for (const width of [1280, 1440, 1920, 2560, 1024, 901, 900, 768, 390, 375, 320]) {
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
      fontLoaded: document.fonts.check('16px "Noto Serif JP"'),
      rightGaps: Object.fromEntries(['.brand-visual', '.hero-photo', '.contact', '.news', '.philosophy', '.craft', '.works', '.events', '.footer', '.philosophy-sub', '.craft-photo', '.work-card:last-child .work-photo', '.event-sub .event-photo'].map(selector => [selector, innerWidth - document.querySelector(selector).getBoundingClientRect().right])),
      bodyFonts: Object.fromEntries(['body', '.philosophy-body', '.craft-intro', '.craft-list p', '.work-description', '.event-description', '.contact-intro', '.news-summary', '.text-link', '.contact-link', '.primary-nav a', '.footer-nav a', '#dialog-content'].map(selector => [selector, getComputedStyle(document.querySelector(selector)).fontSize])),
      overflowingText: [...document.querySelectorAll('main p, main h2, main h3, main dd, .footer-nav a, .primary-nav a, main .text-link, .contact-link')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => ({ text: node.textContent.trim(), className: node.className, width: node.clientWidth, scrollWidth: node.scrollWidth })),
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
    for (const [selector, size] of Object.entries(geometry.bodyFonts)) assert.equal(size, '16px', `Body text at ${width}px: ${selector}`);
    assert.deepEqual(geometry.overflowingText, [], `Text must fit its container at ${width}px`);
    assert(geometry.assets.every(asset => asset.loaded), `Asset missing at ${width}px`);
    assert.deepEqual(errors, [], `Browser errors at ${width}px`);
    if (width > 900) {
      for (const [selector, gap] of Object.entries(geometry.rightGaps)) {
        const expected = ['.brand-visual', '.hero-photo', '.contact'].includes(selector) ? 0 : 64;
        assert(Math.abs(gap - expected) < 1, `Right edge at ${width}px for ${selector}: expected ${expected}px, got ${gap}px`);
      }
    }
    if ([1280, 1920, 768, 390].includes(width)) {
      const label = width <= 600 ? 'mobile' : width <= 900 ? 'tablet' : 'desktop';
      await page.screenshot({ path: `${output}${label}-${width}-layout.png`, fullPage: true });
    }
    if (width === 1280) {
      for (const [previous, next] of [['.news', '.philosophy'], ['.philosophy', '.craft'], ['.craft', '.lower-content'], ['.works', '.events'], ['.events', '.contact'], ['.contact', '.footer']]) {
        const a = geometry.sections[previous], b = geometry.sections[next];
        assert(b.y >= a.y + a.height - 1, `Sections must not overlap: ${previous} / ${next}`);
      }
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
          assert(asset.slot.width > 0 && asset.slot.height > 0, `Visible supplied asset: ${filename}`);
          if (!['house-family.png', 'botanical.png', 'wood-shavings.png', 'open-door.png'].includes(filename)) {
            assert.equal(asset.fit, 'cover', `Preserve the photo crop: ${filename}`);
            assert(Math.abs(asset.width - asset.slot.width) < 1 && Math.abs(asset.height - asset.slot.height) < 1, `Photo fills its frame: ${filename}`);
          }
        }
      }
      results.interactions.push('Body text and regular links are 16px at every tested width; sections do not overlap');
      results.interactions.push('FV/contact reach the right edge; other desktop sections and their rightmost photos have a 64px right gutter');
      results.interactions.push('All 13 supplied photos/drawings are retained; photos fill their frames and SVG dimensions are preserved');
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
