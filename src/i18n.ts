/**
 * Minimal i18n system for zoteasy.
 * Detects language from Obsidian's moment locale (set in Obsidian → General → Language).
 * Falls back to English for all locales other than French.
 */

import { moment } from "obsidian";

type Lang = "en" | "fr";

function lang(): Lang {
  return moment.locale().startsWith("fr") ? "fr" : "en";
}

const strings = {
  // ── Commands ──────────────────────────────────────────────────────────────
  cmdImportName: {
    en: "Import literature note from Zotero",
    fr: "Importer une note de littérature depuis Zotero",
  },
  cmdCitationName: {
    en: "Insert Zotero citation at cursor",
    fr: "Insérer une citation Zotero au curseur",
  },
  cmdRebaseName: {
    en: "Sync all Zotero notes",
    fr: "Synchroniser toutes les notes Zotero",
  },

  // ── Search modal ──────────────────────────────────────────────────────────
  searchImportPlaceholder: {
    en: "Search your Zotero library…",
    fr: "Rechercher dans votre bibliothèque Zotero…",
  },
  searchCitationPlaceholder: {
    en: "Search Zotero to insert citation…",
    fr: "Rechercher dans Zotero pour insérer une citation…",
  },
  searchNavigate: { en: "navigate", fr: "naviguer" },
  searchImportNote: { en: "import note", fr: "importer la note" },
  searchInsertCitation: { en: "insert citation", fr: "insérer la citation" },
  searchCancel: { en: "cancel", fr: "annuler" },

  // ── Settings ──────────────────────────────────────────────────────────────
  settingsZoteroTitle: {
    en: "Zotero connection",
    fr: "Connexion Zotero",
  },
  settingsPortName: { en: "Port", fr: "Port" },
  settingsPortDesc: {
    en:
      "The port Zotero's local API listens on. Default is 23119. " +
      "No API key is needed — the local API only requires Zotero to be running " +
      "with local API access enabled (Preferences → Advanced → " +
      "Allow other applications to communicate with Zotero).",
    fr:
      "Le port écouté par l'API locale de Zotero. Par défaut : 23119. " +
      "Aucune clé API n'est requise — l'API locale nécessite uniquement que Zotero soit en cours d'exécution " +
      "avec l'accès API local activé (Préférences → Avancé → " +
      "Autoriser d'autres applications à communiquer avec Zotero).",
  },
  settingsDataDirName: {
    en: "Zotero data directory",
    fr: "Répertoire de données Zotero",
  },
  settingsDataDirDesc: {
    en:
      "Path to the folder containing zotero.sqlite. " +
      "Zoteasy reads this file directly (read-only) to enumerate annotations, " +
      "since the local API does not expose them through search. " +
      "Supports ~/ for your home directory. " +
      "Find the path in Zotero: Edit → Preferences → Advanced → Files and Folders → Data Directory Location.",
    fr:
      "Chemin vers le dossier contenant zotero.sqlite. " +
      "Zoteasy lit ce fichier directement (lecture seule) pour lister les annotations, " +
      "car l'API locale ne les expose pas via la recherche. " +
      "Supporte ~/ pour votre répertoire personnel. " +
      "Trouvez le chemin dans Zotero : Édition → Préférences → Avancé → Fichiers et dossiers → Emplacement du répertoire de données.",
  },
  settingsTestName: {
    en: "Test connection",
    fr: "Tester la connexion",
  },
  settingsTestDesc: {
    en: "Verify that Zotero is running and the local API is reachable.",
    fr: "Vérifier que Zotero est en cours d'exécution et que l'API locale est accessible.",
  },
  settingsTestBtn: { en: "Test", fr: "Tester" },
  settingsTestingBtn: { en: "Testing…", fr: "Test en cours…" },
  settingsConnectedMsg: {
    en: "Connected to Zotero ✓",
    fr: "Connecté à Zotero ✓",
  },
  settingsConnectedBtn: { en: "Connected ✓", fr: "Connecté ✓" },
  settingsConnFailedBtn: { en: "Failed ✗", fr: "Échec ✗" },
  settingsOutputTitle: {
    en: "Output locations",
    fr: "Emplacements de sortie",
  },
  settingsNotesFolderName: {
    en: "Literature notes folder",
    fr: "Dossier des notes de littérature",
  },
  settingsNotesFolderDesc: {
    en:
      "Vault-relative path where generated literature notes are saved. " +
      "The folder is created automatically if it does not exist.",
    fr:
      "Chemin relatif au coffre où les notes de littérature générées sont sauvegardées. " +
      "Le dossier est créé automatiquement s'il n'existe pas.",
  },
  settingsAttachFolderName: {
    en: "Attachments folder",
    fr: "Dossier des pièces jointes",
  },
  settingsAttachFolderDesc: {
    en: "Vault-relative path where imported image annotations are saved.",
    fr: "Chemin relatif au coffre où les annotations image importées sont sauvegardées.",
  },
  settingsMinimalFormattingName: {
    en: "Minimal formatting",
    fr: "Mise en forme minimale",
  },
  settingsMinimalFormattingDesc: {
    en:
      "When enabled, annotations are imported as plain blockquotes without callout " +
      "wrappers or synthesis blocks — easier to edit freely. " +
      "Rich format uses [!quote] callouts and adds an empty synthesis block after " +
      "each annotation for your personal notes.",
    fr:
      "Lorsque activée, les annotations sont importées comme des citations simples sans " +
      "blocs callout ni blocs de synthèse — plus facile à éditer librement. " +
      "Le format enrichi utilise des callouts [!quote] et ajoute un bloc de synthèse " +
      "vide après chaque annotation pour vos notes personnelles.",
  },

  // ── Import notices ────────────────────────────────────────────────────────
  noticeImported: { en: "Imported", fr: "Importé" },
  noticeUpdated: { en: "Updated", fr: "Mis à jour" },
  noticeNoNew: {
    en: "No new annotations — opened",
    fr: "Aucune nouvelle annotation — ouvert",
  },
  noticeImportFailed: {
    en: "Zoteasy import failed",
    fr: "Échec de l'import Zoteasy",
  },
  noticeCitationInserted: {
    en: "Inserted",
    fr: "Inséré",
  },

  // ── Rebase notices ────────────────────────────────────────────────────────
  noticeRebasing: {
    en: "Zoteasy: syncing notes…",
    fr: "Zoteasy : synchronisation des notes…",
  },
  noticeRebaseDone: {
    en: "Zoteasy sync complete",
    fr: "Synchronisation Zoteasy terminée",
  },
  noticeRebaseNothingToSync: {
    en: "Zoteasy: no literature notes found in output folder.",
    fr: "Zoteasy : aucune note de littérature trouvée dans le dossier de sortie.",
  },

  // ── Note content ──────────────────────────────────────────────────────────
  noteAnnotationsSection: {
    en: "## Annotations",
    fr: "## Annotations",
  },
  noteNoAnnotations: {
    en: "*No annotations imported yet.*",
    fr: "*Aucune annotation importée pour le moment.*",
  },
  noteYourThoughts: {
    en: "Your thoughts",
    fr: "Vos réflexions",
  },
  noteOpenInZotero: {
    en: "Open in Zotero",
    fr: "Ouvrir dans Zotero",
  },
} satisfies Record<string, Record<Lang, string>>;

