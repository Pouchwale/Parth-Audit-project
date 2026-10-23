// THE SECURE ADDRESS ON THE COMPANY NETWORK (backend/secureAddress.ts, backend/tlsCert.ts; the owner, 23-Oct-2026: "when
// i deployed it locally microphone is unable to start ... browser is blocking the microphone so fix it any how").
// What is proved, on real servers on spare ports of this computer (never the plant's 4000 or 4443):
//   * the port: the http port + 443 (4000 -> 4443) unless HTTPS_PORT says otherwise; DCRS_HTTPS=off turns it off;
//   * the certificates: a plant authority (a CA, ten years) and a server certificate it signed, naming localhost, this
//     computer's name, 127.0.0.1 and each network address; kept on the next start, made again when an address
//     changes, the authority kept so that a computer which installed it keeps trusting DCRS;
//   * the secure address answers with the same app over TLS, trusted through the plant's authority alone, and refused
//     for a name the certificate does not carry;
//   * GET /dcrs-certificate.crt hands out the authority (never a key) and GET /api/secure-address says the port;
//   * a port that is taken is said once and DCRS goes on: the http address is never stopped by it.
// Run: npm run test:unit -- secureAddress
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import express from "express";
import { CERTIFICATE_PATH, registerSecureAddressRoutes, secureAddressLines, securePortFor, serverNames, startSecureAddress } from "../secureAddress.ts";
import { ensureCertificates, makeAuthority, makeServerCertificate, serverCertificateFits } from "../tlsCert.ts";

const dirs: string[] = [];
const tempDir = (): string => {
  const d = mkdtempSync(path.join(os.tmpdir(), "dcrs-tls-test-"));
  dirs.push(d);
  return d;
};
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const NAMES = { hosts: ["localhost", "plant-server"], ips: ["127.0.0.1", "192.168.1.50"] };

describe("the secure address's port", () => {
  it("is the http port + 443 unless HTTPS_PORT names another", () => {
    assert.equal(securePortFor(4000, {}), 4443);
    assert.equal(securePortFor(8842, {}), 9285);
    assert.equal(securePortFor(4000, { HTTPS_PORT: "8443" }), 8443);
    assert.equal(securePortFor(4000, { HTTPS_PORT: "4000" }), 4443, "never the http port itself");
    assert.equal(securePortFor(4000, { HTTPS_PORT: "abc" }), 4443);
    assert.equal(securePortFor(65200, {}), null, "no port past 65535");
  });
  it("is off with DCRS_HTTPS=off (or 0, false, no)", () => {
    for (const off of ["off", "0", "false", "no", " OFF "]) assert.equal(securePortFor(4000, { DCRS_HTTPS: off }), null, off);
    assert.equal(securePortFor(4000, { DCRS_HTTPS: "on" }), 4443);
  });
  it("names localhost, this computer and each network address another computer can open", () => {
    const names = serverNames(
      {
        "Wi-Fi": [{ address: "192.168.1.50", family: "IPv4", internal: false }],
        "Loopback Pseudo-Interface 1": [{ address: "127.0.0.1", family: "IPv4", internal: true }],
        Ethernet: [{ address: "169.254.3.4", family: "IPv4", internal: false }],
      },
      "PLANT-PC",
    );
    assert.deepEqual(names, { hosts: ["localhost", "PLANT-PC"], ips: ["127.0.0.1", "192.168.1.50"] });
  });
  it("says where it answers, and where the certificate is to install", () => {
    const lines = secureAddressLines(4000, 4443, ["192.168.1.50"], true);
    assert.match(lines[0], /https:\/\/localhost:4443/);
    assert.ok(lines.some((l) => l.includes("https://192.168.1.50:4443")));
    assert.ok(lines.some((l) => l.includes("http://192.168.1.50:4000/dcrs-certificate.crt")));
    assert.ok(!secureAddressLines(4000, 4443, ["192.168.1.50"], false).some((l) => l.includes("dcrs-certificate")), "no certificate of its own: none to install");
  });
});

