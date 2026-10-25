// THE MAIL SENDER AND THE ADDRESS RULE (the reminder emails, the owner, 25-Oct-2026): backend/email.ts and
// frontend/src/engine/reminderEmail.ts. No network: a stand-in transport, nodemailer's own stream transport for the
// composed message, and capture mode. What is proved here:
//   * how a message goes: EMAIL_TRANSPORT=capture keeps it on the PC (nothing reaches any transport), then a test's
//     transport, then Gmail with both GMAIL_USER and GMAIL_APP_PASSWORD, else nothing (and the caller is told);
//   * every message: from "<COMPANY.shortName> - DCRS" <GMAIL_USER>, a plain-text part and an HTML part (the text made
//     from the HTML when not given), Auto-Submitted, never an attachment; nodemailer composes it as multipart/alternative;
//   * Gmail through nodemailer's pool: one connection, at most one message a second;
//   * an address in a log is masked, every address in an error's text too;
//   * THE ADDRESS RULE the page and the server share: one plain address, trimmed and in small letters, at most 254
//     characters; never a sign-in (gpp.local, the removed-account mark) nor a name that receives no mail (.local,
//     .localhost, .test, .invalid, .example); the three languages.
// Run: npm run test:unit -- email
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, describe, it } from "node:test";
import nodemailer from "nodemailer";
import {
  gmailTransportOptions,
  htmlToText,
  isEmailConfigured,
  mailMode,
  maskAddress,
  nodemailerMessage,
  scrubAddresses,
  sendMail,
  senderName,
  setMailTransport,
  type OutgoingMail,
} from "../email.ts";
import { MAX_ADDRESS_LENGTH, REMINDER_LANGUAGE_NAMES, REMINDER_LANGUAGES, REMOVED_ACCOUNT_MARK, isReminderLanguage, reminderAddress } from "../../frontend/src/engine/reminderEmail.ts";
import { RELEASED_MARK } from "../../frontend/src/engine/accountNames.ts";

// The company's one spelling, read the way backend/email.ts reads it (a path in a variable: the seed's imports are the app's).
const SEED_MASTER_FILE: string = "../../frontend/src/data/seed/masterData.ts";
const COMPANY = ((await import(SEED_MASTER_FILE)) as { COMPANY: { shortName: string } }).COMPANY;

/** A stand-in mailbox for the From line: a reserved domain, nobody's. */
const PLANT = "plant.dcrs@example.com";

function recorder() {
  const sent: OutgoingMail[] = [];
  return { sent, transport: { send: async (m: OutgoingMail) => (sent.push(m), { messageId: `<stand-in-${sent.length}@example.com>` }) } };
}

after(() => setMailTransport(null));

describe("how a message goes", () => {
  it("capture first, then a test's transport, then Gmail with both settings, else nothing", () => {
    const pass = crypto.randomBytes(8).toString("hex");
    setMailTransport(null);
    assert.equal(mailMode({}), "off");
    assert.equal(mailMode({ GMAIL_USER: PLANT }), "off", "a mailbox with no App Password sends nothing");
    assert.equal(mailMode({ GMAIL_APP_PASSWORD: pass }), "off");
    assert.equal(mailMode({ GMAIL_USER: PLANT, GMAIL_APP_PASSWORD: pass }), "gmail");
    assert.equal(mailMode({ GMAIL_USER: " ", GMAIL_APP_PASSWORD: " " }), "off", "blank is not set (the test servers blank both)");
    assert.equal(mailMode({ GMAIL_USER: PLANT, GMAIL_APP_PASSWORD: pass, EMAIL_TRANSPORT: "capture" }), "capture", "capture wins over a real mailbox");
    assert.equal(mailMode({ EMAIL_TRANSPORT: " Capture " }), "capture");
    assert.equal(isEmailConfigured({ GMAIL_USER: PLANT, GMAIL_APP_PASSWORD: pass }), true);
    assert.equal(isEmailConfigured({ GMAIL_USER: PLANT }), false, "escalation.ts's question: a mailbox of the server's own");
    setMailTransport(recorder().transport);
    assert.equal(mailMode({}), "custom");
    assert.equal(mailMode({ EMAIL_TRANSPORT: "capture" }), "capture", "and capture wins over a test's transport too");
    setMailTransport(null);
  });

  it("EMAIL_TRANSPORT=capture: nothing reaches any transport, and the message is answered as captured", async () => {
    const r = recorder();
    setMailTransport(r.transport);
    try {
      const result = await sendMail({ to: "dharmik.reminders@example.com", subject: "3 records need you", html: "<p>Hello</p>" }, { env: { EMAIL_TRANSPORT: "capture", GMAIL_USER: PLANT } });
      assert.equal(result.captured, true);
      assert.match(result.messageId, /^captured-/);
      assert.equal(r.sent.length, 0, "nothing left the PC");
    } finally {
      setMailTransport(null);
    }
  });

  it("with nothing set up, nothing is sent and the caller is told why", async () => {
    setMailTransport(null);
    await assert.rejects(sendMail({ to: "dharmik.reminders@example.com", subject: "x", html: "<p>x</p>" }, { env: {} }), (err: unknown) => (err as { code?: string }).code === "ENOTSETUP" && /GMAIL_USER and GMAIL_APP_PASSWORD/.test(String((err as Error).message)));
  });
});

