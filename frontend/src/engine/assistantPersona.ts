import type { Chip } from "./guidedChecklist";
import { documentRepository } from "../data/repositories/documentRepository";
import { documentOpenRoute } from "./documentRoutes";
import { hrPageForDocument } from "../data/seed/hrModule";
import { MODULE_SECTIONS } from "../data/seed/documentDefinitions";
import { moduleSlug } from "../utils/moduleSlug";
import { todayISO } from "../utils/date";
import { t } from "../i18n";

// MITRA — WHO THE ASSISTANT IS (REQUIREMENTS §50).
//
// The assistant had no name and opened with "Hi <name>! Ask me to open
// anything". The department asked for someone who feels like a buddy: a name,
// a character, and an opening that asks where you want to go the way a
// colleague would. So — Mitra, "friend" in Gujarati: the plant's
// record-keeping buddy. Warm, brief, one thing at a time, and honest about
// being this system's assistant and not a person whenever anybody asks.
//
// The name lives here, once. Change ASSISTANT_NAME and it changes everywhere:
// the floating button, the panel, the full-page Assistant, the login briefing
// and the model's own prompt (backend/assistant.ts keeps a copy in step).
//
// WHERE WOULD YOU LIKE TO GO? Mitra opens with that question and a few
// tappable answers, and each answer asks the next question instead of
// presenting a menu of everything: today's work → the day; a document → which
// shelf → which one → the document's own page; a report → which report. The
// steps are plain data (below), so they are the same in the widget and on the
// full-page Assistant, they never need the network, and they stay inside the
// person's own departments because they are built from the scoped repository.

export const ASSISTANT_NAME = "Mitra";

