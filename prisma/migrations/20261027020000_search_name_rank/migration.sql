CREATE INDEX IF NOT EXISTS "packages_name_rank_idx" ON "packages"
    (lower("name"), ("path" = "module_path") DESC, length("path"), "path");
