import { App } from "obsidian";
import { SearchModal } from "./SearchModal";
import type { ZoteroClient } from "../zotero/client";
import type { OnItemSelect } from "./SearchModal";
import { t } from "../i18n";

/**
 * Search modal variant for inline citation insertion.
 * Identical to SearchModal except for placeholder text and the enter-key hint.
 */
export class CitationModal extends SearchModal {
  constructor(app: App, client: ZoteroClient, onSelect: OnItemSelect) {
    super(app, client, onSelect);
    this.setPlaceholder(t("searchCitationPlaceholder"));
    this.setInstructions([
      { command: "↑↓", purpose: t("searchNavigate") },
      { command: "↵", purpose: t("searchInsertCitation") },
      { command: "esc", purpose: t("searchCancel") },
    ]);
  }
}
