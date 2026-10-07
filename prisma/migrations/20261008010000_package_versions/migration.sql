CREATE TABLE "package_versions" (
    "path" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "module_path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "synopsis" TEXT NOT NULL,
    "documentation" TEXT,
    "symbols" JSONB,

    CONSTRAINT "package_versions_pkey" PRIMARY KEY ("path", "version"),
    CONSTRAINT "package_versions_module_path_fkey" FOREIGN KEY ("module_path")
        REFERENCES "modules"("path") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "package_versions" ("path", "version", "module_path", "name", "synopsis")
SELECT "path", "version", "module_path", "name", "synopsis" FROM "packages";

CREATE INDEX "package_versions_module_path_version_idx"
    ON "package_versions"("module_path", "version");

CREATE INDEX "package_versions_documentation_fts_idx" ON "package_versions" USING GIN (
    (to_tsvector('english', coalesce("documentation", '')) ||
     jsonb_to_tsvector('english', coalesce("symbols", '[]'::jsonb), '["string"]'::jsonb))
) WHERE "documentation" IS NOT NULL OR "symbols" IS NOT NULL;
