import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "../canonical/canonical-json.ts";
import { HumanDecisionSchema, type HumanDecision } from "../schemas/embedded.ts";

function encodeDecisionId(id: string): string {
  return encodeURIComponent(id).replaceAll("%", "~");
}

export class DecisionLog {
  private readonly root: string;

  constructor(artifactRoot: string) {
    this.root = path.join(artifactRoot, "decisions");
  }

  decisionPath(id: string): string {
    return path.join(this.root, `${encodeDecisionId(id)}.json`);
  }

  async append(decision: HumanDecision): Promise<HumanDecision> {
    const parsed = HumanDecisionSchema.parse(decision);
    await mkdir(this.root, { recursive: true });
    const filePath = this.decisionPath(parsed.id);
    try {
      await readFile(filePath, "utf8");
      throw new Error(`decision already exists: ${parsed.id}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await writeFile(filePath, `${canonicalJson(parsed)}\n`, "utf8");
    return parsed;
  }

  async get(id: string): Promise<HumanDecision> {
    const raw = await readFile(this.decisionPath(id), "utf8");
    return HumanDecisionSchema.parse(JSON.parse(raw));
  }

  async list(filter: { decision_type?: string | undefined; include_superseded?: boolean | undefined } = {}): Promise<HumanDecision[]> {
    let names: string[];
    try {
      names = await readdir(this.root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const decisions: HumanDecision[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const raw = await readFile(path.join(this.root, name), "utf8");
      const decision = HumanDecisionSchema.parse(JSON.parse(raw));
      if (filter.decision_type !== undefined && decision.decision_type !== filter.decision_type) continue;
      if (filter.include_superseded !== true && decision.superseded_by_decision_id !== null) continue;
      decisions.push(decision);
    }
    return decisions.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }

  async setSupersededBy(priorDecisionId: string, supersededByDecisionId: string): Promise<HumanDecision> {
    const prior = await this.get(priorDecisionId);
    if (prior.superseded_by_decision_id !== null && prior.superseded_by_decision_id !== supersededByDecisionId) {
      throw new Error(`decision is already superseded by ${prior.superseded_by_decision_id}`);
    }
    const updated = HumanDecisionSchema.parse({ ...prior, superseded_by_decision_id: supersededByDecisionId });
    await writeFile(this.decisionPath(priorDecisionId), `${canonicalJson(updated)}\n`, "utf8");
    return updated;
  }
}
