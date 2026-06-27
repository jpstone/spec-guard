import { existsSync } from "node:fs";
import path from "node:path";
import type { SubagentAdapterKind } from "./config.ts";

/** Best-effort provider availability for config.check. No spawning: scans PATH for the adapter's
 * binary. Spec Guard never silently falls back to a different provider — this only reports. */

export type ProviderAvailability = "available" | "unavailable" | "unknown";

export function commandExistsOnPath(command: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const pathVar = env.PATH ?? env.Path ?? "";
  const dirs = pathVar.split(path.delimiter).filter((dir) => dir.length > 0);
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat", ".com"] : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      if (existsSync(path.join(dir, command + ext))) return true;
    }
  }
  return false;
}

const PROVIDER_BINARY: Record<Exclude<SubagentAdapterKind, "local" | "deterministic">, string> = {
  claude_code: "claude",
  pi: "pi"
};

export function resolveProviderAvailability(provider: SubagentAdapterKind, env: NodeJS.ProcessEnv = process.env): ProviderAvailability {
  // The deterministic command-runner (and its deprecated `local` alias) is not an LLM provider — it needs
  // nothing on PATH and is always available.
  if (provider === "deterministic" || provider === "local") return "available";
  return commandExistsOnPath(PROVIDER_BINARY[provider], env) ? "available" : "unavailable";
}