type StringKey = keyof typeof strings;

/** Returns the translated string for the current Obsidian locale. */
export function t(key: StringKey): string {
  return strings[key][lang()];
}

/**
 * Annotation count suffix, e.g. "5 annotations" / "1 annotation" / "5 annotations".
 * French has no separate singular form for "annotation" but uses different determiners.
 */
export function tAnnotationCount(n: number): string {
  if (lang() === "fr") {
    return n === 1 ? `1 annotation` : `${n} annotations`;
  }
  return n === 1 ? `1 annotation` : `${n} annotations`;
}

/**
 * Rebase result summary string.
 * e.g. "3 notes updated, 12 checked" / "3 notes mises à jour, 12 vérifiées"
 */
export function tRebaseSummary(updated: number, checked: number, errors: number): string {
  if (lang() === "fr") {
    const parts = [
      `${updated} note${updated !== 1 ? "s" : ""} mise${updated !== 1 ? "s" : ""} à jour`,
      `${checked} vérifiée${checked !== 1 ? "s" : ""}`,
    ];
    if (errors > 0) parts.push(`${errors} erreur${errors !== 1 ? "s" : ""}`);
    return parts.join(", ");
  }
  const parts = [
    `${updated} note${updated !== 1 ? "s" : ""} updated`,
    `${checked} checked`,
  ];
  if (errors > 0) parts.push(`${errors} error${errors !== 1 ? "s" : ""}`);
  return parts.join(", ");
}
