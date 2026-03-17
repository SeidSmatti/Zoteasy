import { Editor, Notice, Plugin, TFile, TFolder } from "obsidian";
import { ZoteasySettingTab, DEFAULT_SETTINGS } from "./settings";
import type { PluginSettings } from "./settings";
import { ZoteroClient, ZoteroConnectionError } from "./zotero/client";
import type { ZoteroItem, ZoteroAnnotation } from "./zotero/types";
import { SearchModal } from "./ui/SearchModal";
import { CitationModal } from "./ui/CitationModal";
import { generateNote } from "./notes/generator";
import { extractImportedIds, updateNote } from "./notes/updater";
import { sanitizeFilename, normalizeFolderPath } from "./utils/strings";
import { t, tAnnotationCount, tRebaseSummary } from "./i18n";
import type { NoteOptions } from "./notes/formatter";

export default class ZoteasyPlugin extends Plugin {
  settings!: PluginSettings;
  zoteroClient!: ZoteroClient;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.zoteroClient = new ZoteroClient({
      port: this.settings.zoteroPort,
      dataDir: this.settings.zoteroDataDir,
    });

    this.addSettingTab(new ZoteasySettingTab(this.app, this));

    this.addCommand({
      id: "import-note",
      name: t("cmdImportName"),
      callback: () => {
        new SearchModal(this.app, this.zoteroClient, (item) =>
          this.importNote(item)
        ).open();
      },
    });

    this.addCommand({
      id: "insert-citation",
      name: t("cmdCitationName"),
      // editorCallback captures the active editor at invocation time, ensuring
      // the citation lands in the right note even if the user switches panes.
      // The command is also automatically disabled when no editor is active.
      editorCallback: (editor: Editor) => {
        new CitationModal(this.app, this.zoteroClient, (item) => {
          editor.replaceSelection(`[@${item.citekey}]`);
          new Notice(`${t("noticeCitationInserted")}: [@${item.citekey}]`);
        }).open();
      },
    });

    this.addCommand({
      id: "rebase-notes",
      name: t("cmdRebaseName"),
      callback: () => {
        void this.rebaseAllNotes();
      },
    });

