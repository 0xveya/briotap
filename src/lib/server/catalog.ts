import { prisma } from './prisma';

export const collections = [
  {
    name: 'HTTP & networking',
    query: 'HTTP',
    paths: [
      'github.com/go-chi/chi/v5',
      'github.com/gin-gonic/gin',
      'github.com/labstack/echo/v4',
      'github.com/gorilla/mux'
    ]
  },
  {
    name: 'Data & storage',
    query: 'database',
    paths: [
      'github.com/jackc/pgx/v5',
      'gorm.io/gorm',
      'github.com/redis/go-redis/v9',
      'modernc.org/sqlite'
    ]
  },
  {
    name: 'CLI & logging',
    query: 'logging',
    paths: [
      'github.com/spf13/cobra',
      'github.com/rs/zerolog',
      'go.uber.org/zap',
      'github.com/stretchr/testify'
    ]
  }
];

export async function catalog() {
  const [packages, estimates, cursor] = await Promise.all([
    prisma.package.findMany({
      where: { path: { in: collections.flatMap((group) => group.paths) } }
    }),
    prisma.$queryRaw<
      { name: string; count: number }[]
    >`SELECT relname AS name, greatest(reltuples, 0)::float8 AS count FROM pg_class WHERE relname IN ('packages', 'modules', 'module_versions')`,
    prisma.importCursor.findUnique({ where: { source: 'nas-enrichment' } })
  ]);
  return {
    collections: collections.map((group) => ({
      ...group,
      packages: group.paths.flatMap((path) =>
        packages.filter((pkg) => pkg.path === path)
      )
    })),
    estimates,
    syncedAt: cursor?.updatedAt.toISOString() ?? null
  };
}

export async function packageInfo(path: string) {
  const pkg = await prisma.package.findUnique({
    where: { path },
    include: { module: true }
  });
  const module =
    pkg?.module ?? (await prisma.module.findUnique({ where: { path } }));
  if (!module || !module.version) return null;
  const packages = await prisma.package.findMany({
    where: { modulePath: module.path },
    orderBy: { path: 'asc' },
    take: 100
  });
  return {
    path,
    name: pkg?.name ?? module.name,
    synopsis: pkg?.synopsis ?? '',
    version: pkg?.version ?? module.version,
    modulePath: module.path,
    repoUrl: module.repoUrl,
    commitTime: module.commitTime?.toISOString() ?? null,
    packages
  };
}
