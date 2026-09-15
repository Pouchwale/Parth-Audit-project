import type { DocumentDefinition } from "../types";
import { hrPageForDocument } from "../data/seed/hrModule";

// WHERE "OPEN DOCUMENT" GOES (REQUIREMENTS §47).
//
// Every document opens on a page of its own. The pest control file, CAPA, the
// training record and the reference documents always had one; the log sheets
// did not, and "Open Document" sent them to the Record Calendar — a month of
// every department's due dates, with the document nowhere on it. Now an HR
// format opens its HR page (/hr/{slug}) and every other log sheet its document
// page (/document/{id}): its records on file, the latest shown in full, and New.
export function documentOpenRoute(doc: Pick<DocumentDefinition, "id" | "kind">): string {
  switch (doc.kind) {
    case "chemical-master":
      return "/chemical-master";
    case "licence":
      return "/licence";
    case "compliance-statement":
      return `/soc/${doc.id}`;
    case "gap-inspection":
      return "/gap";
    case "complaint-checklist":
      return "/gap/external";
    case "complaint-ack":
      return "/gap/internal";
    case "pest-responsibilities":
      return "/pest-control";
    case "service-agreement":
      return "/licence";
    case "training-record":
      return "/training";
    // Pest Control documents have their own pages (src/pages/PestControlPages.tsx).
    case "daily-pest-monitoring":
      return "/pest/daily";
    case "fly-catcher":
      return "/pest/trend/fly-catcher";
    case "service-report":
      return `/pest/service/${doc.id.replace(/^service-report-/, "")}`;
    default: {
      const hr = hrPageForDocument(doc.id);
      return hr ? `/hr/${hr.slug}` : `/document/${doc.id}`;
    }
  }
}
