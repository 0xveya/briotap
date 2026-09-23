-- CreateTable
CREATE TABLE "module_versions" (
    "module_path" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "observed_at" TEXT NOT NULL,

    CONSTRAINT "module_versions_pkey" PRIMARY KEY ("module_path","version")
);

-- CreateTable
CREATE TABLE "import_cursors" (
    "source" TEXT NOT NULL,
    "offset" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_cursors_pkey" PRIMARY KEY ("source")
);
