import { query } from '$app/server';
import { prisma } from '$lib/server/prisma';

export const getImportStatus = query(async () => {
  const cursor = await prisma.importCursor.findUnique({ where: { source: 'go-module-index' } });
  return { bytesImported: Number(cursor?.offset ?? 0n) };
});
