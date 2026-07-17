import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  blobToDataUrl,
  deleteAttachment,
  getAttachment,
  getAttachmentDataUrl,
  purgeOrphans,
  putAttachment,
  type AttachmentRecord,
} from "@dashboard/lib/attachment-store";

// ---------------------------------------------------------------------------
// Minimal in-memory IndexedDB fake — just enough surface for the store:
// open/onupgradeneeded, objectStore put/get/delete/openCursor, tx lifecycle.
// ---------------------------------------------------------------------------

type Handler = (() => void) | null;

class FakeRequest<T = unknown> {
  onsuccess: Handler = null;
  onerror: Handler = null;
  result!: T;
  error: Error | null = null;
}

class FakeTransaction {
  oncomplete: Handler = null;
  onerror: Handler = null;
  onabort: Handler = null;
  error: Error | null = null;
  private pending = 0;

  constructor(private records: Map<string, AttachmentRecord>) {}

  objectStore(_name: string) {
    return new FakeObjectStore(this.records, this);
  }

  track(): () => void {
    this.pending += 1;
    return () => {
      this.pending -= 1;
      if (this.pending === 0) {
        setTimeout(() => this.oncomplete?.(), 0);
      }
    };
  }
}

class FakeObjectStore {
  constructor(
    private records: Map<string, AttachmentRecord>,
    private tx: FakeTransaction,
  ) {}

  private fire<T>(fn: () => T): FakeRequest<T> {
    const req = new FakeRequest<T>();
    const done = this.tx.track();
    setTimeout(() => {
      req.result = fn();
      req.onsuccess?.();
      done();
    }, 0);
    return req;
  }

  put(record: AttachmentRecord) {
    return this.fire(() => {
      this.records.set(record.id, record);
      return record.id;
    });
  }

  get(id: string) {
    return this.fire(() => this.records.get(id));
  }

  delete(id: string) {
    return this.fire(() => {
      this.records.delete(id);
      return undefined;
    });
  }

  openCursor() {
    const req = new FakeRequest<{
      value: AttachmentRecord;
      delete: () => void;
      continue: () => void;
    } | null>();
    const done = this.tx.track();
    const ids = [...this.records.keys()];
    let i = 0;
    const step = () => {
      setTimeout(() => {
        if (i >= ids.length) {
          req.result = null;
          req.onsuccess?.();
          done();
          return;
        }
        const id = ids[i]!;
        req.result = {
          value: this.records.get(id)!,
          delete: () => {
            this.records.delete(id);
          },
          continue: () => {
            i += 1;
            step();
          },
        };
        req.onsuccess?.();
      }, 0);
    };
    step();
    return req;
  }
}

class FakeDatabase {
  objectStoreNames = {
    contains: () => this.hasStore,
  };
  private hasStore = false;

  constructor(public records: Map<string, AttachmentRecord>) {}

  createObjectStore(_name: string, _opts: unknown) {
    this.hasStore = true;
    return {};
  }

  transaction(_store: string, _mode: string) {
    return new FakeTransaction(this.records);
  }

  close() {}
}

class FakeFileReader {
  onload: Handler = null;
  onerror: Handler = null;
  result: string | null = null;
  error: Error | null = null;

  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((buf) => {
      const base64 = Buffer.from(buf).toString("base64");
      this.result = `data:${blob.type};base64,${base64}`;
      this.onload?.();
    });
  }
}

let records: Map<string, AttachmentRecord>;

