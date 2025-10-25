import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getJson } from '../lib/api';

type TokenResponse = {
  token: string;
  expiresAt: string;
};

type MemberTokenState =
  | { status: 'idle'; token: null; expiresAt: null }
  | { status: 'loading'; token: null; expiresAt: null }
  | { status: 'ready'; token: string; expiresAt: Date }
  | { status: 'error'; token: null; expiresAt: null; error: string };

function computeRefreshDelay(expiresAt: Date, now = new Date()): number {
  const msUntilExpiry = expiresAt.getTime() - now.getTime();
  const refreshBuffer = 5_000;
  return Math.max(msUntilExpiry - refreshBuffer, 5_000);
}

export function useMemberToken(eventId: string | null) {
  const [state, setState] = useState<MemberTokenState>({ status: 'idle', token: null, expiresAt: null });
  const refreshTimer = useRef<number | undefined>(undefined);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimer.current !== undefined) {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = undefined;
    }
  }, []);

  const fetchToken = useCallback(async () => {
    if (!eventId) {
      setState({ status: 'idle', token: null, expiresAt: null });
      return;
    }

    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading', token: null, expiresAt: null }));

    try {
      const response = await getJson<TokenResponse>(`/member/events/${eventId}/token`);
      const expiresAt = new Date(response.expiresAt);
      setState({ status: 'ready', token: response.token, expiresAt });

      clearRefreshTimer();
      refreshTimer.current = window.setTimeout(() => {
        void fetchToken();
      }, computeRefreshDelay(expiresAt));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch token';
      setState({ status: 'error', token: null, expiresAt: null, error: message });
      clearRefreshTimer();
    }
  }, [eventId, clearRefreshTimer]);

  useEffect(() => {
    void fetchToken();
    return () => {
      clearRefreshTimer();
    };
  }, [fetchToken, clearRefreshTimer]);

  const refresh = useCallback(() => {
    clearRefreshTimer();
    void fetchToken();
  }, [fetchToken, clearRefreshTimer]);

  const memoized = useMemo(
    () => ({
      state,
      refresh,
      isLoading: state.status === 'loading',
      error: state.status === 'error' ? state.error : null,
      token: state.status === 'ready' ? state.token : null,
      expiresAt: state.status === 'ready' ? state.expiresAt : null
    }),
    [state, refresh]
  );

  return memoized;
}