/** Morning until noon, afternoon until five, evening after that. */
export function partOfDay(now = new Date()): "morning" | "afternoon" | "evening" {
  const h = now.getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

export const firstNameOf = (name: string | undefined): string => (name ?? "").trim().split(/\s+/)[0] ?? "";

/** "Good morning, Parth — Mitra here, your records buddy." */
export function hello(name: string | undefined, now = new Date()): string {
  const part = t(`ai.time.${partOfDay(now)}`);
  const first = firstNameOf(name);
  return first ? t("ai.helloName", { time: part, name: first, who: ASSISTANT_NAME, role: t("ai.role") }) : t("ai.hello", { time: part, who: ASSISTANT_NAME, role: t("ai.role") });
}

/** What Mitra says when asked whether it is a person — honestly, and briefly. */
export function whoIAm(): string {
  return t("ai.whoIAm", { who: ASSISTANT_NAME });
}

export interface GuideStep {
  text: string;
  chips: Chip[];
}

const MAX_CHIPS = 8;
const back = (step: string): Chip => ({ label: t("ai.guide.back"), action: { type: "guide", step } });

/** A short, chip-friendly name for a document — the HR formats have one already. */
function shortName(documentId: string, name: string): string {
  const hr = hrPageForDocument(documentId);
  if (hr) return t(hr.navKey);
  return name.length > 44 ? `${name.slice(0, 43)}…` : name;
}

/** A module's own sections, in the order the Document Library shelves them. */
function sectionsOf(docs: { section?: string }[]): string[] {
  const named = Array.from(new Set(docs.map((d) => d.section).filter((x): x is string => !!x)));
  return MODULE_SECTIONS.filter((s) => named.includes(s)).concat(named.filter((s) => !MODULE_SECTIONS.includes(s)));
}

function documentChips(docs: { id: string; name: string }[]): Chip[] {
  return docs.map((d) => ({ label: shortName(d.id, d.name), action: { type: "navigate", route: documentOpenRoute(d as never) } }));
}

function modulesInScope(): string[] {
  const seen: string[] = [];
  for (const d of documentRepository.getAll()) if (!seen.includes(d.module)) seen.push(d.module);
  return seen;
}

/**
 * One step of "where would you like to go?" — its question and its answers.
 * Steps: "home", "documents", "module:{slug}", "reports", "find", "about".
 */
export function guide(step: string): GuideStep {
  if (step === "documents") {
    const modules = modulesInScope();
    const chips: Chip[] = modules.map((m) => ({ label: t(`module.${m}`), action: { type: "guide", step: `module:${moduleSlug(m)}` } }));
    chips.push({ label: t("ai.guide.wholeLibrary"), action: { type: "navigate", route: "/library" } });
    chips.push(back("home"));
    return { text: t("ai.guide.whichShelf"), chips };
  }

  if (step.startsWith("module:")) {
    const slug = step.slice("module:".length);
    const docs = documentRepository.getAll().filter((d) => moduleSlug(d.module) === slug);
    if (docs.length === 0) return guide("documents");
    const moduleName = t(`module.${docs[0].module}`);
    const sections = sectionsOf(docs);
    // A shelf as full as Human Resources (twenty-six documents) is asked about
    // by its own groups first; a small module goes straight to its documents.
    if (docs.length > MAX_CHIPS && sections.length > 1) {
      const chips: Chip[] = sections.map((section, i) => ({ label: section, action: { type: "guide", step: `section:${slug}:${i}` } }));
      // Human Resources' employee sheet, which its formats fetch people from (REQUIREMENTS §53).
      if (slug === "human-resources") chips.push({ label: t("nav.hrMasterData"), action: { type: "navigate", route: "/hr/master-data" } });
      chips.push({ label: t("ai.guide.seeAll"), action: { type: "navigate", route: `/library/${slug}` } });
      chips.push(back("documents"));
      return { text: t("ai.guide.whichPart", { module: moduleName }), chips };
    }
    const chips = documentChips(docs.slice(0, MAX_CHIPS));
    if (docs.length > MAX_CHIPS) chips.push({ label: t("ai.guide.seeAll"), action: { type: "navigate", route: `/library/${slug}` } });
    chips.push(back("documents"));
    return { text: t("ai.guide.whichDocument", { module: moduleName }), chips };
  }

  if (step.startsWith("section:")) {
    const [, slug, index] = step.split(":");
    const inModule = documentRepository.getAll().filter((d) => moduleSlug(d.module) === slug);
    const section = sectionsOf(inModule)[Number(index)];
    const docs = inModule.filter((d) => d.section === section);
    if (docs.length === 0) return guide(`module:${slug}`);
    const chips = documentChips(docs.slice(0, MAX_CHIPS));
    if (docs.length > MAX_CHIPS) chips.push({ label: t("ai.guide.seeAll"), action: { type: "navigate", route: `/library/${slug}` } });
    chips.push(back(`module:${slug}`));
    return { text: t("ai.guide.whichDocument", { module: section }), chips };
  }

  if (step === "reports") {
    const tabs = ["monthly", "daily", "rodent", "flycatcher", "training", "lamination"];
    const now = new Date();
    const chips: Chip[] = tabs.map((tab) => ({
      label: t(`rep.tab.${tab}`),
      action: { type: "navigate", route: `/reports/${now.getFullYear()}/${now.getMonth()}/${tab}` },
    }));
    chips.push(back("home"));
    return { text: t("ai.guide.whichReport"), chips };
  }

  if (step === "find") {
    return {
      text: t("ai.guide.findPrompt"),
      chips: [
        { label: t("ai.guide.searchScreen"), action: { type: "navigate", route: "/search" } },
        { label: t("ai.guide.filesScreen"), action: { type: "navigate", route: "/files" } },
        back("home"),
      ],
    };
  }

  if (step === "about") {
    return {
      text: t("ai.guide.about", { who: ASSISTANT_NAME }),
      chips: [{ label: t("ai.guide.whereTo"), action: { type: "guide", step: "home" } }],
    };
  }

  // "home" — the question Mitra opens with.
  return {
    text: t("ai.whereTo"),
    chips: [
      { label: t("ai.guide.todaysWork"), action: { type: "navigate", route: `/day/${todayISO()}` }, tone: "primary" },
      { label: t("ai.guide.openDocument"), action: { type: "guide", step: "documents" } },
      { label: t("ai.guide.seeReport"), action: { type: "guide", step: "reports" } },
      { label: t("ai.guide.findRecord"), action: { type: "guide", step: "find" } },
      { label: t("ai.guide.briefing"), action: { type: "briefing" } },
      { label: t("ai.guide.whatCanYouDo"), action: { type: "guide", step: "about" } },
    ],
  };
}

/** Mitra's opening: who it is, and where would you like to go. */
export function openingMessage(name: string | undefined, aboutTheRecord = "", now = new Date()): GuideStep {
  const home = guide("home");
  return { text: `${hello(name, now)}${aboutTheRecord}\n${home.text}`, chips: home.chips };
}
