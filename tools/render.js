// node tools/render.js [объект ...] [--views=01_front,06_front_3q] [--no-glb]
// Поднимает локальный сервер, открывает страницу в headless Chromium,
// сохраняет виды в renders/<объект>/ и модели в models/<объект>.glb.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const THREE_DIR = path.join(ROOT, 'node_modules', 'three');
const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith('--'));
const viewsArg = args.find((a) => a.startsWith('--views='));
const views = viewsArg ? viewsArg.slice(8).split(',') : null;
const glb = !args.includes('--no-glb');

const MIME = { '.js': 'text/javascript', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file;
  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`<!doctype html><html><body style="margin:0">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module" src="/src/render.js"></script></body></html>`);
  }
  if (url.startsWith('/three/')) file = path.join(THREE_DIR, url.slice(7));
  else if (url.startsWith('/src/')) file = path.join(ROOT, 'src', url.slice(5));
  if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction('window.ready === true', null, { timeout: 120000 });
  const names = only.length ? only : await page.evaluate('window.objectNames');
  for (const name of names) {
    const t0 = Date.now();
    const res = await page.evaluate(([n, v]) => window.renderObject(n, v), [name, views]);
    const dir = path.join(ROOT, 'renders', name);
    fs.mkdirSync(dir, { recursive: true });
    for (const [id, url] of Object.entries(res.views)) {
      fs.writeFileSync(path.join(dir, `${name}_${id}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
    if (glb) {
      const b64 = await page.evaluate((n) => window.exportGLB(n), name);
      fs.mkdirSync(path.join(ROOT, 'models'), { recursive: true });
      fs.writeFileSync(path.join(ROOT, 'models', `${name}.glb`), Buffer.from(b64, 'base64'));
    }
    console.log(`${name}: ${Object.keys(res.views).length} views, ${Math.round(res.tris)} tris, size ${res.size.map((s) => s.toFixed(2)).join(' x ')} m, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  await browser.close();
  server.close();
})();
