/**
 * Normalizes raw Zotero API JSON into typed domain objects.
 * All `unknown` deserialization happens here; nothing leaves this file as `any`.
 */

import type {
  ZoteroItem,
  ZoteroAuthor,
  ZoteroAnnotation,
  ZoteroAttachment,
  AnnotationType,
} from "./types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

/**
 * Extracts the first four-digit year from a date string.
 * Handles "2020", "2020-03-01", "March 2020", etc.
 */
function extractYear(date: unknown): string {
  const s = str(date);
  const match = s.match(/\b(1[0-9]{3}|2[0-9]{3})\b/);
  return match ? match[1] : "";
}

function parseAuthors(creators: unknown): ZoteroAuthor[] {
  if (!Array.isArray(creators)) return [];
  const authors: ZoteroAuthor[] = [];
  for (const c of creators) {
    if (typeof c !== "object" || c === null) continue;
    const obj = c as Record<string, unknown>;
    const type = str(obj["creatorType"]);
    // Include authors and editors; skip translators, illustrators, etc.
    if (type !== "author" && type !== "editor") continue;
    if (str(obj["name"])) {
      authors.push({ firstName: "", lastName: "", name: str(obj["name"]) });
    } else {
      authors.push({
        firstName: str(obj["firstName"]),
        lastName: str(obj["lastName"]),
      });
    }
  }
  return authors;
}

function parseTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) => {
      if (typeof t === "object" && t !== null) {
        return str((t as Record<string, unknown>)["tag"]);
      }
      return "";
    })
    .filter(Boolean);
}

/**
 * Generates a simple "authorYEAR" citekey when Better BibTeX is unavailable.
 * For non-Latin names the last-name component may be empty; in that case the
 * raw (un-latinised) last name is used verbatim to avoid silent collisions.
 */
function generateCitekey(authors: ZoteroAuthor[], year: string): string {
  const first = authors[0];
  if (!first) return `unknown${year}`;
  const raw = first.name ?? first.lastName;
  const latin = raw.toLowerCase().replace(/[^a-z]/g, "");
  // Fall back to the raw name (lowercased, spaces removed) if the latin
  // stripping would produce an empty string (e.g. Chinese/Arabic names).
  const base = latin || raw.toLowerCase().replace(/\s+/g, "");
  return `${base}${year}`;
}

/**
 * Extracts a Better BibTeX citekey from the Zotero `extra` field.
 * BBT writes a line of the form "Citation Key: darwin1859" into `extra`.
 */
function extractBbtCitekey(extra: unknown): string {
  const text = str(extra);
  const match = text.match(/^Citation Key:\s*(\S+)/im);
  return match ? match[1] : "";
}

// ---------------------------------------------------------------------------
// Public parsers
// ---------------------------------------------------------------------------

/**
 * Parses a single raw Zotero item response object into a ZoteroItem.
 * Accepts the full response envelope (with `.data`) or just the data payload.
 */
export function parseItem(raw: unknown): ZoteroItem {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("parseItem: expected an object");
  }
  const envelope = raw as Record<string, unknown>;
  // The API wraps the payload under `.data`; fall back to the object itself.
  const data =
    typeof envelope["data"] === "object" && envelope["data"] !== null
      ? (envelope["data"] as Record<string, unknown>)
      : envelope;

  const key = str(envelope["key"] ?? data["key"]);
  const authors = parseAuthors(data["creators"]);
  const year = extractYear(data["date"]);

  const bbtCitekey = extractBbtCitekey(data["extra"]);

  return {
    itemKey: key,
    itemType: str(data["itemType"]),
    title: str(data["title"]),
    authors,
    year,
    journal: str(data["publicationTitle"] ?? data["journalAbbreviation"] ?? ""),
    publisher: str(data["publisher"] ?? ""),
    doi: str(data["DOI"] ?? ""),
    url: str(data["url"] ?? ""),
    isbn: str(data["ISBN"] ?? ""),
    abstract: str(data["abstractNote"] ?? ""),
    tags: parseTags(data["tags"]),
    citekey: bbtCitekey || generateCitekey(authors, year),
    collections: Array.isArray(data["collections"])
      ? (data["collections"] as unknown[]).map(str)
      : [],
  };
}

