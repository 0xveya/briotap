import { prisma } from '../src/lib/server/prisma';
import { search } from '../src/lib/server/search';

const query = process.argv.slice(2).join(' ').trim();
if (!query) throw new Error('Usage: mise run search <name or import path>');

try {
  const results = await search(query);
  for (const result of results) {
    console.log(`${result.kind.padEnd(7)} ${result.path}${result.version ? `  ${result.version}` : ''}`);
    if (result.synopsis) console.log(`        ${result.synopsis}`);
  }
  if (!results.length) console.log('No local matches');
} finally {
  await prisma.$disconnect();
}
