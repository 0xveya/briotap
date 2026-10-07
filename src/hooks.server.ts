import type { Handle } from '@sveltejs/kit';
import { Admission, admittedResponse } from '$lib/server/admission';

const admission = new Admission();

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/_app/') && !event.url.pathname.startsWith('/_app/remote/'))
    return resolve(event);
  const release = admission.acquire(event.getClientAddress());
  if (!release) return new Response('Too many requests. Try again shortly.', {
    status: 429,
    headers: { 'Retry-After': '1', 'Cache-Control': 'no-store' }
  });
  try {
    return admittedResponse(await resolve(event), release);
  } catch (error) {
    release();
    throw error;
  }
};
