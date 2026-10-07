import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RequestBudget } from './request-budget';

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true }); });

function path(): string {
  const directory = mkdtempSync(join(tmpdir(), 'briotap-budget-test-'));
  directories.push(directory);
  return join(directory, 'budget.sqlite');
}

test('separate clients share the total limit and keep foreground slots reserved', () => {
  const file = path();
  const scraper = new RequestBudget(file, 4, 2);
  const app = new RequestBudget(file, 4, 2);
  try {
    expect(scraper.tryAcquire('background', 0)).toBe(0);
    expect(app.tryAcquire('foreground', 0)).toBe(250);
    expect(scraper.tryAcquire('background', 250)).toBe(250);
    expect(app.tryAcquire('foreground', 250)).toBe(0);
    expect(scraper.tryAcquire('background', 500)).toBe(0);
    expect(app.tryAcquire('foreground', 750)).toBe(0);
  } finally { scraper.close(); app.close(); }
});

test('foreground can use spare capacity without granting bursts after an idle period', () => {
  const budget = new RequestBudget(path(), 4, 2);
  try {
    expect(budget.tryAcquire('foreground', 10_000)).toBe(0);
    expect(budget.tryAcquire('foreground', 10_000)).toBe(250);
    expect(budget.tryAcquire('foreground', 10_250)).toBe(0);
    expect(budget.tryAcquire('foreground', 10_500)).toBe(0);
    expect(budget.tryAcquire('foreground', 10_750)).toBe(0);
  } finally { budget.close(); }
});

test('upstream cooldown survives restart and applies to both request classes', () => {
  const file = path();
  let budget = new RequestBudget(file, 4, 2);
  budget.cooldown(5000);
  budget.close();
  budget = new RequestBudget(file, 4, 2);
  try {
    expect(budget.tryAcquire('foreground', 1000)).toBe(4000);
    expect(budget.tryAcquire('background', 1000)).toBe(4000);
    expect(budget.tryAcquire('foreground', 5000)).toBe(0);
  } finally { budget.close(); }
});

test('a waiting read can be cancelled without consuming another permit', async () => {
  const budget = new RequestBudget(path(), 1, 0);
  const controller = new AbortController();
  try {
    expect(budget.tryAcquire('background')).toBe(0);
    const wait = budget.acquire('foreground', controller.signal);
    controller.abort();
    await expect(wait).rejects.toThrow();
  } finally { budget.close(); }
});