describe("DCRS's own certificates", () => {
  it("are a plant authority and a server certificate it signed, naming every name and address", () => {
    const authority = makeAuthority();
    const ca = new crypto.X509Certificate(authority.cert);
    assert.equal(ca.ca, true);
    assert.ok(ca.verify(ca.publicKey), "the authority signs itself");
    assert.match(ca.subject, /Gujarat Print Pack Publications Pvt Ltd/);
    const years = (new Date(ca.validTo).getTime() - Date.now()) / (365 * 24 * 3600 * 1000);
    assert.ok(years > 9.9 && years < 10.1, `ten years (${years})`);

    const server = makeServerCertificate(authority, NAMES);
    const x = new crypto.X509Certificate(server.cert);
    assert.equal(x.ca, false);
    assert.ok(x.verify(ca.publicKey), "signed by the plant's authority");
    for (const h of NAMES.hosts) assert.equal(x.checkHost(h), h);
    for (const ip of NAMES.ips) assert.equal(x.checkIP(ip), ip);
    assert.equal(x.checkIP("10.0.0.9"), undefined, "no address it was not given");
    const days = (new Date(x.validTo).getTime() - Date.now()) / (24 * 3600 * 1000);
    assert.ok(days > 390 && days <= 398, `as long as a browser accepts (${days} days)`);
    assert.ok(!server.cert.includes("PRIVATE KEY") && !authority.cert.includes("PRIVATE KEY"));
  });

  it("are kept on the next start, made again for a new address, the authority always kept", () => {
    const dir = tempDir();
    const first = ensureCertificates(dir, NAMES);
    const again = ensureCertificates(dir, NAMES);
    assert.equal(again.cert, first.cert, "the same certificate on the next start");
    assert.equal(again.authorityCert, first.authorityCert);
    const moved = ensureCertificates(dir, { ...NAMES, ips: ["127.0.0.1", "10.1.2.3"] });
    assert.notEqual(moved.cert, first.cert, "made again: the address changed");
    assert.equal(moved.authorityCert, first.authorityCert, "the authority a computer installed is kept");
    assert.ok(new crypto.X509Certificate(moved.cert).checkIP("10.1.2.3"));
    assert.equal(readFileSync(path.join(dir, "dcrs-ca.crt"), "utf8"), first.authorityCert);
  });

  it("are made again a month before they end", () => {
    const authority = makeAuthority();
    const server = makeServerCertificate(authority, NAMES);
    assert.ok(serverCertificateFits(server.cert, authority, NAMES));
    const inElevenMonths = new Date(Date.now() + 370 * 24 * 3600 * 1000);
    assert.equal(serverCertificateFits(server.cert, authority, NAMES, inElevenMonths), false);
    assert.equal(serverCertificateFits(server.cert, makeAuthority(), NAMES), false, "not signed by this authority");
  });
});

function get(url: string, opts: https.RequestOptions = {}): Promise<{ status: number; type: string; body: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.request(url, opts, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, type: String(res.headers["content-type"] ?? ""), body }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("the secure address", () => {
  it("answers with the same app over TLS, trusted through the plant's authority alone", async () => {
    const app = express();
    registerSecureAddressRoutes(app);
    app.get("/api/hello", (_req, res) => {
      res.json({ hello: "plant" });
    });
    const plain = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const httpPort = (plain.address() as AddressInfo).port;
    const said: string[] = [];
    const dir = tempDir();
    const secure = await startSecureAddress(app, httpPort, { port: 0, tlsDir: dir, log: (l) => said.push(l), hostname: "plant-server", networkInterfaces: () => ({}) });
    assert.ok(secure, said.join("\n"));
    try {
      const authority = readFileSync(path.join(dir, "dcrs-ca.crt"), "utf8");
      const hello = await get(`https://localhost:${secure.port}/api/hello`, { ca: authority });
      assert.equal(hello.status, 200);
      assert.deepEqual(JSON.parse(hello.body), { hello: "plant" });

      await assert.rejects(get(`https://127.0.0.1:${secure.port}/api/hello`, { ca: authority, servername: "example.com" }), /altnames|does not match/i);
      await assert.rejects(get(`https://localhost:${secure.port}/api/hello`), /self[- ]signed|unable to verify|certificate/i, "a stranger's trust store does not know it");

      // Where it answers and the certificate to install, on the http address too.
      const where = await get(`http://127.0.0.1:${httpPort}/api/secure-address`);
      assert.deepEqual(JSON.parse(where.body), { port: secure.port, certificate: CERTIFICATE_PATH });
      const crt = await get(`http://127.0.0.1:${httpPort}${CERTIFICATE_PATH}`);
      assert.equal(crt.status, 200);
      assert.match(crt.type, /application\/x-x509-ca-cert/);
      assert.equal(crt.body, authority);
      assert.ok(!crt.body.includes("PRIVATE KEY"), "never a key");
      assert.ok(new crypto.X509Certificate(crt.body).ca);

      assert.ok(said.some((l) => l.includes(`https://localhost:${secure.port}`)), said.join("\n"));
    } finally {
      await secure.close();
      await new Promise<void>((r) => plain.close(() => r()));
    }
    const gone = await get(`http://127.0.0.1:0/api/secure-address`).catch(() => null);
    assert.equal(gone, null);
  });

  it("is said and skipped when its port is taken: DCRS goes on", async () => {
    const taken = await new Promise<http.Server>((resolve) => {
      // (on every address, as DCRS listens: a port held on 127.0.0.1 alone still lets Windows bind the others)
      const s = http.createServer().listen(0, () => resolve(s));
    });
    const port = (taken.address() as AddressInfo).port;
    const said: string[] = [];
    try {
      const secure = await startSecureAddress(express(), 4000, { port, tlsDir: tempDir(), log: (l) => said.push(l), networkInterfaces: () => ({}) });
      assert.equal(secure, null);
      assert.ok(said.some((l) => l.includes(`port ${port} is taken`)), said.join("\n"));
    } finally {
      await new Promise<void>((r) => taken.close(() => r()));
    }
  });

  it("is not started with DCRS_HTTPS=off", async () => {
    const said: string[] = [];
    assert.equal(await startSecureAddress(express(), 4000, { env: { DCRS_HTTPS: "off" }, tlsDir: tempDir(), log: (l) => said.push(l) }), null);
    assert.deepEqual(said, []);
  });
});
