// Places drawer (owner request 2026-10-09): a click in the search box opens a scrolling list of places down the left
// edge; typing narrows it; Escape closes it; every place has Fly drone; Enter still searches the world.
import { checker, open, settledAt } from './lib.mjs';

const { check, done } = checker();
const { browser, page, log } = await open('?e2e=1&notoken=1', { viewport: { width: 1100, height: 700 } });
try {
  await settledAt(page, 40_000);
  const shown = () => page.locator('#places-drawer').isVisible();
  check('the drawer is closed at start', !(await shown()));
  await page.click('#search');
  check('a click in the search box opens the drawer', await shown());
  const all = await page.locator('#places-list li.row').count();
  const scroll = await page.evaluate(() => { const d = document.querySelector('#places-drawer'); return { h: d.scrollHeight, c: d.clientHeight, y: getComputedStyle(d).overflowY }; });
  check('the drawer lists the places and scrolls on its own', all >= 7 && scroll.h > scroll.c && scroll.y === 'auto', `${all} places, ${JSON.stringify(scroll)}`);
  check('every place has Fly drone', (await page.locator('#places-list li.row', { hasText: 'Fly drone' }).count()) === all);
  await page.fill('#search', 'tokyo');
  const names = await page.locator('#places-list li.row > .btn:first-child').allInnerTexts();
  check('typing narrows the list', names.length > 0 && names.length < all && names.every((n) => /tokyo/i.test(n)), names.join(' | '));
  await page.fill('#search', 'zzqx');
  check('no match says so', /No saved place matches/.test(await page.locator('#places-list').innerText()));
  await page.press('#search', 'Escape');
  check('Escape closes the drawer', !(await shown()));
  await page.click('#places-toggle');
  check('the Places button opens it too', await shown());
  check('no console errors', log.errors.length === 0, log.errors.join(' | '));
} finally {
  await browser.close();
}
done();
