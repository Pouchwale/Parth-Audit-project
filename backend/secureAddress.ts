// THE SECURE ADDRESS ON THE COMPANY NETWORK (the owner, 23-Oct-2026: "when i deployed it locally microphone is unable to
// start but when it run it on my system it running perfectly here so browser is blocking the microphone so fix it").
//
// A browser lends a page the microphone only on a secure address: https, or http://localhost on the computer itself.
// On the DCRS computer (http://localhost:4000) Mitra hears; from a laptop or desktop at http://<address>:4000 the browser
// has no microphone to lend at all (frontend/src/utils/micCheck.ts). So DCRS also answers, with the same pages and the
// same API, at https://<address>:<secure port>, on certificates of its own (backend/tlsCert.ts):
//
// - HTTPS_PORT: the secure address's port; unless set, the http port + 443 (4000 -> 4443).
// - DCRS_HTTPS=off: no secure address.
// - HTTPS_CERT_FILE and HTTPS_KEY_FILE: the company's own certificate and key (PEM) instead of DCRS's.
// - GET /dcrs-certificate.crt: the plant's certificate authority, installed once on a computer so that its browser
//   trusts the secure address with no warning (docs/DEPLOYMENT.md). Public, as a certificate is: the key never leaves.
// - GET /api/secure-address: the secure port and where the certificate is, for the words and the button the
//   microphone shows on the http address (frontend/src/utils/micCheck.ts).
//
// Windows Firewall must let the secure port in as it lets 4000 in: scripts/windows/open-firewall.ps1 adds both.
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import type { Express, Request, Response } from "express";
import { lanAddresses, type InterfaceTable } from "./lanAddresses.ts";
import { dataDir } from "./paths.ts";
import { ensureCertificates, type ServerNames } from "./tlsCert.ts";

/** Where DCRS's certificates are kept (backend/data is never committed). */
export const TLS_DIR = path.join(dataDir, "tls");
export const CERTIFICATE_PATH = "/dcrs-certificate.crt";

/** The secure address's port for DCRS on `httpPort`, or null when it is turned off. */
export function securePortFor(httpPort: number, env: NodeJS.ProcessEnv = process.env): number | null {
  if (/^(0|off|false|no)$/i.test((env.DCRS_HTTPS ?? "").trim())) return null;
  const asked = Number(env.HTTPS_PORT);
  if (env.HTTPS_PORT && Number.isInteger(asked) && asked > 0 && asked < 65536 && asked !== httpPort) return asked;
  const port = httpPort + 443;
  return port < 65536 ? port : null;
}

/** What the server's certificate names: localhost, this computer's name, and each address another computer can open. */
export function serverNames(table: InterfaceTable, hostname: string): ServerNames {
  return { hosts: ["localhost", hostname], ips: ["127.0.0.1", ...lanAddresses(table).map((a) => a.ip)] };
}

/** The lines DCRS prints once the secure address answers. */
export function secureAddressLines(httpPort: number, securePort: number, ips: string[], ownAuthority: boolean): string[] {
  const lines = [`Secure address (Mitra's microphone works here): https://localhost:${securePort}`];
  for (const ip of ips) lines.push(`  On the company network, with the microphone: https://${ip}:${securePort}`);
  if (ownAuthority) {
    const where = ips[0] ? `http://${ips[0]}:${httpPort}${CERTIFICATE_PATH}` : `http://localhost:${httpPort}${CERTIFICATE_PATH}`;
    lines.push(`  The first time on a computer, its browser warns once; to trust it for good, install ${where} there (docs/DEPLOYMENT.md).`);
  }
  return lines;
}

interface Running {
  port: number;
  /** DCRS's own certificate authority (PEM), when the certificates are DCRS's own. */
  authority: string | null;
}
let running: Running | null = null;

/** GET /dcrs-certificate.crt and GET /api/secure-address: registered before the app's pages, on both addresses. */
export function registerSecureAddressRoutes(app: Express): void {
  app.get(CERTIFICATE_PATH, (_req: Request, res: Response): void => {
    if (!running?.authority) {
      res.status(404).type("text/plain").send("This DCRS has no certificate of its own to install.");
      return;
    }
    res.set("Cache-Control", "no-store");
    res.set("Content-Disposition", 'attachment; filename="DCRS-certificate.crt"');
    res.type("application/x-x509-ca-cert").send(running.authority);
  });
  app.get("/api/secure-address", (_req: Request, res: Response): void => {
    res.set("Cache-Control", "no-store");
    res.json({ port: running?.port ?? null, certificate: running?.authority ? CERTIFICATE_PATH : null });
  });
}

export interface SecureAddressDeps {
  env?: NodeJS.ProcessEnv;
  /** The port to listen on instead of HTTPS_PORT or the http port + 443 (0: any free port - the tests). */
  port?: number;
  log?: (line: string) => void;
  networkInterfaces?: () => InterfaceTable;
  hostname?: string;
  tlsDir?: string;
}

/**
 * The secure address: an https server for `app` beside its http one. Never stops DCRS: a certificate that cannot be
 * made or a port that is taken is said once, and the http address goes on as before.
 */
export interface SecureServer {
  port: number;
  close: () => Promise<void>;
}

export function startSecureAddress(app: Express, httpPort: number, deps: SecureAddressDeps = {}): Promise<SecureServer | null> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? console.log;
  const port = deps.port ?? securePortFor(httpPort, env);
  if (port === null) return Promise.resolve(null);
  let table: InterfaceTable = {};
  try {
    table = (deps.networkInterfaces ?? (() => os.networkInterfaces() as InterfaceTable))();
  } catch {
    /* no network information: localhost only */
  }
  const names = serverNames(table, deps.hostname ?? os.hostname());
  let key: string;
  let cert: string;
  let authority: string | null = null;
  try {
    if (env.HTTPS_CERT_FILE && env.HTTPS_KEY_FILE) {
      key = readFileSync(env.HTTPS_KEY_FILE, "utf8");
      cert = readFileSync(env.HTTPS_CERT_FILE, "utf8");
    } else {
      const tls = ensureCertificates(deps.tlsDir ?? TLS_DIR, names);
      key = tls.key;
      cert = tls.cert;
      authority = tls.authorityCert;
    }
  } catch (err) {
    log(`The secure address (https, port ${port}) could not be set up: ${(err as Error).message}. Mitra's microphone works on the company network only there.`);
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const server = https.createServer({ key, cert }, app);
    server.on("error", (err: NodeJS.ErrnoException) => {
      log(
        err.code === "EADDRINUSE"
          ? `The secure address could not start: port ${port} is taken. Set HTTPS_PORT to a free port (Mitra's microphone works on the company network only on the secure address).`
          : `The secure address could not start on port ${port}: ${err.message}`,
      );
      resolve(null);
    });
    server.listen(port, () => {
      const listening = (server.address() as { port: number }).port;
      running = { port: listening, authority };
      for (const line of secureAddressLines(httpPort, listening, lanAddresses(table).map((a) => a.ip), authority !== null)) log(line);
      resolve({
        port: listening,
        close: () =>
          new Promise<void>((done) => {
            if (running?.port === listening) running = null;
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}
