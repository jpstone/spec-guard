import type { ActionResult } from "@spec-guard/core";

export function renderInitPlainText(result: ActionResult): string {
  const data = result.data as {
    artifact_root?: string;
    generated_files?: Array<{ path: string; status: string }>;
    next_steps?: string[];
    recommended_tool_calls?: string[];
  };

  const lines = ["Spec Guard initialized successfully", "", `Artifact root: ${data.artifact_root ?? ".spec-guard/"}`, "", "Generated project files:"];
  for (const file of data.generated_files ?? []) {
    lines.push(`- ${file.path} (${file.status})`);
  }
  lines.push("", "Immediate next steps:");
  for (const step of data.next_steps ?? []) lines.push(`- ${step}`);
  lines.push("", "Recommended first tool calls:");
  for (const tool of data.recommended_tool_calls ?? []) lines.push(`- ${tool}`);
  lines.push("");
  return lines.join("\n");
}
