// MITRA ON YOUR PHONE (2-Oct-2026, components/mitra/phoneLink.ts and MitraPhoneCard.tsx).
//
// The plant's phones run the Mitra app in Expo Go from the server PC; the Ask
// Mitra page shows the QR code that opens it. Checked here without a browser:
//   * the address the code holds: exp://<host>:<port> — the host this page was
//     opened on, unless that is the computer's own name (localhost), in which
//     case the server's first network address (GET /api/phone-app); the port
//     from that answer, else 8081; when the route is missing or fails, the
//     browser's host and 8081, with nothing claimed about the app running;
//   * the server's answer read defensively, and a request that cannot hang;
//   * the code itself: drawn by lean-qr, one path inside the quiet zone;
//   * the card: folded, it asks nothing and draws nothing, and it adds nothing
//     the suites count on the page (no box to type in, no Send, no "Ask Mitra").
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import { EXPO_GO_PORT, QR_QUIET_ZONE, fetchPhoneApp, isLoopbackHost, phoneTarget, qrArt, readPhoneAppAnswer } from "../src/components/mitra/phoneLink";

// store/router.tsx reads window.location the moment it loads; the harness stands up none.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "", hostname: "localhost" }, configurable: true, writable: true });
}

test("a name only this computer answers to is known as one", () => {
  for (const host of ["localhost", "LOCALHOST", "127.0.0.1", "127.1.2.3", "::1", "[::1]", "dcrs.localhost", "0.0.0.0"]) assert.equal(isLoopbackHost(host), true, host);
  for (const host of ["192.168.0.12", "10.192.193.24", "dcrs-server", "dcrs.gpp.local", "fe80::1", "128.0.0.1"]) assert.equal(isLoopbackHost(host), false, host);
});

test("the address a phone opens: the page's own host, else the server's network address; its port, else 8081", () => {
  // Opened over the network: that host is the one a phone reaches too.
  assert.deepEqual(phoneTarget("192.168.0.12", null), { url: "exp://192.168.0.12:8081", host: "192.168.0.12", port: EXPO_GO_PORT, running: null, reachable: true });
  const answer = readPhoneAppAnswer({ expoGo: { port: 19000, running: true }, mitraServer: { port: 3000, running: true }, addresses: [{ ip: "10.192.193.24", interface: "Ethernet 7" }] });
  const lan = phoneTarget("192.168.0.12", answer);
  assert.equal(lan.url, "exp://192.168.0.12:19000", "the browser's host stands; the port is the server's");
  assert.equal(lan.running, true);
  // Opened as localhost on the server itself: the first network address the server names.
  const local = phoneTarget("localhost", readPhoneAppAnswer({ expoGo: { running: false }, addresses: [{ ip: "127.0.0.1" }, { ip: "10.192.193.24", interface: "Ethernet 7" }, { ip: "192.168.0.5" }] }));
  assert.equal(local.url, "exp://10.192.193.24:8081", "loopback addresses are passed over; no port said means 8081");
  assert.equal(local.running, false, "the server says the phone app is not running");
  assert.equal(local.reachable, true);
  // No route (404), or it failed: the browser's host and 8081, and nothing claimed.
  const fallback = phoneTarget("localhost", null);
  assert.deepEqual(fallback, { url: "exp://localhost:8081", host: "localhost", port: 8081, running: null, reachable: false });
  assert.equal(phoneTarget("127.0.0.1", readPhoneAppAnswer({ expoGo: { port: 8081, running: true }, addresses: [] })).reachable, false, "an answer naming no address leaves the code unusable on a phone, and says so");
  // An IPv6 address goes into the URL in brackets.
  assert.equal(phoneTarget("localhost", readPhoneAppAnswer({ addresses: [{ ip: "fe80::1" }] })).url, "exp://[fe80::1]:8081");
});

test("the server's answer is read defensively", () => {
  assert.equal(readPhoneAppAnswer(null), null);
  assert.equal(readPhoneAppAnswer("not json"), null);
  assert.deepEqual(readPhoneAppAnswer({}), { expoGo: { port: null, running: null }, addresses: [] });
  assert.deepEqual(readPhoneAppAnswer({ expoGo: { port: "8081", running: "yes" }, addresses: [{ ip: 42 }, null, { ip: "  " }, { ip: " 10.0.0.9 " }] }), {
    expoGo: { port: null, running: null },
    addresses: ["10.0.0.9"],
  });
  assert.equal(readPhoneAppAnswer({ expoGo: { port: 70000 } })?.expoGo.port, null, "a port out of range is not a port");
});

