import { expect, test } from 'bun:test';
import { retryDelay } from './retry-delay';

test('cooldowns accept seconds and HTTP dates and bound excessive waits', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  expect(retryDelay('2', 1000, now)).toBe(2000);
  expect(retryDelay('Thu, 12 Nov 2026 12:00:05 GMT', 1000, now)).toBe(5000);
  expect(retryDelay('999999999999', 1000, now)).toBe(60_000);
  for (const header of [null, '', 'garbage', '-1', '0']) {
    expect(retryDelay(header, 1000, now)).toBe(1000);
  }
});
