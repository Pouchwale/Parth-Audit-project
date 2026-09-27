// The words of one feature of REQUIREMENTS §81, spread into i18n/strings.ts (en and gu).
// `gu` is typed against `en`: a missing Gujarati string is a compile error.
//
// MITRA'S PRAISE, CELEBRATIONS AND THE DAY CARD (engine/motivation.ts).
//
// Many lines, not one: a person who hears "Nicely done." forty times stops
// hearing it. Keys ending in a number (`cheer.onTime.1`, `cheer.onTime.2` …)
// are VARIANTS of one kind of line; engine/motivation.ts finds every variant of
// a kind by its prefix and picks one by a seed (the day, the record), so adding
// a line is adding a key here — nothing else. A variant that names a figure
// ({streak}, {count}, {pct}, {left}) is only chosen when that figure is worth
// saying (a streak of two or more, two or more on time or handed in); `{ontime}` prints
// nothing and marks a line that is only true when nothing was late. `{name}`
// is the person's first name, and is dropped with its comma when unknown.
//
// Never a document's or a module's name: a celebration shows on any screen,
// and must not name another department's paperwork.
const en = {
  // ---- The line under Mitra's reaction toast ---------------------------------
  "cheer.toast.count": "🔥 {count} on time today",
  "cheer.toast.countStreak": "🔥 {count} on time today — a {streak}-day streak",

  "cheer.onTime.1": "Nicely done.",
  "cheer.onTime.2": "That's the way — steady and on time.",
  "cheer.onTime.3": "The team can count on you.",
  "cheer.onTime.4": "One more record an auditor will trust.",
  "cheer.onTime.5": "Clean, complete and on time — proud work.",
  "cheer.onTime.6": "Every on-time record is a promise kept to a customer.",
  "cheer.onTime.7": "You make the whole plant look good.",
  "cheer.onTime.8": "Right on time — the file is stronger for it.",
  "cheer.onTime.9": "Keep that rhythm going!",
  "cheer.onTime.10": "That's quality you can show anyone.",
  "cheer.onTime.11": "Great going, {name}.",
  "cheer.onTime.12": "Safe packs start with records like this one.",

  "cheer.late.lead.one": "Done — a day late this time",
  "cheer.late.lead.many": "Done — {days} days late this time",
  "cheer.late.nextToday": "; the next one is due today, and that one can be on time.",
  "cheer.late.nextTomorrow": "; the next one is due tomorrow — a fresh chance to be on time.",
  "cheer.late.nextOn": "; the next one is due on {date} — plenty of time to be early.",
  "cheer.late.after.1": ". In is far better than missing — the file is whole again.",
  "cheer.late.after.2": ". It's in, and that's what counts now.",
  "cheer.late.after.3": ". Thank you for closing the gap.",
  "cheer.late.after.4": ". Every gap closed makes the next audit easier.",

  "cheer.asRequired.1": "Written up when it happened — exactly what an auditor hopes to see.",
  "cheer.asRequired.2": "Recorded while it's fresh — that's how a good file is kept.",
  "cheer.asRequired.3": "Logged in good time — nothing left to memory.",
  "cheer.asRequired.4": "Captured right when it mattered. Nicely done.",

  "cheer.again.1": "Put right and back in — that's what a careful record looks like.",
  "cheer.again.2": "Corrected and resubmitted — honesty is what makes a file trustworthy.",
  "cheer.again.3": "Fixed properly. Thank you for taking the care.",

  "cheer.verified.1": "Checked and signed — one more record anyone can trust.",
  "cheer.verified.2": "Verified — this one is audit-ready.",
  "cheer.verified.3": "A second pair of eyes is what makes a record count. Thank you.",
  "cheer.verified.4": "Signed off — the team's work is on the record for good.",

  "cheer.sentBack.1": "Sending it back now saves a finding later.",
  "cheer.sentBack.2": "A careful check today keeps the customer safe tomorrow.",
  "cheer.sentBack.3": "Thank you for holding the standard — it will come back right.",

  "cheer.dayDone.1": "✨ Take a breath — you've earned it.",
  "cheer.dayDone.2": "✨ The whole day, done. The team thanks you.",
  "cheer.dayDone.3": "✨ Nothing left waiting — what a feeling!",
  "cheer.dayDone.4": "✨ A clean slate for tomorrow.",

  // ---- The all-done card and its praise ------------------------------------
  "cheer.card.title": "🌟 All done for today, {name}!",
  "cheer.card.count.one": "1 record handed in today",
  "cheer.card.count.many": "{n} records handed in today",
  "cheer.card.streak.none": "🔥 A fresh streak starts tomorrow",
  "cheer.card.streak.one": "🔥 1 day on time — tomorrow makes it 2",
  "cheer.card.streak.many": "🔥 {n}-day streak",
  "cheer.onTimeMonth": "{pct}% on time this month",
  "cheer.close": "Close the celebration",

  "cheer.allDone.1": "You cleared the whole day, {name} — that's what a dependable teammate looks like.",
  "cheer.allDone.2": "{ontime}Every record in, on the day it was due. The auditors would smile.",
  "cheer.allDone.3": "That's the kind of day that makes the whole plant proud.",
  "cheer.allDone.4": "The customer will never see these records — but every pack they open is better for them.",
  "cheer.allDone.5": "Done and dusted. Tomorrow starts with nothing hanging over you.",
  "cheer.allDone.6": "A complete file today means no scramble on audit day.",
  "cheer.allDone.7": "Your colleagues can rely on this file — because you kept it.",
  "cheer.allDone.8": "{done} records, all handled. Superb work, {name}.",

  // ---- A new badge ------------------------------------------------------------
  "cheer.pop.title.one": "A new badge today",
  "cheer.pop.title.many": "New badges today",
  "cheer.badge.first": "First on time today",
  "cheer.badge.allDone": "All done today",
  "cheer.badge.streak": "{n}-day streak",
  "cheer.badge.earlyBird": "Early bird",
  "cheer.badge.cleanWeek": "Clean week",
  "cheer.badge.moduleHero": "Module hero",

  "cheer.streak.1": "{streak} working days in a row, everything on time. That's a habit now!",
  "cheer.streak.2": "A {streak}-day streak — consistency is what quality is made of.",
  "cheer.streak.3": "{streak} days straight without a single late record. Keep the fire going!",
  "cheer.streak.4": "{streak} days on time in a row — the file has never looked better.",
  "cheer.streak.5": "Day after day, on time — {streak} of them. The team notices.",

  "cheer.earlyBird.1": "Handed in before 11 — an early start sets up the whole day.",
  "cheer.earlyBird.2": "Done before the morning is out. Early and excellent.",
  "cheer.earlyBird.3": "In before eleven — that's leading from the front.",

  "cheer.cleanWeek.1": "A clean week so far — every record on time.",
  "cheer.cleanWeek.2": "Not one late record this week. That's what audit-ready looks like.",
  "cheer.cleanWeek.3": "This week's file is spotless so far. Proud work.",

  "cheer.moduleHero.1": "A whole module's records on time this month — this one is yours.",
  "cheer.moduleHero.2": "Every record of a module on time this month. Hero work.",
  "cheer.moduleHero.3": "Not a single late record in a whole module this month — the customer is safer for it.",

  // ---- Said aloud --------------------------------------------------------------
  "cheer.say.allDone.1": "Wonderful work, {name}! Everything due today is done.",
  "cheer.say.allDone.2": "{name}, that's the whole day done — every record in.",
  "cheer.say.allDone.3": "Brilliant, {name}! Nothing is left waiting for you today.",
  "cheer.say.allDone.4": "Well done, {name}! Today's work is complete.",
  "cheer.say.count.one": "One record handed in today.",
  "cheer.say.count.many": "{n} records handed in today.",
  "cheer.say.streak": "That's {streak} days in a row, all on time.",
  "cheer.say.streakMilestone.1": "{name}, that's {streak} days in a row with everything on time. Keep it going!",
  "cheer.say.streakMilestone.2": "A {streak}-day streak, {name}! Consistency like this is what quality is made of.",
  "cheer.say.streakMilestone.3": "{streak} days straight, {name} — the whole team can count on you.",

  // ---- The Dashboard's day card -------------------------------------------------
  "cheer.day.title": "Your day, {name}",
  "cheer.day.ring": "{done} of {total} done today",
  "cheer.day.left.one": "1 left",
  "cheer.day.left.many": "{n} left",
  "cheer.day.streak.none": "🔥 Start a streak today",
  "cheer.day.streak.one": "🔥 1 day on time",
  "cheer.day.streak.many": "🔥 {n} days on time in a row",
  "cheer.day.onTimeNone": "Nothing judged yet this month",
  "cheer.day.next": "Go to the next one",
  "cheer.day.nextUp": "Next up",
  "cheer.day.badges": "Today's badges",
  "cheer.day.loading": "Working out your day…",

  "cheer.progress.1": "{left} to go — finish them on time and today's file is complete.",
  "cheer.progress.2": "You're on your way — {left} more and the day is yours.",
  "cheer.progress.3": "{left} left. Each one you finish is one less worry for the team.",
  "cheer.progress.4": "Keep going — {left} more and it's a clean day.",
  "cheer.progress.5": "Every record counts — for the customer and for you. {left} to go.",
  "cheer.progress.6": "{left} waiting. Start with the most urgent and the rest will follow.",
  "cheer.progress.7": "{count} on time already — {left} more to make it a clean day.",
  "cheer.progress.8": "One at a time — the most urgent first, and the day falls into place.",

  "cheer.dayHappy.1": "🌟 All done for today — thank you!",
  "cheer.dayHappy.2": "🌟 Everything's in. Enjoy the calm.",
  "cheer.dayHappy.3": "🌟 A clean day — nothing left waiting.",
  "cheer.dayHappy.4": "🌟 That's today wrapped up, beautifully.",
  "cheer.dayHappy.5": "{ontime}🌟 All in, all on time — a day to be proud of.",

  "cheer.nothingDue.1": "Nothing of yours is due today — a good day to get ahead.",
  "cheer.nothingDue.2": "A quiet day on the file — nothing of yours is due.",
  "cheer.nothingDue.3": "Nothing due today. Start tomorrow's early and it will thank you.",

  "cheer.waiting.one": "1 is waiting from an earlier day — clearing it keeps the file whole.",
  "cheer.waiting.many": "{n} are waiting from earlier days — clearing them keeps the file whole.",

  "cheer.when.dueToday": "due today",
  "cheer.when.dueTomorrow": "due tomorrow",
  "cheer.when.dueOn": "due on {date}",
  "cheer.when.late.one": "1 day late",
  "cheer.when.late.many": "{n} days late",

  // ---- Today's score, counted from what is missing (8 of 10 done is −20) ------
  "cheer.score.label": "Today's score",
  "cheer.score.explain": "Today's score counts what is still missing: every task left takes points off, and finishing them all brings it to 0.",
  "cheer.score.line.one": "{done} of {total} done — finish {left} more to reach 0.",
  "cheer.score.line.many": "{done} of {total} done — finish {left} more to reach 0.",
  "cheer.score.line.perfect": "All done — nothing missing today.",
  "cheer.score.line.free": "Nothing due today — nothing missing.",
  "cheer.card.score": "Today's score: 0 — nothing missing",
  "cheer.say.score.minus.one": "You are at minus {n} today — finish {left} more to reach zero.",
  "cheer.say.score.minus.many": "You are at minus {n} today — finish {left} more to reach zero.",
  "cheer.say.score.zero": "You are at zero today — nothing missing. Well done!",
  "cheer.say.score.free": "Nothing is due for you today, so your score is zero — nothing missing.",
} as const;

