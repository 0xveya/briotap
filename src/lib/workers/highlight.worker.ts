import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import wasmUrl from 'shiki/onig.wasm?url';
import go from 'shiki/langs/go.mjs';
import { bundledLanguages } from 'shiki/langs';
import type { HighlightRequest, HighlightResponse } from './highlight.types';

const highlighter = createHighlighterCore({
  engine: createOnigurumaEngine(async () => {
    const response = await fetch(wasmUrl);
    if (!response.ok) throw new Error('Could not load syntax engine');
    return response.arrayBuffer();
  }),
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
  const { id, code, language } = event.data;
  try {
    const syntax = await highlighter;
    const name = language.toLowerCase();
    const loader = Object.hasOwn(bundledLanguages, name)
      ? bundledLanguages[name as keyof typeof bundledLanguages] : undefined;
    if (!loader) {
      self.postMessage({ id, html: null } satisfies HighlightResponse);
      return;
    }
    if (!syntax.getLoadedLanguages().includes(name)) await syntax.loadLanguage(await loader());
    const html = syntax.codeToHtml(code, {
      lang: name,
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
