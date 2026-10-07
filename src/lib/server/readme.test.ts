import { expect, test } from 'bun:test';
import { renderReadme } from './readme';

test('README lists, headings, and internal links produce navigable reader content', () => {
  const result = renderReadme('# Router\n\n[Features](#features)\n\n## Features\n\n- First\n- Second\n\n1. Install\n2. Run\n\n## Examples\n\n```go\npackage main\n```', 'https://github.com/example/router', 'v2.0.0', 'README.md');
  expect(result.html).toContain('<ul>');
  expect(result.html).toContain('<ol>');
  expect(result.html).toContain('<li>Second</li>');
  expect(result.html).toContain('href="#readme-features"');
  expect(result.headings.map((heading) => heading.id)).toEqual(['readme-router', 'readme-features', 'readme-examples']);
});

test('README links resolve at the selected version and unsafe markup is removed', () => {
  const result = renderReadme('[Example](examples/main.go)\n\n[Root](/LICENSE)\n\n![Logo](assets/logo.svg)\n\n<script>alert(1)</script><a href="javascript:alert(1)">Bad</a><img src="x" onerror="alert(1)">', 'https://github.com/example/router', 'v2.0.0', 'docs/README.md');
  expect(result.html).toContain('https://github.com/example/router/blob/v2.0.0/docs/examples/main.go');
  expect(result.html).toContain('https://github.com/example/router/blob/v2.0.0/LICENSE');
  expect(result.html).toContain('https://raw.githubusercontent.com/example/router/v2.0.0/docs/assets/logo.svg');
  expect(result.html).toContain('loading="lazy"');
  expect(result.html).not.toContain('<script');
  expect(result.html).not.toContain('javascript:');
  expect(result.html).not.toContain('onerror');
});
