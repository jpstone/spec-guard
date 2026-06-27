import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runDevRuntime, DevRuntimeSchema } from "../src/index.ts";

const node = process.execPath;
const port = (): number => 41000 + Math.floor(Math.random() * 20000);

describe("M11 dev-runtime runner (Floor slice 3a)", () => {
  it("PASSES when the process group comes up and the readiness probe succeeds", async () => {
    const p = port();
    const dev = DevRuntimeSchema.parse({
      processes: [{ name: "server", command: { mode: "argv", argv: [node, "-e", `require('http').createServer((q,r)=>r.end('ok')).listen(${p})`] } }],
      readiness_probe: { kind: "http_healthcheck", value: `http://127.0.0.1:${p}/`, timeout_ms: 10000 }
    });
    const result = await runDevRuntime(dev, { projectRoot: tmpdir() });
    expect(result.status).toBe("passed");
    expect(result.readiness_passed).toBe(true);
    expect(result.process_observations[0]!.started).toBe(true);
  }, 20000);

  it("FAILS fast when a process exits before becoming ready (the 'declared but broken' case)", async () => {
    const dev = DevRuntimeSchema.parse({
      processes: [{ name: "crasher", command: { mode: "argv", argv: [node, "-e", "process.exit(1)"] } }],
      readiness_probe: { kind: "port_open", value: String(port()), timeout_ms: 5000 }
    });
    const result = await runDevRuntime(dev, { projectRoot: tmpdir(), pollIntervalMs: 100 });
    expect(result.status).toBe("failed");
    expect(result.readiness_passed).toBe(false);
    expect(result.error_message).toMatch(/exited before readiness/i);
  }, 20000);

  it("TIMES OUT when a process stays up but never becomes ready (e.g. frontend up, backend down)", async () => {
    const dev = DevRuntimeSchema.parse({
      processes: [{ name: "no-port", command: { mode: "argv", argv: [node, "-e", "setInterval(()=>{}, 1e9)"] } }],
      readiness_probe: { kind: "port_open", value: String(port()), timeout_ms: 1500 }
    });
    const result = await runDevRuntime(dev, { projectRoot: tmpdir(), pollIntervalMs: 100 });
    expect(result.status).toBe("timed_out");
    expect(result.readiness_passed).toBe(false);
  }, 20000);
});
