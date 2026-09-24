import { MNT04_TEXT_EN } from "../data/seed/maintenanceLayouts";

// THE THREE GUJARATI FORMATS, IN ENGLISH (REQUIREMENTS §58).
//
// The department issues three of its Quality Control formats in Gujarati:
//
//   F/QC/13   In-Process Quality Control Record (Printing) — its procedure,
//             its grading criteria, its boxes, its six parameters with the
//             test chart beside each, and its grade chart
//   —         લાઈન કિલયરન્સ, the line clearance checklist of the previous
//             job's materials (no format number printed)
//   —         ક્વોલીટી શહી, the line clearance checklist of the new job's
//             parameters (no format number printed)
//
// With English chosen, Google Translate is not loaded at all (i18n/
// googleTranslate.ts), so those three would sit in Gujarati on an English
// screen. This is their English: every printed line of theirs, written down
// once — the plant's own English, keeping each number, percentage, code and
// obligation exactly as the paper has it, down to a parameter the paper
// spells "રેડ્યૂસ કોર્નર" (Reduce corner).
//
// It is a plain lookup from the printed line to its English, used only to
// DISPLAY a form (i18n/documentText.ts). Nothing here reaches a record: the
// field keys a record is stored under are the same in either language, and
// what was typed into it is never rewritten.
//
// A line changed in one of those layouts has to be added here as well, or it
// simply stays in Gujarati when English is chosen — tests/e2e_qc_formats.py
// reads both forms end to end in English and would say so.

