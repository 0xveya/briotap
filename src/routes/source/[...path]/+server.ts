import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { documentationUrl, sourceLinks } from '$lib/server/source';

export const GET: RequestHandler = async ({ params, url }) => {
  const path = params.path;
  const modulePath = url.searchParams.get('module') ?? '';
  const version = url.searchParams.get('version') ?? '';
  const symbol = url.searchParams.get('symbol') ?? '';
  if (
    !modulePath ||
    path.length > 300 ||
    modulePath.length > 300 ||
    !/^[a-zA-Z0-9._~!+\-/]+$/.test(path) ||
    !/^[a-zA-Z0-9._~!+\-/]+$/.test(modulePath) ||
    !(path === modulePath || path.startsWith(`${modulePath}/`)) ||
    !/^[a-zA-Z0-9._+\-]{1,150}$/.test(version) ||
    !/^[a-zA-Z0-9_.\[\], ]{1,200}$/.test(symbol)
  )
    error(400, 'Invalid source location');
  let href: string | undefined;
  try {
    const links = await sourceLinks(path, modulePath, version);
    href = Object.hasOwn(links, symbol) ? links[symbol] : undefined;
  } catch {
    /* The original documentation remains usable if lookup fails. */
  }
  redirect(
    307,
    href ??
      `${documentationUrl(path, modulePath, version)}#${encodeURIComponent(symbol)}`
  );
};
