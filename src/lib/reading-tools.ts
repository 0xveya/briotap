/** Add copy controls and permalinks to sanitized documentation. */
export function readingTools(node: HTMLElement, _html: string) {
  const controls: HTMLElement[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function clear() {
    for (const control of controls) control.remove();
    controls.length = 0;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  }
  function mount() {
    for (const heading of node.querySelectorAll<HTMLElement>(
      'h2[id], h3[id], h4[id]'
    )) {
      const link = document.createElement('a');
      link.className = 'heading-link';
      link.href = `#${heading.id}`;
      link.textContent = '#';
      link.setAttribute('aria-label', `Link to ${heading.textContent}`);
      heading.append(link);
      controls.push(link);
    }
    for (const pre of node.querySelectorAll('pre')) {
      const toolbar = document.createElement('div');
      toolbar.className = 'snippet-toolbar';
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-live', 'polite');
      button.textContent = 'Copy code';
      button.onclick = async () => {
        try {
          await navigator.clipboard.writeText(pre.textContent ?? '');
          button.textContent = 'Copied';
        } catch {
          button.textContent = 'Select code to copy';
        }
        const timer = setTimeout(() => {
          button.textContent = 'Copy code';
          timers.delete(timer);
        }, 2000);
        timers.add(timer);
      };
      toolbar.append(button);
      pre.before(toolbar);
      controls.push(toolbar);
    }
  }
  mount();
  return {
    update(_html: string) {
      clear();
      mount();
    },
    destroy: clear
  };
}
