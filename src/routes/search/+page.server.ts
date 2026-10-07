import { search } from '$lib/server/search';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ url }) => {
  const q = (url.searchParams.get('q') ?? '').slice(0, 200);
  const start = performance.now();
  return {
    q,
    results: await search(q),
    milliseconds: Math.round(performance.now() - start)
  };
};
