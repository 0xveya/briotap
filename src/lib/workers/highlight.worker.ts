import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import go from 'shiki/langs/go.mjs';
import type { HighlightRequest, HighlightResponse } from './highlight.types';

const highlighter = createHighlighterCore({
  engine: createOnigurumaEngine(() => import('shiki/wasm')),
  langs: [go],
  themes: [
    {
      name: 'briotap',
      type: 'dark',
      colors: {
        'editor.background': '#131116',
        'editor.foreground': '#d8d2de'
      },
      tokenColors: [
        { scope: ['comment'], settings: { foreground: '#918595' } },
        {
          scope: ['keyword', 'storage.type', 'storage.modifier'],
          settings: { foreground: '#ff83b3' }
        },
        { scope: ['string'], settings: { foreground: '#b2d9bd' } },
        {
          scope: ['entity.name.function', 'support.function'],
          settings: { foreground: '#d8b7f3' }
        },
        {
          scope: ['constant.numeric', 'constant.language'],
          settings: { foreground: '#f2c69b' }
        },
        {
          scope: ['entity.name.type', 'support.type'],
          settings: { foreground: '#a2cddd' }
        }
      ]
    }
  ]
});

self.onmessage = async (event: MessageEvent<HighlightRequest>) => {
  const { id, code } = event.data;
  try {
    const html = (await highlighter).codeToHtml(code, {
      lang: 'go',
      theme: 'briotap'
    });
    const response: HighlightResponse = { id, html };
    self.postMessage(response);
  } catch {
    const response: HighlightResponse = { id, html: null };
    self.postMessage(response);
  }
};
