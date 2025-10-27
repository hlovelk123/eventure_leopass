import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteJson, getJson, patchJson, postJson, putJson } from '../../lib/api';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import {
  ensureNotificationPermission,
  getPushSubscription,
  pushCapabilityAvailable,
  subscribeToPush,
  subscriptionToRegistrationPayload,
  unsubscribeFromPush
} from '../../lib/pushNotifications';

const STORAGE_KEY = 'member:lastEventId';

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

type AttendanceHistoryItem = {
  eventId: string;
  eventName: string;
  checkInTs: string;
  checkOutTs: string | null;
  method: string;
  reportCategory: string;
};

type NotificationCategory = 'SYSTEM' | 'REMINDER' | 'EVENT' | 'ALERT';

type MemberNotification = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  category: NotificationCategory;
};

type MemberDashboard = {
  today: MemberEventSummary[];
  upcoming: MemberEventSummary[];
  history: AttendanceHistoryItem[];
  notifications: MemberNotification[];
};

type NotificationPreferences = {
  pushEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatCategoryLabel(category: NotificationCategory): string {
  switch (category) {
    case 'SYSTEM':
      return 'System';
    case 'REMINDER':
      return 'Reminder';
    case 'EVENT':
      return 'Event';
    case 'ALERT':
      return 'Alert';
    default:
      return category;
  }
}

export function MemberDashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const { isOnline } = useNetworkStatus();
  const [eventId, setEventId] = useState('');
  const [dashboard, setDashboard] = useState<MemberDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [markingNotifications, setMarkingNotifications] = useState(false);
  const [pushStatus, setPushStatus] = useState<'idle' | 'enabling' | 'disabling'>('idle');
  const [updatingPreferences, setUpdatingPreferences] = useState(false);
  const pushSupported = pushCapabilityAvailable();
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission
  );

  useEffect(() => {
    const cached = window.localStorage.getItem(STORAGE_KEY);
    if (cached) {
      setEventId(cached);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function loadDashboard() {
      try {
        setLoading(true);
        const response = await getJson<MemberDashboard>('/member/dashboard');
        if (isMounted) {
          setDashboard(response);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          const message = err instanceof Error ? err.message : 'Unable to load dashboard';
          setError(message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadPreferences() {
      try {
        const response = await getJson<NotificationPreferences>('/notifications/preferences');
        if (active) {
          setPreferences(response);
          setPreferencesError(null);
        }
      } catch (err) {
        if (active) {
          const message = err instanceof Error ? err.message : 'Unable to load notification preferences';
          setPreferencesError(message);
        }
      } finally {
        if (active) {
          setPreferencesLoading(false);
        }
      }
    }
    void loadPreferences();
    return () => {
      active = false;
    };
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!eventId) return;
    window.localStorage.setItem(STORAGE_KEY, eventId);
    navigate(`/member/events/${encodeURIComponent(eventId)}/token`);
  };

  const notifications = useMemo(() => dashboard?.notifications ?? [], [dashboard]);
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications]
  );

  const handleMarkAllRead = useCallback(async () => {
    if (notifications.length === 0) {
      return;
    }
    setMarkingNotifications(true);
    try {
      await patchJson<{ updated: number }>('/notifications/mark-all-read', {});
      const readAt = new Date().toISOString();
      setDashboard((prev) =>
        prev
          ? {
              ...prev,
              notifications: prev.notifications.map((notification) => ({
                ...notification,
                readAt
              }))
            }
          : prev
      );
      setPreferencesError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update notifications';
      setPreferencesError(message);
    } finally {
      setMarkingNotifications(false);
    }
  }, [notifications.length]);

  const handleEmailToggle = useCallback(
    async (enabled: boolean) => {
      setPreferencesError(null);
      setUpdatingPreferences(true);
      try {
        const updated = await putJson<NotificationPreferences>('/notifications/preferences', {
          emailEnabled: enabled
        });
        setPreferences(updated);
        setPreferencesError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update email preference';
        setPreferencesError(message);
      } finally {
        setUpdatingPreferences(false);
      }
    },
    []
  );

  const handleEnablePush = useCallback(async () => {
    if (!pushSupported) {
      setPreferencesError('Push notifications are not available on this device.');
      return;
    }
    setPreferencesError(null);
    setPushStatus('enabling');
    setUpdatingPreferences(true);
    try {
      const permission = await ensureNotificationPermission();
      setPushPermission(permission);
      if (permission !== 'granted') {
        throw new Error('Enable notifications in your browser to receive push alerts.');
      }
      const subscription = await subscribeToPush();
      const payload = subscriptionToRegistrationPayload(subscription);
      await postJson('/notifications/subscriptions', {
        ...payload,
        userAgent: window.navigator.userAgent
      });
      const updated = await putJson<NotificationPreferences>('/notifications/preferences', {
        pushEnabled: true
      });
      setPreferences(updated);
      setPreferencesError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enable push notifications';
      setPreferencesError(message);
    } finally {
      setPushStatus('idle');
      setUpdatingPreferences(false);
    }
  }, [pushSupported]);

  const handleDisablePush = useCallback(async () => {
    setPreferencesError(null);
    setPushStatus('disabling');
    setUpdatingPreferences(true);
    try {
      const subscription = await getPushSubscription();
      if (subscription) {
        await deleteJson('/notifications/subscriptions', { endpoint: subscription.endpoint });
      }
      await unsubscribeFromPush();
      const updated = await putJson<NotificationPreferences>('/notifications/preferences', {
        pushEnabled: false
      });
      setPreferences(updated);
      setPreferencesError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disable push notifications';
      setPreferencesError(message);
    } finally {
      setPushStatus('idle');
      setUpdatingPreferences(false);
    }
  }, []);

  const handleTogglePush = useCallback(async () => {
    if (!preferences) {
      return;
    }
    if (preferences.pushEnabled) {
      await handleDisablePush();
    } else {
      await handleEnablePush();
    }
  }, [handleDisablePush, handleEnablePush, preferences]);

  const pushButtonDisabled = pushStatus !== 'idle' || updatingPreferences || preferencesLoading;
  const emailToggleDisabled = updatingPreferences || preferencesLoading;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-5xl flex-col gap-6 px-4 py-10" role="main">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-3xl font-semibold text-brand">Welcome to Leo Pass</h1>
            <p className="text-slate-600">Your events, QR access, and attendance history live here.</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {isOnline ? 'Online' : 'Offline mode'}
          </span>
        </div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </header>

      {loading && <div className="rounded-2xl bg-white p-6 text-center text-slate-500 shadow">Loading your dashboard…</div>}

      {!loading && dashboard && (
        <>
          <section className="grid gap-6 md:grid-cols-2">
            <article className="rounded-2xl bg-white p-5 shadow">
              <h2 className="text-lg font-semibold text-slate-800">Today</h2>
              {dashboard.today.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No events scheduled today.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {dashboard.today.map((event) => (
                    <li key={event.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm uppercase tracking-wide text-slate-500">{event.status}</p>
                          <h3 className="text-lg font-semibold text-slate-800">{event.name}</h3>
                          <p className="text-sm text-slate-500">
                            {formatTime(event.startTime)} – {formatTime(event.endTime)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => navigate(`/member/events/${event.id}/token`)}
                          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand/90"
                        >
                          Show QR
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>{event.requireRsvp ? 'RSVP required' : 'Walk-ins welcome'}</span>
                        {event.venue && <span>Venue: {event.venue}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="rounded-2xl bg-white p-5 shadow">
              <h2 className="text-lg font-semibold text-slate-800">Upcoming</h2>
              {dashboard.upcoming.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No upcoming events yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {dashboard.upcoming.map((event) => (
                    <li key={event.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-slate-800">{event.name}</h3>
                          <p className="text-sm text-slate-500">{formatDateTime(event.startTime)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => navigate(`/member/events/${event.id}/token`)}
                          className="rounded-md border border-brand px-3 py-2 text-sm font-medium text-brand hover:bg-brand/10"
                        >
                          Preview QR
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Notifications</h2>
                <p className="text-xs text-slate-600">
                  {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                disabled={markingNotifications || notifications.length === 0}
                className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                Mark all read
              </button>
            </div>
            {preferencesError && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{preferencesError}</p>
            )}
            {notifications.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">You’re all caught up.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {notifications.map((note) => (
                  <li
                    key={note.id}
                    className={`rounded-xl border p-4 ${
                      note.readAt ? 'border-slate-200 bg-white' : 'border-brand/30 bg-brand/5'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800">{note.title}</h3>
                        <p className="text-xs uppercase tracking-wide text-slate-700">
                          {formatCategoryLabel(note.category)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!note.readAt && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase text-white">New</span>}
                        <span className="text-xs text-slate-700">{formatDateTime(note.createdAt)}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{note.body}</p>
                  </li>
                ))}
              </ul>
            )}

            {!preferencesLoading && (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Push notifications</p>
                      <p className="text-xs text-slate-600">
                        {pushSupported
                          ? pushPermission === 'granted'
                            ? 'Get steward updates and reminders on this device.'
                            : 'Allow browser notifications to enable push alerts.'
                          : 'Push notifications are unavailable on this device.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleTogglePush()}
                      disabled={pushButtonDisabled || !pushSupported}
                      className={`rounded-md px-3 py-2 text-sm font-medium ${
                        preferences?.pushEnabled
                          ? 'border border-red-200 text-red-600 hover:bg-red-50 disabled:border-slate-200 disabled:text-slate-500'
                          : 'bg-brand text-white hover:bg-brand/90 disabled:bg-slate-300'
                      }`}
                    >
                      {preferences?.pushEnabled ? 'Disable push' : 'Enable push'}
                    </button>
                  </div>
                  {pushStatus !== 'idle' && (
                    <p className="mt-2 text-xs text-slate-500">
                      {pushStatus === 'enabling' ? 'Setting up push notifications…' : 'Removing push subscription…'}
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <label className="flex items-center justify-between gap-3 text-sm font-medium text-slate-700">
                    Email alerts
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={preferences?.emailEnabled ?? false}
                      onChange={(event) => void handleEmailToggle(event.target.checked)}
                      disabled={emailToggleDisabled}
                    />
                  </label>
                  <p className="mt-1 text-xs text-slate-500">
                    Receive important updates in your inbox as a backup channel.
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white p-5 shadow">
            <h2 className="text-lg font-semibold text-slate-800">Attendance history</h2>
            {dashboard.history.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No attendance recorded yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Event</th>
                      <th className="px-3 py-2">Check-in</th>
                      <th className="px-3 py-2">Check-out</th>
                      <th className="px-3 py-2">Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-600">
                    {dashboard.history.map((item) => (
                      <tr key={`${item.eventId}-${item.checkInTs}`}>
                        <td className="px-3 py-2">{item.eventName}</td>
                        <td className="px-3 py-2">{formatDateTime(item.checkInTs)}</td>
                        <td className="px-3 py-2">{item.checkOutTs ? formatDateTime(item.checkOutTs) : '-'}</td>
                        <td className="px-3 py-2 capitalize">{item.method.toLowerCase()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <section className="rounded-3xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-slate-800">Jump to event QR</h2>
        <form className="mt-4 space-y-4" onSubmit={submit}>
          <label className="block text-left">
            <span className="text-sm font-medium text-slate-600">Event ID</span>
            <input
              type="text"
              value={eventId}
              onChange={(event) => setEventId(event.target.value.trim())}
              placeholder="event-uuid-1234"
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
            />
          </label>
          <p className="text-xs text-slate-500">
            Ask your club steward or admin if you are unsure about the event identifier. You can bookmark the QR page once opened.
          </p>
          <button
            type="submit"
            disabled={!eventId}
            className="w-full rounded-md bg-brand px-4 py-2 font-medium text-white disabled:bg-slate-300"
          >
            View my QR token
          </button>
        </form>
      </section>
    </main>
  );
}
