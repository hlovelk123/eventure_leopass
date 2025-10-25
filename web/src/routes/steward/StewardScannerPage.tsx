import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useScanQueue } from '../../hooks/useScanQueue';
import { useJwks } from '../../lib/jwks';
import { postJson } from '../../lib/api';

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

const STATUS_RESET_MS = 4_000;
const STORAGE_KEY_DEVICE_ID = 'steward:deviceId';

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

  const saveDeviceId = useCallback(
    (value: string) => {
      setDeviceId(value);
      window.localStorage.setItem(STORAGE_KEY_DEVICE_ID, value);
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
      const response = await postJson<ScanResponse>(
        '/scan',
        {
          token,
          scannerDeviceId: deviceId || undefined,
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
      await enqueue({
        token,
        idempotencyKey,
        scannerDeviceId: deviceId || null,
        scannedAt
      });
      setScanStatus('queued');
      setResultMessage('Scan queued — will sync when you reconnect.');
      resetStatusSoon();
    },
    [enqueue, deviceId, resetStatusSoon]
  );

  const handleToken = useCallback(async (tokenValue: string) => {
    if (!tokenValue || tokenValue === recentTokenRef.current) {
      return;
    }
    recentTokenRef.current = tokenValue;
    setIsVerifying(true);
    try {
      const { payload } = await verifyToken(tokenValue);
      const scannedAt = new Date().toISOString();
      const idempotencyKey = crypto.randomUUID();

      if (!isOnline) {
        await enqueueOffline(tokenValue, idempotencyKey, scannedAt);
        setResultMessage(`Offline — queued event ${payload.eventId}`);
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
  }, [verifyToken, isOnline, enqueueOffline, submitOnline, resetStatusSoon]);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    setScanStatus('scanning');
    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result, error) => {
        if (result) {
          const text = result.getText();
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

          <article className="space-y-3 rounded-2xl bg-white p-5 text-sm text-slate-600 shadow">
            <h2 className="text-base font-semibold text-slate-800">Device fingerprint</h2>
            <p className="text-xs text-slate-500">
              This ID identifies the steward device when scans sync. Use a descriptive label (e.g. “Hall Entrance Pixel 7”).
            </p>
            <input
              type="text"
              value={deviceId}
              onChange={(event) => saveDeviceId(event.target.value)}
              placeholder="Scanner device ID"
              className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
            />
          </article>

          <article className="rounded-2xl bg-white p-5 text-sm leading-relaxed text-slate-600 shadow">
            <h2 className="text-base font-semibold text-slate-800">Guidelines</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              <li>Hold the QR steady about 30 cm away for best results.</li>
              <li>If offline, continue scanning — queued items sync automatically when back online.</li>
              <li>Items older than 48 hours need manual review; tap “Sync queued scans” after resolving connectivity.</li>
            </ul>
          </article>
        </div>
      </section>
    </div>
  );
}
