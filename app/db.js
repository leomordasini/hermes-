/**
 * IndexedDB Persistent Data Layer for Manager Portal
 * 
 * This is the CRITICAL persistence layer. All data lives here.
 * Schema migrations NEVER destroy existing data.
 * All deletes are soft-deletes (deletedAt timestamp).
 * All mutations are audit-logged.
 * 
 * Completely self-contained — no imports.
 */

const DB_NAME = 'ManagerPortalDB';
const DB_VERSION = 1;

// Schema definition: each version describes what stores/indexes to create
const SCHEMA = {
  1: {
    team_members: {
      keyPath: 'id',
      indexes: {
        name: { keyPath: 'name', unique: false },
        role: { keyPath: 'role', unique: false },
        createdAt: { keyPath: 'createdAt', unique: false },
      },
    },
    one_on_ones: {
      keyPath: 'id',
      indexes: {
        memberId: { keyPath: 'memberId', unique: false },
        date: { keyPath: 'date', unique: false },
        createdAt: { keyPath: 'createdAt', unique: false },
      },
    },
    goals: {
      keyPath: 'id',
      indexes: {
        category: { keyPath: 'category', unique: false },
        status: { keyPath: 'status', unique: false },
        quarter: { keyPath: 'quarter', unique: false },
        createdAt: { keyPath: 'createdAt', unique: false },
      },
    },
    projects: {
      keyPath: 'id',
      indexes: {
        status: { keyPath: 'status', unique: false },
        priority: { keyPath: 'priority', unique: false },
        createdAt: { keyPath: 'createdAt', unique: false },
      },
    },
    action_items: {
      keyPath: 'id',
      indexes: {
        status: { keyPath: 'status', unique: false },
        assignee: { keyPath: 'assignee', unique: false },
        dueDate: { keyPath: 'dueDate', unique: false },
        source: { keyPath: 'source', unique: false },
        createdAt: { keyPath: 'createdAt', unique: false },
      },
    },
    notes: {
      keyPath: 'id',
      indexes: {
        category: { keyPath: 'category', unique: false },
        createdAt: { keyPath: 'createdAt', unique: false },
      },
    },
    reviews: {
      keyPath: 'id',
      indexes: {
        memberId: { keyPath: 'memberId', unique: false },
        cycle: { keyPath: 'cycle', unique: false },
        createdAt: { keyPath: 'createdAt', unique: false },
      },
    },
    settings: {
      keyPath: 'key',
      indexes: {},
    },
    audit_log: {
      keyPath: 'id',
      indexes: {
        store: { keyPath: 'store', unique: false },
        action: { keyPath: 'action', unique: false },
        timestamp: { keyPath: 'timestamp', unique: false },
      },
    },
  },
};

class DB {
  constructor() {
    this._db = null;
    this._ready = null;
  }

  /**
   * Open and/or upgrade the database. Safe to call multiple times.
   * Returns a promise that resolves when the DB is ready.
   */
  init() {
    if (this._ready) return this._ready;

    this._ready = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const oldVersion = event.oldVersion;

        // Walk through each version from (oldVersion+1) to DB_VERSION
        for (let v = oldVersion + 1; v <= DB_VERSION; v++) {
          const versionSchema = SCHEMA[v];
          if (!versionSchema) continue;

          for (const [storeName, storeDef] of Object.entries(versionSchema)) {
            let store;

            // Only create the store if it doesn't already exist
            if (!db.objectStoreNames.contains(storeName)) {
              store = db.createObjectStore(storeName, { keyPath: storeDef.keyPath });
            } else {
              // Access existing store via transaction for index upgrades
              store = request.transaction.objectStore(storeName);
            }

            // Create indexes that don't already exist (never drop existing ones)
            for (const [indexName, indexDef] of Object.entries(storeDef.indexes || {})) {
              if (!store.indexNames.contains(indexName)) {
                store.createIndex(indexName, indexDef.keyPath, { unique: indexDef.unique });
              }
            }
          }
        }
      };

      request.onsuccess = () => {
        this._db = request.result;

        // Handle connection closing unexpectedly (e.g., version change from another tab)
        this._db.onversionchange = () => {
          this._db.close();
          this._db = null;
          this._ready = null;
        };

        resolve(this._db);
      };

      request.onerror = () => {
        console.error('[DB] Failed to open database:', request.error);
        this._ready = null;
        reject(request.error);
      };

