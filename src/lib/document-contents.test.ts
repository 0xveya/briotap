import { expect, test } from 'bun:test';
import { parseHTML } from 'linkedom';
import { documentContents, documentFragment } from './document-contents';

test('document headings retain order, hierarchy, and unique jump targets', () => {
  const { document } = parseHTML('<html><body><h2>Getting started</h2><h3>Examples</h3><h2>Examples</h2><h3 id="symbol-NewRouter">NewRouter</h3></body></html>');
  const contents = documentContents(document.querySelectorAll('h2,h3'), 'readme', true);
  expect(contents.headings).toEqual([
    { id: 'readme-getting-started', name: 'Getting started', level: 2 },
    { id: 'readme-examples', name: 'Examples', level: 3 },
    { id: 'readme-examples-1', name: 'Examples', level: 2 }
  ]);
  expect(contents.aliases.get('examples-1')).toBe('readme-examples-1');
  expect(document.getElementById('symbol-NewRouter')?.textContent).toBe('NewRouter');
});

test('upstream heading links and malformed fragments remain usable', () => {
  const { document } = parseHTML('<html><body><h2 id="hdr-Examples">Examples</h2><h2>雪</h2></body></html>');
  const contents = documentContents(document.querySelectorAll('h2'), 'section');
  expect(contents.headings[0]?.id).toBe('hdr-Examples');
  expect(documentFragment('#section-%E9%9B%AA')).toBe('section-雪');
  expect(documentFragment('#broken%')).toBe('broken%');
});
