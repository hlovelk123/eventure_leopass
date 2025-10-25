import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useScanQueue } from '../../hooks/useScanQueue';
import { useJwks } from '../../lib/jwks';
import { getJson, postJson } from '../../lib/api';

type ScanResponse = {
  action: 'check_in' | 'check_out';
  attendanceSession: {
    id: string;
    eventId: string;
    userId: string | null;
    checkInTs: string | null;
    checkOutTs: string | null;
  };
  tokenExpiresAt: string;
};

type StewardDashboard = {
  events: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    activeSessions: number;
    totalPasses: number;
  }[];
};

type StewardEventStats = {
  eventId: string;
  present: number;
  checkedOut: number;
  queued: number;
  totalPasses: number;
};

const STATUS_RESET_MS = 4_000;
const STORAGE_KEY_DEVICE_ID = 'steward:deviceId';

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function StewardScannerPage(): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const recentTokenRef = useRef<string | null>(null);
  const resetTimerRef = useRef<number | undefined>(undefined);

  const { isOnline } = useNetworkStatus();
  const { verifyToken, refresh: refreshJwks, lastFetched, error: jwksError } = useJwks();
  const { pendingCount, expiredCount, enqueue, flush, isFlushing } = useScanQueue(isOnline);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'queued' | 'submitting' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [resultMessage, setResultMessage] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState(() => window.localStorage.getItem(STORAGE_KEY_DEVICE_ID) ?? '');
  const [isVerifying, setIsVerifying] = useState(false);

  const [events, setEvents] = useState<StewardDashboard['events']>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [eventStats, setEventStats] = useState<StewardEventStats | null>(null);

  const [walkInName, setWalkInName] = useState('');
  const [walkInEmail, setWalkInEmail] = useState('');
  const [walkInType, setWalkInType] = useState('Guest');
  const [walkInNotes, setWalkInNotes] = useState('');

  const [manualEmail, setManualEmail] = useState('');
  const [manualAction, setManualAction] = useState<'check_in' | 'check_out'>('check_in');
  const [manualReason, setManualReason] = useState('Manual adjustment');

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const feedbackText = actionError ?? actionMessage;
  const hasFeedback = actionError !== null || actionMessage !== null;

  const saveDeviceId = useCallback(
    (value: string) => {
      setDeviceId(value);
      if (value) {
        window.localStorage.setItem(STORAGE_KEY_DEVICE_ID, value);
      } else {
        window.localStorage.removeItem(STORAGE_KEY_DEVICE_ID);
      }
    },
    []
  );

  const resetStatusSoon = useCallback(() => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => {
      setScanStatus('scanning');
      setResult(null);
      setResultMessage('');
      setSubmitError(null);
    }, STATUS_RESET_MS);
  }, []);

  const submitOnline = useCallback(
    async (token: string, idempotencyKey: string, scannedAt: string) => {
      setScanStatus('submitting');
      setSubmitError(null);
      const normalizedDeviceId = deviceId === '' ? undefined : deviceId;
      const response = await postJson<ScanResponse>(
        '/scan',
        {
          token,
          scannerDeviceId: normalizedDeviceId,
          scannedAt
        },
        {
          headers: {
            'idempotency-key': idempotencyKey
          }
        }
      );
      setResult(response);
      setScanStatus('success');
      const verb = response.action === 'check_in' ? 'Checked in' : 'Checked out';
      setResultMessage(`${verb} · session ${response.attendanceSession.id.slice(0, 8)}…`);
      resetStatusSoon();
    },
    [deviceId, resetStatusSoon]
  );

  const enqueueOffline = useCallback(
    async (token: string, idempotencyKey: string, scannedAt: string) => {
      const normalizedDeviceId = deviceId === '' ? null : deviceId;
      await enqueue({
        token,
        idempotencyKey,
        scannerDeviceId: normalizedDeviceId,
        scannedAt
      });
      setScanStatus('queued');
      setResultMessage('Scan queued — will sync when you reconnect.');
      resetStatusSoon();
    },
    [enqueue, deviceId, resetStatusSoon]
  );

  const handleToken = useCallback(
    async (tokenValue: string) => {
      if (!tokenValue || tokenValue === recentTokenRef.current) {
        return;
      }
      recentTokenRef.current = tokenValue;
      setIsVerifying(true);
      try {
        await verifyToken(tokenValue);
        const scannedAt = new Date().toISOString();
        const idempotencyKey = crypto.randomUUID();

        if (!isOnline) {
          await enqueueOffline(tokenValue, idempotencyKey, scannedAt);
          setResultMessage('Offline — queued for sync.');
          return;
        }

        await submitOnline(tokenValue, idempotencyKey, scannedAt);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Scan failed';
        setSubmitError(message);
        setScanStatus('error');
        resetStatusSoon();
      } finally {
        setIsVerifying(false);
      }
    },
    [verifyToken, isOnline, enqueueOffline, submitOnline, resetStatusSoon]
  );

  const fetchEvents = useCallback(async () => {
    try {
      const response = await getJson<StewardDashboard>('/steward/events');
      setEvents(response.events);
      if (response.events.length > 0) {
        setSelectedEventId((current) => current || response.events[0].id);
      }
      setEventsError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load events';
      setEventsError(message);
      setEvents([]);
      setSelectedEventId('');
      setEventStats(null);
    }
  }, []);

  const fetchEventStats = useCallback(
    async (eventId: string) => {
      try {
        const stats = await getJson<StewardEventStats>(`/steward/events/${eventId}/summary`);
        setEventStats(stats);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load event summary';
        setActionError(message);
      }
    },
    []
  );

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (selectedEventId) {
      void fetchEventStats(selectedEventId);
    } else {
      setEventStats(null);
    }
  }, [selectedEventId, fetchEventStats]);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    setScanStatus('scanning');
    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (resultItem, error) => {
        if (resultItem) {
          const text = resultItem.getText();
          void handleToken(text);
        }
        if (error && !(error instanceof NotFoundException)) {
          console.error('Scanner error', error);
        }
      })
      .then(() => setCameraReady(true))
      .catch((error) => {
        console.error('Unable to initialise camera', error);
        setCameraError('Unable to access camera. Allow permissions and reload.');
        setScanStatus('idle');
      });

    return () => {
      const currentReader = readerRef.current;
      if (currentReader) {
        const { reset, stopContinuousDecode } = currentReader as {
          reset?: () => void;
          stopContinuousDecode?: () => void;
        };
        reset?.call(currentReader);
        stopContinuousDecode?.call(currentReader);
        readerRef.current = null;
      }
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, [handleToken, resetStatusSoon]);

  const statusBanner = useMemo(() => {
    if (submitError) {
      return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>;
    }
    if (scanStatus === 'queued') {
      return <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">{resultMessage}</p>;
    }
    if (scanStatus === 'success' && result) {
      return <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{resultMessage || 'Scan accepted'}</p>;
    }
    if (scanStatus === 'submitting' || isVerifying) {
      return <p className="text-sm text-slate-600">{isVerifying ? 'Verifying token…' : 'Submitting scan…'}</p>;
    }
    if (!cameraReady && !cameraError) {
      return <p className="text-sm text-slate-500">Connecting to camera…</p>;
    }
    if (cameraError) {
      return <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">{cameraError}</p>;
    }
    if (jwksError) {
      return <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">{jwksError}</p>;
    }
    return null;
  }, [submitError, scanStatus, result, resultMessage, cameraReady, cameraError, jwksError, isVerifying]);

  const offlineBadge = useMemo(() => {
    const pendingLabel = pendingCount > 0 ? ` · ${pendingCount} queued` : '';
    const expiredLabel = expiredCount > 0 ? ` · ${expiredCount} needs review` : '';
    return isOnline ? (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
        Online{pendingLabel}
      </span>
    ) : (
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
        Offline{pendingLabel}
        {expiredLabel}
      </span>
    );
  }, [isOnline, pendingCount, expiredCount]);

  const eventOptions = useMemo(
    () => events.map((event) => ({ value: event.id, label: `${event.name} • ${formatTime(event.startTime)}` })),
    [events]
  );

  const handleWalkInSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedEventId) {
        setActionError('Select an event to add walk-ins.');
        return;
      }
      try {
        const normalizedDeviceId = deviceId === '' ? undefined : deviceId;
        await postJson(`/steward/events/${selectedEventId}/walk-ins`, {
          name: walkInName,
          email: walkInEmail || undefined,
          type: walkInType || undefined,
          notes: walkInNotes || undefined,
          scannerDeviceId: normalizedDeviceId
        });
        setWalkInName('');
        setWalkInEmail('');
        setWalkInNotes('');
        setActionMessage('Walk-in added successfully.');
        setActionError(null);
        await fetchEventStats(selectedEventId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to add walk-in';
        setActionError(message);
        setActionMessage(null);
      }
    },
    [selectedEventId, walkInName, walkInEmail, walkInType, walkInNotes, deviceId, fetchEventStats]
  );

  const handleManualSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    if (!selectedEventId) {
      setActionError('Select an event to submit manual attendance.');
      return;
    }
    try {
      const normalizedDeviceId = deviceId === '' ? undefined : deviceId;
      await postJson(`/steward/events/${selectedEventId}/manual-attendance`, {
        action: manualAction,
        memberEmail: manualEmail || undefined,
        reason: manualReason,
        scannerDeviceId: normalizedDeviceId
      });
        setManualEmail('');
        setActionMessage(`${manualAction === 'check_in' ? 'Checked in' : 'Checked out'} member successfully.`);
        setActionError(null);
        await fetchEventStats(selectedEventId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to process manual attendance';
        setActionError(message);
        setActionMessage(null);
      }
    },
    [selectedEventId, manualAction, manualEmail, manualReason, deviceId, fetchEventStats]
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <header className="space-y-3 text-center md:text-left">
        <div className="flex flex-wrap items-center justify-center gap-2 md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Steward tools</p>
            <h1 className="text-3xl font-semibold text-brand">Scanner</h1>
          </div>
          {offlineBadge}
        </div>
        <p className="text-slate-600">
          Hold member QR codes in the frame. Tokens rotate every 30 seconds; duplicates are rejected automatically.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-500 md:justify-start">
          <span>JWKS synced: {lastFetched ? lastFetched.toLocaleString() : 'pending'}</span>
          <button
            type="button"
            className="underline"
            onClick={() => {
              void refreshJwks().catch((error) => console.error('Failed to refresh signing keys', error));
            }}
          >
            Refresh signing keys
          </button>
          <button
            type="button"
            className="underline"
            onClick={() => {
              void flush().catch((error) => console.error('Failed to sync queued scans', error));
            }}
            disabled={isFlushing}
          >
            {isFlushing ? 'Syncing…' : 'Sync queued scans'}
          </button>
        </div>
      </header>

      {statusBanner}

      <section className="grid gap-6 md:grid-cols-[2fr,1fr]">
        <div className="rounded-3xl bg-black/90 p-4 shadow-lg">
          <video
            ref={videoRef}
            className="h-[360px] w-full rounded-2xl bg-black object-cover"
            autoPlay
            playsInline
            muted
          />
        </div>

        <div className="space-y-4">
          <article className="rounded-2xl bg-white p-5 shadow">
            <h2 className="text-base font-semibold text-slate-800">Scanner status</h2>
            <dl className="mt-3 space-y-2 text-sm text-slate-600">
              <div className="flex justify-between">
                <dt>Mode</dt>
                <dd className="font-medium uppercase tracking-wide text-slate-500">{scanStatus}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Pending queue</dt>
                <dd>{pendingCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Needs review (&gt;48h)</dt>
                <dd>{expiredCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Last session</dt>
                <dd>
                  {result ? (
                    <span>
                      {result.attendanceSession.userId ?? 'guest'} ·{' '}
                      <span className="font-mono text-xs">{result.attendanceSession.id.slice(0, 8)}</span>
                    </span>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
          </article>

          <article className="space-y-3 rounded-2xl bg-white p-5 shadow">
            <h2 className="text-base font-semibold text-slate-800">Scanner device</h2>
            <p className="text-xs text-slate-500">Label this browser so audit logs show where scans originated.</p>
            <label className="mt-3 block text-left text-sm font-medium text-slate-600">
              Device ID
              <input
                type="text"
                value={deviceId}
                onChange={(event) => saveDeviceId(event.target.value.trim())}
                placeholder="gate-a-tablet"
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => saveDeviceId('')}
              className="text-xs text-slate-500 underline"
            >
              Clear device ID
            </button>
          </article>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <article className="space-y-5 rounded-3xl bg-white p-6 shadow">
          <header className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-800">Event overview</h2>
            <p className="text-sm text-slate-500">Switch between events to review attendance and queue manual updates.</p>
          </header>
          <label className="block text-sm font-medium text-slate-600">
            Active event
            <select
              value={selectedEventId}
              onChange={(event) => setSelectedEventId(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
            >
              {events.length === 0 ? (
                <option value="">No active events</option>
              ) : (
                eventOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))
              )}
            </select>
          </label>

          {eventsError && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">{eventsError}</p>}

          {eventStats ? (
            <dl className="grid gap-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 md:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Present</dt>
                <dd className="text-lg font-semibold text-slate-900">{eventStats.present}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Checked out</dt>
                <dd className="text-lg font-semibold text-slate-900">{eventStats.checkedOut}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Queued scans</dt>
                <dd className="text-lg font-semibold text-slate-900">{eventStats.queued + pendingCount}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Total passes</dt>
                <dd className="text-lg font-semibold text-slate-900">{eventStats.totalPasses}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Select an event to view stats.</p>
          )}

          {hasFeedback && (
            <p
              className={`rounded-md px-3 py-2 text-sm ${
                actionError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {feedbackText}
            </p>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <form
              className="space-y-3 rounded-2xl border border-slate-200 p-4"
              onSubmit={(event) => {
                void handleWalkInSubmit(event);
              }}
            >
              <h3 className="text-base font-semibold text-slate-800">Add walk-in</h3>
              <label className="block text-sm font-medium text-slate-600">
                Name
                <input
                  required
                  type="text"
                  value={walkInName}
                  onChange={(event) => setWalkInName(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                Email (optional)
                <input
                  type="email"
                  value={walkInEmail}
                  onChange={(event) => setWalkInEmail(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                Category
                <input
                  type="text"
                  value={walkInType}
                  onChange={(event) => setWalkInType(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                Notes
                <textarea
                  value={walkInNotes}
                  onChange={(event) => setWalkInNotes(event.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
                />
              </label>
              <button
                type="submit"
                className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
              >
                Queue guest check-in
              </button>
            </form>

            <form
              className="space-y-3 rounded-2xl border border-slate-200 p-4"
              onSubmit={(event) => {
                void handleManualSubmit(event);
              }}
            >
              <h3 className="text-base font-semibold text-slate-800">Manual attendance</h3>
              <label className="block text-sm font-medium text-slate-600">
                Member email
                <input
                  type="email"
                  value={manualEmail}
                  onChange={(event) => setManualEmail(event.target.value)}
                  placeholder="member@example.com"
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                Action
                <select
                  value={manualAction}
                  onChange={(event) => setManualAction(event.target.value as 'check_in' | 'check_out')}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
                >
                  <option value="check_in">Check in</option>
                  <option value="check_out">Check out</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-600">
                Reason
                <input
                  type="text"
                  value={manualReason}
                  onChange={(event) => setManualReason(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
                />
              </label>
              <button
                type="submit"
                className="w-full rounded-md border border-brand px-4 py-2 text-sm font-medium text-brand hover:bg-brand/10"
              >
                Submit manual update
              </button>
            </form>
          </div>
        </article>

        <aside className="space-y-4 rounded-3xl bg-white p-6 shadow">
          <h2 className="text-base font-semibold text-slate-800">Offline queue</h2>
          {pendingCount === 0 && expiredCount === 0 ? (
            <p className="text-sm text-slate-500">No queued scans. You’re all synced.</p>
          ) : (
            <ul className="space-y-3 text-sm text-slate-600">
              {pendingCount > 0 && (
                <li>
                  <span className="font-semibold text-slate-800">{pendingCount}</span> pending scan
                  {pendingCount > 1 ? 's' : ''} waiting to sync.
                </li>
              )}
              {expiredCount > 0 && (
                <li>
                  <span className="font-semibold text-amber-700">{expiredCount}</span> queued for &gt;48h — reconcile
                  manually.
                </li>
              )}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              void flush().catch((error) => console.error('Failed to sync queued scans', error));
            }}
            disabled={isFlushing}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
          >
            {isFlushing ? 'Syncing…' : 'Sync now'}
          </button>
        </aside>
      </section>
    </div>
  );
}
