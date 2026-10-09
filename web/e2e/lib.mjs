import { execSync } from 'node:child_process';
// Shared Playwright helpers for the headless acceptance checks. Drives the installed Edge (real GPU, nothing to
// download). Overrides: E2E_URL (server), E2E_CHANNEL (chrome | chromium | msedge), E2E_HEADED=1 (show the window).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

// bridges started by the checks listen on 8001 (they inherit these) and every page is pointed there with ?ws=, so the
// PM2 bridge on 8000 and its simulator are never touched (P2A.9.1)
process.env.DW_BRIDGE_PORT ??= '8001';
process.env.DW_SIM_PROFILE ??= 'test'; // their simulators use sim/run-test and UDP 14650-14662 (P2A.9.1)
export const BASE = process.env.E2E_URL ?? 'http://127.0.0.1:3003/';

/** Opens the app. `log.errors` collects console errors and uncaught exceptions; `log.bad` collects HTTP >= 400 and failed requests. */
export async function open(search = '?e2e=1', { viewport = { width: 1280, height: 800 }, offline = false, setup = null, liveOverpass = false } = {}) {
  search += `${search.includes('?') ? '&' : '?'}ws=ws://127.0.0.1:${process.env.DW_BRIDGE_PORT}`; // never the PM2 bridge
  const browser = await chromium.launch({
    channel: process.env.E2E_CHANNEL ?? 'msedge',
    headless: process.env.E2E_HEADED !== '1',
  });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const log = { errors: [], bad: [] };
  page.on('console', (m) => m.type() === 'error' && log.errors.push(`console: ${m.text()}${m.location()?.url ? ` @ ${m.location().url}` : ''}`));
  page.on('pageerror', (e) => log.errors.push(`pageerror: ${e.message}`));
  // net::ERR_ABORTED is Cesium cancelling a tile it no longer needs (the camera moved on), not a failure
  page.on('requestfailed', (r) => r.failure()?.errorText !== 'net::ERR_ABORTED' && log.bad.push(`failed: ${r.url()} (${r.failure()?.errorText})`));
  page.on('response', (r) => r.status() >= 400 && log.bad.push(`${r.status()}: ${r.url()}`));
  if (offline) await context.setOffline(true);
  // every ground click asks OpenStreetMap Overpass for a building count (What is here?, P1.10.3). Tests get a canned answer
  // so they neither load the public service nor fail when it is down; e2e/whatishere.mjs opts in to the live service.
  if (!liveOverpass) {
    await context.route(/overpass-api\.de/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ elements: [{ type: 'count', tags: { total: '0' } }, { type: 'count', tags: { total: '0' } }] }) }));
  }
  await setup?.(context, page); // routes, init scripts and storage that must exist before the page runs
  await page.goto(new URL(search, BASE).href, { waitUntil: 'load' });
  return { browser, context, page, log };
}

/** Waits until the first frame is drawn, imagery (and terrain, when a token is present) are ready and tiles have loaded. */
export const waitForGlobe = (page, timeout = 60_000) => page.waitForFunction(() => window.__dw?.settled(), null, { timeout });

/** Milliseconds since navigation start at which the globe first reports settled (see waitForGlobe). */
export const settledAt = (page, timeout = 60_000) =>
  page.evaluate(
    (limit) =>
      new Promise((resolve, reject) => {
        const tick = () => {
          if (window.__dw?.settled()) return resolve(Math.round(performance.now()));
          if (performance.now() > limit) return reject(new Error(`globe not settled after ${limit} ms`));
          setTimeout(tick, 50);
        };
        tick();
      }),
    timeout,
  );

/** Waits for the camera to move and then sit still (two polls 300 ms apart, under 1 m). Returns elapsed ms, or -1 on timeout. */
export async function cameraRest(page, timeout = 10_000) {
  const t0 = Date.now();
  let prev = null;
  let moved = false;
  while (Date.now() - t0 < timeout) {
    const cur = await page.evaluate(() => { const c = window.__dw.viewer.camera.positionWC; return [c.x, c.y, c.z]; });
    if (prev) {
      const d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]);
      if (d > 100) moved = true;
      else if (moved && d < 1) return Date.now() - t0;
    }
    prev = cur;
    await page.waitForTimeout(300);
  }
  return -1;
}