describe("every message", () => {
  it("from '<the company's short name> - DCRS' <GMAIL_USER>, a text part and an HTML part, Auto-Submitted, never an attachment", async () => {
    assert.equal(await senderName(), `${COMPANY.shortName} - DCRS`);
    assert.equal(COMPANY.shortName, "Gujarat Print Pack Publications Pvt Ltd", "the one spelling of the company (data/seed/masterData.ts)");
    const r = recorder();
    setMailTransport(r.transport);
    try {
      const result = await sendMail({ to: "dharmik.reminders@example.com", subject: "Still open: 3 records need you", html: "<p>Hello Dharmik Mistry,</p><ul><li>F/PRD/10 of 26-10-26 &amp; more</li></ul>" }, { env: { GMAIL_USER: PLANT } });
      assert.equal(result.captured, false);
      assert.equal(r.sent.length, 1);
      const m = r.sent[0];
      assert.deepEqual(m.from, { name: "Gujarat Print Pack Publications Pvt Ltd - DCRS", address: PLANT });
      assert.equal(m.to, "dharmik.reminders@example.com");
      assert.equal(m.text, "Hello Dharmik Mistry,\n- F/PRD/10 of 26-10-26 & more", "the text part made from the HTML");
      assert.match(m.html, /<li>/);
      assert.equal(m.headers["Auto-Submitted"], "auto-generated");
      assert.ok(!("attachments" in nodemailerMessage(m)), "never an attachment");
    } finally {
      setMailTransport(null);
    }
  });

  it("nodemailer composes it as multipart/alternative: the From name, both parts, the headers, no attachment", async () => {
    const mail: OutgoingMail = {
      from: { name: `${COMPANY.shortName} - DCRS`, address: PLANT },
      to: "vinay.reminders@example.com",
      subject: "હજી બાકી: 2 રેકોર્ડ તમારી રાહ જુએ છે",
      text: "નમસ્તે Vinay Bhojak,\n- F/HR/17 ...",
      html: "<p>નમસ્તે Vinay Bhojak,</p>",
      headers: { "Auto-Submitted": "auto-generated" },
    };
    const stream = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
    const info = (await stream.sendMail(nodemailerMessage(mail))) as { message: Buffer };
    const raw = info.message.toString("utf8");
    // The headers unfolded: a long one goes on over the next line, which starts with a space (RFC 5322).
    const head = raw.slice(0, raw.indexOf("\n\n")).replace(/\n[ \t]+/g, " ");
    assert.match(head, /^From: "Gujarat Print Pack Publications Pvt Ltd - DCRS" <plant\.dcrs@example\.com>$/m);
    assert.match(raw, /^Content-Type: multipart\/alternative;/m);
    assert.match(raw, /^Content-Type: text\/plain; charset=utf-8$/m);
    assert.match(raw, /^Content-Type: text\/html; charset=utf-8$/m);
    assert.match(raw, /^Auto-Submitted: auto-generated$/m);
    assert.match(raw, /^Subject: =\?UTF-8\?/m, "a Gujarati subject is encoded, not mangled");
    assert.doesNotMatch(raw, /Content-Disposition: attachment/i);
  });

  it("Gmail through nodemailer's pool: one connection, at most one message a second", () => {
    const pass = crypto.randomBytes(8).toString("hex");
    const o = gmailTransportOptions({ GMAIL_USER: ` ${PLANT} `, GMAIL_APP_PASSWORD: pass });
    assert.equal(o.service, "gmail");
    assert.equal(o.pool, true);
    assert.equal(o.maxConnections, 1);
    assert.equal(o.rateLimit, 1);
    assert.equal(o.rateDelta, 1000);
    assert.deepEqual(o.auth, { user: PLANT, pass });
  });

  it("the text part from an HTML one: its lines and list items, its tags gone, its entities read", () => {
    assert.equal(htmlToText("<h2>Overdue (1)</h2><ul><li>A &lt;b&gt; &quot;c&quot;</li><li>D</li></ul><p>Bye<br>now</p>"), 'Overdue (1)\n- A <b> "c"\n- D\n\nBye\nnow');
    assert.equal(htmlToText("<style>p{}</style><p>x</p>"), "x");
  });
});

