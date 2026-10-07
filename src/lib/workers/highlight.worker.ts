import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import go from 'shiki/langs/go.mjs';
import type { HighlightRequest, HighlightResponse } from './highlight.types';

const highlighter = createHighlighterCore({
  engine: createOnigurumaEngine(() => import('shiki/wasm')),
  langs: [go],
  themes: [
    {
      name: 'briotap-dark',
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
    },
    {
      name: 'briotap-light',
      type: 'light',
      colors: {
        'editor.background': '#f6f1f4',
        'editor.foreground': '#39323e'
      },
      tokenColors: [
        { scope: ['comment'], settings: { foreground: '#6b6170' } },
        {
          scope: ['keyword', 'storage.type', 'storage.modifier'],
          settings: { foreground: '#a61755' }
        },
        { scope: ['string'], settings: { foreground: '#24673a' } },
        {
          scope: ['entity.name.function', 'support.function'],
          settings: { foreground: '#6f3e91' }
        },
        {
          scope: ['constant.numeric', 'constant.language'],
          settings: { foreground: '#87501e' }
        },
        {
          scope: ['entity.name.type', 'support.type'],
          settings: { foreground: '#235e78' }
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
      themes: { dark: 'briotap-dark', light: 'briotap-light' },
      defaultColor: false
    });
    const response: HighlightResponse = { id, html };
    self.postMessage(response);
  } catch {
    const response: HighlightResponse = { id, html: null };
    self.postMessage(response);
  }
};
