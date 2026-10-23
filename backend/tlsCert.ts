// DCRS'S OWN CERTIFICATES, FOR ITS SECURE ADDRESS ON THE COMPANY NETWORK (the owner, 23-Oct-2026: "when i deployed it
// locally microphone is unable to start ... browser is blocking the microphone so fix it any how").
//
// A browser lends a page the microphone only on a secure address: https, or http://localhost on the computer itself
// (frontend/src/utils/micCheck.ts). Laptops and desktops open DCRS at http://<address>:4000, where Mitra cannot hear
// them, so DCRS also answers at https://<address>:4443 (backend/secureAddress.ts) with two certificates made here:
//
// - THE PLANT'S CERTIFICATE AUTHORITY, made once for this DCRS (backend/data/tls/dcrs-ca.crt and its key; the key never
//   leaves this computer). Installed once on a computer as a trusted root (docs/DEPLOYMENT.md), it makes the browser
//   trust the secure address with no warning. Without it the browser warns once that the address is "not private";
//   past the warning the page is still on https, a secure address, and the microphone works.
// - THE SERVER'S CERTIFICATE, signed by it, naming localhost, this computer's name and each of its network addresses.
//   Made again when an address changes, or a month before it ends (397 days, the longest a browser accepts).
//
// No package is needed: the certificates are written here as DER (X.509 v3, ECDSA P-256 with SHA-256) with Node's own
// crypto, and read back with crypto.X509Certificate to check what they name.
import crypto, { type KeyObject } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DAY = 24 * 60 * 60 * 1000;
/** The longest a browser accepts a server certificate for (Chrome and Safari: 398 days). */
const SERVER_DAYS = 397;
/** The plant's authority lasts ten years: installed once on each computer, not again every year. */
const AUTHORITY_DAYS = 3650;
/** A certificate is made again this long before it ends. */
const RENEW_BEFORE_DAYS = 30;
const ORGANISATION = "Gujarat Print Pack Publications Pvt Ltd";

// ---- DER: the few ASN.1 shapes a certificate needs -------------------------------------------------------------------

