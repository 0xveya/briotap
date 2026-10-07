import { copyText } from './clipboard';

const copyPath = 'M8 8h12v12H8z M4 15V4h11';
const copiedPath = 'm5 12 4 4L19 6';

/** Add copy controls and permalinks to sanitized documentation. */
export function readingTools(
  node: HTMLElement,
  options: { html: string; sourceBase: string }
) {
  const controls: HTMLElement[] = [];
  const snippets: { frame: HTMLElement; pre: HTMLPreElement }[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function clear() {
    for (const control of controls) control.remove();
    controls.length = 0;
    for (const { frame, pre } of snippets) {
      frame.before(pre);
      frame.remove();
    }
    snippets.length = 0;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  }
  function mount() {
    for (const heading of node.querySelectorAll<HTMLElement>(
      'h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]'
    )) {
      const name = heading.textContent;
      const link = document.createElement('a');
      link.className = 'heading-link';
      link.href = `#${heading.id}`;
      link.textContent = '#';
      link.setAttribute('aria-label', `Link to ${name}`);
      heading.append(link);
      controls.push(link);
      if (options.sourceBase && heading.id.startsWith('symbol-')) {
        const source = document.createElement('a');
        source.className = 'declaration-source';
        source.href = `${options.sourceBase}&symbol=${encodeURIComponent(heading.id.slice(7))}`;
        source.setAttribute('aria-label', `View source for ${name}`);
        source.title = `View source for ${name}`;
        source.innerHTML =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M10 13l-2 2 2 2M14 13l2 2-2 2"/></svg><span>Source</span>';
        source.target = '_blank';
        source.rel = 'noreferrer';
        heading.append(source);
        controls.push(source);
      }
    }
    for (const pre of node.querySelectorAll('pre')) {
      const frame = document.createElement('div');
      frame.className = 'snippet-frame';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'snippet-copy';
      button.setAttribute('aria-label', 'Copy code');
      button.title = 'Copy code';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '16');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.5');
      svg.setAttribute('aria-hidden', 'true');
      const icon = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path'
      );
      icon.setAttribute('d', copyPath);
      svg.append(icon);
      const status = document.createElement('span');
      status.className = 'sr-only';
      status.setAttribute('aria-live', 'polite');
      button.append(svg, status);
      button.onclick = async () => {
        if (await copyText(pre.textContent ?? '')) {
          icon.setAttribute('d', copiedPath);
          status.textContent = 'Copied';
          button.setAttribute('aria-label', 'Copied');
        } else {
          status.textContent = 'Copy failed. Select the code to copy it.';
          button.title = 'Select the code to copy it';
        }
        if (!button.isConnected) return;
        const timer = setTimeout(() => {
          icon.setAttribute('d', copyPath);
          status.textContent = '';
          button.setAttribute('aria-label', 'Copy code');
          button.title = 'Copy code';
          timers.delete(timer);
        }, 2000);
        timers.add(timer);
      };
      pre.before(frame);
      frame.append(pre, button);
      snippets.push({ frame, pre });
    }
  }
  mount();
  return {
    update(next: { html: string; sourceBase: string }) {
      options = next;
      clear();
      mount();
    },
    destroy: clear
  };
}
