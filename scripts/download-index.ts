import { appendFile, open, rename, stat, writeFile } from 'node:fs/promises';

interface Entry { Path: string; Version: string; Timestamp: string }
interface State { timestamp: string; seen: string[] }

const output = 'data/module-index.jsonl';
const statePath = 'data/module-index.state.json';
const maxPages = Number(process.argv.find((arg) => arg.startsWith('--pages='))?.split('=')[1] ?? Infinity);

async function recover(): Promise<State> {
  const size = await stat(output).then((file) => file.size).catch(() => 0);
  if (!size) return { timestamp: '', seen: [] };
  const file = await open(output, 'r+');
  try {
    const length = Math.min(size, 1024 * 1024);
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, size - length);
    const end = buffer.lastIndexOf(10);
    if (end < 0) throw new Error('No complete JSONL record in the last MiB');
    if (end !== length - 1) await file.truncate(size - length + end + 1);
    const lines = buffer.subarray(0, end).toString('utf8').split('\n');
    const last = JSON.parse(lines.at(-1)!) as Entry;
    const seen: string[] = [];
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line.startsWith('{')) continue;
      const entry = JSON.parse(line) as Entry;
      if (entry.Timestamp !== last.Timestamp) break;
      seen.push(`${entry.Path}@${entry.Version}`);
    }
    return { timestamp: last.Timestamp, seen };
  } finally {
    await file.close();
  }
}

async function fetchPage(state: State): Promise<Entry[]> {
  const url = new URL('https://index.golang.org/index');
  url.searchParams.set('limit', '2000');
  if (state.timestamp) url.searchParams.set('since', state.timestamp);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`index.golang.org: ${response.status}`);
      return (await response.text()).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as Entry);
    } catch (cause) {
      if (attempt === 4) throw cause;
      await Bun.sleep(1000 * 2 ** attempt);
    }
  }
  throw new Error('Index request failed');
}

let state = await recover();
let page = 0;
let total = 0;
while (page < maxPages) {
  const entries = await fetchPage(state);
  const seen = new Set(state.seen);
  const fresh = entries.filter((entry) => entry.Timestamp > state.timestamp || (entry.Timestamp === state.timestamp && !seen.has(`${entry.Path}@${entry.Version}`)));
  if (fresh.length === 0) {
    if (entries.length === 2000) throw new Error(`Index cursor stuck at ${state.timestamp}`);
    break;
  }
  await appendFile(output, fresh.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  const timestamp = fresh.at(-1)!.Timestamp;
  const atTimestamp = fresh.filter((entry) => entry.Timestamp === timestamp).map((entry) => `${entry.Path}@${entry.Version}`);
  state = { timestamp, seen: timestamp === state.timestamp ? [...state.seen, ...atTimestamp] : atTimestamp };
  await writeFile(`${statePath}.tmp`, JSON.stringify(state));
  await rename(`${statePath}.tmp`, statePath);
  total += fresh.length;
  page++;
  console.log(`${page} pages, ${total} new versions; cursor ${timestamp}`);
  if (entries.length < 2000) break;
}