function length(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const tlv = (tag: number, body: Buffer): Buffer => Buffer.concat([Buffer.from([tag]), length(body.length), body]);
const seq = (...items: Buffer[]): Buffer => tlv(0x30, Buffer.concat(items));
const set = (...items: Buffer[]): Buffer => tlv(0x31, Buffer.concat(items));
const bool = (v: boolean): Buffer => tlv(0x01, Buffer.from([v ? 0xff : 0x00]));
const octets = (b: Buffer): Buffer => tlv(0x04, b);
const utf8 = (s: string): Buffer => tlv(0x0c, Buffer.from(s, "utf8"));
/** A BIT STRING of whole bytes, `unused` bits of the last one not part of it. */
const bits = (b: Buffer, unused = 0): Buffer => tlv(0x03, Buffer.concat([Buffer.from([unused]), b]));
/** [n] EXPLICIT: a context-specific, constructed wrapper. */
const explicit = (n: number, body: Buffer): Buffer => tlv(0xa0 + n, body);

/** A non-negative INTEGER from its big-endian bytes (or a small number). */
function integer(value: Buffer | number): Buffer {
  let b = typeof value === "number" ? Buffer.from([value]) : Buffer.from(value);
  while (b.length > 1 && b[0] === 0 && (b[1] & 0x80) === 0) b = b.subarray(1);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
  return tlv(0x02, b);
}

function oid(dotted: string): Buffer {
  const arcs = dotted.split(".").map(Number);
  const out = [40 * arcs[0] + arcs[1]];
  for (const arc of arcs.slice(2)) {
    const chunk = [arc & 0x7f];
    for (let v = Math.floor(arc / 128); v > 0; v = Math.floor(v / 128)) chunk.unshift((v & 0x7f) | 0x80);
    out.push(...chunk);
  }
  return tlv(0x06, Buffer.from(out));
}

/** UTCTime before 2050, GeneralizedTime from then (RFC 5280 4.1.2.5). */
function time(d: Date): Buffer {
  const digits = d.toISOString().replace(/[-:T]/g, "").slice(0, 14); // YYYYMMDDHHMMSS
  return d.getUTCFullYear() < 2050 ? tlv(0x17, Buffer.from(`${digits.slice(2)}Z`, "ascii")) : tlv(0x18, Buffer.from(`${digits}Z`, "ascii"));
}

const OID = {
  ecdsaWithSha256: "1.2.840.10045.4.3.2",
  commonName: "2.5.4.3",
  organisation: "2.5.4.10",
  subjectKeyId: "2.5.29.14",
  keyUsage: "2.5.29.15",
  subjectAltName: "2.5.29.17",
  basicConstraints: "2.5.29.19",
  authorityKeyId: "2.5.29.35",
  extKeyUsage: "2.5.29.37",
  serverAuth: "1.3.6.1.5.5.7.3.1",
};

function distinguishedName(commonName: string): Buffer {
  return seq(set(seq(oid(OID.organisation), utf8(ORGANISATION))), set(seq(oid(OID.commonName), utf8(commonName))));
}

function extension(id: string, critical: boolean, value: Buffer): Buffer {
  return critical ? seq(oid(id), bool(true), octets(value)) : seq(oid(id), octets(value));
}

/** A key's identifier (the SHA-1 of its public key, as RFC 5280 suggests): the server's certificate names its authority by it. */
const keyId = (spki: Buffer): Buffer => crypto.createHash("sha1").update(spki).digest();

function serialNumber(): Buffer {
  const b = crypto.randomBytes(16);
  b[0] = (b[0] & 0x7f) | 0x01; // positive, never zero
  return b;
}

/** The DER of an IPv4 or IPv6 address, for a subjectAltName's iPAddress. */
function ipBytes(ip: string): Buffer | null {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return Buffer.from(ip.split(".").map(Number));
  if (ip === "::1") return Buffer.from([...new Array(15).fill(0), 1]);
  return null;
}

interface CertificateParts {
  issuer: Buffer;
  subject: Buffer;
  from: Date;
  to: Date;
  publicKey: KeyObject;
  extensions: Buffer[];
  signer: KeyObject;
}

function certificateDer(p: CertificateParts): Buffer {
  const algorithm = seq(oid(OID.ecdsaWithSha256));
  const tbs = seq(
    explicit(0, integer(2)), // v3
    integer(serialNumber()),
    algorithm,
    p.issuer,
    seq(time(p.from), time(p.to)),
    p.subject,
    p.publicKey.export({ type: "spki", format: "der" }),
    explicit(3, seq(...p.extensions)),
  );
  // (an ECDSA signature comes out of Node as the DER ECDSA-Sig-Value a certificate carries)
  return seq(tbs, algorithm, bits(crypto.sign("sha256", tbs, p.signer)));
}

function pem(der: Buffer): string {
  const lines = der.toString("base64").match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
}

const keyPem = (key: KeyObject): string => key.export({ type: "pkcs8", format: "pem" }).toString();
const newKeys = () => crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });

// ---- the two certificates ------------------------------------------------------------------------------------------

export interface Authority {
  key: string;
  cert: string;
}

/** The plant's certificate authority: may sign server certificates, nothing below them. */
export function makeAuthority(now: Date = new Date()): Authority {
  const { publicKey, privateKey } = newKeys();
  const name = distinguishedName("DCRS Plant Certificate Authority");
  const spki = publicKey.export({ type: "spki", format: "der" });
  const der = certificateDer({
    issuer: name,
    subject: name,
    from: new Date(now.getTime() - DAY),
    to: new Date(now.getTime() + AUTHORITY_DAYS * DAY),
    publicKey,
    signer: privateKey,
    extensions: [
      extension(OID.basicConstraints, true, seq(bool(true), integer(0))), // a CA, signing only end certificates
      extension(OID.keyUsage, true, bits(Buffer.from([0x86]), 1)), // digitalSignature, keyCertSign, cRLSign
      extension(OID.subjectKeyId, false, octets(keyId(spki))),
    ],
  });
  return { key: keyPem(privateKey), cert: pem(der) };
}

export interface ServerNames {
  /** Names the address may be opened by: localhost, this computer's name. */
  hosts: string[];
  /** Addresses: 127.0.0.1 and each network address of this computer. */
  ips: string[];
}

