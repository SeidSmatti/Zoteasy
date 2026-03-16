import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ZoteasyPlugin from "./main";
import { ZoteroConnectionError } from "./zotero/client";
import { t } from "./i18n";

export interface PluginSettings {
  /** Vault-relative folder where literature notes are created, e.g. "Literature Notes" */
  outputFolder: string;
  /** Vault-relative folder for imported image annotations, e.g. "Attachments/Zotero" */
  attachmentFolder: string;
  /** Port Zotero's local API is listening on (default: 23119) */
  zoteroPort: number;
  /**
   * Path to the Zotero data directory (the folder containing zotero.sqlite).
   * Supports `~/` prefix. Default is ~/Zotero on most systems.
   */
  zoteroDataDir: string;
  /**
   * When true, annotations are rendered as plain blockquotes without callout
   * syntax or synthesis blocks, giving more room for free-form editing.
   */
  minimalFormatting: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  outputFolder: "Literature Notes",
  attachmentFolder: "Attachments/Zotero",
  zoteroPort: 23119,
  zoteroDataDir: "~/Zotero",
  minimalFormatting: false,
};

export class ZoteasySettingTab extends PluginSettingTab {
  plugin: ZoteasyPlugin;

  constructor(app: App, plugin: ZoteasyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // -------------------------------------------------------------------------
    // Zotero connection
    // -------------------------------------------------------------------------
    containerEl.createEl("h2", { text: t("settingsZoteroTitle") });

    new Setting(containerEl)
      .setName(t("settingsPortName"))
      .setDesc(t("settingsPortDesc"))
      .addText((text) =>
        text
          .setPlaceholder("23119")
          .setValue(String(this.plugin.settings.zoteroPort))
          .onChange(async (value) => {
            const port = parseInt(value, 10);
            if (!isNaN(port) && port > 0 && port < 65536) {
              this.plugin.settings.zoteroPort = port;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName(t("settingsDataDirName"))
      .setDesc(t("settingsDataDirDesc"))
      .addText((text) =>
        text
          .setPlaceholder("~/Zotero")
          .setValue(this.plugin.settings.zoteroDataDir)
          .onChange(async (value) => {
            this.plugin.settings.zoteroDataDir = value.trim() || "~/Zotero";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settingsTestName"))
      .setDesc(t("settingsTestDesc"))
      .addButton((btn) =>
        btn
          .setButtonText(t("settingsTestBtn"))
          .setCta()
          .onClick(async () => {
            btn.setButtonText(t("settingsTestingBtn")).setDisabled(true);
            try {
              await this.plugin.zoteroClient.checkConnection();
              new Notice(t("settingsConnectedMsg"));
              btn.setButtonText(t("settingsConnectedBtn"));
            } catch (err) {
              const message =
                err instanceof ZoteroConnectionError
                  ? err.message
                  : "Unexpected error — check the developer console.";
              new Notice(`Zotero connection failed: ${message}`, 8000);
              btn.setButtonText(t("settingsConnFailedBtn"));
            } finally {
              btn.setDisabled(false);
            }
          })
      );

    // -------------------------------------------------------------------------
    // Output locations
    // -------------------------------------------------------------------------
    containerEl.createEl("h2", { text: t("settingsOutputTitle") });

    new Setting(containerEl)
      .setName(t("settingsNotesFolderName"))
      .setDesc(t("settingsNotesFolderDesc"))
      .addText((text) =>
        text
          .setPlaceholder("Literature Notes")
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (value) => {
            this.plugin.settings.outputFolder = value.trim() || "Literature Notes";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settingsAttachFolderName"))
      .setDesc(t("settingsAttachFolderDesc"))
      .addText((text) =>
        text
          .setPlaceholder("Attachments/Zotero")
          .setValue(this.plugin.settings.attachmentFolder)
          .onChange(async (value) => {
            this.plugin.settings.attachmentFolder =
              value.trim() || "Attachments/Zotero";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settingsMinimalFormattingName"))
      .setDesc(t("settingsMinimalFormattingDesc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.minimalFormatting)
          .onChange(async (value) => {
            this.plugin.settings.minimalFormatting = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
