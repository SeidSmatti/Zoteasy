// Typed representations of Zotero data after parsing from raw API responses.
// Raw API responses must never leave zotero/parser.ts as plain objects.

export type AnnotationType = "highlight" | "note" | "image" | "underline" | "ink";

export interface ZoteroAuthor {
  firstName: string;
  lastName: string;
  /** For single-name entities (institutions, etc.) */
  name?: string;
}

export interface ZoteroItem {
  itemKey: string;
  itemType: string;
  title: string;
  authors: ZoteroAuthor[];
  /** Four-digit year extracted from the date field */
  year: string;
  journal: string;
  publisher: string;
  doi: string;
  url: string;
  isbn: string;
  abstract: string;
  tags: string[];
  /**
   * Citekey from Better BibTeX if available, otherwise a generated fallback
   * in the form "authorYEAR" (e.g. "darwin1859").
   */
  citekey: string;
  collections: string[];
}

export interface ZoteroAnnotation {
  /** Annotation item key */
  id: string;
  type: AnnotationType;
  /** Highlighted/underlined text (empty for image/ink annotations) */
  text: string;
  /** User's comment on the annotation */
  comment: string;
  /** Hex color string, e.g. "#ffd400" */
  color: string;
  /** Human-readable page label as displayed in the PDF viewer */
  pageLabel: string;
  /** 0-indexed page index within the PDF file (used for deep links) */
  pageIndex: number;
  /**
   * Zotero sort index string (e.g. "00002|001130|00347") used as a
   * tiebreaker when multiple annotations share the same pageIndex.
   * Encodes page/y/x in zero-padded fields; sorts lexicographically.
   */
  sortIndex: string;
  /** Key of the parent PDF attachment item */
  attachmentKey: string;
  /** Key of the top-level library item this annotation belongs to */
  parentKey: string;
}

export interface ZoteroAttachment {
  key: string;
  title: string;
  contentType: string;
  /** Vault-relative or absolute path to the file, if locally present */
  path: string;
}
