# Zoteasy

Seamless Zotero integration for Obsidian. Import literature notes with metadata, abstracts, and annotations directly from your Zotero library — no templating language, no configuration beyond pointing to your Zotero data directory.

## Requirements

- [Zotero](https://www.zotero.org/) 6 or later, running on the same machine as Obsidian
- Zotero's local API enabled (see setup below)
- Obsidian 1.4.0 or later

## Setup

### 1. Enable Zotero's local API

In Zotero: **Edit → Preferences → Advanced → Allow other applications to communicate with Zotero**

Make sure this checkbox is on. Zotero's local API then listens on `http://localhost:23119`.

No API key or zotero.org account is required — the local API is key-free.

### 2. Configure the plugin

In Obsidian: **Settings → Zoteasy**

- Click **Test** to verify the connection
- Optionally change the output folder (default: `Literature Notes`) and attachments folder (default: `Attachments/Zotero`)
- Change the port only if you run Zotero on a non-default port
- If your Zotero data directory is not `~/Zotero`, update the **Zotero data directory** path accordingly

## Usage

### Import a literature note

**Command palette:** `Zoteasy: Import literature note from Zotero` · `Mod+Shift+I`

Opens a search modal over your Zotero library. Type to filter by title, author, or year. Press **Enter** on a result to:

1. Create a new literature note in your configured output folder, or
2. Update an existing note — appending any new annotations without touching your personal writing

### Insert an inline citation

**Command palette:** `Zoteasy: Insert Zotero citation at cursor` · `Mod+Shift+Z`

Opens the same search modal. Selecting a result inserts `[@citekey]` at the cursor in the active note. Only available when a note is open for editing.

### Sync all notes

**Command palette:** `Zoteasy: Sync all Zotero notes` · `Mod+Shift+U`

Scans every file in your output folder and appends any new annotations found in Zotero since the last import. Non-destructive — your existing writing is never touched.

## Note format

Each imported note contains:

- **YAML frontmatter** — title, authors, year, journal, DOI, tags, citekey, Zotero item key, import date
- **Header** — human-readable metadata line and the abstract
- **Annotations section** — one block per highlight/note/image

Two formatting modes are available in **Settings → Zoteasy → Minimal formatting**:

### Rich format (default)

Each annotation is a typed callout followed by an empty synthesis callout for your personal notes:

```markdown
<!-- zotero-annotation: ABCD1234 -->
> [!quote] p. 32 · [Open in Zotero](zotero://open-pdf/...)
> "The highlighted passage from the PDF"

> [!zoteasy-synthesis] Your thoughts
> <!-- synthesis -->
```

### Minimal format

Plain blockquotes only — no callout syntax, no synthesis blocks. Better suited if you prefer to write freely around the annotations:

```markdown
<!-- zotero-annotation: ABCD1234 -->
**p. 32** · [Open in Zotero](zotero://open-pdf/...)
> "The highlighted passage from the PDF"

*Your comment if any*
```

On re-import, Zoteasy only appends new annotations — it never modifies anything you have written.

## Re-importing a note

Run **Import literature note** and select the same item again. Zoteasy will:

- Fetch the latest annotations from Zotero
- Identify which ones are already in the note
- Append only the new ones at the end of the Annotations section
- Leave all your personal writing untouched

## Annotation types

| Zotero type | Obsidian callout |
|---|---|
| Highlight | `[!quote]` |
| Underline | `[!quote]` |
| Standalone note | `[!note]` |
| Image area | `[!info]` with embedded PNG |
| Ink / drawing | `[!info]` |

Image annotations are downloaded and saved to your configured attachments folder as `zotero-{id}.png`.

## Troubleshooting

**"Cannot reach Zotero"** — Zotero is not running, or the local API is not enabled. See step 1 of setup.

**No annotations appear** — Check that the **Zotero data directory** setting points to the folder containing `zotero.sqlite` (default `~/Zotero`). The PDF must have annotations made with Zotero's built-in reader — annotations from external PDF apps are not stored in the Zotero database.

**Annotations are present in Zotero but missing from the note** — Run **Sync all Zotero notes** (`Mod+Shift+U`) to pick up any annotations added since the last import.

## License

[GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html)
