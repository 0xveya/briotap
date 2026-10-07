import type {
  HighlightRequest,
  HighlightResponse
} from './workers/highlight.types';

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, (html: string | null) => void>();

function highlight(code: string, language: string): {
  result: Promise<string | null>;
  cancel: () => void;
} {
  if (!worker) {
    worker = new Worker(
      new URL('./workers/highlight.worker.ts', import.meta.url),
      { type: 'module', name: 'briotap-syntax' }
    );
    worker.onmessage = (event: MessageEvent<HighlightResponse>) => {
      waiting.get(event.data.id)?.(event.data.html);
      waiting.delete(event.data.id);
    };
    worker.onerror = () => {
      for (const resolve of waiting.values()) resolve(null);
      waiting.clear();
      worker?.terminate();
      worker = null;
    };
  }
  const id = ++nextId;
  const request: HighlightRequest = { id, code, language };
  const result = new Promise<string | null>((resolve) =>
    waiting.set(id, resolve)
  );
  worker.postMessage(request);
  return {
    result,
    cancel: () => {
      waiting.get(id)?.(null);
      waiting.delete(id);
    }
  };
}

type HighlightOptions = string | { html: string; maxLength: number; language?: string };

/** Highlight only snippets near the viewport; retain plain code on failure. */
export function highlightSnippets(node: HTMLElement, options: HighlightOptions) {
  let maxLength = typeof options === 'string' ? 30_000 : Math.min(options.maxLength, 200_000);
  let language = typeof options === 'string' ? 'go' : (options.language ?? 'go');
  let active = true;
  const cancellations: (() => void)[] = [];
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLElement))
          continue;
        const pre = entry.target;
        observer.unobserve(pre);
        const code = pre.textContent ?? '';
        if (code.length > maxLength) continue;
        const declaredLanguage = pre.querySelector('code')?.className.match(/(?:^|\s)language-([^\s]+)/)?.[1];
        const task = highlight(code, declaredLanguage ?? language);
        cancellations.push(task.cancel);
        void task.result.then((html) => {
          if (!active || !html || !pre.isConnected) return;
          const template = document.createElement('template');
          template.innerHTML = html;
          const highlighted = template.content.querySelector('code');
          if (highlighted) {
            pre.replaceChildren(highlighted);
            pre.dataset.highlighted = 'wasm-worker';
          }
        });
      }
    },
    { rootMargin: '250px' }
  );
  for (const pre of node.querySelectorAll('pre')) observer.observe(pre);
  return {
    update(options: HighlightOptions) {
      maxLength = typeof options === 'string' ? 30_000 : Math.min(options.maxLength, 200_000);
      language = typeof options === 'string' ? 'go' : (options.language ?? 'go');
      for (const cancel of cancellations) cancel();
      cancellations.length = 0;
      observer.disconnect();
      for (const pre of node.querySelectorAll('pre:not([data-highlighted])'))
        observer.observe(pre);
    },
    destroy() {
      active = false;
      observer.disconnect();
      for (const cancel of cancellations) cancel();
    }
  };
}
