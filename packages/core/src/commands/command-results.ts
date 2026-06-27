import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "../canonical/canonical-json.ts";
import { CommandResultSchema, type CommandResult } from "../schemas/embedded.ts";

export class CommandResultStore {
  private readonly artifactRoot: string;

  constructor(artifactRoot: string) {
    this.artifactRoot = artifactRoot;
  }

  private resultPath(id: string): string {
    return path.join(this.artifactRoot, "command-results", encodeURIComponent(id), "result.json");
  }

  storageRef(id: string): string {
    return `command-result:${id}`;
  }

  async put(result: CommandResult): Promise<CommandResult> {
    const parsed = CommandResultSchema.parse(result);
    await mkdir(path.dirname(this.resultPath(parsed.id)), { recursive: true });
    await writeFile(this.resultPath(parsed.id), `${canonicalJson(parsed)}\n`, "utf8");
    return parsed;
  }

  async get(refOrId: string): Promise<CommandResult> {
    const id = refOrId.startsWith("command-result:") ? refOrId.slice("command-result:".length) : refOrId;
    return CommandResultSchema.parse(JSON.parse(await readFile(this.resultPath(id), "utf8")));
  }
}
