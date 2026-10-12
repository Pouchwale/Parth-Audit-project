// The words of the browser's room (REQUIREMENTS §108), spread into i18n/strings.ts (en and gu). `gu` is typed against
// `en`: a missing Gujarati string is a compile error.
//
// THE BROWSER'S COPY IS FULL ONLY WHEN IndexedDB TOO REFUSES. What does not fit in the browser's localStorage is kept
// in its IndexedDB (data/browserRoom.ts), so the banner (components/common/StorageFullBanner.tsx) says the copy is
// full only when that larger store refused it as well - the computer's disk nearly full, or a browser without it - and
// says so. "WAS saved" is said once the database has the change, and only then; a copy that came from the database
// with nothing of the person's in it (a sign-in) is "nothing is lost".
const en = {
  "room.full": "This browser's copy is full.",
  "room.fullSavedRecord": "This browser's copy is full — your record WAS saved.",
  "room.fullSavedChange": "This browser's copy is full — your change WAS saved.",
  "room.fullNothingLost": "This browser's copy is full — nothing is lost.",
  "room.sending":
    "Neither its storage nor its larger store (IndexedDB) has room for the app's working copy, so your change is kept on this page and is being sent to the database (PostgreSQL) now. Keep this page open until this says it was saved.",
  "room.saved":
    "It is in the database (PostgreSQL), so nothing is lost, and this page goes on working from memory. This browser's larger store (IndexedDB) did not take it either: the computer's disk may be nearly full. Free some space on the disk, then reload the page.",
};

const gu: Record<keyof typeof en, string> = {
  "room.full": "આ બ્રાઉઝરની નકલ ભરાઈ ગઈ છે.",
  "room.fullSavedRecord": "આ બ્રાઉઝરની નકલ ભરાઈ ગઈ છે — તમારો રેકોર્ડ સાચવાઈ ગયો છે.",
  "room.fullSavedChange": "આ બ્રાઉઝરની નકલ ભરાઈ ગઈ છે — તમારો ફેરફાર સાચવાઈ ગયો છે.",
  "room.fullNothingLost": "આ બ્રાઉઝરની નકલ ભરાઈ ગઈ છે — કંઈ ગુમાયું નથી.",
  "room.sending":
    "તેના સ્ટોરેજમાં કે તેના મોટા સ્ટોર (IndexedDB) માં એપની કામની નકલ માટે જગ્યા નથી, તેથી તમારો ફેરફાર આ પેજ પર રાખ્યો છે અને હમણાં ડેટાબેઝ (PostgreSQL) માં મોકલાઈ રહ્યો છે. તે સાચવાઈ ગયો એવું અહીં લખાય ત્યાં સુધી આ પેજ ખુલ્લું રાખો.",
  "room.saved":
    "તે ડેટાબેઝ (PostgreSQL) માં છે, તેથી કંઈ ગુમાયું નથી, અને આ પેજ મેમરીમાંથી કામ ચાલુ રાખે છે. આ બ્રાઉઝરના મોટા સ્ટોર (IndexedDB) એ પણ તે લીધો નહીં: કમ્પ્યુટરની ડિસ્ક લગભગ ભરાઈ ગઈ હોઈ શકે. ડિસ્ક પર થોડી જગ્યા ખાલી કરો, પછી પેજ ફરી લોડ કરો.",
};

export const ROOM_STRINGS = { en, gu };
