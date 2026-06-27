export interface ActionExecutionContext {
  projectRoot?: string;
  artifactRoot?: string;
  /** Internal test-only escape hatch; CLI/MCP generated contexts do not set this. */
  allowTestFixtureVerifier?: boolean;
}

export function resolveProjectRoot(context: ActionExecutionContext = {}): string {
  return context.projectRoot ?? process.cwd();
}