/** Camera position as { lat, lon, h } (degrees, metres above the ellipsoid). */
export const cameraAt = (page) =>
  page.evaluate(() => {
    const c = window.__dw.viewer.camera.positionCartographic;
    return { lat: (c.latitude * 180) / Math.PI, lon: (c.longitude * 180) / Math.PI, h: c.height };
  });

/** Clicks the globe canvas at its centre plus an offset in CSS pixels. */
export async function clickAt(page, dx = 0, dy = 0) {
  const box = await page.locator('#globe canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

const DOC = new URL('../../docs/data-quality.md', import.meta.url);
const DOC_HEAD = `# Data quality and performance notes

Measured on this laptop: AMD Ryzen 5 5600H, integrated AMD Radeon graphics (Edge, ANGLE Direct3D11), 7.3 GB RAM. Sections between the HTML comments are rewritten by the e2e script named in each heading; the hands-on sections are edited by hand.
`;

/** Replaces (or appends) the block between <!-- name:start --> and <!-- name:end --> in docs/data-quality.md. */
export function writeSection(name, markdown) {
  let doc = existsSync(DOC) ? readFileSync(DOC, 'utf8') : DOC_HEAD;
  const block = `<!-- ${name}:start -->\n${markdown.trim()}\n<!-- ${name}:end -->`;
  const re = new RegExp(`<!-- ${name}:start -->[\\s\\S]*?<!-- ${name}:end -->`);
  doc = re.test(doc) ? doc.replace(re, () => block) : `${doc.trimEnd()}\n\n${block}\n`;
  writeFileSync(DOC, doc);
}

/** Tiny pass/fail printer: check(name, ok, detail) per assertion, done() sets the exit code. */
export function checker() {
  let failed = 0;
  return {
    check(name, ok, detail = '') {
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
      if (!ok) failed++;
    },
    done() {
      console.log(failed ? `${failed} check(s) FAILED` : 'all checks passed');
      process.exitCode = failed ? 1 : 0;
    },
  };
}

/** Which WebGL backend this browser really uses, so frame-rate checks know whether they ran on the GPU. */
export const webgl = (page) =>
  page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    if (!gl) return { kind: 'none', renderer: '' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return { kind: /swiftshader|software|llvmpipe/i.test(renderer) ? 'software (SwiftShader)' : 'GPU', renderer };
  });

/** Stub for the browser Gamepad API (P2B), to pass as `setup`: window.__pad.connect(id), .set(axes, buttons),
 *  .disconnect() drive navigator.getGamepads() and fire the real gamepadconnected / gamepaddisconnected events. */
export const stubGamepad = (context) =>
  context.addInitScript(() => {
    let pad = null;
    const make = (id, axes, buttons) => ({ id, index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes, buttons: buttons.map((v) => ({ pressed: v > 0.5, touched: v > 0, value: v })) });
    navigator.getGamepads = () => [pad, null, null, null];
    const fire = (type) => { const e = new Event(type); e.gamepad = pad; window.dispatchEvent(e); };
    window.__pad = {
      connect(id = 'Stub Pad (STANDARD GAMEPAD Vendor: 0000 Product: 0000)', axes = [0, 0, 0, 0], buttons = Array(17).fill(0)) { pad = make(id, axes, buttons); fire('gamepadconnected'); },
      set(axes, buttons) { if (pad) pad = make(pad.id, axes ?? pad.axes, buttons ?? pad.buttons.map((b) => b.value)); },
      disconnect() { const was = pad; pad = null; const e = new Event('gamepaddisconnected'); e.gamepad = was; window.dispatchEvent(e); },
    };
  });

/** PIDs of every running ArduCopter.elf; a check compares against the set it saw at its start (PM2's simulator is not its own) */
export const elfPids = () => new Set([...execSync('tasklist /FI "IMAGENAME eq ArduCopter.elf" /FO CSV /NH').toString().matchAll(/"ArduCopter\.elf","(\d+)"/g)].map((m) => Number(m[1])));
