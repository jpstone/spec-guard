import { readFile } from "node:fs/promises";
import type { DocsContentTokens } from "../schemas/embedded.ts";

const URL_RE = /https?:\/\/[^\s)]+/g;
const MD_LINK_RE = /\[[^\]]+\]\(([^)]+)\)/g;

export async function extractDocsContentTokens(paths: string[], projectRoot: string): Promise<DocsContentTokens> {
  const headings: string[] = [];
  const links: string[] = [];
  const examples: string[] = [];
  for (const rel of paths) {
    const text = await readFile(`${projectRoot}/${rel}`, "utf8").catch(() => "");
    const lines = text.split(/\r?\n/);
    let fence: string[] | null = null;
    for (const line of lines) {
      if (line.startsWith("```")) {
        if (fence === null) fence = [];
        else { examples.push(fence.join("\n")); fence = null; }
        continue;
      }
      if (fence !== null) { fence.push(line); continue; }
      const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (heading) headings.push(heading[2]!);
      for (const m of line.matchAll(MD_LINK_RE)) links.push(m[1]!);
      for (const m of line.matchAll(URL_RE)) links.push(m[0]!);
    }
  }
  return { paths: [...new Set(paths)], headings: [...new Set(headings)], links: [...new Set(links)], examples: [...new Set(examples.filter((v) => v.length > 0))] };
}
