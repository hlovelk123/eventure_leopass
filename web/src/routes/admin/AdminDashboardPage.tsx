import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { getApiUrl, getJson, patchJson, postJson } from '../../lib/api';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

type AdminEventItem = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  allowWalkIns: boolean;
  requireRsvp: boolean;
  hostClubId?: string | null;
  status: string;
};

type AdminDashboard = {
  totals: {
    activeMembers: number;
    invitedMembers: number;
    activeSessions: number;
    upcomingEvents: number;
  };
  upcoming: AdminEventItem[];
  pendingInvites: { id: string; email: string; displayName: string }[];
};

type CreateEventForm = {
  name: string;
  startTime: string;
  endTime: string;
  hostClubId: string;
  geofenceRadiusM: number;
  reminderBeforeEndMin: number;
  autoCheckoutGraceMin: number;
  allowWalkIns: boolean;
  rsvpRequired: boolean;
};

type ExtendEventForm = {
  eventId: string;
  minutes: number;
  reason: string;
};

type EventReportCategorySummary = {
  category: string;
  label: string;
  attendeeCount: number;
  guestCount: number;
};

type EventReport = {
  event: {
    id: string;
    name: string;
    status: string;
    mode: string;
    allowWalkIns: boolean;
    hostClubs: { id: string; name: string }[];
  };
  timeline: {
    scheduledStart: string;
    scheduledEnd: string;
    actualStart: string | null;
    actualEnd: string | null;
    scheduledDurationMinutes: number;
    actualDurationMinutes: number | null;
    overrunMinutes: number | null;
  };
  totals: {
    totalAttendees: number;
    guestCount: number;
    manualCount: number;
    stillCheckedInCount: number;
  };
  categories: EventReportCategorySummary[];
  attendees: {
    id: string;
    name: string;
    categoryLabel: string;
    isGuest: boolean;
    checkIn: string | null;
    checkOut: string | null;
    totalMinutes: number | null;
  }[];
};

const COLOMBO_FORMATTER = new Intl.DateTimeFormat('en-LK', {
  timeZone: 'Asia/Colombo',
  dateStyle: 'medium',
  timeStyle: 'short'
});

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

const createDefaults: CreateEventForm = {
  name: '',
  startTime: '',
  endTime: '',
  hostClubId: '',
  geofenceRadiusM: 100,
  reminderBeforeEndMin: 10,
  autoCheckoutGraceMin: 5,
  allowWalkIns: true,
  rsvpRequired: false
};

const extendDefaults: ExtendEventForm = {
  eventId: '',
  minutes: 15,
  reason: 'Program running late'
};

