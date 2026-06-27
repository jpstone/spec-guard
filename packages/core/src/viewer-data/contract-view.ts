import { ContractStore } from "../storage/contract-store.ts";

// One frozen contract version, for the contract viewer page + the dashboard contracts list.
export interface ContractDetailView {
  id: string;
  content_hash: string;
  surface: unknown;
  first_version: boolean;
  produced_by: { work_id: string; spec_id: string } | null;
}

export interface ContractsOverview {
  // Every frozen contract version in the committed registry (across ids), newest-id first by name.
  versions: ContractDetailView[];
}

function toView(artifact: { id: string; content_hash: string; surface: unknown; first_version: boolean; produced_by: { work_id: string; spec_id: string } | null }): ContractDetailView {
  return { id: artifact.id, content_hash: artifact.content_hash, surface: artifact.surface, first_version: artifact.first_version, produced_by: artifact.produced_by };
}

/** Every contract version in the registry — the dashboard's "Contracts" list reads this. */
export async function buildContractsOverview(root: string): Promise<ContractsOverview> {
  const store = new ContractStore(root);
  const versions: ContractDetailView[] = [];
  for (const id of await store.listIds()) {
    for (const artifact of await store.listVersions(id)) versions.push(toView(artifact));
  }
  return { versions };
}

/** One contract version (id @ content_hash) for the clean contract viewer page; null if it isn't in the registry. */
export async function buildContractVersionView(root: string, id: string, contentHash: string): Promise<ContractDetailView | null> {
  const artifact = await new ContractStore(root).getVersion({ id, content_hash: contentHash });
  return artifact === null ? null : toView(artifact);
}
