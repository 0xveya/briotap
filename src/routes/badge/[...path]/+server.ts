import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { socketScore } from '$lib/server/socket';
import { badge } from '$lib/server/badge';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
  const path = params.path;
  const type = url.searchParams.get('type') ?? 'version';
  if (path.length > 300 || !/^[a-zA-Z0-9._~!+\-/]+$/.test(path) ||
    !path.split('/').every((part) => part && part !== '.' && part !== '..')) error(400, 'Invalid package path');
  if (!['version', 'docs', 'socket'].includes(type)) error(400, 'Use type=version, docs, or socket');
  const pkg = await prisma.package.findUnique({ where: { path }, select: { version: true, modulePath: true } });
  if (!pkg) error(404, 'Package is not indexed');
  let label = 'briotap';
  let value = type === 'docs' ? 'docs' : pkg.version;
  if (type === 'socket') {
    label = 'Socket';
    const score = await socketScore(pkg.modulePath, pkg.version);
    value = score === null ? 'unavailable' : `${score}/100`;
  }
  return new Response(badge(label, value), { headers: {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'none'; sandbox"
  } });
};
