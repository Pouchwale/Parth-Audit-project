// THE MICROPHONE'S WRONG MESSAGE (REQUIREMENTS §80, voice-and-edits brief §1.2).
//
// Opened over the LAN as http://<address>:<port> the browser gives the page no
// navigator.mediaDevices, and the page used to say the permission was BLOCKED
// and to allow it — which nobody can do. utils/micCheck.ts tells that case
// apart and words what to do instead, with this DCRS's port in the words, in
// English (or Gujarati) and in Hindi.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dcrsPort, micNeedsSecureAddress, micSecureAddressWords } from "../src/utils/micCheck";
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
