// What the download reads off the page, exposed to the check (tests/originals_check/check.py): the same documentBlocks the
// Download button calls (utils/documentExport.ts), bundled on its own and put into the page by Playwright, so the check can
// save what DCRS showed beside the file it downloaded. Never part of the app's own bundle.
import { documentBlocks, recordIdsIn } from "../../frontend/src/utils/documentExport";
import { documentsOnScreen } from "../../frontend/src/utils/print";

(window as unknown as { __origcheck: unknown }).__origcheck = {
  blocks: () => documentBlocks(documentsOnScreen()),
  recordIds: () => recordIdsIn(documentsOnScreen()),
};
