import type { AggregateWorkPacket } from "../schemas/work-packet.ts";

type Specs = AggregateWorkPacket["specs"];

/** The cross-Spec dependency graph: each Spec id -> the sibling Spec ids it declared a dependency on. */
export function dependencyGraph(specs: Specs): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const spec of specs) graph.set(spec.id, spec.dependencies.spec_dependencies.map((edge) => edge.spec_id));
  return graph;
}

/**
 * Detect a cross-Spec dependency cycle. Returns the cycle as an ordered id path (e.g. ["a","b","a"]) or null if the
 * graph is acyclic. A cycle is a design smell — two Specs mutually depending should be one Spec, or share a
 * contract Spec. Unknown deps (rejected at plan time) are ignored here.
 */
export function detectDependencyCycle(specs: Specs): string[] | null {
  const graph = dependencyGraph(specs);
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  let cycle: string[] | null = null;
  const visit = (id: string): boolean => {
    color.set(id, GRAY);
    stack.push(id);
    for (const dep of graph.get(id) ?? []) {
      if (!graph.has(dep)) continue;
      if (color.get(dep) === GRAY) {
        cycle = [...stack.slice(stack.indexOf(dep)), dep];
        return true;
      }
      if (color.get(dep) === undefined && visit(dep)) return true;
    }
    stack.pop();
    color.set(id, BLACK);
    return false;
  };
  for (const id of graph.keys()) {
    if (color.get(id) === undefined && visit(id)) break;
  }
  return cycle;
}

/**
 * A topological implementation order — DEPENDENCIES before DEPENDENTS (so a producer is implemented before the
 * consumer that needs its contract). Assumes the graph is acyclic (run detectDependencyCycle first); the path
 * guard keeps it terminating even if a cycle slips through.
 */
export function topologicalOrder(specs: Specs): string[] {
  const graph = dependencyGraph(specs);
  const order: string[] = [];
  const done = new Set<string>();
  const visit = (id: string, path: Set<string>): void => {
    if (done.has(id) || path.has(id)) return;
    path.add(id);
    for (const dep of graph.get(id) ?? []) if (graph.has(dep)) visit(dep, path);
    path.delete(id);
    done.add(id);
    order.push(id); // post-order: a Spec is emitted AFTER its dependencies
  };
  for (const id of graph.keys()) visit(id, new Set());
  return order;
}
