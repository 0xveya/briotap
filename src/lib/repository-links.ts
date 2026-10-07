/** Metric pages for the repository hosts supported by the package index. */
export function repositoryMetrics(repository: string | null) {
  if (!repository) return null;
  let url: URL;
  try { url = new URL(repository); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const base = `${url.origin}${url.pathname.replace(/\/$/, '').replace(/\.git$/, '')}`;
  if (url.hostname === 'github.com') return {
    stars: `${base}/stargazers`, forks: `${base}/forks`, issues: `${base}/issues?q=is%3Aissue%20is%3Aopen`
  };
  if (url.hostname === 'gitlab.com') return {
    stars: `${base}/-/starrers`, forks: `${base}/-/forks`, issues: `${base}/-/issues?state=opened`
  };
  return null;
}
