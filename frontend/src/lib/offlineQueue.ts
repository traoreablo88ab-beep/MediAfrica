'use client';

// Client-side offline mutation queue — IndexedDB-backed via `idb`, no
// Service Worker (see .planning — Phase 1 covers "tab was already open when
// the connection dropped", not a cold start with zero connectivity).
//
// A queued item's `id` doubles as its Idempotency-Key: the server route
// (e.g. frontend/src/app/api/patients/[id]/consultations/route.ts) uses it
// to make a replayed sync attempt return the original row instead of
// creating a duplicate. Uses the existing `api()` wrapper unmodified — its
// single-flight refresh-on-401 already handles a stale access token
// transparently the moment a queued item's sync call executes online.

import { useCallback, useEffect, useState } from 'react';
import { openDB, type IDBPDatabase } from 'idb';
import { api, ApiError } from './api';

const DB_NAME = 'mediafrica-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'mutations';

export interface QueuedMutation {
  id: string; // idempotency key, crypto.randomUUID()
  url: string;
  method: 'POST';
  body: Record<string, unknown>;
  resourceLabel: string; // e.g. "Consultation" — shown in the pending-sync UI
  createdAt: string;
  status: 'pending' | 'failed';
  lastError?: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// Lightweight pub-sub so every mounted useOfflineQueue() instance (e.g. the
// header badge and the consultation form) re-renders on any queue change,
// without needing a React Context provider for what is otherwise plain
// IndexedDB state.
type Listener = () => void;
const listeners = new Set<Listener>();
function notify(): void {
  for (const listener of listeners) listener();
}

export async function listQueue(): Promise<QueuedMutation[]> {
  const db = await getDb();
  return db.getAll(STORE_NAME);
}

export async function queueMutation(input: {
  url: string;
  body: Record<string, unknown>;
  resourceLabel: string;
}): Promise<QueuedMutation> {
  const item: QueuedMutation = {
    id: crypto.randomUUID(),
    url: input.url,
    method: 'POST',
    body: input.body,
    resourceLabel: input.resourceLabel,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  const db = await getDb();
  await db.put(STORE_NAME, item);
  notify();
  void drainQueue();
  return item;
}

async function removeFromQueue(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
  notify();
}

async function markFailed(item: QueuedMutation, message: string): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, { ...item, status: 'failed', lastError: message });
  notify();
}

let draining = false;

// Drains every `pending` item. A definitive server rejection (any ApiError
// with a real HTTP status — REGISTER_CLOSED, IDEMPOTENCY_KEY_BODY_MISMATCH,
// validation, etc.) marks the item `failed` and stops retrying it
// automatically; a network failure (ApiError status 0 — api.ts's own signal
// for "no response reached the server") leaves it `pending` for the next
// drain. Re-entrancy-guarded so overlapping `online` events / manual
// "Synchroniser" clicks don't race each other.
export async function drainQueue(): Promise<void> {
  if (draining) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  draining = true;
  try {
    const items = await listQueue();
    for (const item of items) {
      if (item.status !== 'pending') continue;
      try {
        await api(item.url, {
          method: item.method,
          body: item.body,
          headers: { 'Idempotency-Key': item.id },
        });
        await removeFromQueue(item.id);
      } catch (err) {
        if (err instanceof ApiError && err.status !== 0) {
          await markFailed(item, err.message);
        }
        // status === 0 → still offline / request never reached the server;
        // leave pending, the next drain (reconnect or manual sync) retries it.
      }
    }
  } finally {
    draining = false;
  }
}

export function useOfflineQueue(): {
  items: QueuedMutation[];
  pendingCount: number;
  failedCount: number;
  syncNow: () => void;
} {
  const [items, setItems] = useState<QueuedMutation[]>([]);

  const refresh = useCallback(() => {
    void listQueue().then(setItems);
  }, []);

  useEffect(() => {
    refresh();
    listeners.add(refresh);
    const onOnline = () => void drainQueue();
    window.addEventListener('online', onOnline);
    void drainQueue();
    return () => {
      listeners.delete(refresh);
      window.removeEventListener('online', onOnline);
    };
  }, [refresh]);

  const syncNow = useCallback(() => {
    void drainQueue();
  }, []);

  return {
    items,
    pendingCount: items.filter((i) => i.status === 'pending').length,
    failedCount: items.filter((i) => i.status === 'failed').length,
    syncNow,
  };
}