function installFakeIdb() {
  records = new Map();
  const fakeIndexedDb = {
    open: (_name: string, _version: number) => {
      const req = new FakeRequest<FakeDatabase>();
      const db = new FakeDatabase(records);
      setTimeout(() => {
        req.result = db;
        (req as unknown as { onupgradeneeded: Handler }).onupgradeneeded?.();
        req.onsuccess?.();
      }, 0);
      return req;
    },
  };
  vi.stubGlobal("window", {});
  vi.stubGlobal("indexedDB", fakeIndexedDb);
  vi.stubGlobal("FileReader", FakeFileReader);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("attachment store (browser)", () => {
  beforeEach(() => {
    installFakeIdb();
  });

  it("puts an attachment and returns a metadata ref without the blob", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const ref = await putAttachment({
      name: "hello.txt",
      mimeType: "text/plain",
      size: 5,
      blob,
    });

    expect(ref).toEqual({
      id: expect.stringMatching(/^att-\d+-[a-z0-9]+$/),
      name: "hello.txt",
      mimeType: "text/plain",
      size: 5,
    });
    expect(records.get(ref.id)?.blob).toBe(blob);
    expect(records.get(ref.id)?.createdAt).toBeTruthy();
  });

  it("round-trips get and returns null for unknown ids", async () => {
    const ref = await putAttachment({
      name: "a.bin",
      mimeType: "application/octet-stream",
      size: 1,
      blob: new Blob(["x"]),
    });

    const rec = await getAttachment(ref.id);
    expect(rec).toMatchObject({ id: ref.id, name: "a.bin" });
    expect(await getAttachment("att-missing")).toBeNull();
  });

  it("deletes an attachment", async () => {
    const ref = await putAttachment({
      name: "a.txt",
      mimeType: "text/plain",
      size: 1,
      blob: new Blob(["x"]),
    });
    await deleteAttachment(ref.id);
    expect(await getAttachment(ref.id)).toBeNull();
  });

  it("returns a data URL for a stored attachment and null when missing", async () => {
    const ref = await putAttachment({
      name: "hi.txt",
      mimeType: "text/plain",
      size: 2,
      blob: new Blob(["hi"], { type: "text/plain" }),
    });

    const url = await getAttachmentDataUrl(ref.id);
    expect(url).toBe(`data:text/plain;base64,${Buffer.from("hi").toString("base64")}`);
    expect(await getAttachmentDataUrl("att-nope")).toBeNull();
  });

  describe("purgeOrphans", () => {
    async function seed(id: string, createdAt: string) {
      records.set(id, {
        id,
        name: `${id}.txt`,
        mimeType: "text/plain",
        size: 1,
        blob: new Blob(["x"]),
        createdAt,
      });
    }

    it("deletes old orphans but keeps referenced and recent records", async () => {
      const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const fresh = new Date().toISOString();
      await seed("keep-old", old);
      await seed("orphan-old", old);
      await seed("orphan-fresh", fresh);

      await purgeOrphans(new Set(["keep-old"]));

      expect([...records.keys()].sort()).toEqual(["keep-old", "orphan-fresh"]);
    });

    it("honors a custom minAgeMs", async () => {
      await seed("orphan", new Date(Date.now() - 10_000).toISOString());
      await purgeOrphans(new Set(), { minAgeMs: 1_000 });
      expect(records.size).toBe(0);
    });

    it("deletes orphans with unparsable createdAt", async () => {
      await seed("weird", "not-a-date");
      await purgeOrphans(new Set());
      expect(records.size).toBe(0);
    });
  });
});

describe("attachment store (server-side)", () => {
  it("getAttachment resolves null instead of throwing", async () => {
    expect(await getAttachment("att-x")).toBeNull();
  });

  it("purgeOrphans is a silent no-op", async () => {
    await expect(purgeOrphans(new Set())).resolves.toBeUndefined();
  });

  it("putAttachment rejects with an explanatory error", async () => {
    await expect(
      putAttachment({
        name: "a",
        mimeType: "text/plain",
        size: 1,
        blob: new Blob(["x"]),
      }),
    ).rejects.toThrow("IndexedDB unavailable");
  });
});

describe("blobToDataUrl", () => {
  it("encodes a blob using FileReader", async () => {
    vi.stubGlobal("FileReader", FakeFileReader);
    const url = await blobToDataUrl(new Blob(["abc"], { type: "text/plain" }));
    expect(url).toBe(`data:text/plain;base64,${Buffer.from("abc").toString("base64")}`);
  });
});
