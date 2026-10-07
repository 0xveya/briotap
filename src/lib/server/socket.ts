import * as v from 'valibot';
import { cached } from './cache';
import { responseText } from './response';

/** Cache the public badge score with the other upstream snapshots. */
export async function socketScore(modulePath: string, version: string): Promise<number | null> {
  const path = modulePath.split('/').map(encodeURIComponent).join('/');
  try {
    return await cached(`socket:v1:${modulePath}@${version}`, v.nullable(v.number()), async () => {
      const response = await fetch(
        `https://socket.dev/api/badge/go/package/${path}?version=${encodeURIComponent(version)}`,
        { signal: AbortSignal.timeout(5000), cache: 'no-store' }
      );
      if (!response.ok) throw new Error(`Socket returned ${response.status}`);
      const svg = await responseText(response, 64 * 1024);
      const match = /<title>Socket: (\d{1,3})<\/title>/.exec(svg);
      const score = match ? Number(match[1]) : null;
      return score !== null && score <= 100 ? score : null;
    });
  } catch {
    return null;
  }
}
