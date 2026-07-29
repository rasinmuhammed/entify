/**
 * A localStorage-backed stand-in for the Supabase client.
 *
 * Entify's demo path has to work with no accounts, no keys and no network, so
 * that evaluating it takes a minute rather than an afternoon of provisioning.
 * Rather than branching every call site on "is Supabase configured", this
 * implements the slice of the Supabase query API the app actually uses -- two
 * tables, and select/insert/update/delete with eq/order/limit/single -- and
 * gets swapped in transparently when credentials are absent.
 *
 * Deliberately not a general Supabase implementation. If a call site starts
 * using an unsupported operator it throws loudly here rather than silently
 * returning wrong rows.
 */

const PREFIX = "entify:local:"

export type LocalRow = Record<string, unknown>
type Result<T> = { data: T; error: { message: string } | null }

function readTable(table: string): LocalRow[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(PREFIX + table)
    return raw ? (JSON.parse(raw) as LocalRow[]) : []
  } catch {
    return []
  }
}

function writeTable(table: string, rows: LocalRow[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(PREFIX + table, JSON.stringify(rows))
  } catch (err) {
    // Quota exceeded is realistic here: datasets can be large.
    console.warn(`[entify] could not persist ${table} locally`, err)
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

type Operation =
  | { kind: "select" }
  | { kind: "insert"; rows: LocalRow[] }
  | { kind: "update"; values: LocalRow }
  | { kind: "delete" }

class LocalQuery implements PromiseLike<Result<LocalRow[] | LocalRow | null>> {
  private filters: Array<[string, unknown]> = []
  private orderBy: { column: string; ascending: boolean } | null = null
  private limitCount: number | null = null
  private wantsSingle = false

  constructor(private table: string, private operation: Operation) {}

  select(): this {
    // Column projection is intentionally ignored: every caller reads whole
    // rows, and pretending to project would hide a real difference.
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value])
    return this
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderBy = { column, ascending: options?.ascending ?? true }
    return this
  }

  limit(count: number): this {
    this.limitCount = count
    return this
  }

  single(): this {
    this.wantsSingle = true
    return this
  }

  maybeSingle(): this {
    this.wantsSingle = true
    return this
  }

  private matches(row: LocalRow): boolean {
    return this.filters.every(([column, value]) => row[column] === value)
  }

  private run(): Result<LocalRow[] | LocalRow | null> {
    const rows = readTable(this.table)

    switch (this.operation.kind) {
      case "insert": {
        const stamped = this.operation.rows.map((row) => ({
          id: newId(),
          created_at: new Date().toISOString(),
          ...row,
        }))
        writeTable(this.table, [...rows, ...stamped])
        return { data: this.wantsSingle ? stamped[0] ?? null : stamped, error: null }
      }

      case "update": {
        const updated: LocalRow[] = []
        const next = rows.map((row) => {
          if (!this.matches(row)) return row
          const merged = {
            ...row,
            ...this.operation.kind === "update" ? this.operation.values : {},
            last_updated: new Date().toISOString(),
          }
          updated.push(merged)
          return merged
        })
        writeTable(this.table, next)
        return { data: this.wantsSingle ? updated[0] ?? null : updated, error: null }
      }

      case "delete": {
        const kept = rows.filter((row) => !this.matches(row))
        const removed = rows.filter((row) => this.matches(row))
        writeTable(this.table, kept)
        return { data: removed, error: null }
      }

      case "select":
      default: {
        let result = rows.filter((row) => this.matches(row))

        if (this.orderBy) {
          const { column, ascending } = this.orderBy
          result = [...result].sort((a, b) => {
            const left = a[column] as string | number | undefined
            const right = b[column] as string | number | undefined
            if (left === right) return 0
            if (left === undefined || left === null) return 1
            if (right === undefined || right === null) return -1
            return (left < right ? -1 : 1) * (ascending ? 1 : -1)
          })
        }

        if (this.limitCount !== null) result = result.slice(0, this.limitCount)

        if (this.wantsSingle) {
          return result.length
            ? { data: result[0], error: null }
            : { data: null, error: { message: "No rows found" } }
        }
        return { data: result, error: null }
      }
    }
  }

  then<TResult1 = Result<LocalRow[] | LocalRow | null>, TResult2 = never>(
    onfulfilled?: ((value: Result<LocalRow[] | LocalRow | null>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    try {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected)
    } catch (err) {
      return Promise.reject(err).then(onfulfilled, onrejected)
    }
  }
}

class LocalTable {
  constructor(private table: string) {}

  select(): LocalQuery {
    return new LocalQuery(this.table, { kind: "select" })
  }

  insert(rows: LocalRow | LocalRow[]): LocalQuery {
    return new LocalQuery(this.table, {
      kind: "insert",
      rows: Array.isArray(rows) ? rows : [rows],
    })
  }

  update(values: LocalRow): LocalQuery {
    return new LocalQuery(this.table, { kind: "update", values })
  }

  delete(): LocalQuery {
    return new LocalQuery(this.table, { kind: "delete" })
  }
}

const FILE_PREFIX = "entify:file:"

/**
 * Object storage backed by IndexedDB.
 *
 * Datasets are far too large for localStorage — a 4,000-row CSV is already
 * ~500KB and the quota is typically 5MB total — so uploaded files go to
 * IndexedDB while table rows stay in localStorage.
 */
function openFileStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("entify-files", 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("files")) {
        request.result.createObjectStore("files")
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function putFile(path: string, blob: Blob): Promise<void> {
  const db = await openFileStore()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite")
    tx.objectStore("files").put(blob, FILE_PREFIX + path)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function getFile(path: string): Promise<Blob | null> {
  const db = await openFileStore()
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const request = db.transaction("files", "readonly").objectStore("files").get(FILE_PREFIX + path)
    request.onsuccess = () => resolve((request.result as Blob) ?? null)
    request.onerror = () => reject(request.error)
  })
  db.close()
  return blob
}

class LocalBucket {
  async upload(path: string, file: Blob) {
    try {
      await putFile(path, file)
      return { data: { path }, error: null }
    } catch (err) {
      return {
        data: null,
        error: { message: err instanceof Error ? err.message : "Local upload failed" },
      }
    }
  }

  async download(path: string) {
    try {
      const blob = await getFile(path)
      return blob
        ? { data: blob, error: null }
        : { data: null, error: { message: "File not found in local storage" } }
    } catch (err) {
      return {
        data: null,
        error: { message: err instanceof Error ? err.message : "Local download failed" },
      }
    }
  }

  async remove(paths: string[]) {
    const db = await openFileStore()
    await new Promise<void>((resolve) => {
      const tx = db.transaction("files", "readwrite")
      paths.forEach((path) => tx.objectStore("files").delete(FILE_PREFIX + path))
      tx.oncomplete = () => resolve()
    })
    db.close()
    return { data: paths.map((path) => ({ name: path })), error: null }
  }

  getPublicUrl(path: string) {
    return { data: { publicUrl: `local://${path}` } }
  }

  async createSignedUrl(path: string) {
    return { data: { signedUrl: `local://${path}` }, error: null }
  }
}

export function createLocalClient() {
  return {
    /** Marks this as the offline shim so UI can show a demo-mode badge. */
    isLocal: true as const,
    from(table: string) {
      return new LocalTable(table)
    },
    storage: {
      from(_bucket: string) {
        return new LocalBucket()
      },
    },
    auth: {
      getUser: async () => ({
        data: { user: { id: "local-user", email: "you@localhost" } },
        error: null,
      }),
      signOut: async () => ({ error: null }),
    },
  }
}

export function clearLocalData(): void {
  if (typeof window === "undefined") return
  Object.keys(window.localStorage)
    .filter((key) => key.startsWith(PREFIX))
    .forEach((key) => window.localStorage.removeItem(key))
}
