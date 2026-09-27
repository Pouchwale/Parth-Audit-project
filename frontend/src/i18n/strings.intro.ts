// The words of one feature of REQUIREMENTS §81, spread into i18n/strings.ts (en and gu).
// `gu` is typed against `en`: a missing Gujarati string is a compile error.
//
// The 3D introduction on the sign-in screen (components/auth/IntroSplash.tsx).
// Its wordmark "DCRS" and the company's registered name are marks, written as
// they are in every language (REQUIREMENTS §58), so only the system's name is here.
const en = {
  "intro.name": "Digital Controlled Record System",
} as const;

const gu: Record<keyof typeof en, string> = {
  "intro.name": "ડિજિટલ કંટ્રોલ્ડ રેકોર્ડ સિસ્ટમ",
};

export const INTRO_STRINGS = { en, gu };
