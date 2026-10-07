import * as v from 'valibot';
import { cached, fetchJson } from './cache';

const requirement = v.object({ name: v.string(), requirement: v.string() });
export const requirementsSchema = v.object({
  go: v.optional(v.object({
    directDependencies: v.nullish(v.array(requirement), []),
    indirectDependencies: v.nullish(v.array(requirement), [])
  }))
});

/** Fetch one module's declared requirements, sharing the insights cache. */
export async function moduleRequirements(modulePath: string, version: string) {
  const result = await cached(`requirements:${modulePath}@${version}`, requirementsSchema, async () =>
    v.parse(requirementsSchema, await fetchJson(`https://api.deps.dev/v3alpha/systems/GO/packages/${encodeURIComponent(modulePath)}/versions/${encodeURIComponent(version)}:requirements`))
  );
  return result.go ? [
    ...result.go.directDependencies.map((item) => ({ ...item, indirect: false })),
    ...result.go.indirectDependencies.map((item) => ({ ...item, indirect: true }))
  ] : null;
}
