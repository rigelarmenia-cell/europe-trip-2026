// Optional local audit against the user's source brief. Never copies or prints its private contents.
// Usage: node tools/privacy-check.mjs /absolute/path/to/02-source.txt
import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd();
const source = await readFile(process.argv[2], 'utf8');
const homeLine = source.split('\n').find(line => line.includes('Հասցեները ֆիքսված են'));
assert.ok(homeLine, 'Private source section must be found before scanning');
const entries = homeLine.split('(')[1].split(')')[0].split(';');
const privateValues = entries.map(entry => entry.split('՝')[1].trim());
assert.equal(privateValues.length, 3);
const fragments = privateValues.map(value => value.split(',')[0]);
const excluded = new Set(['.git', 'artifacts', 'dist', 'node_modules']);
const files = [];
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (excluded.has(item.name) || item.name.endsWith('.zip')) continue;
    const path = join(dir, item.name);
    if (item.isDirectory()) await walk(path);
    else if (!['.png'].includes(extname(path))) files.push(path);
  }
}
await walk(root);
let violations = 0;
for (const file of files) {
  const body = await readFile(file, 'utf8');
  for (const value of [...privateValues, ...fragments]) {
    if (body.includes(value) || body.includes(encodeURIComponent(value))) { console.error('Private address match in', file); violations++; break; }
  }
  if (/gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/.test(body)) { console.error('Token-like value in', file); violations++; }
}
assert.equal(violations, 0, 'Public files must not contain the supplied private addresses or token-like values');
console.log(`PASS: ${files.length} text files checked; supplied private addresses absent; no GitHub token-like values. Original briefs not copied.`);