export const DOCUMENT_TEXT_EN: Record<string, string> = {
  // ── The names the three forms are filed under, and the paper each was read
  // from: a Gujarati form carries its Gujarati title, and with English chosen
  // the title reads in English like the rest of it.
  "In Process Quality Control (Printing) — ઇન પ્રોસેસ ક્વોલિટી કંટ્રોલ": "In Process Quality Control (Printing)",
  "Line Clearance — Materials (લાઈન કિલયરન્સ)": "Line Clearance — Materials",
  "Line Clearance — Quality (ક્વોલીટી શહી)": "Line Clearance — Quality",
  "Photographed Gujarati લાઈન કિલયરન્સ form (supplied 18-Sep-2026)": "Photographed Gujarati Line Clearance form (supplied 18-Sep-2026)",
  "Photographed Gujarati ક્વોલીટી શહી form (supplied 18-Sep-2026)": "Photographed Gujarati Quality Sign form (supplied 18-Sep-2026)",

  // ── F/QC/13 — the three lines printed above the grid
  "પ્રોસીઝર:- ઉત્પાદનની પ્રક્રિયા દરમિયાન Q.A. વ્યક્તિ ખાતરી કરશે કે 3 પૂર્ણ સીટ્સના જોબના દર ૬૦૦૦ મીટરે નમુના લેવામાં આવે. તે નમુનાઓને નીચે જણાવેલા પોઈન્ટ પ્રમાણે ચકાસીને ગ્રેડ આપશે. જો કોઈ સમસ્યાઓની જાણ થાય તો તરત જ Q.A. મેનેજર અને સુપરવાઈઝર ને જાણ કરશે. જો મટીરીયલ્સ સ્વીકાર્ય છે, તો Q.A. મેનેજર તેમજ સુપરવાઈઝરની સહી કરાવવી આવશ્યક છે.": "Procedure:- During the production process the Q.A. person shall ensure that samples of 3 full sheets of the job are taken every 6000 meters. He shall check those samples against the points listed below and grade them. If any problems come to notice, he shall inform the Q.A. manager and the supervisor immediately. If the materials are acceptable, the signature of the Q.A. manager as well as the supervisor is required.",
  "ગ્રેડિંગ માપદંડ: બધા ગ્રેડ નીચે મુજબના માપદંડ મુજબ આપવા જોઈએ. જો કોઈ માપદંડમાં એફ ગ્રેડ આપવામાં આવે તો ઉત્પાદન બંધ કરવું આવશ્યક છે. જો ૧ થી વધુ સી ગ્રેડ મળી આવે, તો છાપવાનું બંધ કરવું જોઈએ અને ક્યુ.એ. મેનેજર કેવી રીતે આગળ વધવું તેના વિશે નિર્ણય કરશે. જો ૩ થી વધુ બી ગ્રેડ મળ્યા હોય, તો છાપવાનું બંધ કરવું જોઈએ અને ક્યુ.એ. મેનેજર કેવી રીતે આગળ વધવું તેના વિશે નિર્ણય કરશે.": "Grading criteria: All grades must be given as per the criteria below. If an F grade is given on any criterion, production must be stopped. If more than 1 C grade is found, printing must be stopped and the Q.A. manager will decide how to proceed. If more than 3 B grades are found, printing must be stopped and the Q.A. manager will decide how to proceed.",
  "ખામી યુક્ત અપ્સ (બધીજ એકત્રિત સીટમાં) મુજબ ગ્રેડ: <11% of total ups = A · <21% = B · <25% = C · >25% = F. જો એરર્સ બેથી ઓછા અપ્સ માં માત્ર હોય તો એ ગ્રેડ આપવો.": "Grade by defective ups (in all the sheets collected together): <11% of total ups = A · <21% = B · <25% = C · >25% = F. If the errors are only in fewer than two ups, grade A is to be given.",

  // ── F/QC/13 — the header box
  "આઇટમ કોડ (Item Code)": "Item Code",
  "પ્રો. નંબર (PO Number)": "PO Number",
  "મશીન (Machine)": "Machine",
  "ઓપરેટર (Operator)": "Operator",
  "QA પર્સન (QA Person)": "QA Person",
  "સેમ્પલ કોન્ટીટી (સીટ) (Sample Qty, sheets)": "Sample Qty, sheets",
  "ટોટલ નંબર ઓફ અપ્સ (Total Ups)": "Total Ups",
  "ઓર્ડર લેન્થ ઈન મીટર (Order Length, m)": "Order Length, m",

  // ── F/QC/13 — the grid's columns
  "પેરામીટર (Parameter)": "Parameter",
  "ટેસ્ટ ચાર્ટ (Test chart)": "Test chart",
  "ગ્રેડ (Grade)": "Grade",
  "પાસ? (Pass?)": "Pass?",
  "ખામી ગણતરી (Defect count)": "Defect count",

  // ── F/QC/13 — the six printed parameters and the test chart beside each
  "રજિસ્ટ્રેશન (Registration)": "Registration",
  "બધા જ ચાર ખૂણાઓનું રજીસ્ટ્રેશન અને બબલ્સનું કેન્દ્ર નિયંત્રણમાં હોવું જોઈએ; બધાજ ઓવરલેપીંગ અને નિયંત્રણની નોંધણી ચશ્માંનો ઉપયોગ કરીને તપાસો.": "Registration at all four corners and the centre of the bubbles must be under control; check all overlapping and registration control using a magnifying glass.",
  "શેડ (Shade)": "Shade",
  "સીટના શેડને તપાસવા માટે શેડ કાર્ડ, પેન્ટોન કોડ અથવા છેલ્લા સ્વીકૃત સીટનો ઉપયોગ કરવો; ક્લાયન્ટની મેચીંગ સ્ટડી મુજબ જ શેડ મેચ થવો જોઈએ.": "Use the shade card, the Pantone code or the last approved sheet to check the shade of the sheet; the shade must match exactly as per the client's matching study.",
  "કોટીંગ (Coating)": "Coating",
  "કોટીંગ સમાન રૂપે લાગુ થઈ રહ્યું છે અને લેમીનેશનમાં કોઈ બબલ્સની રચના નથી તેની ખાતરી કરો; વાર્નિશ ન હોય તેવા વિસ્તારો, અસમાન વાર્નિશ અને વિન્ડોઝના વિસ્તારમાં પણ વાર્નિશ તપાસો.": "Make sure the coating is being applied evenly and that no bubbles are forming in the lamination; also check for areas with no varnish, uneven varnish and varnish in the window areas.",
  "પંચીંગ (Punching)": "Punching",
  "દરેક સીટમાં થોડું હાથથી પ્રેસર આપીને રીલીઝ લાઈનર તૂટતું નથી તે તપાસો; છીછરું પંચીંગ તપાસવા અમુક લેબલો કાઢીને નીચેથી પેપર જરાય તૂટે નહિ તે રીતે લેબલ આસાનીથી ઉખડે છે તેની તપાસ કરો.": "On every sheet, give a little pressure by hand and check that the release liner does not break; to check for shallow punching, take off a few labels and check that the label peels off easily without the paper underneath tearing at all.",
  "પ્રિન્ટ પ્રેસર (Print pressure)": "Print pressure",
  "લેબલના ચાર ખૂણા અને સીટના વચ્ચેના ભાગમાં ખુબ જ વધારે અથવા ખુબ જ ઓછા પ્રિન્ટીંગના દબાણને તપાસો; વધારે દબાણવાળા વિસ્તારો અને ઓછી/અસમાન છપાઈના હલ્કા વિસ્તારો પણ તપાસો.": "Check for very high or very low printing pressure at the four corners of the label and in the middle of the sheet; also check the areas of excess pressure and the light areas of low/uneven printing.",
  "પ્રિન્ટ ડીફોરમીટસ (Print deformities)": "Print deformities",
  "હિકીઝ જેવી પ્રિન્ટ વિકૃતિઓ માટે સીટના બધા જ લેબલો તપાસો — બબલ્સ, ગુમ થયેલ છાપ/પ્રકાર, પેચો, રેખાઓ જેવી સમસ્યાઓ; મંજુર થયેલ આર્ટવર્કમાં અન્ય ચિહ્નો ન હોવા જોઈએ.": "Check every label on the sheet for print deformities such as hickeys — problems such as bubbles, missing print/type, patches and lines; there must be no marks other than those in the approved artwork.",

  // ── F/QC/13 — the footer box
  "એમ.સી.નું વર્ણન (જો લાગુ પડતું હોય તો)": "M.C. description (if applicable)",
  "સહી કરવાનું કારણ (ઓવરરાઈડ)": "Reason for signing (override)",
  "સાઇન ઓફ કરનાર વ્યક્તિનું નામ": "Name of the person signing off",
  "રિમાર્કસ (Remarks)": "Remarks",
  "ક્યુ.એ.ની સહી (QA Sign)": "QA Sign",

  // ── F/QC/13 — the grade chart printed with the form (A / B / C / F per parameter)
  "ગ્રેડ ચાર્ટ (Grade chart) — A / B / C / F per parameter": "Grade chart — A / B / C / F per parameter",
  "પેરામીટર": "Parameter",
  "રજિસ્ટ્રેશન": "Registration",
  "બધા જ રજિસ્ટર સંપૂર્ણ પણે બરાબર છે; કોઈપણ પ્રિન્ટ ખરાબ થઈ નથી.": "All registers are perfectly in order; no print has been spoiled.",
  "રજિસ્ટરમાં અને પ્રિન્ટના વિસ્તારમાં ન્યૂનતમ ગેરરીતી મળી.": "Minimal misregistration found in the register and in the print area.",
  "રજિસ્ટરમાં મધ્યમ ગેરરીતી મળી, પરંતુ પ્રિન્ટ અને ટેક્સમાં ઓવર લાઈન્સ બતાવતું નથી.": "Moderate misregistration found in the register, but the print and the text do not show overlap lines.",
  "મોટી અને ગંભીર ગેરરીતીના મુદ્દાઓ અથવા ઓવરલેપ લાઈન્સ સ્પષ્ટ પણે દેખાય છે.": "Major and serious misregistration issues or overlap lines are clearly visible.",
  "શેડ": "Shade",
  "બધા જ શેડો કલરના સંદર્ભ મુજબ બરાબર મળી રહ્યા છે.": "All shades are matching correctly as per the colour reference.",
  "લોગો બરાબર છે, પરંતુ બીજા કલરમાં નાના ફેરફારો જોવા મળે છે.": "The logo is correct, but small variations are seen in the other colours.",
  "લોગો અને પ્રોસેસ કલરમાં નાના ફેરફારો જોવા મળે છે.": "Small variations are seen in the logo and the process colours.",
  "લોગોના કલરમાં મધ્યમ ફેરફારો અને બીજા કલરોમાં મોટા ફેરફારો જોવા મળે છે.": "Moderate variations are seen in the logo colour and major variations in the other colours.",
  "કોટીંગ": "Coating",
  "કોટીંગના તમામ ક્ષેત્રો સરળ, સ્પોટ અને કરચલી વગરના મળી રહ્યા છે.": "All coated areas are found smooth, without spots and wrinkles.",
  "કોટીંગવાળા વિસ્તારમાં નાની-નાની કરચલીઓ અને બબલ્સ મળી આવે છે.": "Tiny wrinkles and bubbles are found in the coated area.",
  "પંચીંગ": "Punching",
  "છીછરું પંચીંગ અથવા ગેરસમજ દેખાતી નથી.": "No shallow punching or misregistration is visible.",
  "ઓછામાં ઓછું છીછરું પંચીંગ અથવા ખોટી નોંધણીનું અવલોકન થાય છે.": "Slight shallow punching or wrong registration is observed.",
  "ન્યૂનતમ છીછરું પંચીંગ અથવા મધ્યમ ગેરમાર્ગે પંચીંગ નજરમાં આવે છે (ટેક્સ પર મંજૂરી નથી).": "Minimal shallow punching or moderate misplaced punching is noticed (not permitted on text).",
  "ખુબ જ વધારે છીછરું પંચીંગ / ભારે ગેરરીતી મળી.": "Excessive shallow punching / heavy misregistration found.",
  "પ્રિન્ટ પ્રેસર": "Print pressure",
  "ઉચ્ચ અને નીચા છાપના દબાણવાળા કોઈપણ ક્ષેત્ર મળ્યા નથી.": "No areas of high or low print pressure were found.",
  "ન્યૂનતમ દબાણની સમસ્યા મળી; લોગો અને બારકોડ પર અસર થતી નથી.": "Minimal pressure problem found; the logo and the barcode are not affected.",
  "મધ્યમ દબાણની સમસ્યા મળી; લોગો અને બારકોડ પર અસર થતી નથી.": "Moderate pressure problem found; the logo and the barcode are not affected.",
  "લોગો અને બારકોડ પર મુખ્ય દબાણની અસર ગ્રસ્ત છે.": "Major pressure effect has affected the logo and the barcode.",
  "પ્રિન્ટ ડીફોરમીટસ": "Print deformities",
  "કોઈ નાની અથવા મુખ્ય પ્રિન્ટની વિકૃતિનું અવલોકન થતું નથી.": "No minor or major print deformity is observed.",
  "પ્રિન્ટ વિસ્તારમાં ફીકી અથવા નાની બબલ્સ મળી આવે છે.": "Faint or small bubbles are found in the print area.",
  "ટેક્સમાં, લોગોના કે નોન પ્રિન્ટ વિસ્તારમાં નાની વિકૃતિ મળી આવે છે.": "Minor deformity is found in the text, the logo or the non-print area.",
  "ફ્રેમ્સ, લોગોના કે નોન પ્રિન્ટ વિસ્તારમાં મોટી વિકૃતિ મળી આવે છે.": "Major deformity is found in the frames, the logo or the non-print area.",

  // ── THE TWO GUJARATI LINE CLEARANCE CHECKLISTS — the columns both forms end with
  "Q.A એ ચેકીંગ": "Checked by Q.A",
  "Q.A ચેકીંગ": "Q.A checking",
  "Q.A ની શહી": "Q.A's sign",
  "ઓપરેટર ની શહી": "Operator's sign",

  // ── લાઈન કિલયરન્સ (materials) — what is printed above the grid, and its header box
  "પ્રોસેસઃ– નીચે લખેલા દરેક પોઈન્ટ માટે QUALIFIED Q.A વ્યકિત એ પહેલી સાચી સીટ તપાસવી. જો દરેક પોઈન્ટ સાચો ઠરે તો એનાથી લાગતી પ્રોસેસ ઉપર ✓ અને સહી કરવી. સહી થયા બાદ ઓપરેટર પ્રોડકશન ચાલુ કરી શકે છે. લાઈન કિલયરન્સ બોર્ડ પર સાચો જોબ લખેલો છે કે નહી તે પણ તપાસવું કોઈપણ તકલીફ દેખાય તો QA MANAGER ને જાણ કરવી.": "Process:– For each point written below, a QUALIFIED Q.A person must check the first correct sheet. If every point is found correct, put a ✓ and sign against the process concerned. Once the signature is done, the operator can start production. Also check whether the correct job is written on the line clearance board. If any problem is seen, inform the QA MANAGER.",
  "આ ફોર્મ અને ક્વોલીટી શહી (Line Clearance — Quality) એક જ પાના પર છપાયેલાં છે.": "This form and Line Clearance — Quality are printed on the same page.",
  "આઈટમ નં. (Item No.)": "Item No.",
  "પ્રો.નં. (PO No.)": "PO No.",
  "મશીનનું નામઃ– (Machine name)": "Machine name:–",
  "તા. (Date)": "Date",

  // ── લાઈન કિલયરન્સ — its two printed columns
  "પ્રોસેસ (Process)": "Process",
  "મટીરીયલ્સ (Materials)": "Materials",

  // ── લાઈન કિલયરન્સ — its twelve printed lines, process by process
  "પ્રિન્ટીંગ": "Printing",
  "રો–મટીરીયલ્સ સ્ટોક": "Raw materials stock",
  "માઉન્ટ કરેલી પ્લેટ": "Mounted plate",
  "સ્પેસીયલ ઈંક": "Special ink",
  "સ્પેસીયલ વારનીસ": "Special varnish",
  "મેગ્નેટીક ડાઈ": "Magnetic die",
  "પ્રિન્ટ થયેલા રોલ": "Printed rolls",
  "ડાઈ કટ રોલ": "Die-cut rolls",
  "બેકેલાઇટ ડાઈ": "Bakelite die",
  "ક્વોલીટી ચેકીંગ": "Quality checking",
  "કયૂશી માં ચેક થયેલ રોલ": "Rolls checked in QC",
  "મશીન પરથી ઉતારેલ રોલ": "Rolls taken off the machine",
  "લેબલ સ્લીટીંગ": "Label slitting",
  "પેકીંગ ટેબલ": "Packing table",
  "સ્લીટ રોલ": "Slit rolls",
  "Photographed Gujarati લાઈન કિલયરન્સ form, blank (supplied 18-Sep-2026) — no format number printed": "Photographed Gujarati Line Clearance form, blank (supplied 18-Sep-2026) — no format number printed",

  // ── ક્વોલીટી શહી (quality) — what is printed above the grid, its header box and its columns
  "પ્રોસીઝરઃ– ઓપરેટર ખાતરી કરવી જોઈ એ કે નીચે ની સૂચિબદ્ધસ બ્ધીજ આઈટમ્સો ઉત્પાદન ક્ષેત્ર માં થી દૂર કરવા માં આવી છે. અને યોગ્ય રીસે મુકવા માં આવી છે. તે બ્ધીજ સામગ્રી સંગ્રહ સ્થાન થી દૂર કર્યા પછી. QA ના વ્યકિત એ લાઈન કિલયરન્સ તપાસી લેવું. અને તે મંજુર કરવું આવશ્યક છે. તે પણ ખાતરી કરવી જ જોઈ એ કે લાઈન કિલયરન્સ બોર્ડ પર સાચા જોબ નો ઉલ્લેખ કરવા માં આવ્યો છે કે નહી. જો કોઈ સમસ્યા જાણ થઈ હોય તો બ્ધુજ કિલયરન્સ થઈ જાય પછી જ ઉત્પાદન શરૂ થવું જોઈએ": "Procedure:– The operator must make sure that all the items listed below have been removed from the production area. And that they have been put in their proper place. After all that material has been cleared away to the storage place. The QA person must check the line clearance. And it must be approved. It must also be made sure whether the correct job has been mentioned on the line clearance board or not. If any problem has been reported, production must be started only after everything has been cleared",
  "આ ફોર્મ અને લાઈન કિલયરન્સ (Line Clearance — Materials) એક જ પાના પર છપાયેલાં છે.": "This form and Line Clearance — Materials are printed on the same page.",
  "પ્રોડકશન નં. (Production No.)": "Production No.",
  "પેરામિટર (Parameter)": "Parameter",

  // ── ક્વોલીટી શહી — its fifteen printed lines
  "જોબ સ્પેકસ": "Job specs",
  "સેડ": "Shade",
  "ટેક્સ": "Text",
  "ઇમેજ": "Image",
  "વારનીસ / લેમીનેશન": "Varnish / Lamination",
  "એપુવ થયેલ આર્ટવર્ક": "Approved artwork",
  "ડાઈમેન્સન": "Dimension",
  "ગેપ": "Gap",
  "રેડ્યૂસ કોર્નર": "Reduce corner",
  "ડેપ્થ": "Depth",
  "માસ્ટર – રજીસ્ટ્રેશન": "Master – Registration",
  "માસ્ટર – સેડ": "Master – Shade",
  "માસ્ટર – સ્પોટસ": "Master – Spots",
  "Photographed Gujarati ક્વોલીટી શહી form, blank (supplied 18-Sep-2026) — no format number printed": "Photographed Gujarati Quality Sign form, blank (supplied 18-Sep-2026) — no format number printed",
  // ── F/DISP/02 — Container Stuffing & Vehicle Inspection Record, the fourth
  //    form the plant issues in Gujarati (REQUIREMENTS §70). Its name, the
  //    seven things to do when a container arrives, the consignment's own
  //    boxes, the nine-point checklist, the two answers and the two
  //    authorisations. The plant's own English, keeping every obligation as
  //    the paper has it — including the checklist's own numbering, which runs
  //    1, 2, 3, 4, 6, 7, 8, 9 with no 5.
  "Container Stuffing & Vehicle Inspection Record — કન્ટેનર સ્ટફિંગ અને વાહન નિરીક્ષણ રેકોર્ડ": "Container Stuffing & Vehicle Inspection Record",

  "1. તેના આગમન પર કન્ટેનર ખોલો.": "1. Open the container on its arrival.",
  "2. જુઓ કે તે કોઈપણ પ્રકારના દૃશ્યમાન સંકટથી મુક્ત છે (દા.ત. - ગંદકી, ધૂળ, અગાઉના શિપમેન્ટના રાસાયણિક અવશેષો, પક્ષીઓની છી, ખાદ્ય ચીજો, કોઈપણ વાંધાજનક વસ્તુઓ વગેરે). જો કોઈ નુકસાન/સફાઈ ન કરી શકાય તેવી સ્થિતિ મળી આવે, તો કન્ટેનર પરત કરો. ત્યાં કોઈ વાંધાજનક ગંધ હોવી જોઈએ નહીં": "2. See that it is free of any kind of visible hazard (e.g. - dirt, dust, chemical residues of a previous shipment, bird droppings, food items, any objectionable things and so on). If any damage, or a condition that cannot be cleaned, is found, return the container. There must be no objectionable smell",
  "3. જો જરૂરી હોય તો કન્ટેનર સાફ કરો.": "3. Clean the container if necessary.",
  "4. જો લોડિંગ તરત જ શરૂ ન થાય તો કન્ટેનર લોડિંગ સમયે જ બંધ અને ખોલવું જોઈએ.": "4. If loading does not begin at once, the container should be closed and opened only at the time of loading.",
  "5. કન્ટેનરનો ફ્લોર સુધ અને સ્વચ્છ ફેબ્રિકથી ઢંકાયેલો હોવો જોઈએ, માત્ર ગાંસડીના કિસ્સામાં.": "5. The container's floor should be covered with sound and clean fabric, in the case of bales only.",
  "6. લોડિંગ સમર્પિત કેનોપી હેઠળ થવું જોઈએ.": "6. Loading should take place under a dedicated canopy.",
  "7. લોડ થઈ જાય પછી કન્ટેનર તરત જ બંધ કરવું જોઈએ.": "7. Once the load is in, the container should be closed at once.",

  "તારીખ": "Date",
  "ગ્રાહકનું નામ": "Customer's name",
  "ઇન્વોઇસ નં.": "Invoice No.",
  "આંતરિક પીઓ નંબર": "Internal PO number",
  "ડ્રાઈવરનું નામ": "Driver's name",
  "ગ્રાહક પીઓ નંબર": "Customer PO number",
  "ટ્રાન્સપોર્ટરનું નામ": "Transporter's name",
  "વાહન નં.": "Vehicle No.",

  "ક્રમ નં.": "Sr. No.",
  "ચેકલિસ્ટ": "Checklist",
  "પાલન (NA સ્ટ્રાઈક આઉટ)": "Compliance (strike NA out)",
  "જો કોઈ અન્ય અવલોકનો હોય": "If there are any other observations",
  "હા": "Yes",
  "નાં": "No",

  "શું કન્ટેનર દૂષણથી મુક્ત છે અને અમારા ઉત્પાદનના પરિવહન માટે યોગ્ય છે?": "Is the container free of contamination and fit for the transport of our product?",
  "શું કન્ટેનર આંતરિક સપાટી પર કોઈપણ ખાડા, છિદ્રો, લીક અથવા નખથી મુક્ત છે?": "Is the container free of any dents, holes, leaks or nails on the inner surface?",
  "શું કન્ટેનર દૂષિતતા, ઘનીકરણ, ઝેરી પદાર્થો અથવા જંતુઓથી મુક્ત છે?": "Is the container free of contamination, condensation, toxic substances or insects?",
  "શું કન્ટેનર અપ્રિય / તીવ્ર ગંધથી મુક્ત છે?": "Is the container free of an unpleasant / strong smell?",
  "ફેબ્રિકથી ઢંકાયેલો ફ્લોર": "Floor covered with fabric",
  "લાકડાના પેલેટની સ્થિતિ યોગ્ય અને કોઈ નુકસાન નથી": "The wooden pallets are in a fit condition and there is no damage",
  "ગાંસડી/પેલેટ્સ પર માર્કિંગ ઉપલબ્ધ છે": "Marking is available on the bales / pallets",
  "બધા દસ્તાવેજો (લાયસન્સ, પીયુસી, વીમો અને નોંધણી જગ્યાએ?": "All the documents (licence, PUC, insurance and registration in place?",

  "(ડિસ્પેચ ઇન્ચાર્જ) પ્રોડક્ટ રિલીઝ ઓથોરાઇઝેશન — નામ": "(Dispatch In charge) Product release authorisation — Name",
  "(ડિસ્પેચ ઇન્ચાર્જ) પ્રોડક્ટ રિલીઝ ઓથોરાઇઝેશન — હોદ્દો": "(Dispatch In charge) Product release authorisation — Designation",
  "(ડિસ્પેચ ઇન્ચાર્જ) પ્રોડક્ટ રિલીઝ ઓથોરાઇઝેશન — સાઇન": "(Dispatch In charge) Product release authorisation — Sign",
  "(QC) દ્વારા ચેક અને મંજૂર — નામ": "Checked and approved by (QC) — Name",
  "(QC) દ્વારા ચેક અને મંજૂર — હોદ્દો": "Checked and approved by (QC) — Designation",
  "(QC) દ્વારા ચેક અને મંજૂર — સાઇન": "Checked and approved by (QC) — Sign",

  // ── F/MNT/04 — Daily Equipment Health Status & Cleaning Record (REQUIREMENTS
  //    §74): its seven check parameters, each printed in Hindi AND Gujarati on
  //    one row, and its two footnotes. Written once, beside the layout they
  //    belong to (data/seed/maintenanceLayouts.ts), so the two cannot drift.
  ...MNT04_TEXT_EN,
};
