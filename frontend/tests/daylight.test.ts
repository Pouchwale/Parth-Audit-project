// THE DAYLIGHT THEME FOLLOWS THE REAL SUN (REQUIREMENTS §166; the owner, 2-Nov-2026): engine/daylight.ts, judged
// without a browser.
//   * the sun over Mehsana: sunrise, noon and sunset to a few minutes of the almanac on the year's shortest and
//     longest days and on 2-Nov-2026; civil dawn and dusk about 23 minutes either side at this latitude;
//   * the phases walk the day in order - night, dawn, morning, noon, afternoon, evening, dusk, night - and the sun's
//     place on its arc runs 0 to 1 across the day, up to the top at noon; the moon crosses the night the same way;
//   * the colours: the surfaces are the light theme's tinted by day and the dark theme's by night, and the ink reads
//     on every one of them at every ten minutes of both days (WCAG 7:1 and more); the band is a gradient of the sky;
//   * the store: a fourth choice, daylight, painted as data-theme with data-sky and the tokens inline on <html>, the
//     base mirrored for the first paint, "See the day" painting another minute until Now, the tokens lifted for print.
// Run: npm run test:unit -- daylight
import test from "node:test";
import assert from "node:assert/strict";
import { clockWords, contrast, DARK_BASE, LIGHT_BASE, mix, paletteAt, skyAt, skyFor, skyWords, sunElevation, sunTimes, type SkyPhase } from "../src/engine/daylight";
import { setDaylightThemeAvailable } from "../src/engine/features";

const minutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const within = (actual: number, wanted: string, tolerance: number, what: string) => assert.ok(Math.abs(actual - minutes(wanted)) <= tolerance, `${what}: ${clockWords(actual)}, wanted ${wanted} ± ${tolerance} min`);

test("the sun over Mehsana: the almanac's sunrise, noon and sunset, to a few minutes, on three days of the year", () => {
  const nov = sunTimes("2026-11-02");
  within(nov.sunrise, "06:50", 5, "sunrise 2-Nov-2026");
  within(nov.sunset, "17:59", 5, "sunset 2-Nov-2026");
  within(nov.noon, "12:24", 4, "solar noon 2-Nov-2026");
  const june = sunTimes("2026-06-21");
  within(june.sunrise, "05:56", 5, "sunrise 21-Jun-2026");
  within(june.sunset, "19:27", 5, "sunset 21-Jun-2026");
  const dec = sunTimes("2026-12-21");
  within(dec.sunrise, "07:16", 5, "sunrise 21-Dec-2026");
  within(dec.sunset, "18:03", 5, "sunset 21-Dec-2026");
  for (const t of [nov, june, dec]) {
    assert.ok(t.dawn < t.sunrise && t.sunrise < t.noon && t.noon < t.sunset && t.sunset < t.dusk, "dawn, sunrise, noon, sunset, dusk in order");
    assert.ok(t.sunrise - t.dawn > 18 && t.sunrise - t.dawn < 30, `civil dawn ${Math.round(t.sunrise - t.dawn)} minutes before sunrise`);
    assert.ok(t.dusk - t.sunset > 18 && t.dusk - t.sunset < 30, `civil dusk ${Math.round(t.dusk - t.sunset)} minutes after sunset`);
  }
  assert.ok(june.noonElevation > 85 && nov.noonElevation > 50 && nov.noonElevation < 55 && dec.noonElevation > 42 && dec.noonElevation < 44, `the noon sun's height: ${june.noonElevation.toFixed(1)}, ${nov.noonElevation.toFixed(1)}, ${dec.noonElevation.toFixed(1)}`);
  // The sun's height at a minute: under the horizon before sunrise, highest at noon, under again after sunset.
  assert.ok(sunElevation("2026-11-02", nov.sunrise - 30) < 0 && sunElevation("2026-11-02", nov.sunrise + 60) > 5);
  assert.ok(Math.abs(sunElevation("2026-11-02", nov.noon) - nov.noonElevation) < 1);
  assert.ok(sunElevation("2026-11-02", nov.sunset + 40) < -6, "after civil dusk the sun is six degrees under");
  assert.equal(clockWords(nov.noon), "12:2" + clockWords(nov.noon).slice(4));
});

