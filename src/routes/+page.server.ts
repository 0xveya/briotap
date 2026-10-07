import { catalog } from '$lib/server/catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ catalog: await catalog() });
