export type SymbolEntry = {
  id: string;
  name: string;
  kind: string;
  signature: string;
};
export type SymbolKind =
  'all' | 'error' | 'func' | 'method' | 'type' | 'const' | 'var';
export const symbolCategories: { kind: SymbolKind; label: string }[] = [
  { kind: 'all', label: 'All' },
  { kind: 'error', label: 'Errors' },
  { kind: 'type', label: 'Types' },
  { kind: 'func', label: 'Functions' },
  { kind: 'method', label: 'Methods' },
  { kind: 'const', label: 'Constants' },
  { kind: 'var', label: 'Variables' }
];

/** Recognize Go error naming conventions without guessing from comments. */
export function symbolCategory(symbol: SymbolEntry): SymbolKind {
  if (
    ['var', 'const', 'type'].includes(symbol.kind) &&
    /^(?:Err[A-Z_])|Error$/.test(symbol.name)
  )
    return 'error';
  if (symbol.kind === 'func')
    return symbol.name.includes('.') ? 'method' : 'func';
  return symbol.kind === 'type' || symbol.kind === 'const'
    ? symbol.kind
    : 'var';
}
export type IndexedSymbol = {
  symbol: SymbolEntry;
  name: string;
  leaf: string;
  signature: string;
  initials: string;
  kind: SymbolKind;
};

/** Normalize paths, receiver syntax, and camel-case abbreviations once per API. */
export function indexSymbols(symbols: SymbolEntry[]): IndexedSymbol[] {
  return symbols.map((symbol) => ({
    symbol,
    name: symbol.name.toLowerCase(),
    leaf: symbol.name.split('.').at(-1)!.toLowerCase(),
    signature: symbol.signature.toLowerCase(),
    initials: (symbol.name.match(/[A-Z](?=[a-z])|[A-Z]+(?![a-z])/g) ?? [])
      .map((word) => word[0])
      .join('')
      .toLowerCase(),
    kind: symbolCategory(symbol)
  }));
}

/** Rank exact names before prefixes, substrings, abbreviations, and signatures. */
export function searchSymbols(
  index: IndexedSymbol[],
  query: string,
  kind: SymbolKind,
  signatures: boolean
): SymbolEntry[] {
  const tokens = query.toLowerCase().match(/[\w]+/g) ?? [];
  const nameQuery = tokens.join('.');
  return index
    .flatMap((item, order) => {
      if (kind !== 'all' && item.kind !== kind) return [];
      let score = 0;
      for (const token of tokens) {
        if (item.name.includes(token))
          score +=
            item.leaf === token ? 0 : item.leaf.startsWith(token) ? 2 : 4;
        else if (token.length >= 2 && item.initials.startsWith(token))
          score += item.initials === token ? 8 : 12;
        else if (signatures && item.signature.includes(token)) score += 20;
        else return [];
      }
      if (tokens.length)
        score +=
          item.name === nameQuery ? -20 : item.leaf === nameQuery ? -10 : 0;
      const category = symbolCategories.findIndex(
        (category) => category.kind === item.kind
      );
      return [{ symbol: item.symbol, score, order, category }];
    })
    .sort(
      (a, b) =>
        a.score - b.score ||
        (!tokens.length
          ? a.category - b.category ||
            a.symbol.name.localeCompare(b.symbol.name)
          : a.order - b.order)
    )
    .map((item) => item.symbol);
}

export function matchedName(
  name: string,
  query: string
): { text: string; matched: boolean }[] {
  const tokens = query.toLowerCase().match(/[\w]+/g) ?? [];
  const lower = name.toLowerCase();
  const parts: { text: string; matched: boolean }[] = [];
  for (let position = 0; position < name.length;) {
    const token = tokens.find((item) => lower.startsWith(item, position));
    if (token) {
      parts.push({
        text: name.slice(position, position + token.length),
        matched: true
      });
      position += token.length;
    } else {
      const previous = parts.at(-1);
      if (previous && !previous.matched) previous.text += name[position];
      else parts.push({ text: name[position]!, matched: false });
      position++;
    }
  }
  return parts;
}
