// Headless smoke test + screenshots of every scene.
// Usage: node tools/screenshots.mjs [sceneId ...] [--explode=0.6] [--out=screenshots]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=')]; }));
const only = args.filter((a) => !a.startsWith('--'));
const outDir = opt.out || 'screenshots';
fs.mkdirSync(outDir, { recursive: true });

const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(opt.w || 1500), height: Number(opt.h || 900) } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

await page.goto(url);
await page.waitForFunction(() => window.__timsReady, null, { timeout: 60000 });
const ids = await page.evaluate(() => [...document.querySelectorAll('.nav-item')].map((b) => b.dataset.id));
const list = only.length ? only : ids;
let failed = 0;
for (const id of list) {
  const explodes = (opt.explode ? opt.explode.split(',') : ['0', '0.7']).map(Number);
  for (const e of explodes) {
    errors.length = 0;
    await page.evaluate(({ id, e }) => { window.__timsReady = null; location.hash = `scene=${id}&explode=${e}`; }, { id, e });
    try {
      await page.waitForFunction((id) => window.__timsReady === id, id, { timeout: 400000 });
    } catch { errors.push('timeout waiting for scene'); }
    await page.waitForTimeout(Number(opt.wait || 1800));
    const file = path.join(outDir, `${id}-${Math.round(e * 100)}.png`);
    await page.screenshot({ path: file });
    const errs = errors.filter((x) => !/GPU stall|ReadPixels|WebGL-|swiftshader|Automatic fallback/i.test(x));
    if (errs.length) failed++;
    console.log(`${errs.length ? '✗' : '✓'} ${id} explode=${e} → ${file}${errs.length ? '\n   ' + errs.slice(0, 6).join('\n   ') : ''}`);
  }
}
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