/** The server's certificate for `names`, signed by `authority`. */
export function makeServerCertificate(authority: Authority, names: ServerNames, now: Date = new Date()): Authority {
  const { publicKey, privateKey } = newKeys();
  const ca = new crypto.X509Certificate(authority.cert);
  const caKey = crypto.createPrivateKey(authority.key);
  const caSpki = ca.publicKey.export({ type: "spki", format: "der" });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const altNames: Buffer[] = [];
  for (const host of unique(names.hosts)) altNames.push(tlv(0x82, Buffer.from(host, "ascii"))); // dNSName
  for (const ip of unique(names.ips)) {
    const b = ipBytes(ip);
    if (b) altNames.push(tlv(0x87, b)); // iPAddress
  }
  const der = certificateDer({
    issuer: distinguishedName("DCRS Plant Certificate Authority"),
    subject: distinguishedName(names.hosts.find((h) => h !== "localhost") ?? names.ips[0] ?? "localhost"),
    from: new Date(now.getTime() - DAY),
    to: new Date(now.getTime() + SERVER_DAYS * DAY),
    publicKey,
    signer: caKey,
    extensions: [
      extension(OID.basicConstraints, true, seq()), // not a CA
      extension(OID.keyUsage, true, bits(Buffer.from([0x80]), 7)), // digitalSignature
      extension(OID.extKeyUsage, false, seq(oid(OID.serverAuth))),
      extension(OID.subjectAltName, false, seq(...altNames)),
      extension(OID.authorityKeyId, false, seq(tlv(0x80, keyId(caSpki)))),
      extension(OID.subjectKeyId, false, octets(keyId(spki))),
    ],
  });
  return { key: keyPem(privateKey), cert: pem(der) };
}

function unique(list: string[]): string[] {
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))];
}

/** Whether `cert` still serves: signed by `authority`, naming every name and address, not ending within a month. */
export function serverCertificateFits(cert: string, authority: Authority, names: ServerNames, now: Date = new Date()): boolean {
  try {
    const x = new crypto.X509Certificate(cert);
    if (!x.verify(new crypto.X509Certificate(authority.cert).publicKey)) return false;
    if (new Date(x.validTo).getTime() - now.getTime() < RENEW_BEFORE_DAYS * DAY) return false;
    if (new Date(x.validFrom).getTime() > now.getTime()) return false;
    return unique(names.hosts).every((h) => x.checkHost(h) !== undefined) && unique(names.ips).every((ip) => x.checkIP(ip) !== undefined);
  } catch {
    return false;
  }
}

export interface TlsFiles {
  key: string;
  cert: string;
  /** The plant's certificate authority (PEM), as GET /dcrs-certificate.crt hands it out. */
  authorityCert: string;
}

/**
 * The secure address's key and certificate from `dir` (backend/data/tls), made where they are missing, ending or no
 * longer naming this computer's addresses. The authority is made once and kept: computers that installed it keep
 * trusting every server certificate made after.
 */
export function ensureCertificates(dir: string, names: ServerNames, now: Date = new Date()): TlsFiles {
  mkdirSync(dir, { recursive: true });
  const file = (name: string) => path.join(dir, name);
  let authority: Authority | null = null;
  if (existsSync(file("dcrs-ca.key")) && existsSync(file("dcrs-ca.crt"))) {
    const kept = { key: readFileSync(file("dcrs-ca.key"), "utf8"), cert: readFileSync(file("dcrs-ca.crt"), "utf8") };
    try {
      const x = new crypto.X509Certificate(kept.cert);
      if (new Date(x.validTo).getTime() - now.getTime() > RENEW_BEFORE_DAYS * DAY) authority = kept;
    } catch {
      /* unreadable: made again */
    }
  }
  if (!authority) {
    authority = makeAuthority(now);
    writeFileSync(file("dcrs-ca.key"), authority.key, { mode: 0o600 });
    writeFileSync(file("dcrs-ca.crt"), authority.cert);
  }
  let server: Authority | null = null;
  if (existsSync(file("dcrs.key")) && existsSync(file("dcrs.crt"))) {
    const kept = { key: readFileSync(file("dcrs.key"), "utf8"), cert: readFileSync(file("dcrs.crt"), "utf8") };
    if (serverCertificateFits(kept.cert, authority, names, now)) server = kept;
  }
  if (!server) {
    server = makeServerCertificate(authority, names, now);
    writeFileSync(file("dcrs.key"), server.key, { mode: 0o600 });
    writeFileSync(file("dcrs.crt"), server.cert);
  }
  return { key: server.key, cert: server.cert, authorityCert: authority.cert };
}
