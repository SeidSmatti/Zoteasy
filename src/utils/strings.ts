import type { ZoteroAuthor } from "../zotero/types";

/** Characters that are invalid in filenames on Windows, macOS, or Linux. */
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|#^[\]]/g;

/**
 * Produces a safe filename from an arbitrary string.
 * Strips invalid characters, collapses whitespace, and caps length at 200 chars.
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(INVALID_FILENAME_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/**
 * Formats a single author as "Last, First" or just the single name for institutions.
 */
export function formatAuthor(author: ZoteroAuthor): string {
  if (author.name) return author.name;
  if (author.firstName) return `${author.lastName}, ${author.firstName}`;
  return author.lastName;
}

/**
 * Formats an author list for display (e.g. in the note header).
 * Three or more authors: "Smith, J.; Doe, J.; et al."
 */
export function formatAuthors(authors: ZoteroAuthor[], maxShown = 2): string {
  if (authors.length === 0) return "";
  const shown = authors.slice(0, maxShown).map(formatAuthor);
  if (authors.length > maxShown) {
    return shown.join("; ") + "; et al.";
  }
  return shown.join("; ");
}

/**
 * Escapes a string for safe embedding inside a YAML double-quoted scalar.
 * Handles backslashes, double quotes, and control characters.
 */
export function escapeYamlString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * Returns today's date as an ISO string (YYYY-MM-DD).
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Normalises a vault folder path: trims whitespace and removes trailing slashes
 * so that `${folder}/${filename}` never produces a double-slash path.
 */
export function normalizeFolderPath(path: string): string {
  return path.trim().replace(/\/+$/, "");
}
