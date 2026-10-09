// @ts-nocheck: a Node-only test (it reads files with node:fs) and @types/node is not installed; vitest runs it fine
// P1.12.1 the app works anywhere: no place name or test-place coordinate in app code. Place lists live in data files
// (data/world-places.json, data/test-places.json), tests and docs only. Comments may mention places; code may not.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const data = ['world-places.json', 'test-places.json'].flatMap(
  (f) => (JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8')).places as { name: string; lat?: number; lon?: number }[]),
);
const names = [...new Set(data.map((p) => p.name.replace(/\s*\(.*\)\s*$/, '').trim()).filter((n) => n.length > 3))];
const coords = [...new Set(data.flatMap((p) => [p.lat, p.lon]).filter((v): v is number => Number.isFinite(v) && Math.abs(v % 1) > 1e-6).map((v) => v.toFixed(4).replace(/0+$/, '')))];

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(f) && !/\.test\.ts$/.test(f) && !/\.d\.ts$/.test(f) ? [p] : [];
  });
// comments out: block comments, then line comments (not the // inside a URL)
const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<![:'"\w])\/\/.*$/gm, '');

describe('no place lists in app logic (P1.12.1)', () => {
  const sources = files(join(ROOT, 'web', 'src')).map((f) => ({ f: f.slice(ROOT.length + 1), src: code(readFileSync(f, 'utf8')) }));

  it('the data files give names and coordinates to look for', () => {
    expect(names.length).toBeGreaterThan(30);
    expect(coords.length).toBeGreaterThan(30);
  });

  it('no place name from the place lists appears in app code', () => {
    const hits = sources.flatMap(({ f, src }) => names.filter((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(src)).map((n) => `${f}: ${n}`));
    expect(hits).toEqual([]);
  });

  it('no test-place coordinate appears in app code', () => {
    const hits = sources.flatMap(({ f, src }) => coords.filter((c) => new RegExp(`(?<![\\d.])${c.replace('.', '\\.')}\\d*`).test(src)).map((c) => `${f}: ${c}`));
    expect(hits).toEqual([]);
  });
});
