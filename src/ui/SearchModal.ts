import { App, SuggestModal } from "obsidian";
import type { ZoteroItem } from "../zotero/types";
import type { ZoteroClient } from "../zotero/client";
import { formatAuthors } from "../utils/strings";
import { t } from "../i18n";

export type OnItemSelect = (item: ZoteroItem) => void | Promise<void>;

export class SearchModal extends SuggestModal<ZoteroItem> {
  private client: ZoteroClient;
  private onSelect: OnItemSelect;
  /** Tracks in-flight request so stale results are discarded */
  private requestId = 0;

  constructor(app: App, client: ZoteroClient, onSelect: OnItemSelect) {
    super(app);
    this.client = client;
    this.onSelect = onSelect;
    this.setPlaceholder(t("searchImportPlaceholder"));
    this.setInstructions([
      { command: "↑↓", purpose: t("searchNavigate") },
      { command: "↵", purpose: t("searchImportNote") },
      { command: "esc", purpose: t("searchCancel") },
    ]);
  }

  async getSuggestions(query: string): Promise<ZoteroItem[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    // Stamp this request; if a newer one arrives we discard our results
    const id = ++this.requestId;

    try {
      const items = await this.client.getItems(trimmed);
      // Discard if superseded by a newer query
      if (id !== this.requestId) return [];
      return items;
    } catch {
      // Errors are surfaced at the command level; here we just return nothing
      return [];
    }
  }

  renderSuggestion(item: ZoteroItem, el: HTMLElement): void {
    const titleEl = el.createEl("div", { cls: "zoteasy-suggestion-title" });
    titleEl.setText(item.title || "(untitled)");

    const metaParts: string[] = [];
    const authors = formatAuthors(item.authors);
    if (authors) metaParts.push(authors);
    if (item.year) metaParts.push(item.year);
    if (item.journal) metaParts.push(item.journal);
    else if (item.publisher) metaParts.push(item.publisher);

    if (metaParts.length > 0) {
      const metaEl = el.createEl("div", { cls: "zoteasy-suggestion-meta" });
      metaEl.setText(metaParts.join(" · "));
    }
  }

  onChooseSuggestion(item: ZoteroItem): void {
    void this.onSelect(item);
  }
}
