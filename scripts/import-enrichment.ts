import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma } from '../src/lib/server/prisma';

type PackageInfo = { path: string; name: string; synopsis: string };
type Entry = {
  path: string;
  module?: { path: string; version: string; repoUrl: string | null; commitTime: string | null };
  packages?: PackageInfo[];
  error?: string;
};

const source = 'nas-enrichment';
const input = resolve('data/module-enrichment.jsonl');
let offset = 0;
let imported = 0;

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid enrichment record at byte ${offset}`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error(`Invalid enrichment record at byte ${offset}`);
  return value;
}

function nullableString(value: unknown): string | null {
  return value == null ? null : string(value);
}

function moduleName(path: string): string {
  const parts = path.split('/');
  const last = parts.at(-1) ?? path;
  return /^v[2-9]\d*$/.test(last) ? parts.at(-2) ?? last : last;
}

function parseEntry(line: Buffer): Entry {
  const value = object(JSON.parse(line.toString('utf8')) as unknown);
  const path = string(value.path);
  if (value.error !== undefined) return { path, error: string(value.error) };
  const module = object(value.module);
  if (string(module.path) !== path) throw new Error(`Module path mismatch at byte ${offset}`);
  if (!Array.isArray(value.packages)) throw new Error(`Missing packages at byte ${offset}`);
  return {
    path,
    module: {
      path,
      version: string(module.version),
      repoUrl: nullableString(module.repoUrl),
      commitTime: nullableString(module.commitTime)
    },
    packages: value.packages.map((item) => {
      const pkg = object(item);
      return { path: string(pkg.path), name: string(pkg.name), synopsis: string(pkg.synopsis) };
    })
  };
}

async function importEntry(entry: Entry, nextOffset: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (entry.error !== undefined) {
      await tx.module.upsert({
        where: { path: entry.path },
        create: { path: entry.path, name: moduleName(entry.path), lastError: entry.error },
        update: { lastError: entry.error }
      });
    } else if (entry.module && entry.packages) {
      const module = entry.module;
      const commitTime = module.commitTime ? new Date(module.commitTime) : null;
      if (commitTime && Number.isNaN(commitTime.valueOf())) {
        throw new Error(`Invalid commit time at byte ${offset}`);
      }
      await tx.module.upsert({
        where: { path: entry.path },
        create: {
          path: entry.path, name: moduleName(entry.path), version: module.version,
          repoUrl: module.repoUrl, commitTime, enrichedAt: new Date()
        },
        update: {
          name: moduleName(entry.path), version: module.version,
          repoUrl: module.repoUrl, commitTime, enrichedAt: new Date(), lastError: null
        }
      });
      await tx.package.deleteMany({ where: { modulePath: entry.path } });
      await tx.package.createMany({
        data: entry.packages.map((pkg) => ({
          ...pkg, modulePath: entry.path, version: module.version
        })),
        skipDuplicates: true
      });
    }
    await tx.importCursor.upsert({
      where: { source },
      create: { source, offset: BigInt(nextOffset) },
      update: { offset: BigInt(nextOffset) }
    });
  }, { timeout: 30_000 });
  imported++;
  if (imported % 100 === 0) console.log(`${imported} enrichment records imported`);
}

try {
  const cursor = await prisma.importCursor.findUnique({ where: { source } });
  offset = Number(cursor?.offset ?? 0n);
  const size = (await stat(input)).size;
  if (size < offset) throw new Error('The enrichment file is shorter than the saved import cursor');
  if (size > offset) {
    let pending = Buffer.alloc(0);
    const stream = createReadStream(input, { start: offset, end: size - 1 });
    for await (const chunk of stream) {
      pending = Buffer.concat([pending, chunk as Buffer]);
      let newline: number;
      while ((newline = pending.indexOf(10)) !== -1) {
        const line = pending.subarray(0, newline);
        pending = pending.subarray(newline + 1);
        const entry = parseEntry(line);
        const nextOffset = offset + newline + 1;
        await importEntry(entry, nextOffset);
        offset = nextOffset;
      }
    }
  }
  console.log(`${imported} enrichment records imported; cursor at byte ${offset}`);
} finally {
  await prisma.$disconnect();
}
