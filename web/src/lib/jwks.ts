import { useCallback, useEffect, useMemo, useState } from 'react';
import { verify } from '@noble/ed25519';
import { getJson } from './api';
import { base64UrlToUint8Array, decodeJwt, type JwtHeader } from './tokenUtils';

const STORAGE_KEY = 'leopass:jwks-cache';
const JWKS_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CLOCK_SKEW_MS = 90 * 1000;

type MemberTokenPayload = {
  jti: string;
  sub: string;
  eventId: string;
  type: string;
  ver: number;
  nbf: number;
  exp: number;
  iat: number;
};

type Jwk = {
  kid: string;
  x: string;
  alg: string;
  use: string;
  crv: string;
};

type CachedJwks = {
  fetchedAt: string;
  keys: Jwk[];
};

function loadCachedJwks(): CachedJwks | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as CachedJwks;
  } catch (error) {
    console.warn('Failed to load cached JWKS', error);
    return null;
  }
}

function saveCachedJwks(cache: CachedJwks): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

function ensureMemberPayload(payload: MemberTokenPayload): MemberTokenPayload {
  if (!payload.jti || !payload.sub || !payload.eventId) {
    throw new Error('Token payload missing required fields');
  }
  if (payload.type !== 'member') {
    throw new Error(`Unsupported token type: ${payload.type}`);
  }
  return payload;
}

function validateTokenWindow(payload: MemberTokenPayload): void {
  const now = Date.now();
  const nbfMs = payload.nbf * 1000;
  const expMs = payload.exp * 1000;
  if (now < nbfMs - CLOCK_SKEW_MS) {
    throw new Error('Token not yet valid');
  }
  if (now > expMs + CLOCK_SKEW_MS) {
    throw new Error('Token expired');
  }
}

type VerifyTokenResult = {
  header: JwtHeader;
  payload: MemberTokenPayload;
};

export function useJwks() {
  const cached = loadCachedJwks();
  const [keys, setKeys] = useState<Jwk[]>(cached?.keys ?? []);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(cached ? new Date(cached.fetchedAt) : null);

  const getKey = useCallback(
    (kid: string | undefined): Jwk | null => {
      if (!kid) {
        return null;
      }
      return keys.find((key) => key.kid === kid) ?? null;
    },
    [keys]
  );

  const refresh = useCallback(async () => {
    const response = await getJson<{ keys: Jwk[] }>('/.well-known/jwks.json');
    setKeys(response.keys);
    const fetchedAt = new Date();
    setLastFetched(fetchedAt);
    saveCachedJwks({ fetchedAt: fetchedAt.toISOString(), keys: response.keys });
    setError(null);
  }, []);

  const verifyToken = useCallback(
    async (token: string): Promise<VerifyTokenResult> => {
      const decoded = decodeJwt<MemberTokenPayload>(token);
      let jwk = getKey(decoded.header.kid);
      if (!jwk) {
        try {
          await refresh();
          jwk = getKey(decoded.header.kid);
        } catch (refreshError) {
          const message = refreshError instanceof Error ? refreshError.message : 'Unknown error';
          throw new Error(`Unable to refresh signing keys: ${message}`);
        }
      }
      if (!jwk) {
        throw new Error('Signing key not found. Sync before scanning.');
      }

      const publicKey = base64UrlToUint8Array(jwk.x);
      const verificationResult = verify(decoded.signature, decoded.signingInput, publicKey);
      const isValid = await Promise.resolve(verificationResult);
      if (!isValid) {
        throw new Error('Invalid token signature');
      }

      const payload = ensureMemberPayload(decoded.payload);
      validateTokenWindow(payload);
      return { header: decoded.header, payload };
    },
    [getKey, refresh]
  );

  const isStale = useMemo(() => {
    if (!lastFetched) {
      return true;
    }
    return Date.now() - lastFetched.getTime() > JWKS_REFRESH_INTERVAL_MS;
  }, [lastFetched]);

  useEffect(() => {
    if (isStale) {
      void refresh().catch((refreshError) => {
        const message = refreshError instanceof Error ? refreshError.message : 'Unknown error';
        if (!keys.length) {
          setError(message);
        }
      });
    }
  }, [isStale, refresh, keys.length]);

  return {
    verifyToken,
    refresh,
    lastFetched,
    error,
    keys
  };
}
