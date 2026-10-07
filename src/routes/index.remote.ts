import { query } from '$app/server';
import * as v from 'valibot';
import { search } from '$lib/server/search';
import { catalog } from '$lib/server/catalog';
import { documentation } from '$lib/server/documentation';
import { insights } from '$lib/server/insights';

const path = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(300),
  v.regex(/^[a-zA-Z0-9._~!+\-/]+$/)
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
