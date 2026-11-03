// THE DAYLIGHT THEME FOLLOWS THE REAL SUN (REQUIREMENTS §166; the owner, 2-Nov-2026: "a theme for the whole day:
// in the morning the sun arrives, at noon it is at its peak, in the evening it is about to go - on real time, how the
// sun rises and sets, so it feels natural and the user feels like working in nature").
//
// The sun over the plant (Mehsana, Gujarat) is worked out, not guessed: NOAA's solar equations give the day's sunrise,
// solar noon, sunset and the civil twilight (the sun six degrees under the horizon) for any date, to the minute, and the
// sun's height at any moment. From them the day is read in phases - night, dawn, morning, noon, afternoon, evening,
// dusk - and painted: a sky band (the top bar's gradient) with the sun on its arc, and the app's own canvas, surfaces
// and panel tinted a little toward the sky's light: amber at sunrise, cool white under the noon sun, cream in the
// afternoon, orange and rose as the sun goes, deep blue at night. The words stay the theme's own ink, so nothing is
// harder to read at any hour (frontend/tests/daylight.test.ts holds the contrast at every ten minutes of the year's
// longest and shortest days). At night the dark theme's values are the base; by day the light theme's.
//
// Pure, with no imports: store/theme.tsx runs it on the plant's wall clock every minute.

/** The plant: 308/9 GIDC Dediyasan, Mehsana, Gujarat (Master Data's address). */
export const PLANT_LATITUDE = 23.588;
export const PLANT_LONGITUDE = 72.369;
/** India Standard Time, in minutes east of UTC (the plant's clock, engine/workingHoursCore.ts). */
export const PLANT_UTC_OFFSET_MINUTES = 330;

export type SkyPhase = "night" | "dawn" | "morning" | "noon" | "afternoon" | "evening" | "dusk";

export interface SunTimes {
  /** All in minutes after the plant's midnight. */
  dawn: number;
  sunrise: number;
  noon: number;
  sunset: number;
  dusk: number;
  /** The sun's height at solar noon, degrees above the horizon. */
  noonElevation: number;
}

export interface Sky {
  phase: SkyPhase;
  /** Dark at night, light from civil dawn to civil dusk. */
  base: "light" | "dark";
  /** Where the sun is on its arc, 0 at sunrise to 1 at sunset (clamped; by night, the moon's place across the night). */
  sunX: number;
  /** How high on the arc, 0 at the horizon to 1 at the top. */
  sunY: number;
  /** The sun's height above the horizon, degrees (negative under it). */
  elevation: number;
  /** The minute of the day the sky was read for. */
  minutes: number;
  times: SunTimes;
}

const RAD = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

/** Minutes of the day as the clock shows them, "06:49". */
export function clockWords(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/** The Julian day at 0h UT of a calendar date (Meeus). */
function julianDay(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
}

/** The sun's declination (degrees) and the equation of time (minutes) at a Julian century. */
function solar(jc: number): { declination: number; equationOfTime: number } {
  const l0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const m = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const c = Math.sin(m * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) + Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * jc) + Math.sin(3 * m * RAD) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * jc;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const declination = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) / RAD;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eqTime =
    4 *
    (y * Math.sin(2 * l0 * RAD) - 2 * e * Math.sin(m * RAD) + 4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) - 0.5 * y * y * Math.sin(4 * l0 * RAD) - 1.25 * e * e * Math.sin(2 * m * RAD)) /
    RAD;
  return { declination, equationOfTime: eqTime };
}

function parseDate(dateISO: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateISO);
  if (!m) {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  }
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** The hour angle (degrees) at which the sun's centre is `zenith` degrees from the zenith; NaN where it never is (polar). */
function hourAngle(zenith: number, latitude: number, declination: number): number {
  const cosH = Math.cos(zenith * RAD) / (Math.cos(latitude * RAD) * Math.cos(declination * RAD)) - Math.tan(latitude * RAD) * Math.tan(declination * RAD);
  return Math.acos(clamp(cosH, -1, 1)) / RAD;
}