describe("never an address in a log", () => {
  it("an address masked: its first letter, its domain's first letter and its ending", () => {
    assert.equal(maskAddress("dharmik.mistry@example.com"), "d…@e….com");
    assert.equal(maskAddress("a@b.co.in"), "a…@b….in");
    assert.equal(maskAddress("nobody"), "n…");
    assert.equal(maskAddress(""), "");
  });

  it("every address in an error's text masked", () => {
    const said = scrubAddresses("550 5.1.1 <dharmik.mistry@example.com>: Recipient address rejected; also sent by plant.dcrs@example.co.in");
    assert.equal(said, "550 5.1.1 <d…@e….com>: Recipient address rejected; also sent by p…@e….in");
    assert.doesNotMatch(said, /[a-z0-9]@[a-z0-9]/i);
  });
});

describe("the address rule (engine/reminderEmail.ts), the page's and the server's", () => {
  it("one plain address, trimmed and in small letters", () => {
    for (const [typed, kept] of [
      ["  Dharmik.Mistry@Example.com ", "dharmik.mistry@example.com"],
      ["a+reminders@sub.example.co.in", "a+reminders@sub.example.co.in"],
      ["x_y-z@domain-name.org", "x_y-z@domain-name.org"],
      ["kapila.barad.qc@example.com", "kapila.barad.qc@example.com"],
    ] as const) {
      assert.deepEqual(reminderAddress(typed), { ok: true, address: kept }, typed);
    }
  });

  it("never a sign-in, never a name that receives no mail", () => {
    const refused: [unknown, string][] = [
      ["", "empty"],
      ["   ", "empty"],
      [undefined, "empty"],
      [42, "empty"],
      ["kapila.barad@gpp.local", "sign-in"],
      ["KAPILA.BARAD@GPP.LOCAL", "sign-in"],
      [`kapila.barad@gpp.local${RELEASED_MARK}3f1c2d4e`, "sign-in"],
      ["someone@printer.local", "no-mail-domain"],
      ["someone@host.localhost", "no-mail-domain"],
      ["someone@mail.test", "no-mail-domain"],
      ["someone@mail.invalid", "no-mail-domain"],
      ["someone@mail.example", "no-mail-domain"],
      ["a@example.com,b@example.com", "not-one-address"],
      ["a@example.com; b@example.com", "not-one-address"],
      ["Dharmik <dharmik@example.com>", "not-one-address"],
      ['"dharmik"@example.com', "not-one-address"],
      ["dharmik mistry@example.com", "not-one-address"],
      ["dharmik@@example.com", "not-one-address"],
      ["a@b@example.com", "not-one-address"],
      ["@example.com", "not-one-address"],
      ["a..b@example.com", "not-one-address"],
      [".a@example.com", "not-one-address"],
      ["a.@example.com", "not-one-address"],
      ["a@[10.0.0.1]", "not-one-address"],
      ["dharmik", "not-one-address"],
      ["a@localhost", "bad-domain"],
      ["a@10.0.0.1", "bad-domain"],
      ["a@example.c", "bad-domain"],
      ["a@-example.com", "bad-domain"],
      ["a@example-.com", "bad-domain"],
      ["a@example..com", "bad-domain"],
      ["a@exa_mple.com", "bad-domain"],
      [`${"a".repeat(65)}@example.com`, "not-one-address"],
      [`a@${"b".repeat(250)}.com`, "too-long"],
    ];
    for (const [typed, problem] of refused) assert.deepEqual(reminderAddress(typed), { ok: false, problem }, String(typed));
    assert.equal(MAX_ADDRESS_LENGTH, 254);
  });

  it("the removed-account mark is engine/accountNames.ts's own", () => {
    assert.equal(REMOVED_ACCOUNT_MARK, RELEASED_MARK);
  });

  it("the three languages, each named in its own words", () => {
    assert.deepEqual([...REMINDER_LANGUAGES], ["en", "gu", "hi"]);
    assert.deepEqual(REMINDER_LANGUAGE_NAMES, { en: "English", gu: "ગુજરાતી", hi: "हिन्दी" });
    assert.ok(isReminderLanguage("gu") && isReminderLanguage("hi") && !isReminderLanguage("fr") && !isReminderLanguage(undefined));
  });
});
