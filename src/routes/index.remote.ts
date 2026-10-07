import { query } from '$app/server';
import * as v from 'valibot';
import { search } from '$lib/server/search';
import { catalog } from '$lib/server/catalog';
import { documentation } from '$lib/server/documentation';
import { readme } from '$lib/server/readme';
import { sourceIndex, sourceFile } from '$lib/server/source';
import { releases } from '$lib/server/releases';
import { insights } from '$lib/server/insights';
import { moduleRequirements } from '$lib/server/requirements';
import { socketScore } from '$lib/server/socket';

const path = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(300),
  v.regex(/^[a-zA-Z0-9._~!+\-/]+$/),
  v.check((value) => value.split('/').every((part) => !!part && part !== '.' && part !== '..'), 'Invalid package path')
);
const version = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(150),
  v.regex(/^[a-zA-Z0-9._+\-]+$/)
);
export const searchPackages = query(
  v.pipe(v.string(), v.maxLength(200)),
  search
);
export const getCatalog = query(catalog);
export const getSocketScore = query(
  v.object({ modulePath: path, version }),
  (input) => socketScore(input.modulePath, input.version)
);
export const getDocumentation = query(
  v.object({ path, version }),
  async (input) => {
    try {
      return {
        ok: true as const,
        data: await documentation(input.path, input.version)
      };
    } catch {
      return {
        ok: false as const,
        message:
          'Documentation could not be loaded. Try again or open the original on pkg.go.dev.'
      };
    }
  }
);
export const getInsights = query(
  v.object({ path, modulePath: path, version }),
  (input) => insights(input.path, input.modulePath, input.version)
);

export const getReadme = query(v.object({ modulePath: path, version }), async (input) => {
  try { return { ok: true as const, data: await readme(input.modulePath, input.version) }; }
  catch { return { ok: false as const, message: 'The README could not be loaded. Try again or open pkg.go.dev.' }; }
});

const sourceLocation = v.pipe(
  v.object({ path, modulePath: path, version }),
  v.check((value) => value.path === value.modulePath || value.path.startsWith(`${value.modulePath}/`), 'Package is outside the selected module')
);

export const getSourceFiles = query(
  sourceLocation,
  async (input) => {
    try {
      return { ok: true as const, files: (await sourceIndex(input.path, input.modulePath, input.version)).files };
    } catch {
      return { ok: false as const, message: 'Source files could not be loaded. Open the original documentation to browse source.' };
    }
  }
);
export const getSourceFile = query(
  v.pipe(
    v.object({ path, modulePath: path, version, name: v.pipe(v.string(), v.maxLength(255), v.regex(/^[a-zA-Z0-9_.-]+\.go$/)) }),
    v.check((value) => value.path === value.modulePath || value.path.startsWith(`${value.modulePath}/`), 'Package is outside the selected module')
  ),
  async (input) => {
    try {
      return { ok: true as const, file: await sourceFile(input.path, input.modulePath, input.version, input.name) };
    } catch {
      return { ok: false as const, message: 'This file could not be displayed. Open it in the source repository.' };
    }
  }
);
export const getReleases = query(v.pipe(v.string(), v.maxLength(500)), releases);

export const getModuleRequirements = query(v.object({ modulePath: path, version }), async (input) => {
  try {
    const requirements = await moduleRequirements(input.modulePath, input.version);
    return requirements === null
      ? { ok: false as const, message: 'Requirements are unavailable for this module version.' }
      : { ok: true as const, requirements };
  } catch {
    return { ok: false as const, message: 'Requirements could not be loaded. Try again or open deps.dev.' };
  }
});
