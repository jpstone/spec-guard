export type Attrs = Record<string, string | number | boolean | null | undefined>;

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function attrs(input: Attrs = {}): string {
  return Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => value === true ? ` ${key}` : ` ${key}=\"${escapeHtml(value)}\"`)
    .join("");
}

export function css(): string {
  return `<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1f2937;background:#f8fafc}.mantine-AppShell-root{min-height:100vh;background:#f8fafc}.mantine-AppShell-header{background:#111827;color:white;padding:18px 28px;display:flex;justify-content:space-between;align-items:center}.mantine-AppShell-main{padding:28px;max-width:1240px;margin:0 auto}.sg-title{margin:0;font-size:24px;font-weight:750}.sg-subtle{color:#64748b}.mantine-Grid-root{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:18px 0}.mantine-Card-root{background:white;border:1px solid #e2e8f0;border-radius:14px;padding:18px;box-shadow:0 1px 2px rgba(15,23,42,.05)}a.mantine-Card-root{display:block;text-decoration:none;color:inherit;transition:transform .12s,box-shadow .12s}a.mantine-Card-root:hover{transform:translateY(-1px);box-shadow:0 10px 20px rgba(15,23,42,.08)}.sg-action-card{border:2px solid #f59e0b;box-shadow:inset 0 0 0 3px rgba(245,158,11,.13)}.sg-action-card:before{content:"Action needed";display:inline-block;margin-bottom:8px;padding:3px 8px;border-radius:999px;background:#fffbeb;color:#92400e;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.sg-metric-label{font-size:13px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.03em}.sg-metric-value{font-size:34px;font-weight:850;line-height:1.1;margin-top:6px}.mantine-Badge-root{display:inline-flex;align-items:center;border-radius:999px;padding:3px 9px;font-size:12px;font-weight:750;border:1px solid transparent}.sg-badge-default{background:#f1f5f9;color:#334155}.sg-badge-red{background:#fef2f2;color:#991b1b;border-color:#fecaca}.sg-badge-green{background:#f0fdf4;color:#166534;border-color:#bbf7d0}.sg-badge-yellow{background:#fffbeb;color:#92400e;border-color:#fde68a}.sg-badge-blue{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}.mantine-Table-table{width:100%;border-collapse:collapse;background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}.mantine-Table-table th,.mantine-Table-table td{text-align:left;padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top}.mantine-Table-table th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#475569;background:#f8fafc}.mantine-Button-root{display:inline-flex;align-items:center;gap:8px;border-radius:10px;background:#2563eb;color:white!important;padding:9px 13px;text-decoration:none;font-weight:750;border:0}.sg-button-secondary{background:#e2e8f0;color:#0f172a!important}.sg-section{margin:22px 0}.sg-section h2{margin:0 0 10px;font-size:20px}.sg-kv{display:grid;grid-template-columns:minmax(160px,240px) 1fr;gap:8px 14px}.sg-kv dt{font-weight:800;color:#475569}.sg-kv dd{margin:0}.sg-list{margin:8px 0 0;padding-left:20px}.sg-json{background:#0f172a;color:#e2e8f0;border-radius:12px;padding:14px;overflow:auto;max-height:440px}.sg-pill-row{display:flex;flex-wrap:wrap;gap:8px}.sg-callout{border-left:5px solid #2563eb;background:#eff6ff;padding:14px;border-radius:10px}.sg-lane{border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:white}.sg-lane h3{margin-top:0}
</style>`;
}

export function AppShell(input: { title: string; subtitle?: string; children: string }): string {
  return `<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>${escapeHtml(input.title)}</title>${css()}</head><body><div class=\"mantine-AppShell-root\" data-mantine-component=\"AppShell\"><header class=\"mantine-AppShell-header\"><div><h1 class=\"sg-title\">${escapeHtml(input.title)}</h1>${input.subtitle ? `<div>${escapeHtml(input.subtitle)}</div>` : ""}</div><nav><a class=\"mantine-Button-root sg-button-secondary\" data-mantine-component=\"Button\" href=\"/\">Dashboard</a></nav></header><main class=\"mantine-AppShell-main\">${input.children}</main></div></body></html>`;
}

export function Grid(children: string): string {
  return `<div class=\"mantine-Grid-root\" data-mantine-component=\"Grid\">${children}</div>`;
}

export function Card(input: { children: string; href?: string; action?: boolean; label?: string }): string {
  const className = `mantine-Card-root${input.action ? " sg-action-card" : ""}`;
  const attr = attrs({ class: className, "data-mantine-component": "Card", "aria-label": input.label });
  return input.href ? `<a${attr} href=\"${escapeHtml(input.href)}\">${input.children}</a>` : `<section${attr}>${input.children}</section>`;
}

export function MetricCard(input: { label: string; value: number | string; href: string; detail?: string; action?: boolean }): string {
  return Card({ href: input.href, ...(input.action === undefined ? {} : { action: input.action }), label: input.label, children: `<div class=\"sg-metric-label\">${escapeHtml(input.label)}</div><div class=\"sg-metric-value\">${escapeHtml(input.value)}</div>${input.detail ? `<div class=\"sg-subtle\">${escapeHtml(input.detail)}</div>` : ""}` });
}

export function Badge(value: unknown, tone: "default" | "red" | "green" | "yellow" | "blue" = "default"): string {
  return `<span class=\"mantine-Badge-root sg-badge-${tone}\" data-mantine-component=\"Badge\">${escapeHtml(value)}</span>`;
}

export function ButtonLink(href: string, label: string, secondary = false): string {
  return `<a class=\"mantine-Button-root${secondary ? " sg-button-secondary" : ""}\" data-mantine-component=\"Button\" href=\"${escapeHtml(href)}\">${escapeHtml(label)}</a>`;
}

export function Table(headers: string[], rows: string[][]): string {
  return `<table class=\"mantine-Table-table\" data-mantine-component=\"Table\"><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

export function Section(title: string, children: string): string {
  return `<section class=\"sg-section\"><h2>${escapeHtml(title)}</h2>${children}</section>`;
}

export function JsonDebug(value: unknown): string {
  return `<details><summary>Debug JSON</summary><pre class=\"sg-json\">${escapeHtml(JSON.stringify(value, null, 2))}</pre></details>`;
}