test("the phases walk the day in order, and the sun runs its arc 0 to 1, up to the top at noon; the moon crosses the night", () => {
  const times = sunTimes("2026-11-02");
  const seen: SkyPhase[] = [];
  let lastX = -1;
  for (let m = 0; m < 1440; m += 5) {
    const sky = skyAt(m, times, sunElevation("2026-11-02", m));
    if (seen[seen.length - 1] !== sky.phase) seen.push(sky.phase);
    if (sky.phase !== "night") {
      assert.ok(sky.sunX >= lastX - 1e-9, `the sun never goes back (${m})`);
      lastX = sky.sunX;
    }
    assert.ok(sky.sunX >= 0 && sky.sunX <= 1 && sky.sunY >= 0 && sky.sunY <= 1);
    assert.equal(sky.base, sky.phase === "night" ? "dark" : "light");
  }
  assert.deepEqual(seen, ["night", "dawn", "morning", "noon", "afternoon", "evening", "dusk", "night"]);
  const noon = skyAt(times.noon, times);
  assert.equal(noon.phase, "noon");
  assert.ok(noon.sunY > 0.99 && Math.abs(noon.sunX - 0.5) < 0.01, "at its peak, in the middle of the arc");
  assert.ok(skyAt(times.sunrise + 1, times).sunY < 0.02 && skyAt(times.sunrise + 1, times).phase === "dawn", "just risen: at the left edge");
  assert.ok(skyAt(times.sunset - 1, times).sunX > 0.99 && skyAt(times.sunset - 1, times).phase === "evening", "about to go: at the right edge");
  assert.equal(skyAt(times.sunset + 10, times).phase, "dusk");
  assert.equal(skyAt(times.dusk + 1, times).phase, "night");
  // The moon: just after dusk at the left, mid-night at the top, before dawn at the right.
  assert.ok(skyAt(times.dusk + 5, times).sunX < 0.02);
  assert.ok(skyAt(times.dawn - 5, times).sunX > 0.98);
  const midnight = skyAt(((times.dusk + (1440 - times.dusk + times.dawn) / 2) % 1440), times);
  assert.ok(midnight.sunY > 0.99, "the moon at the top of its arc in the middle of the night");
  const w = skyWords(skyFor("2026-11-02", 15 * 60));
  assert.deepEqual([w.phase, w.sunrise.length, w.sunset.length], ["afternoon", 5, 5]);
});

