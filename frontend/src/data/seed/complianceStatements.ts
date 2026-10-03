// Statements of Compliance (Declarations of Compliance) — transcribed
// verbatim from the two Word documents in the uploaded zip. These are
// reference documents with a validity period ("valid for two years from the
// date of Publication"), so the app tracks when each one is due for
// re-issue instead of treating them as fillable records. The company's name
// is the one exception to verbatim: it is written as the owner gave it on
// 02-Oct-2026 (COMPANY.name), not as each Word document spelt it.
import { COMPANY } from "./masterData";

export interface ComplianceSection {
  label: string;
  lines: string[];
}

export interface ComplianceStatement {
  documentId: string;
  headerTitle: string; // running header on the Word document
  footerRef: string; // Format/Rev footer, verbatim
  referenceSource?: string;
  sections: ComplianceSection[];
  declarations: string[];
  signedBy: string;
  signedTitle: string;
  signedOn: string; // ISO date
  validityYears: number;
}

export const COMPLIANCE_STATEMENTS: Record<string, ComplianceStatement> = {
  "soc-labels": {
    documentId: "soc-labels",
    headerTitle: "STATEMENT OF COMPLIANCE – PRESSURE LABELS",
    footerRef: "F/QC- 09 (Rev – 00 / 01.12.2021)",
    sections: [
      { label: "Manufacturer", lines: [COMPANY.name] },
      { label: "Address", lines: ["308,309, G.I.D.C. Estate, At Dediyasan, Mehsana – 384002, Gujarat, India"] },
      { label: "Product", lines: ["Pressure Labels"] },
      {
        label: "Raw materials used",
        lines: ["Adhesive Label – Paper, Silver metalized paper, Filmic Paper, BOPP Film", "Ink – UV / Water based", "Lamination adhesive", "UV Varnish", "Cold Foil", "Coil Foil adhesive"],
      },
      { label: "Manufacturing process", lines: ["Printing (Flexo), Lamination, Foiling, Coating, Punching, Slitting"] },
      { label: "Subcontracted / Outsource manufacturing", lines: ["Nil"] },
      { label: "Function or known uses", lines: ["FMCG, Pharma, Food industries, Cosmetic"] },
      {
        label: "Specification for use",
        lines: [
          "Used as secondary packaging for packers of FMCG, Pharma, Food industries & Cosmetic products for product aesthetic, identification & labelling",
          "Usable for packers of products ranging from – 40 Deg C to 130 Deg C.",
          "Finish products shall not be used for further use by the customer, if found with any of the below mentioned conditions.",
          "• Chemical contamination in the product as well as product packaging such as traces of any chemicals, oil or objectionable materials",
          "• Physical contamination in the products such as any non-product foreign matter found in the products",
          "• Product packaging are damaged",
          "• Products are damaged during transportation",
        ],
      },
      { label: "Usable life", lines: ["18 months from the date of manufacturing"] },
      { label: "Storage condition", lines: ["Store in dry place. Protect from moist environment"] },
      { label: "Regulatory requirements", lines: ["Nil"] },
      { label: "Country of Sale", lines: ["India, USA"] },
      { label: "Post-consumer recycling", lines: ["No PCWR waste used"] },
    ],
    declarations: [
      `${COMPANY.name}, hereby declares that all raw materials used in the manufacturing of Printed Pressure Labels do not have a concentration of lead, cadmium, Hexavalent chromium and mercury that exceeds 100 PPM, and conform to Council Directive 94/62/EC with amendments 2005/20/EC and 2004/12/EC`,
      "Substances such as 4-methylbenzophenone, benzophenone, hydroxybenzophenone and bisphenol A are not added or used in the manufacturing of Printed Pressure Labels and are therefore not expected to be present in our products",
      "Inks used are suitable for Indirect Food Contact where there is a barrier between the ink and the product. They confirm to the requirement of Heavy Metal Content of CONEG and EN 71 part 3. The inks do not contain any material that is in the negative list of CEPE. The inks do not contain any animal fat",
      "Printed Pressure Labels have to be kept in its original packaging in a cool or ambient temperate and dry place as per product application by packers / customer.",
      "This Declaration is valid for two years from the date of Publication, unless there is a change to the materials used, processing technologies or applicable legislation.",
      "Whilst this Declaration is made using all due diligence, it is the responsibility of the downstream users of these articles to ensure compliance with all relevant legislation in their own applications and technologies",
      `This Declaration of Compliance is applicable to current and future supplies of Products manufactured by ${COMPANY.name} and are updated only when there are (1) Legislative changes (2) Creation of new scientific data that affects the use of the material & (3) Modified composition of the material or the article that has significance for the application`,
    ],
    signedBy: "Shail Patel",
    signedTitle: "CEO",
    signedOn: "2025-04-01",
    validityYears: 2,
  },

  "soc-flexible-packaging": {
    documentId: "soc-flexible-packaging",
    headerTitle: "STATEMENT OF COMPLIANCE – FLEXIBLE PACKAGING (ROLLS & POUCHES)",
    footerRef: "F/QC- 38 (Rev – 00 / 24.02.2025)",
    referenceSource: "BRC Global Standard for Packaging and Packaging Materials",
    sections: [
      { label: "Manufacturer", lines: [COMPANY.name] },
      { label: "Address", lines: ["308,309, G.I.D.C. Estate, At Dediyasan, Mehsana – 384002, Gujarat, India"] },
      {
        label: "Product",
        lines: [
          "Flexo Printed & Unlaminated Flexible Packaging materials in roll form & pouch form",
          "Flexo Printed & Solvent base laminated Flexible Packaging materials in roll form & pouch form",
        ],
      },
      {
        label: "Raw materials used",
        lines: ["Films – BOPP, METALIZED FILMS, PEARLISED BOPP, MATT FINISH FILMS, POLYSTER FILMS", "Aluminium Foils", "Ink", "Solvents – Ethyl acetate", "Adhesive & Hardener"],
      },
      { label: "Manufacturing process", lines: ["Printing (Flexo), Lamination - solvent based), Slitting & Pouching"] },
      { label: "Subcontracted / Outsource manufacturing", lines: ["Nil"] },
      {
        label: "Function or known uses",
        lines: ["Flexible packaging materials in roll forms as well as Pouch forms are being used by as primary packing / product contact materials for FMCG, Pharma, Food industries, Cosmetic, Chemicals etc."],
      },
      {
        label: "Specification for use",
        lines: [
          "Flexible packaging laminates can be used up to maximum 12 months from date of manufacturing if storage condition doesn’t exceed 50 degrees centigrade.",
          "Suitability of storage condition for packed products to be determined by packers.",
          "Finish products (Rolls & Pouches) shall not be used for further processing or packaging of the products by the customer, if found with any of the below mentioned conditions.",
          "• Chemical contamination in the product as well as product packaging such as traces of any chemicals, oil or objectionable materials",
          "• Physical contamination in the products such as any non-product foreign matter found in the products",
          "• Product packaging are damaged",
          "• Products are damaged during transportation",
          "• Discard top layer & bottom layer of the films roll for approx. 5 meters, depending upon the visual quality of the rolls",
        ],
      },
      {
        label: "Migration details",
        lines: [
          "Commission Regulation (EC) No. 10/2011 of 14 January 2011 with amendments (EC) No. 2023/1442 dated 11th July 2023, on plastic materials and articles intended to come into contact with food.",
          "Complied with Overall migration to all simulants & Specific migration to all heavy metals as specified in FSSAI regulation 2020 (earlier 2018) amended till date",
        ],
      },
      {
        label: "Post-consumer recycling instructions/specification",
        lines: ["No PCWR waste used for the manufacturing of packaging materials in the process. Packaging materials can be recycled subject to layer & substrate combination"],
      },
      {
        label: "Applicable regulations",
        lines: [
          "Regulation (EC) No. 1935/2004 of 27 October 2004 on materials and articles intended to come into contact with food.",
          "Commission Regulation (EC) No. 10/2011 of 14 January 2011 with amendments (EC) No. 2023/1442 dated 11th July 2023, on plastic materials and articles intended to come into contact with food",
          "Commission Directive 2002/72/EC of 6 August 2002 with amendments (EC) No. 975/2009, 2008/39/EC, 2007/19/EC, 2005/79/EC, 2004/19/EC and 2004/1/EC relating to plastic materials and articles intended to come into contact with foodstuffs",
          "Commission Regulation (EC) No. 282/2008 of 27 March 2008 on recycled plastic materials and articles intended to come into contact with foods",
          "Commission Regulation (EC) No. 2023/2006 of 22 December 2006 on good manufacturing practice for materials and articles intended to come into contact with food",
          "Council Directive 94/62/EC of 20 December 1994 with amendments 2005/20/EC and 2004/12/EC on packaging and packaging waste",
          "Compliance of packaging materials to the requirements of EU Directives no. 2018/851 and 2018/852 and in particular to the obligations of identification and classification of packaging according to the provisions of Decision 97/129 / EC",
          "FSSAI regulation for packaging materials 2018 & amended as 2020",
        ],
      },
      {
        label: "Intended Food Contact packaging",
        lines: [
          "Type of Food (e.g., infant product, culinary product and confectionery), foreseen shelf life and storage conditions.",
          "Description of the suitability for food contact i.e., suitable for all types of food or only one /several of the following categories: Dry Food; Dry and non‐fatty food; Wet & aqueous food; Fatty food; Specific Food (e.g., acid, alcoholic); Food to be reheated in packaging (time and max. temperature in °C)",
        ],
      },
      {
        label: "REACH",
        lines: [
          "Under the REACH regulation 1907/2006/EC, all the products of OSWAL [FIBC Bags] are manufactured items and so exempt from REACH registration",
          "GPPPL have taken all the necessary steps to ensure that the chemical components from which GPPPL products are obtained fulfil the obligation of the REACH registration, with specific requests of declarations from GPPPL’s Raw material suppliers",
          "Raw material suppliers to GPPPL are: Producers of Films / Foils; Producers of Additives; Producers of Glue / Adhesives; Producers of Ink; Producers of Solvents",
          "Nevertheless, the obligation of registration of the individual chemical substances used by the raw material suppliers to GPPPL goes down in the supply chain to the obliged parties that supply the raw materials",
        ],
      },
    ],
    declarations: [
      "We declare that all raw materials used in the manufacturing of products with BOPP, METALIZED BOPP, PEARLISED BOPP, MATT BOPP, PET, METPET, CPP, ALUMINIUM FOIL do not have a concentration of lead, cadmium, Hexavalent chromium and mercury that exceeds 100 PPM, and conform to Council Directive 94/62/EC with amendments 2005/20/EC and 2004/12/EC",
      "Substances such as 4-methylbenzophenone, benzophenone, hydroxybenzophenone and bisphenol A are not added or used in the manufacturing of products with BOPP, METALIZED BOPP, PEARLISED BOPP, MATT BOPP, PET, METPET, CPP, ALUMINIUM FOIL and are therefore not expected to be present in our products",
      "Inks used are suitable for Indirect Food Contact where there is a barrier between the ink and the product. They confirm to the requirement of Heavy Metal Content of CONEG and EN 71 part 3. The inks do not contain any material that is in the negative list of CEPE. The inks do not contain any animal fat",
      "Adhesive & Hardeners used in Lamination processes are suitable for Indirect Food contact",
      "BOPP, METALIZED BOPP, PEARLISED BOPP, MATT BOPP, PET, METPET, CPP films are Food Grade material. It meets various stipulations laid down by directive 2008/39/EC & 2007/19/EC. It also confirms to FDA title 21CFR section 177.1640",
      "Products manufactured from BOPP, METALIZED BOPP, PEARLISED BOPP, MATT BOPP, PET, METPET, CPP, ALUMINIUM FOIL must be kept in its original packaging in a cool or ambient temperate and dry place. Avoid direct exposure to sunlight and UV light. Shelf life is 1 year from the date of manufacturing provided the material is stored under the described conditions. GPPPL is not aware of the limits of shelf life",
      "We hereby declare that; the flexible packaging materials being supplied doesn’t contain any hazard having no preventive control",
      "This Declaration is valid for two years from the date of Publication, unless there is a change to the materials used, processing technologies or applicable legislation.",
      "Whilst this Declaration is made using all due diligence, it is the responsibility of the downstream users of these articles to ensure compliance with all relevant legislation in their own applications and technologies",
      "This Declaration of Compliance is applicable to current and future supplies of Products manufactured from BOPP, METALIZED BOPP, PEARLISED BOPP, MATT BOPP, PET, METPET, CPP, ALUMINIUM FOIL and are updated only by (1) Legislative changes (2) Creation of new scientific data that affects the use of the material & (3) Modified composition of the material or the article that has significance for the application",
    ],
    signedBy: "Shail Patel",
    signedTitle: "CEO",
    signedOn: "2025-02-24",
    validityYears: 2,
  },
};

/** A date of publication the statement can be dated by: an ISO date (yyyy-mm-dd). */
export function isPublicationDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

/**
 * When the statement is due for re-issue — "" when it holds no readable date of
 * publication (a correction that emptied it, saved before that was refused):
 * formatDisplayDate("") then says TO BE CONFIRMED instead of the page failing.
 */
export function complianceValidUntil(s: ComplianceStatement): string {
  if (!isPublicationDate(s.signedOn)) return "";
  const [y, m, d] = s.signedOn.split("-").map(Number);
  const years = Number.isFinite(s.validityYears) ? s.validityYears : 2;
  return `${y + years}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * A correction as it may be saved: the statement is never left without a date
 * of publication. One the correction empties or garbles (an uploaded file, a
 * proposed change) keeps the date the statement has — or, if that is unreadable
 * too, the date it was issued with.
 */
export function keepPublicationDate(next: ComplianceStatement, current: ComplianceStatement | undefined): ComplianceStatement {
  if (isPublicationDate(next.signedOn)) return next;
  const kept = [current?.signedOn, COMPLIANCE_STATEMENTS[current?.documentId ?? next.documentId]?.signedOn].find(isPublicationDate);
  return kept ? { ...next, signedOn: kept } : next;
}