test("asking the server: a missing route, a refusal, a failure or no answer in time all mean no answer", async () => {
  const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
  let asked: { url: string; init?: RequestInit } | null = null;
  const ok = (async (url: string, init?: RequestInit) => {
    asked = { url, init };
    return new Response(JSON.stringify({ expoGo: { port: 8081, running: true }, addresses: [{ ip: "10.192.193.24" }] }), { status: 200 });
  }) as unknown as typeof fetch;
  assert.deepEqual(await fetchPhoneApp(ok), { expoGo: { port: 8081, running: true }, addresses: ["10.192.193.24"] });
  assert.equal(asked!.url, "/api/phone-app");
  assert.equal(asked!.init?.credentials, "include", "asked as the signed-in person");
  assert.equal(await fetchPhoneApp(reply(404, { error: "Not found" })), null, "no such route yet: the browser's host and 8081");
  assert.equal(await fetchPhoneApp(reply(401, { error: "Sign in" })), null);
  assert.equal(await fetchPhoneApp((async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch), null);
  const hangs = ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as unknown as typeof fetch;
  const started = Date.now();
  assert.equal(await fetchPhoneApp(hangs, 30), null, "a server that never answers is not waited on for ever");
  assert.ok(Date.now() - started < 2000);
});

test("the QR code: lean-qr's modules as one path, inside the four-module quiet zone", () => {
  const art = qrArt("exp://192.168.0.12:8081");
  assert.ok(art, "a code is made");
  assert.equal(art!.size, 25, "a short address fits a version-2 code at medium correction");
  assert.match(art!.path, /^M\d/, "a path of moves and lines");
  assert.doesNotMatch(art!.path, /[^MLZ\d .-]/, "nothing but M, L, Z and numbers");
  const coords = [...art!.path.matchAll(/(-?\d+) (-?\d+)/g)].flatMap((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(coords.every((n) => n >= 0 && n <= art!.size), "every point inside the code, so the quiet zone stays blank");
  assert.equal(QR_QUIET_ZONE, 4);
  assert.notEqual(qrArt("exp://10.192.193.24:8081")!.path, art!.path, "another address, another code");
  assert.equal(qrArt("x".repeat(8000)), null, "too much for any QR code: none, rather than a throw");
});

test("the card: folded it asks nothing and draws nothing; it adds nothing the suites count", async () => {
  const [auth, store, card] = await Promise.all([import("../src/store/AuthContext"), import("../src/store/AppStore"), import("../src/components/mitra/MitraPhoneCard")]);
  const render = (el: ReactElement): string => renderToStaticMarkup(h(auth.AuthProvider, null, h(store.AppStoreProvider, null, el)));
  const folded = render(h(card.MitraPhoneCard));
  assert.match(folded, /<section class="mitra-phone no-print" data-section="mitra-phone" aria-label="Mitra on your phone"/, "screen only, and named");
  assert.match(folded, /<button type="button" class="btn btn-secondary btn-sm mitra-phone-toggle" data-action="phone-code" aria-expanded="false"[^>]*>Show the code<\/button>/);
  assert.match(folded, /Use Mitra on an Android phone or an iPhone, in the Expo Go app\./);
  assert.doesNotMatch(folded, /<svg class="mitra-qr"|mitra-phone-body/, "no code until it is opened");
  for (const html of [folded]) {
    assert.doesNotMatch(html, /<textarea|data-action="send"|aria-label="Send"|chat-msg/, "nothing a suite counts on the page");
    assert.doesNotMatch(html, /Ask Mitra/, "no button that says Ask Mitra");
    assert.doesNotMatch(html, /—/, "no em dash in the new words");
  }
  const qr = render(h(card.MitraQr, { text: "exp://10.192.193.24:8081", label: "QR code that opens Mitra in Expo Go: exp://10.192.193.24:8081" }));
  assert.match(qr, /^<svg class="mitra-qr" viewBox="-4 -4 33 33" role="img" aria-label="QR code that opens Mitra in Expo Go: exp:\/\/10\.192\.193\.24:8081" shape-rendering="crispEdges" focusable="false">/);
  assert.match(qr, /<rect x="-4" y="-4" width="33" height="33" fill="#ffffff"><\/rect><path d="M[^"]+" fill="#0b2230"><\/path><\/svg>$/, "a white square and one dark path");
});

test("the card's words: plain English and Gujarati, every step there, no em dash", async () => {
  const { STRINGS } = await import("../src/i18n/strings");
  const keys = ["ai.phone.title", "ai.phone.lead", "ai.phone.show", "ai.phone.hide", "ai.phone.finding", "ai.phone.qrLabel", "ai.phone.notRunning", "ai.phone.loopback", "ai.phone.step1", "ai.phone.step2", "ai.phone.step3", "ai.phone.step4", "ai.phone.step5", "ai.side.emptyTitle", "ai.side.emptyText"] as const;
  for (const key of keys) {
    const en = (STRINGS.en as Record<string, string>)[key];
    const gu = (STRINGS.gu as Record<string, string>)[key];
    assert.ok(en && en.trim(), `${key} in English`);
    assert.ok(gu && gu.trim(), `${key} in Gujarati`);
    assert.match(gu, /[\u0A80-\u0AFF]/, `${key} is written in Gujarati`);
    for (const words of [en, gu]) assert.doesNotMatch(words, /[—–]/, `${key}: no em or en dash`);
  }
  const en = STRINGS.en as Record<string, string>;
  assert.match(en["ai.phone.step1"], /Play Store/);
  assert.match(en["ai.phone.step1"], /App Store/);
  assert.match(en["ai.phone.step2"], /Wi-Fi/);
  assert.match(en["ai.phone.step3"], /iPhone only/, "Expo Go on an iPhone signs in to the same Expo account as the server (Expo, 3-Sep-2026)");
  assert.match(en["ai.phone.step4"], /Camera app/);
  assert.match(en["ai.phone.step4"], /inside Expo Go/);
  assert.match(en["ai.phone.step5"], /DCRS email and password/);
  assert.match(en["ai.phone.notRunning"], /not running/);
  assert.match(en["ai.phone.notRunning"], /administrator/);
});
