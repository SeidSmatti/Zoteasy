/**
 * Assembles a complete literature note string from a ZoteroItem and its annotations.
 * All content decisions live here; the formatter handles the individual pieces.
 */

import type { ZoteroItem, ZoteroAnnotation } from "../zotero/types";
import {
  toFrontmatter,
  toHeader,
  annotationToCallout,
  synthesisBlock,
  DEFAULT_NOTE_OPTIONS,
} from "./formatter";
import type { NoteOptions } from "./formatter";
import { t } from "../i18n";

/**
 * Generates a full literature note.
 *
 * @param item        - The Zotero library item (metadata source)
 * @param annotations - Annotations to embed; pass `[]` for a metadata-only note
 * @param imagePaths  - Map of annotation ID → vault filename for image annotations
 * @returns           - Complete markdown string ready to write to the vault
 */
export function generateNote(
  item: ZoteroItem,
  annotations: ZoteroAnnotation[] = [],
  imagePaths: Map<string, string> = new Map(),
  options: NoteOptions = DEFAULT_NOTE_OPTIONS
): string {
  const sections: string[] = [];

  sections.push(toFrontmatter(item));
  sections.push("");
  sections.push(toHeader(item, options));
  sections.push("---");
  sections.push("");
  sections.push(t("noteAnnotationsSection"));
  sections.push("");

  if (annotations.length === 0) {
    sections.push(t("noteNoAnnotations"));
  } else {
    for (const ann of annotations) {
      sections.push(annotationToCallout(ann, imagePaths.get(ann.id), options));
      sections.push("");
      const synthesis = synthesisBlock(options);
      if (synthesis !== null) {
        sections.push(synthesis);
        sections.push("");
      }
    }
  }

  return sections.join("\n");
}