/**
 * The day's sun over a place: sunrise and sunset (the sun's upper edge at the horizon, refraction allowed for), solar
 * noon, civil dawn and dusk (the centre six degrees under), all in minutes after the place's midnight.
 */
export function sunTimes(dateISO: string, latitude: number = PLANT_LATITUDE, longitude: number = PLANT_LONGITUDE, utcOffsetMinutes: number = PLANT_UTC_OFFSET_MINUTES): SunTimes {
  const { y, m, d } = parseDate(dateISO);
  // Worked out at the place's local noon, which is near enough for every hour of the day.
  const jd = julianDay(y, m, d) + (720 - utcOffsetMinutes) / 1440;
  const jc = (jd - 2451545) / 36525;
  const { declination, equationOfTime } = solar(jc);
  const noon = 720 - 4 * longitude - equationOfTime + utcOffsetMinutes;
  const haRise = hourAngle(90.833, latitude, declination);
  const haDawn = hourAngle(96, latitude, declination);
  const noonElevation = 90 - Math.abs(latitude - declination);
  return { dawn: noon - haDawn * 4, sunrise: noon - haRise * 4, noon, sunset: noon + haRise * 4, dusk: noon + haDawn * 4, noonElevation };
}

/** The sun's height above the horizon, degrees, at a minute of the day. */
export function sunElevation(dateISO: string, minutes: number, latitude: number = PLANT_LATITUDE, longitude: number = PLANT_LONGITUDE, utcOffsetMinutes: number = PLANT_UTC_OFFSET_MINUTES): number {
  const { y, m, d } = parseDate(dateISO);
  const jd = julianDay(y, m, d) + (minutes - utcOffsetMinutes) / 1440;
  const jc = (jd - 2451545) / 36525;
  const { declination, equationOfTime } = solar(jc);
  const trueSolarMinutes = (((minutes - utcOffsetMinutes + equationOfTime + 4 * longitude) % 1440) + 1440) % 1440;
  const ha = trueSolarMinutes / 4 - 180;
  const sinEl = Math.sin(latitude * RAD) * Math.sin(declination * RAD) + Math.cos(latitude * RAD) * Math.cos(declination * RAD) * Math.cos(ha * RAD);
  return Math.asin(clamp(sinEl, -1, 1)) / RAD;
}

/**
 * THE SKY AT A MINUTE OF THE DAY. The phases: night until civil dawn; dawn from there until the sun is a little way up;
 * morning; noon (the middle fifth of the day, the sun at its peak); afternoon; evening (the last tenth, the sun about
 * to go); dusk until civil twilight ends; night again. The sun's place on its arc runs 0 to 1 from sunrise to sunset.
 */
export function skyAt(minutes: number, times: SunTimes, elevation?: number): Sky {
  const m = ((minutes % 1440) + 1440) % 1440;
  const dayLength = Math.max(1, times.sunset - times.sunrise);
  const t = (m - times.sunrise) / dayLength;
  const el = elevation ?? times.noonElevation * Math.sin(clamp(t, 0, 1) * Math.PI) - (t < 0 || t > 1 ? 6 * Math.min(1, Math.abs(t < 0 ? t : t - 1) * dayLength / Math.max(1, times.sunrise - times.dawn)) : 0);
  let phase: SkyPhase;
  if (m < times.dawn || m > times.dusk) phase = "night";
  else if (m < times.sunrise + 0.07 * dayLength) phase = "dawn";
  else if (t < 0.4) phase = "morning";
  else if (t < 0.6) phase = "noon";
  else if (t < 0.9) phase = "afternoon";
  else if (m <= times.sunset) phase = "evening";
  else phase = "dusk";
  const base: "light" | "dark" = phase === "night" ? "dark" : "light";
  let sunX: number;
  let sunY: number;
  if (phase === "night") {
    // The moon crosses the night as the sun crosses the day: from dusk to the next dawn.
    const nightLength = 1440 - (times.dusk - times.dawn);
    const since = m > times.dusk ? m - times.dusk : m + (1440 - times.dusk);
    sunX = clamp(since / nightLength, 0, 1);
    sunY = Math.sin(sunX * Math.PI);
  } else {
    sunX = clamp(t, 0, 1);
    sunY = clamp(Math.sin(sunX * Math.PI), 0, 1);
  }
  return { phase, base, sunX, sunY, elevation: el, minutes: m, times };
}

