import { expect, test } from 'bun:test';
import { documentationUrl } from './source';

test('source lookup rejects unrelated modules and path traversal', () => {
  expect(() => documentationUrl('github.com/a/b', 'github.com/another/module', 'v1.0.0')).toThrow();
  expect(() => documentationUrl('github.com/a/b/../c', 'github.com/a/b', 'v1.0.0')).toThrow();
  expect(documentationUrl('github.com/a/b/sub', 'github.com/a/b', 'v1.0.0')).toBe('https://pkg.go.dev/github.com/a/b@v1.0.0/sub');
});
