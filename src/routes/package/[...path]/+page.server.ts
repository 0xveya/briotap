import { error } from '@sveltejs/kit';
import { packageInfo } from '$lib/server/catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
  const pkg = await packageInfo(params.path);
  if (!pkg)
    error(
      404,
      'This package is not in the local index yet. Try searching for its module.'
    );
  const requested = url.searchParams.get('version');
  if (requested && !/^[a-zA-Z0-9._+\-]{1,150}$/.test(requested))
    error(400, 'Invalid version');
  return {
    pkg: { ...pkg, version: requested ?? pkg.version },
    latestVersion: pkg.version
  };
};
