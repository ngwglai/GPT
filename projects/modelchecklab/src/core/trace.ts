import type { Node, Step } from "./types";
export function reconstruct(nodes: Node[], id: number): Step[] {
  const result: Step[] = [];
  let cursor: number | null = id;
  while (cursor !== null) {
    const n: Node = nodes[cursor];
    result.push({ state: n.state, action: n.action });
    cursor = n.parent;
  }
  return result.reverse();
}
