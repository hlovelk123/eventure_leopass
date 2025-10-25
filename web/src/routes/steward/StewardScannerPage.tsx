import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export function StewardScannerPage(): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const recentTokenRef = useRef<string | null>(null);
  const resetTimerRef = useRef<number | undefined>(undefined);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'submitting' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [resultMessage, setResultMessage] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  const handleSubmit = useCallback(
    async (token: string) => {
      setScanStatus('submitting');
      setSubmitError(null);
      try {
        const idempotencyKey = crypto.randomUUID();
        const response = await postJson<ScanResponse>(
          '/scan',
          {
            token,
            scannedAt: new Date().toISOString()
          },
          {
            headers: {
              'idempotency-key': idempotencyKey
            }
          }
        );
        setResult(response);
        setScanStatus('success');
        const verb = response.action === 'check_in' ? 'checked in' : 'checked out';
        setResultMessage(`Member ${verb}. Session ${response.attendanceSession.id.slice(0, 8)}…`);
        resetStatusSoon();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to submit scan';
        setSubmitError(message);
        setScanStatus('error');
        resetStatusSoon();
      }
    },
    [resetStatusSoon]
  );

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    setScanStatus('scanning');
    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result, error) => {
        if (result) {
          const text = result.getText();
          if (!text || text === recentTokenRef.current) {
            return;
          }
          recentTokenRef.current = text;
          void handleSubmit(text);
        }
        if (error && !(error instanceof NotFoundException)) {
          console.error('Scanner error', error);
        }
      })
      .then(() => setCameraReady(true))
      .catch((error) => {
        console.error('Unable to initialise camera', error);
        setCameraError('Unable to access camera. Allow camera permissions and reload.');
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
  }, [handleSubmit]);

  const statusBanner = useMemo(() => {
    if (submitError) {
      return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>;
    }
    if (scanStatus === 'success' && result) {
      return (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {resultMessage || 'Scan accepted'}
        </p>
      );
    }
    if (scanStatus === 'submitting') {
      return <p className="text-sm text-slate-600">Submitting scan…</p>;
    }
    if (!cameraReady && !cameraError) {
      return <p className="text-sm text-slate-500">Connecting to camera…</p>;
    }
    if (cameraError) {
      return <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">{cameraError}</p>;
    }
    return null;
  }, [cameraReady, cameraError, scanStatus, result, submitError, resultMessage]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold text-brand">Steward Scanner</h1>
        <p className="text-slate-600">
          Hold member QR codes in the frame. Tokens rotate every 30 seconds; duplicates will be
          ignored automatically.
        </p>
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
            <h2 className="text-base font-semibold text-slate-800">Scan status</h2>
            <dl className="mt-3 space-y-2 text-sm text-slate-600">
              <div className="flex justify-between">
                <dt>Mode</dt>
                <dd className="font-medium uppercase tracking-wide text-slate-500">{scanStatus}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Last session</dt>
                <dd>
                  {result ? (
                    <span>
                      {result.attendanceSession.userId ?? 'guest'} ·{' '}
                      <span className="font-mono text-xs">
                        {result.attendanceSession.id.slice(0, 8)}
                      </span>
                    </span>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
          </article>

          <article className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow">
            <h2 className="text-base font-semibold text-slate-800">Guidelines</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              <li>Hold the QR steady about 30 cm away for best results.</li>
              <li>Check the banner after each scan to confirm check-in or check-out.</li>
              <li>Network unavailable? Leave the page open; scans will retry when back online.</li>
            </ul>
          </article>
        </div>
      </section>
    </div>
  );
}
