// THE PERSON'S DAY ON THE TASKS SCREEN. Plain functions with no imports, so the server's tests can check them
// (server/test/phone-tasks.test.ts).
//
// DCRS works out the day (its /api/v1/today, relayed by the Mitra server as /tasks): what is ready, what needs input,
// what is overdue, waiting for verification or coming up, for what the person answers for and may verify (for the
// super admin, every module). These only put DCRS's lists into the screen's sections and count them by module.
import type { TaskItem, Tasks } from '@shared/api';

export type SectionKey = 'ready' | 'input' | 'overdue' | 'verify' | 'upcoming';

export interface TaskSection {
  key: SectionKey;
  title: string;
  hint: string;
  items: TaskItem[];
}

const SECTIONS: readonly { key: SectionKey; title: string; hint: string }[] = [
  { key: 'ready', title: 'Ready for your OK', hint: 'Prepared and passing its checks: review it, then submit.' },
  { key: 'input', title: 'Needs your input', hint: 'Enter what you saw, then submit.' },
  { key: 'overdue', title: 'Overdue', hint: 'Past its day: do these first.' },
  { key: 'verify', title: 'Waiting for verification', hint: 'Submitted by someone else: check it, then verify or send it back.' },
  { key: 'upcoming', title: 'Coming up', hint: 'Due in the next few days.' },
];

/** A record's line, the same whichever of DCRS's lists it is in: its id, or its document and day before it is started. */
export function taskKey(item: Pick<TaskItem, 'recordId' | 'documentId' | 'dueDate'>): string {
  return item.recordId ?? `${item.documentId}|${item.dueDate}`;
}

/** The module a line belongs to: DCRS's, else the department in its format number (F/QC/30 is QC), else "Other". */
export function moduleOf(item: Pick<TaskItem, 'module' | 'formatNo'>): string {
  if (typeof item.module === 'string' && item.module.trim()) return item.module.trim();
  const code = /^F\s*[:/-]?\s*([A-Z]{2,5})\b/i.exec(item.formatNo ?? '')?.[1];
  return code ? code.toUpperCase() : 'Other';
}

/**
 * The sections, in the screen's order, each with DCRS's lines (of one module, when one is chosen). "Needs your input"
 * also holds what is due today and not in another section, so nothing due is left out. Empty sections are left out.
 */
export function taskSections(tasks: Tasks, module?: string | null): TaskSection[] {
  const keep = (items: readonly TaskItem[] | undefined) => (items ?? []).filter((item) => !module || moduleOf(item) === module);
  const lists: Record<SectionKey, TaskItem[]> = {
    ready: keep(tasks.readyToSubmit),
    input: keep(tasks.needsInput),
    overdue: keep(tasks.overdue),
    verify: keep(tasks.awaitingVerification),
    upcoming: keep(tasks.upcoming),
  };
  const shown = new Set([...lists.ready, ...lists.input, ...lists.overdue, ...lists.verify].map(taskKey));
  for (const item of keep(tasks.due)) {
    if (shown.has(taskKey(item))) continue;
    shown.add(taskKey(item));
    lists.input.push(item);
  }
  return SECTIONS.map((section) => ({ ...section, items: lists[section.key] })).filter((section) => section.items.length > 0);
}

/** The modules that have anything today, A to Z: the super admin's filter. */
export function modulesOf(tasks: Tasks): string[] {
  const all = [tasks.readyToSubmit, tasks.needsInput, tasks.overdue, tasks.awaitingVerification, tasks.upcoming, tasks.due];
  return [...new Set(all.flatMap((items) => (items ?? []).map(moduleOf)))].sort((a, b) => a.localeCompare(b));
}

export interface ModuleSummary {
  module: string;
  ready: number;
  input: number;
  overdue: number;
  verify: number;
  upcoming: number;
}

/** Each module's counts by section: the super admin's view of the whole plant today. */
export function moduleSummary(tasks: Tasks): ModuleSummary[] {
  return modulesOf(tasks).map((module) => {
    const counts: ModuleSummary = { module, ready: 0, input: 0, overdue: 0, verify: 0, upcoming: 0 };
    for (const section of taskSections(tasks, module)) counts[section.key] = section.items.length;
    return counts;
  });
}

/** How many lines ask something of the person today (everything but what is coming up). */
export function openCount(tasks: Tasks): number {
  return taskSections(tasks)
    .filter((section) => section.key !== 'upcoming')
    .reduce((sum, section) => sum + section.items.length, 0);
}

/** The document as people know it: "F/HR/17 Daily Pest Control Monitoring Record", or its name while its number is to come. */
export function taskTitle(item: Pick<TaskItem, 'formatNo' | 'document' | 'documentId'>): string {
  const number = (item.formatNo ?? '').trim();
  const name = (item.document ?? '').trim() || item.documentId;
  return number && !/^to be /i.test(number) ? `${number} ${name}` : name;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A day as people say it: "8 Oct 2026". */
export function dateWords(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
}

/** A line's second line: its day, its status, and what DCRS says still stops it. */
export function taskLine(item: TaskItem, today: string): string {
  const day = item.dueDate === today ? 'Today' : dateWords(item.dueDate);
  const status = item.status ?? (item.started ? null : 'Not started');
  const waiting = typeof item.count === 'number' && item.count > 0 ? `${item.count} ${item.count === 1 ? 'reading' : 'readings'} to enter` : null;
  return [day, status, waiting].filter(Boolean).join(' · ');
}
