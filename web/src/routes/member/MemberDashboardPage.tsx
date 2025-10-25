import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'member:lastEventId';

export function MemberDashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const [eventId, setEventId] = useState('');

  useEffect(() => {
    const cached = window.localStorage.getItem(STORAGE_KEY);
    if (cached) {
      setEventId(cached);
    }
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!eventId) return;
    window.localStorage.setItem(STORAGE_KEY, eventId);
    navigate(`/member/events/${encodeURIComponent(eventId)}/token`);
  };

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center space-y-10 py-10">
      <section className="space-y-3 text-center">
        <h1 className="text-3xl font-semibold text-brand">Leo Pass Member</h1>
        <p className="text-slate-600">
          Access your rotating QR token for steward check-in and review upcoming events.
        </p>
      </section>

      <section className="rounded-3xl bg-white p-6 shadow">
        <form className="space-y-4" onSubmit={submit}>
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
            Ask your club steward or admin if you are unsure about the event identifier. You can
            bookmark the QR page once opened.
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
    </div>
  );
}
