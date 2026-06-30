import { aggregateStoreForContext, topologicalOrder } from "../../src/index.ts";
import { workParallelismPlan } from "../../src/actions/work.ts";

export async function recordSequentialParallelismPlan(root: string, id = "WP1") {
  const context = { projectRoot: root };
  const aggregate = await aggregateStoreForContext(context).read(id);
  const order = topologicalOrder(aggregate.specs);
  return workParallelismPlan({
    id,
    strategy: "sequential",
    reasoning: "Test fixture runs Specs sequentially after implementation planning.",
    execution_groups: order.map((specId, index) => ({
      id: `wave-${index + 1}`,
      spec_ids: [specId],
      rationale: "Test fixture keeps each Spec in its own dependency-ordered wave."
    })),
    constraints: [],
    risks: []
  }, context);
}
