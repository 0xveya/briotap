import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ cookies }) => ({
  wrapCode: cookies.get('briotap-wrap-code') !== 'false'
});
