import { z } from "zod";
import { DiagnosticSchema } from "../schemas/embedded.ts";

const ActionObjectSchema = z.object({}).catchall(z.unknown());
export type ActionObject = z.infer<typeof ActionObjectSchema>;

export const MutationSummarySchema = z.object({
  artifact: z.string(),
  operation: z.enum(["create", "update", "audit_record", "supersede", "archive_metadata", "none"]),
  paths: z.array(z.string()),
  summary: z.string()
}).strict();
export type MutationSummary = z.infer<typeof MutationSummarySchema>;

export const NextActionSchema = z.object({
  action_id: z.string(),
  cli: z.string().nullable(),
  mcp: z.string().nullable(),
  reason: z.string(),
  suggested_input: ActionObjectSchema.nullable()
}).strict();
export type NextAction = z.infer<typeof NextActionSchema>;

export const ActionResultSchema = z.object({
  ok: z.boolean(),
  action_id: z.string(),
  data: ActionObjectSchema,
  diagnostics: z.array(DiagnosticSchema),
  mutations: z.array(MutationSummarySchema),
  next_actions: z.array(NextActionSchema),
  summary: z.string()
}).strict();
export type ActionResult<TData extends object = ActionObject> = Omit<z.infer<typeof ActionResultSchema>, "data"> & { data: TData };

export function okActionResult<TData extends object = Record<string, never>>(
  actionId: string,
  summary: string,
  data?: TData
): ActionResult<TData | Record<string, never>> {
  return {
    ok: true,
    action_id: actionId,
    data: data === undefined ? {} : data,
    diagnostics: [],
    mutations: [],
    next_actions: [],
    summary
  };
}
