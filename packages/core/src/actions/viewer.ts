import { z } from "zod";
import type { ActionResult } from "./result.ts";

export const ServeViewerInputSchema = z.object({
  host: z.string().min(1).optional(),
  port: z.number().int().min(0).max(65535).optional(),
  open_browser: z.boolean().optional()
}).strict();
export type ServeViewerInput = z.infer<typeof ServeViewerInputSchema>;

export interface ServeViewerData extends Record<string, unknown> {
  host: string;
  port: number;
  url: string;
  artifact_root: string;
}

export function serveViewerSuccessResult(data: ServeViewerData): ActionResult<ServeViewerData> {
  return {
    ok: true,
    action_id: "serve.viewer",
    data,
    diagnostics: [],
    mutations: [{ artifact: "viewer", operation: "none", paths: [], summary: "Started local Spec Guard viewer HTTP server." }],
    next_actions: [],
    summary: `Viewer running at ${data.url}`
  };
}
