import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toDataURL } from 'qrcode';
import { useMemberToken } from '../../hooks/useMemberToken';
import { getJson } from '../../lib/api';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

type MemberEventSummary = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  status: 'UPCOMING' | 'ACTIVE' | 'COMPLETE';
  venue?: string | null;
  allowWalkIns: boolean;
  requireRsvp: boolean;
};

function formatDuration(expiresAt: Date | null): string {
  if (!expiresAt) return '';
  const diffSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const seconds = diffSeconds % 60;
  const minutes = Math.floor(diffSeconds / 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString([], { dateStyle: 'medium' });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MemberQrPage(): JSX.Element {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<string>('');
  const { token, expiresAt, error, isLoading, refresh } = useMemberToken(eventId ?? null);
  const { isOnline } = useNetworkStatus();
  const [eventDetail, setEventDetail] = useState<MemberEventSummary | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function generateQr() {
      if (!token) {
        setDataUrl(null);
        return;
      }
      try {
        const url = await toDataURL(token, { width: 320, errorCorrectionLevel: 'M' });
        if (!cancelled) {
          setDataUrl(url);
        }
      } catch (qrError) {
        if (!cancelled) {
          console.error('Failed to render QR code', qrError);
        }
      }
    }
    void generateQr();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    async function fetchEventDetail() {
      if (!eventId) {
        setEventDetail(null);
        return;
      }
      try {
        const detail = await getJson<MemberEventSummary>(`/member/events/${eventId}`);
        if (!cancelled) {
          setEventDetail(detail);
          setDetailError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unable to load event details';
          setDetailError(message);
        }
      }
    }

    void fetchEventDetail();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    if (!expiresAt) {
      setExpiresIn('');
      return;
    }
    const interval = window.setInterval(() => {
      setExpiresIn(formatDuration(expiresAt));
    }, 500);
    setExpiresIn(formatDuration(expiresAt));
    return () => {
      window.clearInterval(interval);
    };
  }, [expiresAt]);

  const statusLabel = useMemo(() => {
    if (error) {
      return (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Unable to load token: {error}.{' '}
          <button type="button" className="underline" onClick={refresh}>
            Retry
          </button>
        </p>
      );
    }
    if (isLoading) {
      return <p className="text-sm text-slate-600">Generating token…</p>;
    }
    if (expiresAt) {
      return (
        <p className="text-sm text-slate-600">
          Rotating in <span className="font-semibold text-brand">{expiresIn}</span>
        </p>
      );
    }
    return null;
  }, [error, isLoading, expiresAt, expiresIn, refresh]);

  if (!eventId) {
    return (
      <section className="mx-auto mt-16 max-w-lg space-y-4 text-center">
        <h1 className="text-2xl font-semibold text-brand">Event not specified</h1>
        <p className="text-slate-600">
          Provide an event ID to view your rotating QR token. You can start from the{' '}
          <button
            type="button"
            className="text-brand underline"
            onClick={() => navigate('/member')}
          >
            member dashboard
          </button>
          .
        </p>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 py-10">
      <header className="space-y-2 text-center">
        <p className="text-sm text-slate-500">
          <Link to="/member" className="text-brand underline">
            Back to member dashboard
          </Link>
        </p>
        <h1 className="text-3xl font-semibold text-brand">Event QR Token</h1>
        <p className="text-slate-600">Present this code to the steward for check-in.</p>
        {eventDetail ? (
          <div className="space-y-1 text-sm text-slate-500">
            <p className="font-medium text-slate-700">{eventDetail.name}</p>
            <p>
              {formatDate(eventDetail.startTime)} • {formatTime(eventDetail.startTime)} – {formatTime(eventDetail.endTime)}
            </p>
            <p className="text-xs uppercase tracking-wide text-slate-400">Event ID: {eventId}</p>
          </div>
        ) : (
          <p className="text-xs uppercase tracking-wide text-slate-400">Event ID: {eventId}</p>
        )}
        {!isOnline && <p className="text-xs text-amber-600">Offline mode — scans will queue until you reconnect.</p>}
        {detailError && <p className="text-xs text-red-600">{detailError}</p>}
      </header>

      <section className="rounded-3xl bg-white p-6 shadow-lg">
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
            {dataUrl ? (
              <img src={dataUrl} alt="Member QR token" className="h-64 w-64" />
            ) : (
              <div className="flex h-64 w-64 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                {isLoading ? 'Generating…' : 'QR not available'}
              </div>
            )}
          </div>
          {statusLabel}
          <button
            type="button"
            onClick={() => refresh()}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand/90"
          >
            Refresh token
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 text-sm leading-relaxed text-slate-600 shadow">
        <h2 className="mb-2 text-base font-semibold text-slate-800">Tips</h2>
        <ul className="list-disc space-y-1 pl-5 text-left text-sm">
          <li>Keep your screen brightness high so stewards can scan quickly.</li>
          <li>Tokens rotate every 30 seconds. If it expires, tap refresh.</li>
          <li>Lost connection? The steward can queue the scan offline and sync later.</li>
        </ul>
      </section>
    </div>
  );
}
