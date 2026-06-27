import path from "node:path";
import type { CommandSpec } from "../schemas/embedded.ts";

const PLACEHOLDER_EXECUTABLES = new Set(["echo", "printf", "true", "false", "pwd", "whoami"]);
const VERSION_HELP_ARGS = new Set(["--version", "-v", "-V", "version", "--help", "help"]);
const SELF_CHECK_EXECUTABLES = new Set(["spec-guard", "pi"]);
const SELF_INSPECT_ARGS = new Set(["", "status", "check", "get", "list", "config", "baseline", "mcp", "quickstart", "--json", "--help", "help", "--version", "version"]);

function executableBasename(executable: string): string {
  const base = path.basename(executable).toLowerCase();
  return base.replace(/\.(cmd|exe|bat|ps1)$/u, "");
}

function currentSpecGuardBinary(): string | null {
  const invoked = process.argv[1];
  return invoked === undefined ? null : executableBasename(invoked);
}

function argvIsInvalid(argv: readonly string[]): { invalid: boolean; reason: string | null } {
  if (argv.length === 0) return { invalid: true, reason: "empty command" };
  const base = executableBasename(argv[0] ?? "");
  if (PLACEHOLDER_EXECUTABLES.has(base)) return { invalid: true, reason: `placeholder executable ${base}` };
  if (argv.length > 1 && argv.slice(1).every((arg) => VERSION_HELP_ARGS.has(arg))) return { invalid: true, reason: "version/help-only command" };
  const selfNames = new Set(SELF_CHECK_EXECUTABLES);
  const current = currentSpecGuardBinary();
  if (current !== null && current.length > 0) selfNames.add(current);
  if (selfNames.has(base) && argv.slice(1).every((arg) => SELF_INSPECT_ARGS.has(arg))) return { invalid: true, reason: "Spec Guard/Pi self-check command" };
  return { invalid: false, reason: null };
}

function shellSegmentIsInvalid(segment: string): { invalid: boolean; reason: string | null } {
  const trimmed = segment.trim();
  if (trimmed.length === 0) return { invalid: false, reason: null };
  if (/^exit(?:\s+\d+)?$/iu.test(trimmed)) return { invalid: true, reason: "shell exit-only command" };
  return argvIsInvalid(trimmed.split(/\s+/u).filter(Boolean));
}

function shellIsInvalid(command: string): { invalid: boolean; reason: string | null } {
  const trimmed = command.trim();
  if (trimmed.length === 0) return { invalid: true, reason: "empty command" };
  if (/[`$<>()[\]{}\n\r]/u.test(trimmed)) return { invalid: false, reason: null };
  const segments = trimmed.split(/\s*(?:&&|\|\||;)\s*/u).filter((segment) => segment.trim().length > 0);
  if (segments.length === 0) return { invalid: true, reason: "empty command" };
  if (segments.join(" ").includes("&") || segments.join(" ").includes("|")) return { invalid: false, reason: null };
  const checks = segments.map(shellSegmentIsInvalid);
  if (checks.every((check) => check.invalid)) return { invalid: true, reason: checks.length > 1 ? "placeholder-only compound shell command" : checks[0]?.reason ?? "placeholder shell command" };
  return { invalid: false, reason: null };
}

export function detectInvalidBaselineCommand(commandSpec: CommandSpec): { invalid: boolean; reason: string | null } {
  if (commandSpec.mode === "argv") return argvIsInvalid(commandSpec.argv ?? []);
  return shellIsInvalid(commandSpec.shell_command ?? "");
}
