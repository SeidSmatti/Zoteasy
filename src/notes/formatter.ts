/**
 * Pure string-building helpers for note content.
 * No file I/O or Obsidian API calls here — only markdown assembly.
 */

import type { ZoteroItem, ZoteroAnnotation } from "../zotero/types";
import {
  formatAuthor,
  formatAuthors,
  escapeYamlString,
  todayIso,
} from "../utils/strings";
import { t } from "../i18n";

// ---------------------------------------------------------------------------
// Note format options
// ---------------------------------------------------------------------------

/**
 * Controls how a literature note is rendered.
 * `minimal: true` skips callout wrappers and synthesis blocks so the user
 * has plain markdown they can freely edit.
 */
export interface NoteOptions {
  minimal: boolean;
}

export const DEFAULT_NOTE_OPTIONS: NoteOptions = { minimal: false };

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

/**
 * Builds the YAML frontmatter block for a literature note.
 * The abstract is intentionally omitted from frontmatter — it lives in the
 * header section so it stays readable.
 */
export function toFrontmatter(item: ZoteroItem): string {
  const authors = item.authors.map((a) => `"${escapeYamlString(formatAuthor(a))}"`);
  const tags = item.tags.map((t) => `"${escapeYamlString(t)}"`);

  const lines = [
    "---",
    `title: "${escapeYamlString(item.title)}"`,
    `authors: [${authors.join(", ")}]`,
    `year: "${item.year}"`,
    `journal: "${escapeYamlString(item.journal)}"`,
    `publisher: "${escapeYamlString(item.publisher)}"`,
    `doi: "${escapeYamlString(item.doi)}"`,
    `url: "${escapeYamlString(item.url)}"`,
    `isbn: "${escapeYamlString(item.isbn)}"`,
    `tags: [${tags.join(", ")}]`,
    `citekey: "${escapeYamlString(item.citekey)}"`,
    `zotero-key: "${item.itemKey}"`,
    `imported: "${todayIso()}"`,
    "---",
  ];

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Header section
// ---------------------------------------------------------------------------

/**
 * Builds the human-readable header block: title, author/year/journal line,
 * and the abstract (omitted when empty).
 *
 * Rich mode:   abstract rendered as a foldable `[!abstract]-` callout.
 * Minimal mode: abstract rendered as a plain paragraph for free editing.
 */
export function toHeader(item: ZoteroItem, options: NoteOptions = DEFAULT_NOTE_OPTIONS): string {
  const parts: string[] = [];

  parts.push(`# ${item.title}`, "");

  const metaParts: string[] = [];
  const authors = formatAuthors(item.authors);
  if (authors) metaParts.push(authors);
  if (item.year) metaParts.push(item.year);
  if (item.journal) metaParts.push(`*${item.journal}*`);
  else if (item.publisher) metaParts.push(`*${item.publisher}*`);
  if (item.doi) metaParts.push(`[DOI](https://doi.org/${item.doi})`);

  if (metaParts.length > 0) {
    parts.push(`**${metaParts.join(" · ")}**`, "");
  }

  if (item.abstract) {
    if (options.minimal) {
      // Plain paragraph — easy to delete or replace
      parts.push(
        item.abstract
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n")
          .trim(),
        ""
      );
    } else {
      parts.push(abstractCallout(item.abstract), "");
    }
  }

  return parts.join("\n");
}

function abstractCallout(abstract: string): string {
  // Normalise line endings before splitting so Windows \r\n doesn't leave
  // stray \r characters inside callout lines.
  const body = abstract
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `> [!abstract]-\n${body}`;
}

// ---------------------------------------------------------------------------
// Annotation rendering
// ---------------------------------------------------------------------------

/**
 * Builds a `zotero://open-pdf/...` deep-link URI for an annotation.
 * Opens the PDF in Zotero at the exact page and annotation.
 */
export function pdfLink(ann: ZoteroAnnotation): string {
  const page = ann.pageIndex + 1; // Zotero URI uses 1-indexed page
  return (
    `zotero://open-pdf/library/items/${ann.attachmentKey}` +
    `?page=${page}&annotation=${ann.id}`
  );
}

/**
 * Renders a single annotation as markdown.
 *
 * Rich mode (default):
 *   Callout type is chosen by annotation type:
 *     highlight / underline → [!quote]
 *     note (standalone)     → [!note]
 *     image / ink           → [!info]
 *
 * Minimal mode:
 *   Plain blockquote for highlights, plain text for notes/images.
 *   No callout syntax — easier to freely edit around.
 *
 * The sentinel comment on line 1 lets the updater identify which annotations
 * are already present in a note during non-destructive updates.
 */
export function annotationToCallout(
  ann: ZoteroAnnotation,
  imagePath?: string,
  options: NoteOptions = DEFAULT_NOTE_OPTIONS
): string {
  return options.minimal
    ? renderMinimal(ann, imagePath)
    : renderRich(ann, imagePath);
}

function renderRich(ann: ZoteroAnnotation, imagePath?: string): string {
  const link = `[${t("noteOpenInZotero")}](${pdfLink(ann)})`;
  const calloutType = annotationCalloutType(ann.type);
  const header = `> [!${calloutType}] p. ${ann.pageLabel} · ${link}`;
  const sentinel = `<!-- zotero-annotation: ${ann.id} -->`;
  const lines: string[] = [sentinel, header];

  if (ann.type === "image" || ann.type === "ink") {
    const ref = imagePath ? `![[${imagePath}]]` : `*(open in Zotero)*`;
    lines.push(`> ${ref}`);
  } else if (ann.type === "note") {
    if (ann.comment) {
      ann.comment
        .trim()
        .split("\n")
        .forEach((l) => lines.push(`> ${l}`));
    }
  } else if (ann.text) {
    const textLines = ann.text
      .trim()
      .split("\n")
      .map((l) => `> ${l}`);
    lines.push(...textLines);
    if (ann.comment) {
      lines.push(`> `);
      ann.comment
        .trim()
        .split("\n")
        .forEach((l) => lines.push(`> *${l}*`));
    }
  }

  return lines.join("\n");
}

function renderMinimal(ann: ZoteroAnnotation, imagePath?: string): string {
  const link = `[${t("noteOpenInZotero")}](${pdfLink(ann)})`;
  const sentinel = `<!-- zotero-annotation: ${ann.id} -->`;
  const pageRef = `**p. ${ann.pageLabel}** · ${link}`;
  const lines: string[] = [sentinel, pageRef];

  if (ann.type === "image" || ann.type === "ink") {
    lines.push(imagePath ? `![[${imagePath}]]` : `*(open in Zotero)*`);
  } else if (ann.type === "note") {
    if (ann.comment) {
      ann.comment
        .trim()
        .split("\n")
        .forEach((l) => lines.push(l));
    }
  } else if (ann.text) {
    ann.text
      .trim()
      .split("\n")
      .forEach((l) => lines.push(`> ${l}`));
    if (ann.comment) {
      lines.push("");
      ann.comment
        .trim()
        .split("\n")
        .forEach((l) => lines.push(`*${l}*`));
    }
  }

  return lines.join("\n");
}

/** Maps annotation type to the Obsidian callout identifier (rich mode only). */
function annotationCalloutType(type: ZoteroAnnotation["type"]): string {
  switch (type) {
    case "highlight":
    case "underline":
      return "quote";
    case "note":
      return "note";
    case "image":
    case "ink":
      return "info";
  }
}

/**
 * A blank synthesis callout placed below each imported annotation (rich mode).
 * Returns null in minimal mode — callers should skip it entirely.
 *
 * Uses the custom `zoteasy-synthesis` callout type so CSS can target it
 * precisely without affecting any other `[!note]` callouts in the vault.
 * The `<!-- synthesis -->` marker tells the updater that everything inside
 * is user-authored and must never be touched.
 */
export function synthesisBlock(options: NoteOptions = DEFAULT_NOTE_OPTIONS): string | null {
  if (options.minimal) return null;
  return `> [!zoteasy-synthesis] ${t("noteYourThoughts")}\n> <!-- synthesis -->`;
}
