// Finding, and driving, the scroll pane inside a component.
//
// `<Table>`, `<Markdown>`'s host box and the montage are scrolled the way a
// trackpad scrolls them: `scrollTo` on the pane, once a frame. The pane is
// core's scroll container; a component that has one inside it does not
// hand it out, so it is found by walking down from a box around it.
//
// Core keeps a pane's extent in device pixels (`contentHeight`, `abs`) and
// takes `scrollTo` in logical ones, so the room is divided by the scale
// once, here (docs/scale.md).

interface ScrollNode {
  isScroller?: () => boolean;
  scrollTo(to: { x?: number; y?: number } | number): void;
  scrollY: number;
  contentHeight: number;
  scale?: number;
  abs: { y: number; width: number; height: number };
  children?: ScrollNode[];
}

export interface Scroller {
  scrollTo(to: { x?: number; y?: number }): void;
  /** How far the pane can move, in logical pixels. */
  room(): number;
  /** Where it is, in logical pixels. */
  y(): number;
  readonly contentHeight: number;
  viewportHeight(): number;
  /** Where the viewport's top is in the window, in logical pixels. */
  top(): number;
}

export function findScroller(from: unknown): Scroller | null {
  const node = find(from as ScrollNode | null);
  if (!node) return null;
  const s = (): number => node.scale ?? 1;
  return {
    scrollTo: (to) => node.scrollTo(to),
    room: () => Math.max(0, (node.contentHeight - node.abs.height) / s()),
    y: () => node.scrollY / s(),
    get contentHeight() {
      return node.contentHeight / s();
    },
    viewportHeight: () => node.abs.height / s(),
    top: () => node.abs.y / s(),
  };
}

function find(node: ScrollNode | null): ScrollNode | null {
  if (!node) return null;
  const stack = [node];
  while (stack.length) {
    const n = stack.shift() as ScrollNode;
    if (n.isScroller?.()) return n;
    if (n.children) stack.push(...n.children);
  }
  return null;
}
