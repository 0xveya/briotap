/** Resolve source against the selected module version. */
export function sourceBase(
  path: string,
  modulePath: string,
  version: string
): string {
  const params = new URLSearchParams({ module: modulePath, version });
  return `/source/${path}?${params}`;
}
