function escape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
}

/** Render a self-contained badge without scripts, fonts, or external resources. */
export function badge(label: string, value: string): string {
  const left = Math.ceil(label.length * 7 + 16);
  const right = Math.ceil(value.length * 7 + 16);
  const width = left + right;
  const title = escape(`${label}: ${value}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${title}"><title>${title}</title><rect width="${width}" height="20" rx="3" fill="#181418"/><path d="M${left} 0h${right - 3}q3 0 3 3v14q0 3-3 3H${left}z" fill="#ff83b3"/><g font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle"><text x="${left / 2}" y="14" fill="#fff">${escape(label)}</text><text x="${left + right / 2}" y="14" fill="#181418">${escape(value)}</text></g></svg>`;
}
