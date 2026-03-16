/**
 * Minimal read-only SQLite B-tree reader for extracting Zotero annotation keys.
 *
 * Only implements what is needed: reading the `items` and `itemAnnotations`
 * tables to find annotation keys for a given PDF attachment.
 *
 * References: https://www.sqlite.org/fileformat2.html
 */

import { openSync, readSync, closeSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function u16(buf: Buffer, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

function u32(buf: Buffer, off: number): number {
  return (
    (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0)
  );
}

/** Reads a SQLite variable-length integer. Returns [value, bytesConsumed]. */
function readVarint(buf: Buffer, off: number): [number, number] {
  let result = 0;
  for (let i = 0; i < 9; i++) {
    if (off + i >= buf.length) return [result, i];
    const byte = buf[off + i];
    if (i === 8) {
      return [result * 256 + byte, 9];
    }
    result = result * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return [result, i + 1];
  }
  return [result, 9];
}

type SqlValue = string | number | null;

/** Reads a single column value given its serial type code. */
function readSqlValue(
  buf: Buffer,
  off: number,
  typeCode: number,
  available: number
): [SqlValue, number] {
  switch (typeCode) {
    case 0:
      return [null, 0];
    case 1: {
      const v = buf[off] ?? 0;
      return [v > 127 ? v - 256 : v, 1];
    }
    case 2: {
      const v = u16(buf, off);
      return [v > 32767 ? v - 65536 : v, 2];
    }
    case 3: {
      const v = (buf[off] << 16) | (buf[off + 1] << 8) | buf[off + 2];
      return [v > 8388607 ? v - 16777216 : v, 3];
    }
    case 4: {
      const v =
        (buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3];
      return [v, 4];
    }
    case 5: {
      const hi = (buf[off] << 8) | buf[off + 1];
      const lo = u32(buf, off + 2);
      const hiS = hi > 32767 ? hi - 65536 : hi;
      return [hiS * 4294967296 + lo, 6];
    }
    case 6: {
      const hi =
        (buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3];
      const lo = u32(buf, off + 4);
      return [hi * 4294967296 + lo, 8];
    }
    case 7:
      return [0, 8]; // float — not needed
    case 8:
      return [0, 0];
    case 9:
      return [1, 0];
    default: {
      if (typeCode >= 12 && typeCode % 2 === 0) {
        const size = (typeCode - 12) / 2;
        return [null, Math.min(size, available)];
      }
      if (typeCode >= 13 && typeCode % 2 === 1) {
        const size = (typeCode - 13) / 2;
        const readSize = Math.min(size, available, buf.length - off);
        try {
          return [buf.toString("utf8", off, off + readSize), size];
        } catch {
          return [null, size];
        }
      }
      return [null, 0];
    }
  }
}

/** Parses a SQLite record from the local (in-page) payload portion. */
function parseRecord(
  buf: Buffer,
  start: number,
  available: number,
  maxCols: number
): SqlValue[] {
  if (start >= buf.length || available <= 0) return [];

  let pos = start;
  const [headerSize, hs] = readVarint(buf, pos);
  if (headerSize <= 0 || headerSize > available) return [];
  pos += hs;

  const headerEnd = start + headerSize;
  const types: number[] = [];

  while (pos < headerEnd && pos < buf.length && types.length < maxCols) {
    const [typeCode, ts] = readVarint(buf, pos);
    if (ts === 0) break;
    types.push(typeCode);
    pos += ts;
  }

  let bodyPos = start + headerSize;
  const cols: SqlValue[] = [];

  for (let i = 0; i < types.length; i++) {
    if (bodyPos >= buf.length || bodyPos >= start + available) break;
    const remaining = Math.min(available - (bodyPos - start), buf.length - bodyPos);
    const [val, size] = readSqlValue(buf, bodyPos, types[i], remaining);
    cols.push(val);
    bodyPos += size;
  }

  return cols;
}

// ---------------------------------------------------------------------------
// B-tree reader
// ---------------------------------------------------------------------------

interface RowData {
  rowid: number;
  cols: SqlValue[];
}

class SqliteReader {
  private fd: number;
  readonly pageSize: number;

  constructor(dbPath: string) {
    this.fd = openSync(dbPath, "r");
    try {
      // Read the 100-byte database header from page 1
      const hdr = Buffer.alloc(100);
      readSync(this.fd, hdr, 0, 100, 0);

      const magic = hdr.toString("utf8", 0, 16);
      if (!magic.startsWith("SQLite format 3")) {
        throw new Error("Not a SQLite 3 database");
      }

      const ps = u16(hdr, 16);
      this.pageSize = ps === 1 ? 65536 : ps;
    } catch (err) {
      closeSync(this.fd);
      throw err;
    }
  }

  close(): void {
    closeSync(this.fd);
  }

  private readPage(pageNum: number): Buffer {
    const buf = Buffer.alloc(this.pageSize);
    const offset = (pageNum - 1) * this.pageSize;
    readSync(this.fd, buf, 0, this.pageSize, offset);
    return buf;
  }

  readTable(rootPageNum: number, maxCols: number): RowData[] {
    const rows: RowData[] = [];
    this.traverseTable(rootPageNum, rows, maxCols, new Set<number>());
    return rows;
  }

  private traverseTable(
    pageNum: number,
    rows: RowData[],
    maxCols: number,
    visited: Set<number>
  ): void {
    if (visited.has(pageNum)) return;
    visited.add(pageNum);

    const page = this.readPage(pageNum);
    // Page 1 has a 100-byte database header before the B-tree header
    const hdrOff = pageNum === 1 ? 100 : 0;
    if (hdrOff >= page.length) return;

    const pageType = page[hdrOff];

    if (pageType === 13) {
      this.readLeafTablePage(page, hdrOff, rows, maxCols);
    } else if (pageType === 5) {
      this.readInteriorTablePage(page, hdrOff, rows, maxCols, visited);
    }
  }

  private readInteriorTablePage(
    page: Buffer,
    hdrOff: number,
    rows: RowData[],
    maxCols: number,
    visited: Set<number>
  ): void {
    const numCells = u16(page, hdrOff + 3);
    const rightmost = u32(page, hdrOff + 8);
    const cellPtrBase = hdrOff + 12;

    for (let i = 0; i < numCells; i++) {
      if (cellPtrBase + i * 2 + 1 >= page.length) break;
      const cellOff = u16(page, cellPtrBase + i * 2);
      if (cellOff + 3 >= page.length) continue;
      const leftChild = u32(page, cellOff);
      if (leftChild > 0) {
        try {
          this.traverseTable(leftChild, rows, maxCols, visited);
        } catch {
          // Corrupted child page — continue with remaining subtrees
        }
      }
    }
    if (rightmost > 0) {
      try {
        this.traverseTable(rightmost, rows, maxCols, visited);
      } catch {
        // Corrupted rightmost child — remaining rows already collected
      }
    }
  }

  private readLeafTablePage(
    page: Buffer,
    hdrOff: number,
    rows: RowData[],
    maxCols: number
  ): void {
    const numCells = u16(page, hdrOff + 3);
    const cellPtrBase = hdrOff + 8;
    const U = this.pageSize;
    const X = U - 35; // max in-page payload for leaf table

    for (let i = 0; i < numCells; i++) {
      if (cellPtrBase + i * 2 + 1 >= page.length) break;
      const cellOff = u16(page, cellPtrBase + i * 2);
      if (cellOff >= page.length) continue;

      try {
        let pos = cellOff;

        const [payloadSize, ps] = readVarint(page, pos);
        pos += ps;
        const [rowid, rs] = readVarint(page, pos);
        pos += rs;

        // Compute local (in-page) payload size
        let localPayload: number;
        if (payloadSize <= X) {
          localPayload = payloadSize;
        } else {
          // Overflow: first K bytes are in-page, remaining in overflow pages
          const M = Math.floor(((U - 12) * 32) / 255) - 23;
          const K = Math.min(X, M + ((payloadSize - M) % (U - 4)));
          localPayload = K;
        }

        const available = Math.min(localPayload, page.length - pos);
        if (available <= 0) continue;

        const cols = parseRecord(page, pos, available, maxCols);
        rows.push({ rowid, cols });
      } catch {
        // Malformed cell — skip and continue with remaining cells on this page
      }
    }
  }

  /**
   * Finds the root page number for a table from sqlite_master.
   * sqlite_master schema: type(0), name(1), tbl_name(2), rootpage(3), sql(4)
   */
  findTableRootPage(tableName: string): number {
    // sqlite_master lives on page 1; read first 4 cols only
    const rows = this.readTable(1, 4);
    for (const row of rows) {
      if (row.cols[0] === "table" && row.cols[1] === tableName) {
        const rp = row.cols[3];
        if (typeof rp === "number" && rp > 0) return rp;
      }
    }
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Expands a leading `~/` to the user's home directory. */
export function expandHome(p: string): string {
  if (p === "~" || p.startsWith("~/")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

/** Returns the default Zotero data directory path. */
export function defaultZoteroDataDir(): string {
  return join(homedir(), "Zotero");
}

/**
 * Returns annotation item keys for a given PDF attachment key.
 *
 * Reads the Zotero SQLite database directly (read-only). Zotero runs in WAL
 * mode, so concurrent reads while Zotero is running are safe.
 *
 * Zotero DB schema (relevant tables):
 *   items(itemID PK, itemTypeID, dateAdded, dateModified, clientDateModified, libraryID, key, ...)
 *   itemAnnotations(itemID PK, parentItemID, type, ...)
 *
 * IMPORTANT: In SQLite, INTEGER PRIMARY KEY columns (rowid aliases) ARE stored
 * in the record as a null placeholder (type code 0) at position 0. So the
 * declared column order maps directly to record column indices, including col 0.
 *
 * For `items`:     col 0=itemID(null), col 1=itemTypeID, ..., col 6=key
 * For `itemAnnotations`: col 0=itemID(null), col 1=parentItemID
 */
export function getAnnotationKeysForAttachment(
  dbPath: string,
  attachmentKey: string
): string[] {
  const reader = new SqliteReader(dbPath);
  try {
    const itemsRoot = reader.findTableRootPage("items");
    const annotationsRoot = reader.findTableRootPage("itemAnnotations");
    if (!itemsRoot || !annotationsRoot) return [];

    // items record: [0]=itemID(null), [1]=itemTypeID, [2]=dateAdded,
    //   [3]=dateModified, [4]=clientDateModified, [5]=libraryID, [6]=key
    const itemRows = reader.readTable(itemsRoot, 7);
    const keyToId = new Map<string, number>();
    const idToKey = new Map<number, string>();
    for (const row of itemRows) {
      const key = row.cols[6];
      if (typeof key === "string" && key.length > 0) {
        keyToId.set(key, row.rowid);
        idToKey.set(row.rowid, key);
      }
    }

    const attachmentId = keyToId.get(attachmentKey);
    if (attachmentId === undefined) return [];

    // itemAnnotations record: [0]=itemID(null), [1]=parentItemID, [2]=type, ...
    const annRows = reader.readTable(annotationsRoot, 2);
    const keys: string[] = [];
    for (const row of annRows) {
      if (row.cols[1] === attachmentId) {
        const k = idToKey.get(row.rowid);
        if (k) keys.push(k);
      }
    }
    return keys;
  } finally {
    reader.close();
  }
}
