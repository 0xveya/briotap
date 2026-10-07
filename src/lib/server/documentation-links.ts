/** Normalize a pkg.go.dev package link while retaining its upstream fallback. */
export function documentationLink(href: string) {
  let url: URL;
  let pathname: string;
  try {
    url = new URL(href, 'https://pkg.go.dev');
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (url.origin !== 'https://pkg.go.dev') return null;
  const match = /^\/([a-zA-Z0-9._~!+\-/]+?)(?:@([a-zA-Z0-9._+\-]{1,150})(\/[a-zA-Z0-9._~!+\-/]+)?)?$/.exec(pathname);
  if (!match) return { external: url.href, path: null, local: null };
  const path = match[1]! + (match[3] ?? '');
  const local = new URL(`/package/${path}`, 'https://briotap.invalid');
  if (match[2]) local.searchParams.set('version', match[2]);
  local.searchParams.set('tab', 'docs');
  local.hash = /^#[A-Z]/.test(url.hash) ? `#symbol-${url.hash.slice(1)}` : url.hash;
  return { external: url.href, path, local: `${local.pathname}${local.search}${local.hash}` };
}
