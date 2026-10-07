import * as v from 'valibot';
import { cached, fetchJson, pkgUrl } from './cache';

const versionSchema = v.object({
  licenses: v.optional(v.array(v.string()), []),
  advisoryKeys: v.optional(v.array(v.object({ id: v.string() })), []),
  publishedAt: v.optional(v.string()),
  relatedProjects: v.optional(
    v.array(v.object({ projectKey: v.object({ id: v.string() }) })),
    []
  )
});
const projectSchema = v.object({
  starsCount: v.optional(v.number()),
  forksCount: v.optional(v.number()),
  openIssuesCount: v.optional(v.number()),
  homepage: v.optional(v.string()),
  description: v.optional(v.string()),
  scorecard: v.optional(
    v.object({
      overallScore: v.optional(v.number()),
      date: v.optional(v.string())
    })
  )
});
const importedSchema = v.object({
  importedBy: v.object({ items: v.array(v.string()), total: v.number() })
});
const versionsSchema = v.object({
  items: v.array(
    v.object({
      version: v.string(),
      commitTime: v.optional(v.string()),
      retracted: v.optional(v.boolean(), false)
    })
  )
});
const requirement = v.object({ name: v.string(), requirement: v.string() });
const requirementsSchema = v.object({
  go: v.optional(
    v.object({
      directDependencies: v.optional(v.array(requirement), []),
      indirectDependencies: v.optional(v.array(requirement), [])
    })
  )
});

async function optional<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    console.error('Package metadata unavailable', error);
    return null;
  }
}

export async function insights(
  path: string,
  modulePath: string,
  version: string
) {
  const base = `https://api.deps.dev/v3alpha/systems/GO/packages/${encodeURIComponent(modulePath)}/versions/${encodeURIComponent(version)}`;
  const [metadata, importedBy, versions, requirements] = await Promise.all([
    optional(() =>
      cached(`insights:${modulePath}@${version}`, versionSchema, async () =>
        v.parse(versionSchema, await fetchJson(base))
      )
    ),
    optional(() =>
      cached(`imported:${path}`, importedSchema, async () =>
        v.parse(
          importedSchema,
          await fetchJson(pkgUrl('imported-by', path, { limit: '40' }))
        )
      )
    ),
    optional(() =>
      cached(`versions:${modulePath}`, versionsSchema, async () =>
        v.parse(
          versionsSchema,
          await fetchJson(pkgUrl('versions', modulePath, { limit: '30' }))
        )
      )
    ),
    optional(() =>
      cached(
        `requirements:${modulePath}@${version}`,
        requirementsSchema,
        async () =>
          v.parse(requirementsSchema, await fetchJson(`${base}:requirements`))
      )
    )
  ]);
  const projectId = metadata?.relatedProjects[0]?.projectKey.id;
  const project = projectId
    ? await optional(() =>
        cached(`project:${projectId}`, projectSchema, async () =>
          v.parse(
            projectSchema,
            await fetchJson(
              `https://api.deps.dev/v3alpha/projects/${encodeURIComponent(projectId)}`
            )
          )
        )
      )
    : null;
  const major = /(?:\/v|\.v)([2-9]\d*)$/.exec(modulePath)?.[1];
  const releases =
    versions?.items.filter((item) =>
      major
        ? item.version.startsWith(`v${major}.`)
        : /^v[01]\./.test(item.version)
    ) ?? null;
  return {
    metadata,
    project,
    projectId,
    importedBy: importedBy?.importedBy ?? null,
    versions: releases,
    requirements: requirements?.go
      ? [
          ...requirements.go.directDependencies.map((item) => ({
            ...item,
            indirect: false
          })),
          ...requirements.go.indirectDependencies.map((item) => ({
            ...item,
            indirect: true
          }))
        ]
      : null,
    fetchedAt: new Date().toISOString()
  };
}
