/** Link to the selected package inside its versioned module. */
export function goDocsUrl(
  path: string,
  modulePath: string,
  version: string
): string {
  return `https://pkg.go.dev/${modulePath}@${encodeURIComponent(version)}${path.slice(modulePath.length)}`;
}
