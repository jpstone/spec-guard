import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { ArtifactStore, serveViewerSuccessResult, storeForContext, type ActionResult, type ServeViewerData } from "@spec-guard/core";
import { renderRoute } from "./routes.ts";

export interface ServeViewerOptions {
  projectRoot?: string;
  artifactRoot?: string;
  host?: string;
  port?: number;
}

export interface ViewerServerHandle {
  server: http.Server;
  host: string;
  port: number;
  url: string;
  artifactRoot: string;
  result: ActionResult<ServeViewerData>;
  close: () => Promise<void>;
}

function writeResponse(response: ServerResponse, status: number, contentType: string, body: string): void {
  response.statusCode = status;
  response.setHeader("content-type", contentType);
  response.setHeader("cache-control", "no-store");
  response.end(body);
}

function requestUrl(request: IncomingMessage): string {
  return request.url ?? "/";
}

export async function serveViewer(options: ServeViewerOptions = {}): Promise<ViewerServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4777;
  const store: ArtifactStore = storeForContext({ ...(options.projectRoot === undefined ? {} : { projectRoot: options.projectRoot }), ...(options.artifactRoot === undefined ? {} : { artifactRoot: options.artifactRoot }) });
  const server = http.createServer((request, response) => {
    void (async () => {
      try {
        if (request.method !== "GET" && request.method !== "HEAD") {
          writeResponse(response, 405, "text/plain; charset=utf-8", "Method not allowed");
          return;
        }
        const rendered = await renderRoute(requestUrl(request), { store });
        writeResponse(response, rendered.status, rendered.contentType, request.method === "HEAD" ? "" : rendered.body);
      } catch (error) {
        writeResponse(response, 500, "text/plain; charset=utf-8", error instanceof Error ? error.message : String(error));
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address !== null ? (address as AddressInfo).port : port;
  const actualHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  const url = `http://${actualHost}:${actualPort}/`;
  const result = serveViewerSuccessResult({ host, port: actualPort, url, artifact_root: store.root });
  return {
    server,
    host,
    port: actualPort,
    url,
    artifactRoot: store.root,
    result,
    close: () => new Promise<void>((resolve, reject) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close((error) => error === undefined ? resolve() : reject(error));
    })
  };
}

export * from "./routes.ts";
export * from "./render.ts";
export * from "./mantine-components.ts";