    this.checkConnectionSilently();
  }

  onunload(): void {}

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.zoteroClient.updateConfig({
      port: this.settings.zoteroPort,
      dataDir: this.settings.zoteroDataDir,
    });
  }

  // ---------------------------------------------------------------------------
  // Note import
  // ---------------------------------------------------------------------------

  private noteOptions(): NoteOptions {
    return { minimal: this.settings.minimalFormatting };
  }

  private async importNote(item: ZoteroItem): Promise<void> {
    // sanitizeFilename can return "" for all-special-char titles; fall back to itemKey
    const safeName =
      sanitizeFilename(item.title) || sanitizeFilename(item.itemKey) || item.itemKey;
    const filename = safeName + ".md";
    const folder = normalizeFolderPath(this.settings.outputFolder);
    const notePath = `${folder}/${filename}`;

    try {
      await this.ensureFolder(folder);

      const existing = this.app.vault.getAbstractFileByPath(notePath);

      const annotations = await this.zoteroClient.getAllAnnotationsForItem(
        item.itemKey
      );

      if (existing instanceof TFile) {
        // Note already exists — append only new annotations
        const currentContent = await this.app.vault.read(existing);
        const importedIds = extractImportedIds(currentContent);
        const fresh = annotations.filter((a) => !importedIds.has(a.id));

        const imagePaths = await this.saveAnnotationImages(fresh);
        const { content: updatedContent, newCount } = updateNote(
          currentContent,
          fresh,
          imagePaths,
          this.noteOptions()
        );

        if (newCount > 0) {
          await this.app.vault.modify(existing, updatedContent);
        }

        await this.app.workspace.getLeaf(false).openFile(existing);
        new Notice(
          newCount > 0
            ? `${t("noticeUpdated")}: ${filename} · ${tAnnotationCount(newCount)}`
            : `${t("noticeNoNew")}: ${filename}`
        );
        return;
      }

      // New note
      const imagePaths = await this.saveAnnotationImages(annotations);
      const content = generateNote(item, annotations, imagePaths, this.noteOptions());
      const file = await this.app.vault.create(notePath, content);
      await this.app.workspace.getLeaf(false).openFile(file);

      const n = annotations.length;
      new Notice(
        `${t("noticeImported")}: ${filename}` +
          (n > 0 ? ` · ${tAnnotationCount(n)}` : "")
      );
    } catch (err) {
      const message =
        err instanceof ZoteroConnectionError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown error";
      new Notice(`${t("noticeImportFailed")}: ${message}`, 8000);
    }
  }

  // ---------------------------------------------------------------------------
  // Rebase (sync all notes)
  // ---------------------------------------------------------------------------

  /**
   * Scans every Markdown file in the output folder, checks whether its
   * zotero-key has new annotations in the Zotero database, and appends them
   * non-destructively. User synthesis blocks are never touched.
   */
  private async rebaseAllNotes(): Promise<void> {
    const folderPath = normalizeFolderPath(this.settings.outputFolder);
    const folder = this.app.vault.getAbstractFileByPath(folderPath);

    if (!(folder instanceof TFolder)) {
      new Notice(t("noticeRebaseNothingToSync"));
      return;
    }

    const mdFiles = folder.children.filter(
      (f): f is TFile => f instanceof TFile && f.extension === "md"
    );

    if (mdFiles.length === 0) {
      new Notice(t("noticeRebaseNothingToSync"));
      return;
    }

    new Notice(t("noticeRebasing"));

    let updated = 0;
    let errors = 0;

    for (const file of mdFiles) {
      try {
        const content = await this.app.vault.read(file);

        // Extract zotero-key from YAML frontmatter (quoted or unquoted)
        const match = content.match(/^zotero-key:\s*"?([A-Z0-9]+)"?\s*$/m);
        if (!match) continue;

        const itemKey = match[1];
        const annotations = await this.zoteroClient.getAllAnnotationsForItem(itemKey);
        const importedIds = extractImportedIds(content);
        const fresh = annotations.filter((a) => !importedIds.has(a.id));

        if (fresh.length === 0) continue;

        const imagePaths = await this.saveAnnotationImages(fresh);
        const { content: updated_content, newCount } = updateNote(
          content,
          fresh,
          imagePaths,
          this.noteOptions()
        );

        if (newCount > 0) {
          await this.app.vault.modify(file, updated_content);
          updated++;
        }
      } catch {
        errors++;
      }
    }

    new Notice(
      `${t("noticeRebaseDone")}: ${tRebaseSummary(updated, mdFiles.length, errors)}`
    );
  }

  /**
   * Downloads PNG images for all image-type annotations and writes them to
   * the attachments folder. Returns a map of annotationId → vault filename.
   * Per-image failures are suppressed so a single unavailable image does not
   * abort the import — the callout renders a placeholder link instead.
   */
  private async saveAnnotationImages(
    annotations: ZoteroAnnotation[]
  ): Promise<Map<string, string>> {
    // ink annotations may also have a PNG rendition via the /image endpoint
    const imageAnnotations = annotations.filter(
      (a) => a.type === "image" || a.type === "ink"
    );
    if (imageAnnotations.length === 0) return new Map();

    const folder = normalizeFolderPath(this.settings.attachmentFolder);
    await this.ensureFolder(folder);

    const paths = new Map<string, string>();
    for (const ann of imageAnnotations) {
      try {
        const buffer = await this.zoteroClient.downloadAnnotationImage(ann.id);
        const filename = `zotero-${ann.id}.png`;
        await this.app.vault.adapter.writeBinary(`${folder}/${filename}`, buffer);
        paths.set(ann.id, filename);
      } catch {
        // Placeholder will be used in the callout; import continues.
      }
    }
    return paths;
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(folderPath);
    if (existing instanceof TFolder) return;
    if (existing instanceof TFile) {
      throw new Error(
        `Cannot create folder "${folderPath}": a file with that name already exists.`
      );
    }
    await this.app.vault.createFolder(folderPath);
  }

  // ---------------------------------------------------------------------------
  // Connection check
  // ---------------------------------------------------------------------------

  private checkConnectionSilently(): void {
    this.zoteroClient.checkConnection().catch((err: unknown) => {
      if (err instanceof ZoteroConnectionError) {
        new Notice(`Zoteasy: ${err.message}`, 6000);
      }
    });
  }
}
