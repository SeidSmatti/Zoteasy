/**
 * ZoteroClient — thin HTTP wrapper around the Zotero local REST API.
 *
 * All requests go to http://localhost:{port}/api/ only.
 * No external network calls are made.
 *
 * Authentication notes:
 * - The local API does NOT use API keys.
 * - The only requirement is the `zotero-allowed-request: 1` header, which
 *   bypasses Zotero's DNS-rebinding protection for non-browser clients.
 * - `/users/0/` always refers to the local user's personal library.
 */

import { requestUrl } from "obsidian";
import { join } from "path";
import {
  parseItems,
  parseItem,
  parseAnnotation,
  parseAttachments,
} from "./parser";
import type { ZoteroItem, ZoteroAnnotation, ZoteroAttachment } from "./types";
import { expandHome, getAnnotationKeysForAttachment } from "./sqlite";

export interface ZoteroClientConfig {
  port: number;
  /** Path to the Zotero data directory (containing zotero.sqlite). */
  dataDir: string;
}

export class ZoteroClient {
  private port: number;
  private baseUrl: string;
  private dataDir: string;

  constructor(config: ZoteroClientConfig) {
    this.port = config.port;
    this.dataDir = config.dataDir;
    this.baseUrl = `http://localhost:${this.port}/api`;
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  updateConfig(config: ZoteroClientConfig): void {
    this.port = config.port;
    this.dataDir = config.dataDir;
    this.baseUrl = `http://localhost:${this.port}/api`;
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  /**
   * Verifies that Zotero is running and the local API is reachable.
   * Throws a ZoteroConnectionError if the API cannot be reached.
   */
  async checkConnection(): Promise<number> {
    await this.get(`/users/0/items?limit=1&format=json`);
    return 0;
  }

  // ---------------------------------------------------------------------------
  // Library queries
  // ---------------------------------------------------------------------------

  /**
   * Searches the Zotero library for items matching `query`.
   * Returns up to `limit` results.
   *
   * Uses /items/top so the server applies `noChildren: true` — only top-level
   * items are returned, never notes, attachments, or annotation children.
   * (Using /items instead causes the server to re-add child notes/annotations
   * after the quicksearch runs, producing apparent "duplicate" results.)
   */
  async getItems(query: string, limit = 50): Promise<ZoteroItem[]> {
    const params = new URLSearchParams({
      q: query,
      format: "json",
      limit: String(limit),
    });
    const data = await this.get(`/users/0/items/top?${params.toString()}`);
    return parseItems(data);
  }

  /**
   * Fetches a single library item by its key.
   */
  async getItem(itemKey: string): Promise<ZoteroItem> {
    const data = await this.get(`/users/0/items/${itemKey}`);
    return parseItem(data);
  }

  /**
   * Returns all PDF attachments for a given library item.
   */
  async getAttachments(itemKey: string): Promise<ZoteroAttachment[]> {
    const data = await this.get(
      `/users/0/items/${itemKey}/children?format=json`
    );
    return parseAttachments(data);
  }

  /**
   * Returns all annotations across all PDF attachments of a library item.
   *
   * The Zotero local REST API never returns annotation items through any
   * search query — they are excluded at the database level. The only reliable
   * way to enumerate annotations is:
   *   1. Read annotation keys from the Zotero SQLite database directly.
   *   2. Fetch each annotation individually via GET /items/{key}.
   *
   * Attachment keys are collected from two sources:
   *   a. GET /children — works for regular papers with PDF attachment children.
   *   b. The item key itself — handles standalone PDF items (type "attachment").
   */
  async getAllAnnotationsForItem(itemKey: string): Promise<ZoteroAnnotation[]> {
    const attachmentKeys = new Set<string>();

    // Collect PDF attachment keys. For regular papers the children endpoint
    // returns attachment items; for standalone PDFs itemKey is itself the
    // attachment, so it is always added as a fallback.
    try {
      const attachments = await this.getAttachments(itemKey);
      for (const att of attachments) attachmentKeys.add(att.key);
    } catch {
      // getAttachments returns [] for standalone attachments; failure is safe
    }
    attachmentKeys.add(itemKey);

    // Resolve annotation keys from the Zotero SQLite database and fetch each
    // annotation individually — the local API search never returns annotation
    // items, so direct key-based fetches are the only reliable path.
    const annotationKeys = new Set<string>();
    const dbPath = join(expandHome(this.dataDir), "zotero.sqlite");

    for (const attKey of attachmentKeys) {
      try {
        const keys = getAnnotationKeysForAttachment(dbPath, attKey);
        for (const k of keys) annotationKeys.add(k);
      } catch {
        // SQLite read failure (wrong path, locked file) is non-fatal
      }
    }

    if (annotationKeys.size === 0) return [];

    const annotations: ZoteroAnnotation[] = [];
    for (const annKey of annotationKeys) {
      try {
        const data = await this.get(`/users/0/items/${annKey}`);
        const ann = parseAnnotation(data, itemKey);
        if (ann) annotations.push(ann);
      } catch {
        // Annotation may have been deleted since the database was read
      }
    }

    annotations.sort(compareAnnotations);
    return annotations;
  }

  /**
   * Downloads the PNG image for an image-type annotation.
   * Endpoint: GET /api/users/0/items/{annotationKey}/image
   */
  async downloadAnnotationImage(annotationKey: string): Promise<ArrayBuffer> {
    return this.getBinary(`/users/0/items/${annotationKey}/image`);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async get(path: string): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    try {
      const response = await requestUrl({
        url,
        method: "GET",
        // zotero-allowed-request bypasses the local API's DNS-rebinding protection.
        // No API key is needed or accepted by the local API.
        headers: { "zotero-allowed-request": "1" },
      });
      return response.json as unknown;
    } catch (err) {
      throw mapRequestError(err);
    }
  }

  private async getBinary(path: string): Promise<ArrayBuffer> {
    const url = `${this.baseUrl}${path}`;
    try {
      const response = await requestUrl({
        url,
        method: "GET",
        headers: { "zotero-allowed-request": "1" },
      });
      return response.arrayBuffer;
    } catch (err) {
      throw mapRequestError(err);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sorts annotations in reading order: page first, then Zotero's sort index. */
function compareAnnotations(
  a: { pageIndex: number; sortIndex: string },
  b: { pageIndex: number; sortIndex: string }
): number {
  if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
  // sortIndex is a zero-padded "page|y|x" string — lexicographic order is correct
  return a.sortIndex.localeCompare(b.sortIndex);
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ZoteroConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZoteroConnectionError";
  }
}

/**
 * Maps a raw requestUrl error into a descriptive ZoteroConnectionError.
 *
 * Obsidian's requestUrl throws a RequestUrlError (which has a `status`
 * property) for HTTP error responses (4xx/5xx), and a plain Error for
 * network-level failures (no connection, ECONNREFUSED, etc.).
 */
function mapRequestError(err: unknown): Error {
  // HTTP error — Obsidian's RequestUrlError carries a numeric `status`
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: number }).status;
    if (status === 401 || status === 403) {
      return new ZoteroConnectionError(
        "Zotero rejected the request (HTTP " + status + "). " +
          "Make sure the local API is enabled in Zotero Preferences → Advanced."
      );
    }
    if (status === 404) {
      return new ZoteroConnectionError(
        "The requested Zotero item was not found (HTTP 404)."
      );
    }
    if (status >= 500) {
      return new ZoteroConnectionError(
        `Zotero returned a server error (HTTP ${status}). Try restarting Zotero.`
      );
    }
  }

  // Network-level failure — Zotero is not running or the local API is disabled
  if (err instanceof Error && isNetworkFailure(err.message)) {
    return new ZoteroConnectionError(
      "Cannot reach Zotero. Make sure Zotero is running and the local API is " +
        "enabled (Preferences → Advanced → Allow other applications to communicate with Zotero)."
    );
  }

  return err instanceof Error ? err : new Error(String(err));
}

function isNetworkFailure(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("net::err") ||
    lower.includes("econnrefused") ||
    lower.includes("failed to fetch") ||
    lower.includes("network error") ||
    lower.includes("networkerror")
  );
}
