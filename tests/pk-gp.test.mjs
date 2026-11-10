import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { build } = createRequire(import.meta.resolve('wrangler/package.json'))('esbuild');
const result = await build({ entryPoints: [new URL('../lib/pk-gp.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], bundle: true, format: 'esm', platform: 'node', write: false });
const { parsePkGp } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
test('OSRS GP accepts k/M and Dutch or English decimals with exact whole-coin results', () => {
  for (const [input, expected] of [['250k', 250000], ['750K', 750000], ['2.5m', 2500000], ['2,5M', 2500000], [' 1.25 K ', 1250], ['0,001k', 1], ['0.000001M', 1], ['1,234567m', 1234567], ['2500000', 2500000], ['2.500.000', 2500000], ['2 500 000', 2500000], ['100000m', 100000000000]]) assert.equal(parsePkGp(input), expected, input);
});
test('invalid, fractional-coin, empty and excessive amounts never silently change into another amount', () => {
  for (const value of ['', ' ', '0', '0k', '-1m', '2.5', '2,5', '1e6', '2mm', 'NaN', 'Infinity', '5gp', '1,2.5m', '1,2345k', '0.0000001m', '100000.000001m', '100000000001', '999999999999999999999999999999999999k']) assert.equal(parsePkGp(value), null, value);
});
