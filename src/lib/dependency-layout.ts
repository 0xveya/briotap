export const DEPENDENCY_CARD_WIDTH = 264;
export function dependencyCardHeight(name: string) {
  return Math.max(100, Math.ceil(name.length / 30) * 19 + 78);
}
export type DependencyLayoutNode = { id: string; depth: number; height: number };
export type DependencyLayoutEdge = { from: string; to: string };
export type DependencyPosition = { id: string; left: number; top: number };
const gap = 64;
const rowGap = 64;
const levelGap = 110;
const margin = 40;
const step = DEPENDENCY_CARD_WIDTH + gap;

/** Wrap each depth into compact bands, with connections routed through clear gutters. */
export function layoutDependencies(nodes: readonly DependencyLayoutNode[], edges: readonly DependencyLayoutEdge[]) {
  const levels = Map.groupBy(nodes, (node) => node.depth);
  const ordered = [...levels.entries()].sort(([a], [b]) => a - b);
  const largest = Math.max(1, ...ordered.map(([, level]) => level.length));
  let columns = 1;
  let best = Infinity;
  function rows(level: DependencyLayoutNode[], count: number) {
    const result: DependencyLayoutNode[][] = [];
    for (let index = 0; index < level.length; index += count) result.push(level.slice(index, index + count));
    return result;
  }
  for (let count = 1; count <= Math.min(8, largest); count++) {
    const width = count * step - gap + margin * 2;
    const height = ordered.reduce((sum, [, level]) => sum + rows(level, count).reduce((total, row) => total + Math.max(...row.map((node) => node.height)) + rowGap, 0) - rowGap, margin * 2 + (ordered.length - 1) * levelGap);
    const size = Math.max(width / 1.4, height);
    if (size < best) { best = size; columns = count; }
  }
  const width = columns * step - gap + margin * 2;
  const placed = new Map<string, DependencyPosition>();
  const bands = new Map<number, { top: number; bottom: number }>();
  const rowBottoms = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    const parents = incoming.get(edge.to) ?? [];
    parents.push(edge.from);
    incoming.set(edge.to, parents);
  }
  let top = margin;
  for (const [depth, level] of ordered) {
    const center = (node: DependencyLayoutNode) => {
      const parents = (incoming.get(node.id) ?? []).flatMap((id) => {
        const parent = placed.get(id);
        return parent ? [parent.left] : [];
      });
      return parents.length ? parents.reduce((sum, value) => sum + value, 0) / parents.length : width / 2;
    };
    const sorted = level.map((node, index) => ({ node, index, center: center(node) })).sort((a, b) => a.center - b.center || a.index - b.index).map((item) => item.node);
    const bandTop = top;
    for (const row of rows(sorted, columns)) {
      const offset = margin + Math.floor((columns - row.length) / 2) * step;
      const bottom = top + Math.max(...row.map((node) => node.height));
      row.forEach((node, column) => {
        placed.set(node.id, { id: node.id, left: offset + column * step, top });
        rowBottoms.set(node.id, bottom);
      });
      top = bottom + rowGap;
    }
    bands.set(depth, { top: bandTop, bottom: top - rowGap });
    top += levelGap - rowGap;
  }
  const height = Math.max(0, top - levelGap + margin);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const segments = new Map<string, { horizontal: boolean; fixed: number; ranges: [number, number][] }>();
  const arrows = new Set<string>();
  const paths = edges.flatMap((edge) => {
    const from = placed.get(edge.from), to = placed.get(edge.to);
    const source = nodeMap.get(edge.from), target = nodeMap.get(edge.to);
    if (!from || !to || !source || !target) return [];
    const sourceBand = bands.get(source.depth)!;
    const targetBand = bands.get(target.depth)!;
    const startX = from.left + DEPENDENCY_CARD_WIDTH / 2;
    const endX = to.left + DEPENDENCY_CARD_WIDTH / 2;
    const exitY = rowBottoms.get(source.id)! + rowGap / 2;
    const enterY = to.top - rowGap / 2;
    const fromGutter = from.left + DEPENDENCY_CARD_WIDTH + gap / 2;
    const toGutter = to.left - gap / 2;
    const points = source.depth < target.depth
      ? [[startX, from.top + source.height], [startX, exitY], [fromGutter, exitY], [fromGutter, sourceBand.bottom + levelGap / 2], [toGutter, sourceBand.bottom + levelGap / 2], [toGutter, enterY], [endX, enterY], [endX, to.top]]
      : [[startX, from.top + source.height], [startX, exitY], [fromGutter, exitY], [fromGutter, sourceBand.bottom + rowGap / 2], [width - 8, sourceBand.bottom + rowGap / 2], [width - 8, targetBand.top - rowGap / 2], [toGutter, targetBand.top - rowGap / 2], [toGutter, enterY], [endX, enterY], [endX, to.top]];
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1]!, b = points[index]!;
      const horizontal = a[1] === b[1];
      const fixed = horizontal ? a[1]! : a[0]!;
      const first = horizontal ? a[0]! : a[1]!;
      const second = horizontal ? b[0]! : b[1]!;
      const id = `${horizontal ? 'h' : 'v'}:${fixed}`;
      const segment = segments.get(id) ?? { horizontal, fixed, ranges: [] };
      segment.ranges.push([Math.min(first, second), Math.max(first, second)]);
      segments.set(id, segment);
    }
    arrows.add(`M${points.at(-2)!.join(',')} L${points.at(-1)!.join(',')}`);
    return [{ ...edge, d: points.map(([x, y], index) => `${index ? 'L' : 'M'}${x},${y}`).join(' ') }];
  });
  const strokes: string[] = [];
  for (const segment of segments.values()) {
    const merged: [number, number][] = [];
    for (const range of segment.ranges.sort((a, b) => a[0] - b[0])) {
      const last = merged.at(-1);
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push([...range]);
    }
    for (const [start, end] of merged) strokes.push(segment.horizontal ? `M${start},${segment.fixed} L${end},${segment.fixed}` : `M${segment.fixed},${start} L${segment.fixed},${end}`);
  }
  return { positions: [...placed.values()], paths, segments: strokes, arrows: [...arrows], width, height };
}