const gu: Record<keyof typeof en, string> = {
  "cheer.toast.count": "🔥 આજે {count} સમયસર",
  "cheer.toast.countStreak": "🔥 આજે {count} સમયસર — સળંગ {streak} દિવસ",

  "cheer.onTime.1": "સરસ કામ.",
  "cheer.onTime.2": "બસ આમ જ — નિયમિત અને સમયસર.",
  "cheer.onTime.3": "ટીમ તમારા પર ભરોસો રાખી શકે છે.",
  "cheer.onTime.4": "વધુ એક રેકોર્ડ, જેના પર ઓડિટર ભરોસો કરશે.",
  "cheer.onTime.5": "ચોખ્ખું, પૂરું અને સમયસર — ગર્વ થાય એવું કામ.",
  "cheer.onTime.6": "દરેક સમયસર રેકોર્ડ એટલે ગ્રાહકને આપેલું વચન પાળ્યું.",
  "cheer.onTime.7": "તમારા કામથી આખા પ્લાન્ટની શાન વધે છે.",
  "cheer.onTime.8": "બરાબર સમયસર — ફાઇલ હવે વધુ મજબૂત છે.",
  "cheer.onTime.9": "આ લય ચાલુ રાખો!",
  "cheer.onTime.10": "આ એવી ગુણવત્તા છે જે કોઈને પણ ગર્વથી બતાવી શકાય.",
  "cheer.onTime.11": "ખૂબ સરસ, {name}.",
  "cheer.onTime.12": "સુરક્ષિત પેકની શરૂઆત આવા રેકોર્ડથી જ થાય છે.",

  "cheer.late.lead.one": "થઈ ગયું — આ વખતે એક દિવસ મોડું",
  "cheer.late.lead.many": "થઈ ગયું — આ વખતે {days} દિવસ મોડું",
  "cheer.late.nextToday": "; હવે પછીનું આજે જ છે — એ સમયસર થઈ શકે છે.",
  "cheer.late.nextTomorrow": "; હવે પછીનું કાલે છે — સમયસર થવાની નવી તક.",
  "cheer.late.nextOn": "; હવે પછીનું {date} ના રોજ છે — વહેલું કરવાનો પૂરતો સમય છે.",
  "cheer.late.after.1": ". ખૂટતું રહે એના કરતાં મોડું જમા થાય એ ઘણું સારું — ફાઇલ ફરી પૂરી થઈ.",
  "cheer.late.after.2": ". એ જમા થઈ ગયું, અને હવે એ જ મહત્ત્વનું છે.",
  "cheer.late.after.3": ". ખાલી જગ્યા પૂરી કરવા બદલ આભાર.",
  "cheer.late.after.4": ". પૂરી થયેલી દરેક ખાલી જગ્યા આગલું ઓડિટ સહેલું બનાવે છે.",

  "cheer.asRequired.1": "જ્યારે બન્યું ત્યારે જ નોંધ્યું — ઓડિટર આ જ જોવા માંગે છે.",
  "cheer.asRequired.2": "યાદ તાજી હોય ત્યારે જ નોંધ્યું — સારી ફાઇલ આમ જ રખાય છે.",
  "cheer.asRequired.3": "સમયસર નોંધ્યું — કંઈ યાદશક્તિ પર છોડ્યું નથી.",
  "cheer.asRequired.4": "જ્યારે જરૂર હતી ત્યારે જ નોંધાયું. સરસ.",

  "cheer.again.1": "સુધારીને પાછું જમા — કાળજીવાળો રેકોર્ડ આવો જ હોય.",
  "cheer.again.2": "સુધારીને ફરી જમા — પ્રમાણિકતાથી જ ફાઇલ પર ભરોસો બને છે.",
  "cheer.again.3": "બરાબર સુધાર્યું. કાળજી લેવા બદલ આભાર.",

  "cheer.verified.1": "તપાસીને સહી — વધુ એક રેકોર્ડ જેના પર સૌ ભરોસો કરી શકે.",
  "cheer.verified.2": "ચકાસાયું — આ રેકોર્ડ ઓડિટ માટે તૈયાર છે.",
  "cheer.verified.3": "બીજી નજરની તપાસથી જ રેકોર્ડની કિંમત વધે છે. આભાર.",
  "cheer.verified.4": "મંજૂર — ટીમનું કામ હવે કાયમ માટે નોંધાયું.",

  "cheer.sentBack.1": "અત્યારે પાછું મોકલવાથી પછી ઓડિટમાં વાંધો નહીં નીકળે.",
  "cheer.sentBack.2": "આજની કાળજીભરી તપાસ કાલે ગ્રાહકને સુરક્ષિત રાખે છે.",
  "cheer.sentBack.3": "ધોરણ જાળવવા બદલ આભાર — એ બરાબર થઈને પાછું આવશે.",

  "cheer.dayDone.1": "✨ થોડો આરામ કરો — તમે એના હકદાર છો.",
  "cheer.dayDone.2": "✨ આખા દિવસનું કામ પૂરું. ટીમ તમારો આભાર માને છે.",
  "cheer.dayDone.3": "✨ હવે કંઈ બાકી નથી — કેવું સરસ લાગે!",
  "cheer.dayDone.4": "✨ કાલ માટે એકદમ ચોખ્ખી શરૂઆત.",

  "cheer.card.title": "🌟 આજનું બધું પૂરું, {name}!",
  "cheer.card.count.one": "આજે 1 રેકોર્ડ જમા",
  "cheer.card.count.many": "આજે {n} રેકોર્ડ જમા",
  "cheer.card.streak.none": "🔥 કાલથી નવી સળંગ શરૂઆત",
  "cheer.card.streak.one": "🔥 1 દિવસ સમયસર — કાલે 2 થશે",
  "cheer.card.streak.many": "🔥 સળંગ {n} દિવસ",
  "cheer.onTimeMonth": "આ મહિને {pct}% સમયસર",
  "cheer.close": "ઉજવણી બંધ કરો",

  "cheer.allDone.1": "{name}, તમે આખો દિવસ પૂરો કર્યો — ભરોસાપાત્ર સાથી આવા જ હોય.",
  "cheer.allDone.2": "{ontime}દરેક રેકોર્ડ તેના દિવસે જ જમા. ઓડિટર પણ ખુશ થઈ જશે.",
  "cheer.allDone.3": "આવો દિવસ આખા પ્લાન્ટને ગર્વ અપાવે છે.",
  "cheer.allDone.4": "ગ્રાહક આ રેકોર્ડ ક્યારેય નહીં જુએ — પણ તેમના હાથમાં આવતું દરેક પેક આનાથી જ વધુ સારું બને છે.",
  "cheer.allDone.5": "બધું પૂરું. કાલની શરૂઆત કોઈ બાકી કામના ભાર વગર.",
  "cheer.allDone.6": "આજે ફાઇલ પૂરી, એટલે ઓડિટના દિવસે કોઈ દોડાદોડી નહીં.",
  "cheer.allDone.7": "તમારા સાથીઓ આ ફાઇલ પર ભરોસો રાખી શકે છે — કારણ કે તમે એને સાચવી.",
  "cheer.allDone.8": "{done} રેકોર્ડ, બધા પૂરા. ઉત્તમ કામ, {name}.",

  "cheer.pop.title.one": "આજે નવો બેજ",
  "cheer.pop.title.many": "આજે નવા બેજ",
  "cheer.badge.first": "આજનું પહેલું સમયસર",
  "cheer.badge.allDone": "આજનું બધું પૂરું",
  "cheer.badge.streak": "સળંગ {n} દિવસ",
  "cheer.badge.earlyBird": "વહેલી સવારનું કામ",
  "cheer.badge.cleanWeek": "ચોખ્ખું અઠવાડિયું",
  "cheer.badge.moduleHero": "મોડ્યુલનો હીરો",

  "cheer.streak.1": "સળંગ {streak} કામકાજના દિવસ, બધું સમયસર. હવે એ તમારી આદત બની ગઈ!",
  "cheer.streak.2": "સળંગ {streak} દિવસ — ગુણવત્તા નિયમિતતાથી જ બને છે.",
  "cheer.streak.3": "{streak} દિવસ સળંગ, એક પણ રેકોર્ડ મોડો નહીં. આ જોશ ચાલુ રાખો!",
  "cheer.streak.4": "સળંગ {streak} દિવસ સમયસર — ફાઇલ ક્યારેય આટલી સરસ નહોતી.",
  "cheer.streak.5": "દિવસે દિવસે સમયસર — આવા {streak} દિવસ. ટીમ આ જોઈ રહી છે.",

  "cheer.earlyBird.1": "11 વાગ્યા પહેલાં જમા — વહેલી શરૂઆત આખો દિવસ સુધારી દે છે.",
  "cheer.earlyBird.2": "સવાર પૂરી થાય એ પહેલાં જ પૂરું. વહેલું અને ઉત્તમ.",
  "cheer.earlyBird.3": "અગિયાર પહેલાં જમા — આને કહેવાય આગળ રહીને કામ કરવું.",

  "cheer.cleanWeek.1": "અત્યાર સુધી ચોખ્ખું અઠવાડિયું — દરેક રેકોર્ડ સમયસર.",
  "cheer.cleanWeek.2": "આ અઠવાડિયે એક પણ રેકોર્ડ મોડો નહીં. ઓડિટ માટે તૈયાર આવું જ હોય.",
  "cheer.cleanWeek.3": "આ અઠવાડિયાની ફાઇલ અત્યાર સુધી એકદમ સ્વચ્છ છે. ગર્વ થાય એવું કામ.",

  "cheer.moduleHero.1": "આ મહિને આખા મોડ્યુલના રેકોર્ડ સમયસર — આ તો તમારું જ છે.",
  "cheer.moduleHero.2": "આ મહિને એક મોડ્યુલનો દરેક રેકોર્ડ સમયસર. હીરો જેવું કામ.",
  "cheer.moduleHero.3": "આ મહિને આખા મોડ્યુલમાં એક પણ રેકોર્ડ મોડો નહીં — ગ્રાહક એટલો વધુ સુરક્ષિત.",

  "cheer.say.allDone.1": "ખૂબ સરસ કામ, {name}! આજનું બધું જ પૂરું થઈ ગયું.",
  "cheer.say.allDone.2": "{name}, આખો દિવસ પૂરો — દરેક રેકોર્ડ જમા.",
  "cheer.say.allDone.3": "શાબાશ, {name}! આજે તમારું કંઈ બાકી નથી.",
  "cheer.say.allDone.4": "વાહ, {name}! આજનું કામ પૂરું થયું.",
  "cheer.say.count.one": "આજે એક રેકોર્ડ જમા થયો.",
  "cheer.say.count.many": "આજે {n} રેકોર્ડ જમા થયા.",
  "cheer.say.streak": "સળંગ {streak} દિવસ, બધું સમયસર.",
  "cheer.say.streakMilestone.1": "{name}, સળંગ {streak} દિવસ, બધું સમયસર. આમ જ ચાલુ રાખો!",
  "cheer.say.streakMilestone.2": "{name}, સળંગ {streak} દિવસ! આવી નિયમિતતાથી જ ગુણવત્તા બને છે.",
  "cheer.say.streakMilestone.3": "{name}, સળંગ {streak} દિવસ — આખી ટીમ તમારા પર ભરોસો રાખી શકે છે.",

  "cheer.day.title": "{name}, તમારો દિવસ",
  "cheer.day.ring": "આજે {total} માંથી {done} પૂરાં",
  "cheer.day.left.one": "1 બાકી",
  "cheer.day.left.many": "{n} બાકી",
  "cheer.day.streak.none": "🔥 આજથી સળંગ શરૂ કરો",
  "cheer.day.streak.one": "🔥 1 દિવસ સમયસર",
  "cheer.day.streak.many": "🔥 સળંગ {n} દિવસ સમયસર",
  "cheer.day.onTimeNone": "આ મહિને હજુ કંઈ ગણાયું નથી",
  "cheer.day.next": "હવે પછીના પર જાઓ",
  "cheer.day.nextUp": "હવે પછી",
  "cheer.day.badges": "આજના બેજ",
  "cheer.day.loading": "તમારો દિવસ ગણાઈ રહ્યો છે…",

  "cheer.progress.1": "હજુ {left} બાકી — સમયસર પૂરાં કરો તો આજની ફાઇલ પૂરી.",
  "cheer.progress.2": "તમે સાચા રસ્તે છો — હજુ {left} અને દિવસ તમારો.",
  "cheer.progress.3": "{left} બાકી. તમે પૂરું કરો એ દરેક, ટીમની એક ચિંતા ઓછી કરે છે.",
  "cheer.progress.4": "ચાલુ રાખો — હજુ {left} અને ચોખ્ખો દિવસ.",
  "cheer.progress.5": "દરેક રેકોર્ડ મહત્ત્વનો છે — ગ્રાહક માટે અને તમારા માટે. હજુ {left} બાકી.",
  "cheer.progress.6": "{left} રાહ જુએ છે. સૌથી જરૂરીથી શરૂ કરો, બાકીનાં પાછળ આવશે.",
  "cheer.progress.7": "{count} તો સમયસર થઈ ગયા — ચોખ્ખા દિવસ માટે હજુ {left}.",
  "cheer.progress.8": "એક પછી એક — સૌથી જરૂરી પહેલાં, અને આખો દિવસ ગોઠવાઈ જશે.",

  "cheer.dayHappy.1": "🌟 આજનું બધું પૂરું — આભાર!",
  "cheer.dayHappy.2": "🌟 બધું જમા થઈ ગયું. હવે શાંતિથી.",
  "cheer.dayHappy.3": "🌟 ચોખ્ખો દિવસ — કંઈ બાકી નથી.",
  "cheer.dayHappy.4": "🌟 આજનો દિવસ સરસ રીતે પૂરો.",
  "cheer.dayHappy.5": "{ontime}🌟 બધું જમા, બધું સમયસર — ગર્વ થાય એવો દિવસ.",

  "cheer.nothingDue.1": "આજે તમારું કંઈ બાકી નથી — આગળનું કામ કરવા માટે સારો દિવસ.",
  "cheer.nothingDue.2": "ફાઇલ પર શાંત દિવસ — આજે તમારું કંઈ બાકી નથી.",
  "cheer.nothingDue.3": "આજે કંઈ બાકી નથી. કાલનું કામ વહેલું શરૂ કરશો તો સહેલું પડશે.",

  "cheer.waiting.one": "આગલા દિવસનું 1 બાકી છે — એ પૂરું કરશો તો ફાઇલ પૂરી રહેશે.",
  "cheer.waiting.many": "આગલા દિવસોનાં {n} બાકી છે — એ પૂરાં કરશો તો ફાઇલ પૂરી રહેશે.",

  "cheer.when.dueToday": "આજે કરવાનું",
  "cheer.when.dueTomorrow": "કાલે કરવાનું",
  "cheer.when.dueOn": "{date} સુધીમાં કરવાનું",
  "cheer.when.late.one": "1 દિવસ મોડું",
  "cheer.when.late.many": "{n} દિવસ મોડું",

  "cheer.score.label": "આજનો સ્કોર",
  "cheer.score.explain": "આજનો સ્કોર હજુ શું બાકી છે એ ગણે છે: બાકી રહેલું દરેક કામ પોઇન્ટ ઘટાડે છે, અને બધું પૂરું થાય એટલે સ્કોર 0 થાય.",
  "cheer.score.line.one": "{total} માંથી {done} પૂરાં — 0 સુધી પહોંચવા હજુ {left} પૂરું કરો.",
  "cheer.score.line.many": "{total} માંથી {done} પૂરાં — 0 સુધી પહોંચવા હજુ {left} પૂરાં કરો.",
  "cheer.score.line.perfect": "બધું પૂરું — આજે કંઈ ખૂટતું નથી.",
  "cheer.score.line.free": "આજે કંઈ કરવાનું નથી — કંઈ ખૂટતું નથી.",
  "cheer.card.score": "આજનો સ્કોર: 0 — કંઈ ખૂટતું નથી",
  "cheer.say.score.minus.one": "આજે તમે માઇનસ {n} પર છો — શૂન્ય સુધી પહોંચવા હજુ {left} પૂરું કરો.",
  "cheer.say.score.minus.many": "આજે તમે માઇનસ {n} પર છો — શૂન્ય સુધી પહોંચવા હજુ {left} પૂરાં કરો.",
  "cheer.say.score.zero": "આજે તમે શૂન્ય પર છો — કંઈ ખૂટતું નથી. શાબાશ!",
  "cheer.say.score.free": "આજે તમારું કંઈ કરવાનું નથી, એટલે તમારો સ્કોર શૂન્ય છે — કંઈ ખૂટતું નથી.",
};

export const MOTIVATION_STRINGS = { en, gu };
