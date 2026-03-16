/**
 * Non-destructive note updater.
 *
 * Invariants:
 *  - Only lines inside Zotero-owned annotation blocks are ever written by this module.
 *  - User content (synthesis blocks and anything else in the note) is never modified.
 *  - The operation is idempotent: re-importing the same set of annotations is a no-op.
 */

import type { ZoteroAnnotation } from "../zotero/types";
import {
  annotationToCallout,
  synthesisBlock,
  DEFAULT_NOTE_OPTIONS,
} from "./formatter";
import type { NoteOptions } from "./formatter";
import { t } from "../i18n";

export interface UpdateResult {
  content: string;
  /** Number of annotation blocks actually appended (0 means nothing changed) */
  newCount: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scans note content for annotation-ID sentinels and returns the set of IDs
 * that have already been imported.
 */
export function extractImportedIds(content: string): Set<string> {
  const ids = new Set<string>();
  const re = /<!-- zotero-annotation: ([^\s>]+) -->/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    ids.add(match[1]);
  }
  return ids;
}

/**
 * Appends new annotation+synthesis blocks to an existing note.
 *
 * @param existingContent - Full current content of the note file
 * @param newAnnotations  - Only annotations NOT already present in the note
 * @param imagePaths      - Map of annotationId → vault filename for image annotations
 */
export function updateNote(
  existingContent: string,
  newAnnotations: ZoteroAnnotation[],
  imagePaths: Map<string, string> = new Map(),
  options: NoteOptions = DEFAULT_NOTE_OPTIONS
): UpdateResult {
  if (newAnnotations.length === 0) {
    return { content: existingContent, newCount: 0 };
  }

  // Build the new lines to insert
  const newLines: string[] = [];
  for (const ann of newAnnotations) {
    newLines.push(annotationToCallout(ann, imagePaths.get(ann.id), options));
    newLines.push("");
    const synthesis = synthesisBlock(options);
    if (synthesis !== null) {
      newLines.push(synthesis);
      newLines.push("");
    }
  }

  const lines = existingContent.split("\n");

  // Find the "## Annotations" section header (matches English and French)
  const sectionStart = lines.findIndex((l) => /^## Annotations\s*$/.test(l.trim()));

  if (sectionStart === -1) {
    // No annotations section — append one at the end of the file
    const appended =
      existingContent.trimEnd() +
      "\n\n---\n\n## Annotations\n\n" +
      newLines.join("\n");
    return { content: appended, newCount: newAnnotations.length };
  }

  // Find the section's end boundary: the next heading at any level, or EOF
  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (/^#{1,6} /.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }

  const sectionLines = lines.slice(sectionStart + 1, sectionEnd);
  const hasPlaceholder = sectionLines.some((l) =>
    /^\*No annotations imported yet\.\*$|^\*Aucune annotation importée pour le moment\.\*$/.test(
      l.trim()
    )
  );

  let result: string[];

  if (hasPlaceholder) {
    // Replace the placeholder: discard the entire section body and write fresh
    const before = lines.slice(0, sectionStart + 1); // includes "## Annotations"
    const after = lines.slice(sectionEnd);
    result = [...before, "", ...newLines, ...after];
  } else {
    // Append after the last non-empty line inside the section
    let insertAfter = sectionStart;
    for (let i = sectionEnd - 1; i > sectionStart; i--) {
      if (lines[i].trim() !== "") {
        insertAfter = i;
        break;
      }
    }

    const before = lines.slice(0, insertAfter + 1);
    const after = lines.slice(sectionEnd);
    result = [...before, "", ...newLines, ...after];
  }

  return {
    content: result.join("\n"),
    newCount: newAnnotations.length,
  };
}
