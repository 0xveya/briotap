import { expect, test } from 'bun:test';
import { documentationLink } from './documentation-links';

test('versioned subpackage links retain their version and symbol', () => {
  expect(documentationLink('https://pkg.go.dev/github.com/example/mod@v1.2.3/sub#Client.Do'))
    .toEqual({
      external: 'https://pkg.go.dev/github.com/example/mod@v1.2.3/sub#Client.Do',
      path: 'github.com/example/mod/sub',
      local: '/package/github.com/example/mod/sub?version=v1.2.3&tab=docs#symbol-Client.Do'
    });
});

test('relative package links retain an absolute upstream fallback', () => {
  expect(documentationLink('/fmt#Println')?.external).toBe('https://pkg.go.dev/fmt#Println');
  expect(documentationLink('/github.com/example/mod')?.local)
    .toBe('/package/github.com/example/mod?tab=docs');
});

test('encoded version metadata is normalized', () => {
  expect(documentationLink('/github.com/example/mod@v2.0.0%2Bincompatible/sub')?.local)
    .toBe('/package/github.com/example/mod/sub?version=v2.0.0%2Bincompatible&tab=docs');
});

test('other hosts and malformed paths are not converted to local packages', () => {
  expect(documentationLink('//example.com/fmt')).toBeNull();
  expect(documentationLink('/github.com/example/mod@invalid%20version')?.path).toBeNull();
  expect(documentationLink('/%invalid')).toBeNull();
});
