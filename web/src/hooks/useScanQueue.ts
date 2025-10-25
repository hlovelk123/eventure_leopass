import { useCallback, useEffect, useMemo, useState } from 'react';
import { openDB, type DBSchema } from 'idb';
import { postJson } from '../lib/api';

const MAX_QUEUE_ENTRIES = 500;
const MAX_ENTRY_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

type QueueItem = {
  id: string;
  token: string;
  scannerDeviceId?: string | null;
  scannedAt: string;
  enqueuedAt: string;
  idempotencyKey: string;
  retries: number;
  lastError?: string | null;
};

type OfflineDb = DBSchema & {
  scanQueue: {
    key: string;
    value: QueueItem;
    indexes: {
      'by-enqueuedAt': string;
    };
  };
};

const dbPromise = openDB<OfflineDb>('leopass-offline', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('scanQueue')) {
      const store = db.createObjectStore('scanQueue', { keyPath: 'id' });
      store.createIndex('by-enqueuedAt', 'enqueuedAt');
    }
  }
});

function isExpired(item: QueueItem): boolean {
  return Date.now() - new Date(item.enqueuedAt).getTime() > MAX_ENTRY_AGE_MS;
}

export function useScanQueue(isOnline: boolean) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [isFlushing, setIsFlushing] = useState(false);

  const loadQueue = useCallback(async () => {
    const db = await dbPromise;
    const entries = await db.getAllFromIndex('scanQueue', 'by-enqueuedAt');
    entries.sort((a, b) => new Date(a.enqueuedAt).getTime() - new Date(b.enqueuedAt).getTime());
    setItems(entries);
  }, []);

  const enqueue = useCallback(
    async (input: { token: string; idempotencyKey: string; scannerDeviceId?: string | null; scannedAt: string }) => {
      const db = await dbPromise;
      const count = await db.count('scanQueue');
      if (count >= MAX_QUEUE_ENTRIES) {
        throw new Error('Offline queue limit reached (500 entries). Sync before scanning more attendees.');
      }
      const item: QueueItem = {
        id: crypto.randomUUID(),
        token: input.token,
        scannerDeviceId: input.scannerDeviceId ?? null,
        scannedAt: input.scannedAt,
        idempotencyKey: input.idempotencyKey,
        enqueuedAt: new Date().toISOString(),
        retries: 0,
        lastError: null
      };
      await db.put('scanQueue', item);
      await loadQueue();
    },
    [loadQueue]
  );

  const remove = useCallback(async (id: string) => {
    const db = await dbPromise;
    await db.delete('scanQueue', id);
    await loadQueue();
  }, [loadQueue]);

  const update = useCallback(async (item: QueueItem) => {
    const db = await dbPromise;
    await db.put('scanQueue', item);
  }, []);

  const flush = useCallback(async () => {
    const db = await dbPromise;
    const entries = await db.getAllFromIndex('scanQueue', 'by-enqueuedAt');
    if (entries.length === 0) {
      return;
    }
    setIsFlushing(true);
    for (const entry of entries) {
      if (isExpired(entry)) {
        await update({ ...entry, lastError: 'Queued >48h — requires manual review' });
        continue;
      }

      try {
        await postJson<unknown>(
          '/scan',
          {
            token: entry.token,
            scannerDeviceId: entry.scannerDeviceId,
            scannedAt: entry.scannedAt
          },
          {
            headers: {
              'idempotency-key': entry.idempotencyKey
            }
          }
        );
        await remove(entry.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const isNetworkError = error instanceof TypeError || message.toLowerCase().includes('fetch');
        await update({ ...entry, retries: entry.retries + 1, lastError: message });
        if (isNetworkError) {
          break;
        }
      }
    }
    await loadQueue();
    setIsFlushing(false);
  }, [loadQueue, remove, update]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (isOnline) {
      void flush();
    }
  }, [isOnline, flush]);

  const pendingCount = useMemo(() => items.filter((item) => !isExpired(item)).length, [items]);
  const expiredCount = useMemo(() => items.filter((item) => isExpired(item)).length, [items]);

  return {
    items,
    pendingCount,
    expiredCount,
    isFlushing,
    enqueue,
    flush,
    remove
  };
}
