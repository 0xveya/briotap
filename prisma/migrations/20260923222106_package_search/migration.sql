-- CreateTable
CREATE TABLE "modules" (
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "repo_url" TEXT,
    "commit_time" TIMESTAMPTZ(6),
    "enriched_at" TIMESTAMPTZ(6),
    "last_error" TEXT,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("path")
);

-- CreateTable
CREATE TABLE "packages" (
    "path" TEXT NOT NULL,
    "module_path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "synopsis" TEXT NOT NULL,
    "version" TEXT NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("path")
);

-- CreateTable
CREATE TABLE "enrichment_cursors" (
    "source" TEXT NOT NULL,
    "last_path" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrichment_cursors_pkey" PRIMARY KEY ("source")
);

-- CreateIndex
CREATE INDEX "packages_module_path_idx" ON "packages"("module_path");

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_module_path_fkey" FOREIGN KEY ("module_path") REFERENCES "modules"("path") ON DELETE CASCADE ON UPDATE CASCADE;

-- Local package search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "modules_path_prefix_idx" ON "modules" (lower("path") text_pattern_ops);
CREATE INDEX "modules_name_prefix_idx" ON "modules" (lower("name") text_pattern_ops);
CREATE INDEX "modules_path_trgm_idx" ON "modules" USING GIN (lower("path") gin_trgm_ops);
CREATE INDEX "modules_name_trgm_idx" ON "modules" USING GIN (lower("name") gin_trgm_ops);
CREATE INDEX "packages_path_prefix_idx" ON "packages" (lower("path") text_pattern_ops);
CREATE INDEX "packages_name_prefix_idx" ON "packages" (lower("name") text_pattern_ops);
CREATE INDEX "packages_path_trgm_idx" ON "packages" USING GIN (lower("path") gin_trgm_ops);
CREATE INDEX "packages_name_trgm_idx" ON "packages" USING GIN (lower("name") gin_trgm_ops);
CREATE INDEX "packages_synopsis_fts_idx" ON "packages" USING GIN (to_tsvector('english', "synopsis"));