/** Parses an array of raw item objects, skipping unparseable entries. */
export function parseItems(raw: unknown): ZoteroItem[] {
  if (!Array.isArray(raw)) return [];
  const results: ZoteroItem[] = [];
  // The local API can return the same item multiple times when it belongs to
  // multiple collections. Deduplicate by itemKey so the search modal is clean.
  const seen = new Set<string>();
  for (const entry of raw) {
    try {
      const item = parseItem(entry);
      if (seen.has(item.itemKey)) continue;
      seen.add(item.itemKey);
      results.push(item);
    } catch {
      // Skip malformed entries silently; the rest of the list is still valid.
    }
  }
  return results;
}

/**
 * Parses a single raw annotation item into a ZoteroAnnotation.
 *
 * @param raw                   - Raw response envelope from the local API
 * @param parentKey             - Key of the top-level library item
 * @param attachmentKeyFallback - Fallback attachment key if `parentItem` is absent
 */
export function parseAnnotation(
  raw: unknown,
  parentKey: string,
  attachmentKeyFallback = ""
): ZoteroAnnotation | null {
  if (typeof raw !== "object" || raw === null) return null;
  const envelope = raw as Record<string, unknown>;
  const data =
    typeof envelope["data"] === "object" && envelope["data"] !== null
      ? (envelope["data"] as Record<string, unknown>)
      : envelope;

  if (str(data["itemType"]) !== "annotation") return null;

  const rawType = str(data["annotationType"]);
  const validTypes: AnnotationType[] = [
    "highlight",
    "note",
    "image",
    "underline",
    "ink",
  ];
  const type: AnnotationType = validTypes.includes(rawType as AnnotationType)
    ? (rawType as AnnotationType)
    : "highlight";

  const id = str(envelope["key"] ?? data["key"]);
  // An annotation without a key cannot be tracked by the deduplication system;
  // importing it would cause it to be duplicated on every re-import.
  if (!id) return null;

  // annotationPosition is a JSON string; extract pageIndex from it.
  let pageIndex = 0;
  try {
    const pos = JSON.parse(str(data["annotationPosition"])) as Record<
      string,
      unknown
    >;
    pageIndex = num(pos["pageIndex"]);
  } catch {
    // Leave pageIndex as 0 if position is malformed.
  }

  // The annotation's parentItem field is the key of the PDF attachment it
  // belongs to — used for constructing zotero://open-pdf deep links.
  const attachmentKey = str(data["parentItem"] ?? attachmentKeyFallback);

  return {
    id,
    type,
    text: str(data["annotationText"] ?? ""),
    comment: str(data["annotationComment"] ?? ""),
    color: str(data["annotationColor"] ?? "#ffd400"),
    pageLabel: str(data["annotationPageLabel"] ?? String(pageIndex + 1)),
    pageIndex,
    sortIndex: str(data["annotationSortIndex"] ?? ""),
    attachmentKey,
    parentKey,
  };
}

/** Parses children of a library item, returning only PDF attachments. */
export function parseAttachments(raw: unknown): ZoteroAttachment[] {
  if (!Array.isArray(raw)) return [];
  const results: ZoteroAttachment[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const envelope = entry as Record<string, unknown>;
    const data =
      typeof envelope["data"] === "object" && envelope["data"] !== null
        ? (envelope["data"] as Record<string, unknown>)
        : envelope;

    if (str(data["itemType"]) !== "attachment") continue;

    const contentType = str(data["contentType"]);
    const title = str(data["title"] ?? "");

    // The local API often omits contentType entirely. Accept any attachment
    // where the contentType is PDF, explicitly empty (local API), or the
    // filename ends with .pdf. Non-PDF attachments return no annotation
    // children — the empty result is harmless.
    const isPdf =
      contentType === "application/pdf" ||
      contentType === "" ||
      title.toLowerCase().endsWith(".pdf");
    if (!isPdf) continue;

    results.push({
      key: str(envelope["key"] ?? data["key"]),
      title,
      contentType,
      path: str(data["path"] ?? ""),
    });
  }
  return results;
}