      request.onblocked = () => {
        console.warn('[DB] Database upgrade blocked. Close other tabs using this app.');
      };
    });

    return this._ready;
  }

  /**
   * Ensure the DB is initialized before any operation.
   */
  async _getDB() {
    if (!this._db) {
      await this.init();
    }
    return this._db;
  }

  /**
   * Run a transaction and return a promise.
   * @param {string|string[]} storeNames
   * @param {'readonly'|'readwrite'} mode
   * @param {function} callback — receives an object of { storeName: objectStore }
   */
  async _tx(storeNames, mode, callback) {
    const db = await this._getDB();
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];

    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode);
      const stores = {};
      for (const name of names) {
        stores[name] = tx.objectStore(name);
      }

      let result;
      try {
        result = callback(stores, tx);
      } catch (err) {
        reject(err);
        return;
      }

      // If callback returns an IDBRequest, resolve with its result
      if (result && typeof result.onsuccess !== 'undefined') {
        result.onsuccess = () => resolve(result.result);
        result.onerror = () => reject(result.error);
      } else if (result && typeof result.then === 'function') {
        // If callback returns a promise, let the transaction complete naturally
        result.then(resolve).catch(reject);
      } else {
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
      }
    });
  }

  /**
   * Write an audit log entry. Called internally within a readwrite transaction.
   * @param {IDBObjectStore} auditStore — the audit_log object store
   * @param {string} storeName
   * @param {string} action — 'add', 'update', 'delete'
   * @param {string} recordId
   * @param {object} snapshot — copy of the record at this point
   */
  _writeAuditEntry(auditStore, storeName, action, recordId, snapshot) {
    const entry = {
      id: crypto.randomUUID(),
      store: storeName,
      action,
      recordId: recordId || null,
      timestamp: new Date().toISOString(),
      snapshot: JSON.parse(JSON.stringify(snapshot || {})),
    };
    auditStore.add(entry);
  }

  /**
   * Add a new record to a store.
   * Auto-generates id, createdAt, updatedAt. Logs to audit_log.
   * @param {string} storeName
   * @param {object} record
   * @returns {Promise<object>} The saved record with generated fields
   */
  async add(storeName, record) {
    const now = new Date().toISOString();
    const enriched = {
      ...record,
      id: record.id || crypto.randomUUID(),
      createdAt: record.createdAt || now,
      updatedAt: now,
      deletedAt: null,
    };

    await this._tx([storeName, 'audit_log'], 'readwrite', (stores) => {
      stores[storeName].add(enriched);
      this._writeAuditEntry(stores['audit_log'], storeName, 'add', enriched.id, enriched);
    });

    return enriched;
  }

  /**
   * Update an existing record. Sets updatedAt. Logs to audit_log.
   * @param {string} storeName
   * @param {object} record — must include 'id' (or 'key' for settings)
   * @returns {Promise<object>} The updated record
   */
  async update(storeName, record) {
    const now = new Date().toISOString();
    const db = await this._getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([storeName, 'audit_log'], 'readwrite');
      const store = tx.objectStore(storeName);
      const auditStore = tx.objectStore('audit_log');

      // Determine the key based on store's keyPath
      const keyPath = store.keyPath;
      const key = record[keyPath];

      if (key === undefined) {
        reject(new Error(`Record must include the key field "${keyPath}"`));
        return;
      }

      // Get the existing record first so we can merge
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (!existing) {
          reject(new Error(`Record not found in "${storeName}" with ${keyPath}="${key}"`));
          return;
        }
        if (existing.deletedAt) {
          reject(new Error(`Record in "${storeName}" with ${keyPath}="${key}" has been deleted`));
          return;
        }

        const updated = {
          ...existing,
          ...record,
          updatedAt: now,
          // Preserve original createdAt, never overwrite deletedAt via update
          createdAt: existing.createdAt,
          deletedAt: existing.deletedAt,
        };

        store.put(updated);
        this._writeAuditEntry(auditStore, storeName, 'update', String(key), updated);

        tx.oncomplete = () => resolve(updated);
      };

      getReq.onerror = () => reject(getReq.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Soft-delete a record. Sets deletedAt, never removes from DB. Logs to audit_log.
   * @param {string} storeName
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(storeName, id) {
    const now = new Date().toISOString();
    const db = await this._getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([storeName, 'audit_log'], 'readwrite');
      const store = tx.objectStore(storeName);
      const auditStore = tx.objectStore('audit_log');

      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (!existing) {
          reject(new Error(`Record not found in "${storeName}" with id="${id}"`));
          return;
        }
        if (existing.deletedAt) {
          // Already deleted — no-op
          resolve();
          return;
        }

        const updated = {
          ...existing,
          deletedAt: now,
          updatedAt: now,
        };

        store.put(updated);
        this._writeAuditEntry(auditStore, storeName, 'delete', String(id), updated);

        tx.oncomplete = () => resolve();
      };

      getReq.onerror = () => reject(getReq.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get a single record by id. Returns null if not found or soft-deleted.
   * @param {string} storeName
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async get(storeName, id) {
    const record = await this._tx(storeName, 'readonly', (stores) => {
      return stores[storeName].get(id);
    });
    if (!record || record.deletedAt) return null;
    return record;
  }

  /**
   * Get all non-deleted records from a store, with optional filtering and sorting.
   * @param {string} storeName
   * @param {object} [options]
   * @param {string} [options.index] — index name to query on
   * @param {*} [options.value] — value to match on the index
   * @param {string} [options.sortBy] — field name to sort by
   * @param {'asc'|'desc'} [options.sortDir] — sort direction (default 'asc')
   * @param {function} [options.filter] — additional filter function
   * @returns {Promise<object[]>}
   */
  async getAll(storeName, options = {}) {
    const { index, value, sortBy, sortDir = 'asc', filter } = options;

    const db = await this._getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);

      let request;
      if (index && value !== undefined) {
        const idx = store.index(index);
        request = idx.getAll(value);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => {
        let results = request.result || [];

        // Exclude soft-deleted records (settings store may not have deletedAt)
        results = results.filter((r) => !r.deletedAt);

        // Apply custom filter
        if (typeof filter === 'function') {
          results = results.filter(filter);
        }

        // Sort
        if (sortBy) {
          results.sort((a, b) => {
            const aVal = a[sortBy];
            const bVal = b[sortBy];
            if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
            return 0;
          });
        }

        resolve(results);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Query records by index. Returns non-deleted records matching the index value.
   * @param {string} storeName
   * @param {string} indexName
   * @param {*} value
   * @returns {Promise<object[]>}
   */
  async query(storeName, indexName, value) {
    const db = await this._getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const idx = store.index(indexName);
      const request = idx.getAll(value);

      request.onsuccess = () => {
        const results = (request.result || []).filter((r) => !r.deletedAt);
        resolve(results);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Export the entire database as a JSON-serializable object.
   * Includes ALL records (even soft-deleted) for complete backup.
   * @returns {Promise<object>}
   */
  async exportAll() {
    const db = await this._getDB();
    const storeNames = Array.from(db.objectStoreNames);
    const backup = {
      _meta: {
        exportedAt: new Date().toISOString(),
        dbName: DB_NAME,
        dbVersion: DB_VERSION,
      },
    };

    for (const storeName of storeNames) {
      backup[storeName] = await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    }

    return backup;
  }

  /**
   * Import data from a JSON backup. Merges — existing records are NOT overwritten.
   * New records (by id/key) are added. This ensures no data loss.
   * @param {object|string} json — backup object or JSON string
   * @returns {Promise<{imported: number, skipped: number}>}
   */
  async importData(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const db = await this._getDB();
    const storeNames = Array.from(db.objectStoreNames);

    let imported = 0;
    let skipped = 0;

    for (const storeName of storeNames) {
      const records = data[storeName];
      if (!Array.isArray(records) || records.length === 0) continue;

      await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const keyPath = store.keyPath;

        let pending = records.length;

        const checkDone = () => {
          pending--;
          if (pending <= 0) resolve();
        };

        for (const record of records) {
          const key = record[keyPath];
          if (key === undefined) {
            skipped++;
            checkDone();
            continue;
          }

          // Check if record already exists — if so, skip (don't overwrite)
          const getReq = store.get(key);
          getReq.onsuccess = () => {
            if (getReq.result) {
              // Record exists — skip to preserve existing data
              skipped++;
              checkDone();
            } else {
              // Record doesn't exist — add it
              const addReq = store.add(record);
              addReq.onsuccess = () => {
                imported++;
                checkDone();
              };
              addReq.onerror = () => {
                // Swallow duplicate key errors gracefully
                addReq.onerror = null;
                skipped++;
                checkDone();
              };
            }
          };
          getReq.onerror = () => {
            skipped++;
            checkDone();
          };
        }

        tx.onerror = () => reject(tx.error);
      });
    }

    return { imported, skipped };
  }

  /**
   * Get audit log entries, optionally filtered by store name.
   * Returns most recent entries first.
   * @param {string} [storeName] — filter by store name (optional)
   * @param {number} [limit=50] — max entries to return
   * @returns {Promise<object[]>}
   */
  async getAuditLog(storeName, limit = 50) {
    const db = await this._getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('audit_log', 'readonly');
      const store = tx.objectStore('audit_log');

      let request;
      if (storeName) {
        const idx = store.index('store');
        request = idx.getAll(storeName);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => {
        let results = request.result || [];
        // Sort by timestamp descending (most recent first)
        results.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        // Apply limit
        if (limit && limit > 0) {
          results = results.slice(0, limit);
        }
        resolve(results);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Count non-deleted records in a store.
   * @param {string} storeName
   * @returns {Promise<number>}
   */
  async count(storeName) {
    const db = await this._getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = (request.result || []).filter((r) => !r.deletedAt);
        resolve(results.length);
      };

      request.onerror = () => reject(request.error);
    });
  }
}

// Singleton instance
const db = new DB();
export { DB };
export default db;