test("the colours: the light theme's surfaces tinted by day, the dark theme's by night, the ink readable at every ten minutes of the longest and shortest days", () => {
  for (const date of ["2026-06-21", "2026-12-21", "2026-11-02"]) {
    const times = sunTimes(date);
    for (let m = 0; m < 1440; m += 10) {
      const sky = skyAt(m, times, sunElevation(date, m));
      const p = paletteAt(sky);
      const ink = sky.base === "dark" ? DARK_BASE.ink : LIGHT_BASE.ink;
      for (const name of ["canvas", "surface", "surface-sunken", "surface-raised", "shell", "field-bg"]) {
        assert.match(p[name], /^#[0-9A-F]{6}$/, `${name} at ${clockWords(m)}`);
        assert.ok(contrast(ink, p[name]) >= 7, `${date} ${clockWords(m)} ${sky.phase}: ink on ${name} ${p[name]} reads ${contrast(ink, p[name]).toFixed(1)}:1`);
      }
      assert.match(p["sky-band"], /^linear-gradient\(180deg, #[0-9A-F]{6} 0%, #[0-9A-F]{6} 100%\)$/);
      assert.equal(p["sun-x"], sky.sunX.toFixed(3));
      assert.equal(p["sun-y"], sky.sunY.toFixed(3));
    }
  }
  const times = sunTimes("2026-11-02");
  const noon = paletteAt(skyAt(times.noon, times));
  const dawn = paletteAt(skyAt(times.sunrise + 3, times));
  const evening = paletteAt(skyAt(times.sunset - 5, times));
  const night = paletteAt(skyAt(times.dusk + 120, times));
  // By day the canvas stays near the light theme's cream; at dawn and evening it warms; the band is blue at noon and amber at the edges of the day.
  assert.ok(contrast(noon.canvas, LIGHT_BASE.canvas) < 1.06, "noon: the canvas barely tinted");
  assert.notEqual(dawn.canvas, noon.canvas);
  assert.ok(Number.parseInt(dawn["sky-top"].slice(1, 3), 16) > Number.parseInt(dawn["sky-top"].slice(5, 7), 16), "dawn's band is warmer (more red than blue)");
  assert.ok(Number.parseInt(noon["sky-top"].slice(5, 7), 16) > Number.parseInt(noon["sky-top"].slice(1, 3), 16), "noon's band is blue");
  assert.ok(Number.parseInt(evening["sky-bottom"].slice(1, 3), 16) > Number.parseInt(evening["sky-bottom"].slice(5, 7), 16), "evening's band is amber");
  assert.ok(contrast(night.canvas, "#000000") < contrast(DARK_BASE.canvas, "#000000") + 0.5, "night: as dark as the dark theme");
  assert.ok(Number.parseInt(night.canvas.slice(5, 7), 16) > Number.parseInt(night.canvas.slice(1, 3), 16), "...and toward blue");
  assert.equal(mix("#000000", "#FFFFFF", 0.5), "#808080");
  assert.ok(contrast("#000000", "#FFFFFF") > 20.9);
});

// ---- the store ---------------------------------------------------------------------------

const attrs = new Map<string, string>();
const inline = new Map<string, string>();
const rootStyle = { colorScheme: "", setProperty: (n: string, v: string) => inline.set(n, v), removeProperty: (n: string) => inline.delete(n) };
Object.defineProperty(globalThis, "document", {
  value: { documentElement: { style: rootStyle, getAttribute: (n: string) => attrs.get(n) ?? null, setAttribute: (n: string, v: string) => attrs.set(n, String(v)), removeAttribute: (n: string) => attrs.delete(n) } },
  configurable: true,
  writable: true,
});

test("the store: daylight is the fourth choice; chosen, it paints data-sky and the tokens inline, mirrors the base, previews another minute, lifts the tokens for print, and clears on another choice", async () => {
  const theme = await import("../src/store/theme");
  assert.deepEqual([...theme.THEME_CHOICES], ["light", "dark", "system", "daylight"]);
  assert.ok(theme.isThemeChoice("daylight"));
  // A server that does not offer Daylight (the plant's, until the owner says yes): the switch offers three, and the choice paints light.
  setDaylightThemeAvailable(false);
  assert.deepEqual([...theme.themeChoicesOffered()], ["light", "dark", "system"]);
  theme.setThemeChoice("daylight");
  assert.equal(attrs.get("data-theme"), "light", "daylight not offered: light");
  assert.ok(!attrs.has("data-sky"));
  setDaylightThemeAvailable(true);
  assert.deepEqual([...theme.themeChoicesOffered()], ["light", "dark", "system", "daylight"]);
  theme.setThemeChoice("daylight");
  assert.equal(attrs.get("data-theme"), "daylight");
  const sky = theme.paintedSky();
  assert.ok(sky, "the sky is read at once");
  assert.equal(attrs.get("data-sky"), sky!.phase);
  for (const name of theme.SKY_TOKENS) assert.ok(inline.has(`--${name}`), `--${name} set inline`);
  assert.equal(rootStyle.colorScheme, sky!.base);
  assert.equal(localStorage.getItem(theme.SKY_MIRROR_KEY), sky!.base === "dark" ? "night" : "day");
  assert.equal(theme.effectiveTheme("daylight"), sky!.base);
  assert.equal(JSON.parse(localStorage.getItem("dcrs:v1:settings")!).theme, "daylight", "kept with the person's settings");
  // See the day: noon, then night, then now.
  theme.previewSky(sky!.times.noon);
  assert.equal(attrs.get("data-sky"), "noon");
  assert.ok(theme.skyPreviewOn());
  assert.equal(rootStyle.colorScheme, "light");
  theme.previewSky(sky!.times.dusk + 150);
  assert.equal(attrs.get("data-sky"), "night");
  assert.equal(rootStyle.colorScheme, "dark");
  assert.equal(localStorage.getItem(theme.SKY_MIRROR_KEY), sky!.base === "dark" ? "night" : "day", "the base mirrored is the real sky's, never a preview's");
  theme.previewSky(null);
  assert.ok(!theme.skyPreviewOn());
  assert.equal(attrs.get("data-sky"), theme.paintedSky()!.phase);
  // Printing: the inline tokens are lifted, so the print block's values paint; back afterwards.
  window.dispatchEvent(new Event("beforeprint"));
  assert.ok(!inline.has("--canvas"), "lifted for print");
  window.dispatchEvent(new Event("afterprint"));
  assert.ok(inline.has("--canvas"), "painted again after print");
  // Another choice: nothing of the sky is left on <html>.
  theme.setThemeChoice("light");
  assert.equal(attrs.get("data-theme"), "light");
  assert.ok(!attrs.has("data-sky"));
  assert.equal(inline.size, 0);
  assert.equal(theme.paintedSky(), null);
  assert.equal(rootStyle.colorScheme, "");
});
