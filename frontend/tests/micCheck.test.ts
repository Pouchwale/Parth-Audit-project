// THE MICROPHONE'S WRONG MESSAGE (REQUIREMENTS §80, voice-and-edits brief §1.2).
//
// Opened over the LAN as http://<address>:<port> the browser gives the page no
// navigator.mediaDevices, and the page used to say the permission was BLOCKED
// and to allow it — which nobody can do. utils/micCheck.ts tells that case
// apart and words what to do instead, with this DCRS's port in the words, in
// English (or Gujarati) and in Hindi.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dcrsPort, loadSecureAddress, micNeedsSecureAddress, micSecureAddressWords, secureAddressUrl, setSecureAddress } from "../src/utils/micCheck";
import { HINDI } from "../src/i18n/hindi";

const lanHttp = { isSecureContext: false, navigator: {}, location: { port: "8787", protocol: "http:" } };
const localhost = { isSecureContext: true, navigator: { mediaDevices: {} }, location: { port: "8787", protocol: "http:" } };
const https = { isSecureContext: true, navigator: { mediaDevices: {} }, location: { port: "", protocol: "https:" } };

describe("the microphone on an insecure address", () => {
  it("knows http over the LAN (no secure context, no mediaDevices) from a secure page", () => {
    assert.equal(micNeedsSecureAddress(lanHttp), true);
    assert.equal(micNeedsSecureAddress({ navigator: {}, location: { port: "8787" } }), true, "no mediaDevices at all is the same case");
    assert.equal(micNeedsSecureAddress(localhost), false);
    assert.equal(micNeedsSecureAddress(https), false);
  });

  it("says to open DCRS at localhost on this port, or its https address — never that the permission was blocked", () => {
    const words = micSecureAddressWords(lanHttp);
    assert.ok(words, "the LAN address gets the words");
    assert.match(words, /works only on a secure address/);
    assert.match(words, /http:\/\/localhost:8787/);
    assert.match(words, /https address/);
    assert.doesNotMatch(words, /blocked/i);
    // The Hindi sentence follows, with the same port in it (REQUIREMENTS §89).
    assert.ok(words.includes(HINDI.micSecureAddress.replace("{port}", "8787")));
    assert.doesNotMatch(words, /\{port\}/, "no placeholder left in the words");
  });

  it("gives no words on a secure address, so the real reason is worded instead", () => {
    assert.equal(micSecureAddressWords(localhost), null);
    assert.equal(micSecureAddressWords(https), null);
  });

  it("reads the port from the address, and the scheme's own port when the address shows none", () => {
    assert.equal(dcrsPort(lanHttp), "8787");
    assert.equal(dcrsPort(https), "443");
    assert.equal(dcrsPort({ location: { port: "", protocol: "http:" } }), "80");
  });
});

// DCRS'S OWN SECURE ADDRESS (backend/secureAddress.ts; the owner, 23-Oct-2026: "when i deployed it locally microphone is
// unable to start ... fix it any how"): on the http address the words name https://<the same computer>:<secure port> and
// the same page, where the browser lends the microphone.
describe("the microphone's way to DCRS's secure address", () => {
  const lanPage = { isSecureContext: false, navigator: {}, location: { port: "4000", protocol: "http:", hostname: "192.168.1.50", hash: "#/assistant" } };

  it("names the same page on the secure address, in the interface language and in Hindi", () => {
    const where = { port: 4443, certificate: "/dcrs-certificate.crt" };
    assert.equal(secureAddressUrl(lanPage, where), "https://192.168.1.50:4443/#/assistant");
    const words = micSecureAddressWords(lanPage, where);
    assert.ok(words);
    assert.match(words, /https:\/\/192\.168\.1\.50:4443\/#\/assistant/);
    assert.match(words, /button below/);
    assert.ok(words.includes(HINDI.micSecureAddressUrl.replace("{url}", "https://192.168.1.50:4443/#/assistant")));
    assert.doesNotMatch(words, /\{url\}|blocked/i);
  });

  it("keeps the old words while the secure address is not known, and none on a secure page", () => {
    assert.match(micSecureAddressWords(lanPage, null) ?? "", /http:\/\/localhost:4000/);
    assert.equal(secureAddressUrl(lanPage, null), null);
    assert.equal(secureAddressUrl(lanPage, { port: null, certificate: null }), null);
    assert.equal(micSecureAddressWords({ ...https, location: { ...https.location, hostname: "192.168.1.50" } }, { port: 4443, certificate: null }), null);
  });

  it("asks the server once, and only on an address where the microphone needs it", async () => {
    setSecureAddress(null);
    const asked: string[] = [];
    const fake = (async (url: string) => {
      asked.push(url);
      return { ok: true, json: async () => ({ port: 4443, certificate: "/dcrs-certificate.crt" }) };
    }) as unknown as typeof fetch;
    assert.equal(await loadSecureAddress(localhost, fake), null, "localhost has the microphone: nothing asked");
    assert.deepEqual(asked, []);
    assert.deepEqual(await loadSecureAddress(lanPage, fake), { port: 4443, certificate: "/dcrs-certificate.crt" });
    assert.deepEqual(await loadSecureAddress(lanPage, fake), { port: 4443, certificate: "/dcrs-certificate.crt" });
    assert.deepEqual(asked, ["/api/secure-address"], "asked once");
    assert.equal(micSecureAddressWords(lanPage)?.includes("https://192.168.1.50:4443/#/assistant"), true, "the words use what was found");
    setSecureAddress(null);
    const none = (async () => ({ ok: true, json: async () => ({ port: null, certificate: null }) })) as unknown as typeof fetch;
    assert.equal(await loadSecureAddress(lanPage, none), null, "a DCRS with no secure address");
    setSecureAddress(null);
  });
});