/** The sky now, for a date and a minute of the plant's day. */
export function skyFor(dateISO: string, minutes: number): Sky {
  return skyAt(minutes, sunTimes(dateISO), sunElevation(dateISO, minutes));
}

// ---------------------------------------------------------------------------
// the colours

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (v: number) => pad2hex(Math.round(clamp(v, 0, 255)));
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

const pad2hex = (n: number): string => n.toString(16).padStart(2, "0");

/** `a` moved `k` of the way (0 to 1) toward `b`. */
export function mix(a: string, b: string, k: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const f = clamp(k, 0, 1);
  return rgbToHex({ r: x.r + (y.r - x.r) * f, g: x.g + (y.g - x.g) * f, b: x.b + (y.b - x.b) * f });
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The sky's keyframes along the day: `t` is the sun's place, −0.1 civil dawn, 0 sunrise, 0.5 noon, 1 sunset, 1.1 civil dusk. */
interface SkyKey {
  t: number;
  /** The band's top and bottom. */
  top: string;
  bottom: string;
  /** What the canvas is tinted toward. */
  tint: string;
  sun: string;
}

const DAY_KEYS: readonly SkyKey[] = [
  { t: -0.1, top: "#2B2F55", bottom: "#C97C6A", tint: "#E9B294", sun: "#FFB36B" },
  { t: 0.0, top: "#E39A6E", bottom: "#FBD9B3", tint: "#F6CFA0", sun: "#FFB347" },
  { t: 0.12, top: "#A9CCEE", bottom: "#F8E6C7", tint: "#F8E8C6", sun: "#FFD66B" },
  { t: 0.35, top: "#7FB8EC", bottom: "#D9ECFB", tint: "#EEF4FA", sun: "#FFE27A" },
  { t: 0.5, top: "#5FA8EA", bottom: "#CFE6FA", tint: "#EEF5FB", sun: "#FFF0A6" },
  { t: 0.7, top: "#78B2E6", bottom: "#E7E9D8", tint: "#F6EEDC", sun: "#FFE27A" },
  { t: 0.9, top: "#D99A68", bottom: "#F7D3A6", tint: "#F8D9B0", sun: "#FFB347" },
  { t: 1.0, top: "#B4607A", bottom: "#F2A66B", tint: "#F3BE9A", sun: "#FF9A3C" },
  { t: 1.1, top: "#2C2A5A", bottom: "#B96C7C", tint: "#D9ABA8", sun: "#FF9A3C" },
];

const NIGHT = { top: "#0B1430", bottom: "#1B2A4D", tint: "#0E1A33", moon: "#F2EBD2" };

function keyAt(t: number): SkyKey {
  const x = clamp(t, DAY_KEYS[0].t, DAY_KEYS[DAY_KEYS.length - 1].t);
  for (let i = 0; i < DAY_KEYS.length - 1; i++) {
    const a = DAY_KEYS[i];
    const b = DAY_KEYS[i + 1];
    if (x >= a.t && x <= b.t) {
      const k = (x - a.t) / (b.t - a.t);
      return { t: x, top: mix(a.top, b.top, k), bottom: mix(a.bottom, b.bottom, k), tint: mix(a.tint, b.tint, k), sun: mix(a.sun, b.sun, k) };
    }
  }
  return DAY_KEYS[DAY_KEYS.length - 1];
}

/** The light theme's surfaces (styles.css :root) and the dark theme's (:root[data-theme="dark"]): the bases the sky tints. */
export const LIGHT_BASE = { canvas: "#FAF9F5", surface: "#FFFDFA", "surface-sunken": "#F3F1EA", "surface-raised": "#FFFEFC", shell: "#F3F1EA", hairline: "#E6E2D8", "hairline-strong": "#CFC9BE", "field-bg": "#FFFDFA", ink: "#1F1E1D" } as const;
export const DARK_BASE = { canvas: "#262624", surface: "#30302E", "surface-sunken": "#3A3936", "surface-raised": "#363533", shell: "#1F1F1D", hairline: "#44433F", "hairline-strong": "#56544F", "field-bg": "#262624", ink: "#F4F3EE" } as const;

export type SkyPalette = Record<string, string>;

/**
 * THE TOKENS THE SKY PAINTS, by name without the leading dashes: the surfaces of the base theme tinted toward the
 * sky's light (a little by day, deeper into blue by night), the band's gradient, the sun's colour and its place.
 */
export function paletteAt(sky: Sky): SkyPalette {
  const out: SkyPalette = {};
  if (sky.base === "dark") {
    const k = 0.32;
    out.canvas = mix(DARK_BASE.canvas, NIGHT.tint, k);
    out.surface = mix(DARK_BASE.surface, NIGHT.tint, k * 0.7);
    out["surface-sunken"] = mix(DARK_BASE["surface-sunken"], NIGHT.tint, k * 0.7);
    out["surface-raised"] = mix(DARK_BASE["surface-raised"], NIGHT.tint, k * 0.6);
    out.shell = mix(DARK_BASE.shell, NIGHT.tint, k);
    out.hairline = mix(DARK_BASE.hairline, "#2A3A5E", 0.35);
    out["hairline-strong"] = mix(DARK_BASE["hairline-strong"], "#3A4C72", 0.35);
    out["field-bg"] = out.canvas;
    out["sky-top"] = NIGHT.top;
    out["sky-bottom"] = NIGHT.bottom;
    out["sun-color"] = NIGHT.moon;
    out["sun-glow"] = "rgba(242, 235, 210, 0.28)";
  } else {
    const t = (sky.minutes - sky.times.sunrise) / Math.max(1, sky.times.sunset - sky.times.sunrise);
    const key = keyAt(t);
    // Deeper in the twilight and the golden hours, lightest under the noon sun.
    const warmth = clamp(1 - Math.abs(t - 0.5) / 0.5, 0, 1);
    const k = 0.14 - 0.05 * warmth;
    out.canvas = mix(LIGHT_BASE.canvas, key.tint, k);
    out.surface = mix(LIGHT_BASE.surface, key.tint, k * 0.5);
    out["surface-sunken"] = mix(LIGHT_BASE["surface-sunken"], key.tint, k * 0.8);
    out["surface-raised"] = mix(LIGHT_BASE["surface-raised"], key.tint, k * 0.4);
    out.shell = mix(LIGHT_BASE.shell, key.tint, k);
    out.hairline = mix(LIGHT_BASE.hairline, key.tint, k * 0.6);
    out["hairline-strong"] = mix(LIGHT_BASE["hairline-strong"], key.tint, k * 0.4);
    out["field-bg"] = out.surface;
    out["sky-top"] = key.top;
    out["sky-bottom"] = key.bottom;
    out["sun-color"] = key.sun;
    out["sun-glow"] = `${mix(key.sun, "#FFFFFF", 0.2)}66`;
  }
  out["sky-band"] = `linear-gradient(180deg, ${out["sky-top"]} 0%, ${out["sky-bottom"]} 100%)`;
  out["sun-x"] = sky.sunX.toFixed(3);
  out["sun-y"] = sky.sunY.toFixed(3);
  return out;
}

/** The sky's words for the switch's note: the phase, and the day's sunrise and sunset as the clock shows them. */
export function skyWords(sky: Sky): { phase: SkyPhase; sunrise: string; sunset: string } {
  return { phase: sky.phase, sunrise: clockWords(sky.times.sunrise), sunset: clockWords(sky.times.sunset) };
}