export function AdminDashboardPage(): JSX.Element {
  const { isOnline } = useNetworkStatus();
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [events, setEvents] = useState<AdminEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reportEventId, setReportEventId] = useState('');
  const [report, setReport] = useState<EventReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateEventForm>(createDefaults);
  const [extendForm, setExtendForm] = useState<ExtendEventForm>(extendDefaults);
  const [creating, setCreating] = useState(false);
  const [extending, setExtending] = useState(false);

  const formatColombo = useCallback((value: string | null) => {
    if (!value) {
      return '—';
    }
    return COLOMBO_FORMATTER.format(new Date(value));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboardResponse, eventsResponse] = await Promise.all([
        getJson<AdminDashboard>('/admin/dashboard'),
        getJson<AdminEventItem[]>('/admin/events')
      ]);
      setDashboard(dashboardResponse);
      setEvents(eventsResponse);
      setMessage(null);
      if (eventsResponse.length > 0) {
        setReportEventId((current) => {
          if (current && eventsResponse.some((evt) => evt.id === current)) {
            return current;
          }
          return eventsResponse[0].id;
        });
      } else {
        setReportEventId('');
        setReport(null);
      }
    } catch (err) {
      const messageText = err instanceof Error ? err.message : 'Failed to load admin data';
      setError(messageText);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (events.length > 0 && !extendForm.eventId) {
      setExtendForm((prev) => ({
        ...prev,
        eventId: events[0].id
      }));
    }
  }, [events, extendForm.eventId]);

  useEffect(() => {
    if (!reportEventId) {
      setReport(null);
      return;
    }
    let active = true;
    setReportLoading(true);
    setReportError(null);
    getJson<EventReport>(`/admin/events/${reportEventId}/report`)
      .then((response) => {
        if (!active) {
          return;
        }
        setReport(response);
      })
      .catch((err) => {
        if (!active) {
          return;
        }
        const messageText = err instanceof Error ? err.message : 'Failed to load event report';
        setReportError(messageText);
      })
      .finally(() => {
        if (active) {
          setReportLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [reportEventId]);

  const downloadReportCsv = useCallback(() => {
    if (!reportEventId) {
      return;
    }
    const url = getApiUrl(`/admin/events/${reportEventId}/report.csv`);
    window.open(url, '_blank', 'noopener');
  }, [reportEventId]);

  const selectedExtendEvent = useMemo(
    () => events.find((event) => event.id === extendForm.eventId) ?? null,
    [events, extendForm.eventId]
  );

  const handleCreateChange = <K extends keyof CreateEventForm>(field: K, value: CreateEventForm[K]) => {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await postJson('/admin/events', {
        name: createForm.name,
        startTime: new Date(createForm.startTime).toISOString(),
        endTime: new Date(createForm.endTime).toISOString(),
        hostClubId: createForm.hostClubId || undefined,
        geofenceRadiusM: createForm.geofenceRadiusM || undefined,
        reminderBeforeEndMin: createForm.reminderBeforeEndMin || undefined,
        autoCheckoutGraceMin: createForm.autoCheckoutGraceMin || undefined,
        allowWalkIns: createForm.allowWalkIns,
        rsvpRequired: createForm.rsvpRequired
      });
      setCreateForm(createDefaults);
      setMessage('Event created successfully.');
      await loadData();
    } catch (err) {
      const messageText = err instanceof Error ? err.message : 'Failed to create event';
      setError(messageText);
    } finally {
      setCreating(false);
    }
  };

  const handleExtendSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!extendForm.eventId) {
      setError('Select an event to extend.');
      return;
    }
    setExtending(true);
    setError(null);
    try {
      await postJson(`/admin/events/${extendForm.eventId}/extend`, {
        minutes: extendForm.minutes,
        reason: extendForm.reason
      });
      setMessage('Event extended successfully.');
      await loadData();
    } catch (err) {
      const messageText = err instanceof Error ? err.message : 'Failed to extend event';
      setError(messageText);
    } finally {
      setExtending(false);
    }
  };

  const updateEventSettings = async (eventId: string, updates: Partial<Pick<CreateEventForm, 'allowWalkIns' | 'rsvpRequired'>>) => {
    setError(null);
    try {
      await patchJson(`/admin/events/${eventId}`, updates);
      setMessage('Event settings updated.');
      await loadData();
    } catch (err) {
      const messageText = err instanceof Error ? err.message : 'Failed to update event';
      setError(messageText);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Admin console</p>
            <h1 className="text-3xl font-semibold text-brand">Events &amp; attendance</h1>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {isOnline ? 'Online' : 'Offline mode'}
          </span>
        </div>
        <p className="text-sm text-slate-500">
          Review member totals, manage events, and coordinate stewards. Changes take effect immediately for authenticated users.
        </p>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {message && !error && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
      </header>

      {loading && <div className="rounded-2xl bg-white p-6 text-center text-slate-500 shadow">Loading admin data…</div>}

      {!loading && dashboard && (
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl bg-white p-5 shadow">
            <h2 className="text-xs uppercase tracking-wide text-slate-400">Active members</h2>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{dashboard.totals.activeMembers}</p>
          </article>
          <article className="rounded-2xl bg-white p-5 shadow">
            <h2 className="text-xs uppercase tracking-wide text-slate-400">Invited members</h2>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{dashboard.totals.invitedMembers}</p>
          </article>
          <article className="rounded-2xl bg-white p-5 shadow">
            <h2 className="text-xs uppercase tracking-wide text-slate-400">Active sessions</h2>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{dashboard.totals.activeSessions}</p>
          </article>
          <article className="rounded-2xl bg-white p-5 shadow">
            <h2 className="text-xs uppercase tracking-wide text-slate-400">Upcoming events</h2>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{dashboard.totals.upcomingEvents}</p>
          </article>
        </section>
      )}

      {!loading && dashboard && (
        <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <article className="space-y-4 rounded-3xl bg-white p-6 shadow">
            <header className="space-y-1">
              <h2 className="text-xl font-semibold text-slate-800">Upcoming highlights</h2>
              <p className="text-sm text-slate-500">Highest priority events for the next few days.</p>
            </header>
            {dashboard.upcoming.length === 0 ? (
              <p className="text-sm text-slate-500">No future events scheduled.</p>
            ) : (
              <ul className="space-y-3">
                {dashboard.upcoming.map((event) => (
                  <li key={event.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-400">{event.status}</p>
                        <h3 className="text-lg font-semibold text-slate-800">{event.name}</h3>
                        <p className="text-sm text-slate-500">{formatDateTime(event.startTime)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2 text-xs text-slate-500">
                        <span>{event.requireRsvp ? 'RSVP required' : 'Walk-ins allowed'}</span>
                        {event.hostClubId && <span>Club: {event.hostClubId.slice(0, 8)}…</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="space-y-3 rounded-3xl bg-white p-6 shadow">
            <header>
              <h2 className="text-lg font-semibold text-slate-800">Pending invites</h2>
              <p className="text-xs text-slate-500">Members who have not activated their accounts.</p>
            </header>
            {dashboard.pendingInvites.length === 0 ? (
              <p className="text-sm text-slate-500">No outstanding invites.</p>
            ) : (
              <ul className="space-y-2 text-sm text-slate-600">
                {dashboard.pendingInvites.map((invite) => (
                  <li key={invite.id} className="rounded-xl border border-slate-200 p-3">
                    <p className="font-medium text-slate-800">{invite.displayName || invite.email}</p>
                    <p className="text-xs text-slate-500">{invite.email}</p>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <article className="space-y-5 rounded-3xl bg-white p-6 shadow">
          <header className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-800">Create event</h2>
            <p className="text-sm text-slate-500">Define event timing and access rules. You can tweak settings later.</p>
          </header>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              void handleCreateSubmit(event);
            }}
          >
            <label className="md:col-span-2 text-sm font-medium text-slate-600">
              Name
              <input
                required
                type="text"
                value={createForm.name}
                onChange={(e) => handleCreateChange('name', e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Starts
              <input
                required
                type="datetime-local"
                value={createForm.startTime}
                onChange={(e) => handleCreateChange('startTime', e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Ends
              <input
                required
                type="datetime-local"
                value={createForm.endTime}
                onChange={(e) => handleCreateChange('endTime', e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Host club ID
              <input
                type="text"
                value={createForm.hostClubId}
                onChange={(e) => handleCreateChange('hostClubId', e.target.value)}
                placeholder="Optional"
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Geofence radius (m)
              <input
                type="number"
                min={50}
                max={2000}
                value={createForm.geofenceRadiusM}
                onChange={(e) => handleCreateChange('geofenceRadiusM', Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Reminder before end (min)
              <input
                type="number"
                min={0}
                max={180}
                value={createForm.reminderBeforeEndMin}
                onChange={(e) => handleCreateChange('reminderBeforeEndMin', Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Auto checkout grace (min)
              <input
                type="number"
                min={0}
                max={120}
                value={createForm.autoCheckoutGraceMin}
                onChange={(e) => handleCreateChange('autoCheckoutGraceMin', Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </label>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <input
                id="allow-walkins"
                type="checkbox"
                checked={createForm.allowWalkIns}
                onChange={(e) => handleCreateChange('allowWalkIns', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
              />
              <label htmlFor="allow-walkins">Allow walk-ins</label>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <input
                id="require-rsvp"
                type="checkbox"
                checked={createForm.rsvpRequired}
                onChange={(e) => handleCreateChange('rsvpRequired', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
              />
              <label htmlFor="require-rsvp">Require RSVP</label>
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:bg-slate-300"
              >
                {creating ? 'Creating…' : 'Create event'}
              </button>
            </div>
          </form>
        </article>

        <article className="space-y-4 rounded-3xl bg-white p-6 shadow">
          <header className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-800">Extend event</h2>
            <p className="text-sm text-slate-500">Add extra minutes when programmes overrun. Hard limit is 60 minutes.</p>
          </header>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              void handleExtendSubmit(event);
            }}
          >
            <label className="block text-sm font-medium text-slate-600">
              Event
              <select
                value={extendForm.eventId}
                onChange={(e) => setExtendForm((prev) => ({ ...prev, eventId: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
              >
                <option value="">Select event</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </label>
            {selectedExtendEvent && (
              <p className="text-xs text-slate-500">
                Current end: {formatDateTime(selectedExtendEvent.endTime)} · status {selectedExtendEvent.status}
              </p>
            )}
            <label className="block text-sm font-medium text-slate-600">
              Minutes to add
              <input
                type="number"
                min={1}
                max={60}
                value={extendForm.minutes}
                onChange={(e) => setExtendForm((prev) => ({ ...prev, minutes: Number(e.target.value) }))}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </label>
            <label className="block text-sm font-medium text-slate-600">
              Reason
              <input
                type="text"
                value={extendForm.reason}
                onChange={(e) => setExtendForm((prev) => ({ ...prev, reason: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={extending}
              className="w-full rounded-md border border-brand px-4 py-2 text-sm font-medium text-brand hover:bg-brand/10 disabled:bg-slate-300"
            >
              {extending ? 'Extending…' : 'Extend event'}
            </button>
          </form>
        </article>
      </section>

      <section className="space-y-5 rounded-3xl bg-white p-6 shadow">
        <header className="space-y-1">
          <h2 className="text-xl font-semibold text-slate-800">Event report</h2>
          <p className="text-sm text-slate-500">
            Review attendance breakdowns and download CSV exports in Asia/Colombo timezone.
          </p>
        </header>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">Create an event to unlock reporting.</p>
        ) : (
          <>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <label className="flex flex-col text-sm font-medium text-slate-600 md:w-72">
                Event
                <select
                  value={reportEventId}
                  onChange={(event) => setReportEventId(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
                >
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={downloadReportCsv}
                  disabled={!reportEventId || reportLoading}
                  className="rounded-md border border-brand px-4 py-2 text-sm font-medium text-brand hover:bg-brand/10 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  Download CSV
                </button>
              </div>
            </div>
            {reportError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{reportError}</p>
            )}
            {reportLoading && (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Loading report…</div>
            )}
            {!reportLoading && report && (
              <div className="space-y-5">
                <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
                  <article className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold text-slate-700">Timeline</h3>
                    <dl className="mt-2 grid gap-2 text-sm text-slate-600">
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt className="font-medium text-slate-500">Scheduled</dt>
                        <dd>
                          {formatColombo(report.timeline.scheduledStart)} →{' '}
                          {formatColombo(report.timeline.scheduledEnd)}
                        </dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt className="font-medium text-slate-500">Actual</dt>
                        <dd>
                          {formatColombo(report.timeline.actualStart)} →{' '}
                          {formatColombo(report.timeline.actualEnd)}
                        </dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt className="font-medium text-slate-500">Duration</dt>
                        <dd>
                          Planned {report.timeline.scheduledDurationMinutes} min · Actual{' '}
                          {report.timeline.actualDurationMinutes ?? '—'} min
                        </dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt className="font-medium text-slate-500">Overrun</dt>
                        <dd>
                          {report.timeline.overrunMinutes === null
                            ? '—'
                            : report.timeline.overrunMinutes === 0
                            ? 'On schedule'
                            : report.timeline.overrunMinutes > 0
                            ? `${report.timeline.overrunMinutes} min over`
                            : `${Math.abs(report.timeline.overrunMinutes)} min under`}
                        </dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt className="font-medium text-slate-500">Host clubs</dt>
                        <dd>
                          {report.event.hostClubs.length === 0
                            ? '—'
                            : report.event.hostClubs.map((club) => club.name).join(', ')}
                        </dd>
                      </div>
                    </dl>
                  </article>
                  <article className="rounded-2xl border border-slate-100 bg-white p-4">
                    <h3 className="text-sm font-semibold text-slate-700">Totals</h3>
                    <ul className="mt-2 space-y-2 text-sm text-slate-600">
                      <li className="flex justify-between">
                        <span>Attendees</span>
                        <span className="font-semibold text-slate-800">{report.totals.totalAttendees}</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Invited guests</span>
                        <span className="font-semibold text-slate-800">{report.totals.guestCount}</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Manual actions</span>
                        <span className="font-semibold text-slate-800">{report.totals.manualCount}</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Still checked-in</span>
                        <span className="font-semibold text-slate-800">{report.totals.stillCheckedInCount}</span>
                      </li>
                    </ul>
                  </article>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2 text-right">Attendees</th>
                        <th className="px-3 py-2 text-right">Invited guests</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-600">
                      {report.categories.map((category) => (
                        <tr key={category.category}>
                          <td className="px-3 py-2 font-medium text-slate-800">{category.label}</td>
                          <td className="px-3 py-2 text-right">{category.attendeeCount}</td>
                          <td className="px-3 py-2 text-right">{category.guestCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Recent attendees</h3>
                  {report.attendees.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No attendance recorded yet.</p>
                  ) : (
                    <ul className="mt-2 grid gap-2 md:grid-cols-2">
                      {report.attendees.slice(0, 6).map((attendee) => (
                        <li key={attendee.id} className="rounded-xl border border-slate-100 p-3 text-sm text-slate-600">
                          <p className="font-medium text-slate-800">
                            {attendee.name} ·{' '}
                            <span className="text-xs uppercase tracking-wide text-slate-400">
                              {attendee.categoryLabel}
                            </span>
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatColombo(attendee.checkIn)} → {formatColombo(attendee.checkOut)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {attendee.isGuest ? 'Invited guest' : 'Member'} ·{' '}
                            {attendee.totalMinutes != null ? `${attendee.totalMinutes} min` : '—'}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="rounded-3xl bg-white p-6 shadow">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">All events</h2>
            <p className="text-sm text-slate-500">Toggle access modes or export details for steward briefings.</p>
          </div>
          <button
            type="button"
            className="text-sm text-brand underline"
            onClick={() => {
              void loadData();
            }}
          >
            Refresh list
          </button>
        </header>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">No events have been created yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Event</th>
                  <th className="px-3 py-2">Window</th>
                  <th className="px-3 py-2">Mode</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-600">
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-800">{event.name}</p>
                      <p className="text-xs text-slate-400">{event.id}</p>
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <span className="block">{formatDateTime(event.startTime)}</span>
                      <span className="block text-xs text-slate-400">→ {formatDateTime(event.endTime)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-1 text-xs">
                        <span>{event.requireRsvp ? 'RSVP required' : 'Walk-ins allowed'}</span>
                        <span>{event.allowWalkIns ? 'Walk-ins enabled' : 'Walk-ins disabled'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm uppercase tracking-wide text-slate-500">{event.status}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          onClick={() => {
                            void updateEventSettings(event.id, { allowWalkIns: !event.allowWalkIns });
                          }}
                        >
                          {event.allowWalkIns ? 'Disable walk-ins' : 'Enable walk-ins'}
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          onClick={() => {
                            void updateEventSettings(event.id, { rsvpRequired: !event.requireRsvp });
                          }}
                        >
                          {event.requireRsvp ? 'Mark walk-in' : 'Require RSVP'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
