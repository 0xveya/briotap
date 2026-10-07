<script lang="ts">
  let {
    name,
    size = 18
  }: {
    name:
      | 'search'
      | 'arrow'
      | 'copy'
      | 'star'
      | 'external'
      | 'package'
      | 'book'
      | 'branch'
      | 'network'
      | 'chevron'
      | 'sun'
      | 'moon'
      | 'file-code'
      | 'check'
      | 'more'
      | 'close';
    size?: number;
  } = $props();
  const paths = {
    search: 'm21 21-4.5-4.5M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    copy: 'M9 9h12v12H9zM15 9V3H3v12h6',
    star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
    external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
    package: 'm12 2 10 5v10l-10 5-10-5V7zM2 7l10 5 10-5M12 12v10M7 4.5l10 5',
    book: 'M12 5v16M12 5C8 2 3 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-2-7-1-10 1',
    branch: 'M6 3v12a6 6 0 0 0 12 0V9M6 9h6a6 6 0 0 0 6-6',
    network: 'M9 2h6v6H9zM2 16h6v6H2zM16 16h6v6h-6zM12 8v4M5 16v-4h14v4',
    chevron: 'm6 9 6 6 6-6',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z',
    'file-code': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M10 13l-2 2 2 2M14 13l2 2-2 2',
    check: 'm5 12 4 4L19 6',
    more: 'M5 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2M19 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2',
    close: 'm6 6 12 12M6 18 18 6'
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"><path d={paths[name]} /></svg
>
