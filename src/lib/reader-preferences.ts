import * as v from 'valibot';
const schema = v.object({
  textSize: v.picklist(['normal', 'large']),
  wrapCode: v.boolean()
});
export type ReaderPreferences = v.InferOutput<typeof schema>;
const key = 'briotap:reader';

export function readReaderPreferences(): ReaderPreferences | null {
  try {
    const result = v.safeParse(
      schema,
      JSON.parse(localStorage.getItem(key) ?? 'null') as unknown
    );
    return result.success ? result.output : null;
  } catch {
    return null;
  }
}

export function saveReaderPreferences(preferences: ReaderPreferences): void {
  try {
    localStorage.setItem(key, JSON.stringify(preferences));
  } catch {
    /* Storage can be disabled by the browser. */
  }
}
