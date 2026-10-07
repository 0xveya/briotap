import { search } from '$lib/server/search';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ url }) => {
  const q = (url.searchParams.get('q') ?? '').slice(0, 200);
  const start = performance.now();
  try {
    return {
      q,
      results: await search(q),
      milliseconds: Math.round(performance.now() - start),
      failure: null
    };
  } catch (error) {
    console.error('Package search failed', error);
    return {
      q,
      results: [],
      milliseconds: Math.round(performance.now() - start),
      failure: 'Search could not finish. Please try again.'
    };
  }
};
