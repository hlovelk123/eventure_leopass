import { useCallback, useMemo, useState } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON
} from '@simplewebauthn/types';
import { TurnstileWidget } from '../components/TurnstileWidget';
import { postJson } from '../lib/api';

type ApiUser = {
  id: string;
  email: string;
  displayName: string;
  status: string;
};

type Step = 'request-otp' | 'verify-otp' | 'authenticated';

export function AuthPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<Step>('request-otp');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<ApiUser | null>(null);
  const siteKey = import.meta.env.VITE_CF_TURNSTILE_SITE_KEY as string | undefined;

  const canSubmitEmail = email.length > 3 && !!turnstileToken;
  const canSubmitOtp = otp.length === 6 && challengeId.length > 0;

  const resetState = useCallback(() => {
    setOtp('');
    setChallengeId('');
    setStatus(null);
    setError(null);
  }, []);

  const handleRequestOtp = useCallback(async () => {
    try {
      setError(null);
      setStatus('Requesting verification code...');
      const response = await postJson<{ challengeId: string }>('/auth/otp/request', {
        email,
        turnstileToken
      });
      setChallengeId(response.challengeId);
      setStep('verify-otp');
      setStatus('Verification code sent. Check your email.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request OTP');
    }
  }, [email, turnstileToken]);

  const handleVerifyOtp = useCallback(async () => {
    try {
      setError(null);
      setStatus('Validating code...');
      const response = await postJson<{ user: ApiUser }>('/auth/otp/verify', {
        email,
        challengeId,
        code: otp
      });
      setUser(response.user);
      setStatus(`Signed in as ${response.user.displayName}`);
      setStep('authenticated');
      setOtp('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify code');
    }
  }, [email, challengeId, otp]);

  const registerPasskey = useCallback(async () => {
    try {
      setError(null);
      setStatus('Preparing passkey registration...');
      const { options, challengeId: registerChallengeId } = await postJson<{
        options: PublicKeyCredentialCreationOptionsJSON;
        challengeId: string;
      }>('/auth/webauthn/register/options', {});

      const credential = await startRegistration({ optionsJSON: options });

      await postJson('/auth/webauthn/register/verify', {
        challengeId: registerChallengeId,
        credential
      });

      setStatus('Passkey registered successfully');
    } catch (err) {
      if ((err as Error).name === 'NotAllowedError') {
        setError('Passkey registration was cancelled or timed out.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to register passkey');
    }
  }, []);

  const signInWithPasskey = useCallback(async () => {
    try {
      setError(null);
      setStatus('Requesting passkey challenge...');
      const { options, challengeId: authChallengeId, user: authenticatedUser } = await postJson<{
        options: PublicKeyCredentialRequestOptionsJSON;
        challengeId: string;
        user: ApiUser;
      }>('/auth/webauthn/login/options', { email });

      const assertion = await startAuthentication({ optionsJSON: options });
      await postJson('/auth/webauthn/login/verify', {
        email,
        challengeId: authChallengeId,
        credential: assertion
      });

      setUser(authenticatedUser);
      setStatus(`Signed in with passkey as ${authenticatedUser.displayName}`);
      setStep('authenticated');
    } catch (err) {
      if ((err as Error).name === 'NotAllowedError') {
        setError('Passkey sign-in was cancelled or timed out.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Passkey sign-in failed');
    }
  }, [email]);

  const turnstile = useMemo<JSX.Element | null>(() => {
    if (!siteKey) {
      return null;
    }
    return <TurnstileWidget siteKey={siteKey} onToken={setTurnstileToken} />;
  }, [siteKey]);

  return (
    <div className="mx-auto max-w-xl space-y-8 py-12">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold text-brand">Leo Pass Sign In</h1>
        <p className="text-slate-600">Sign in with a one-time code or register a passkey for faster access.</p>
      </header>

      <section className="rounded-2xl bg-white p-6 shadow">
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-600">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                resetState();
              }}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
              placeholder="you@example.com"
            />
          </label>

          {turnstile}

          <button
            type="button"
            disabled={!canSubmitEmail || step !== 'request-otp'}
            onClick={() => {
              void handleRequestOtp();
            }}
            className="w-full rounded-md bg-brand px-4 py-2 font-medium text-white disabled:bg-slate-300"
          >
            Send verification code
          </button>
        </div>
      </section>

      {step !== 'request-otp' && (
        <section className="rounded-2xl bg-white p-6 shadow">
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-600">6-digit code</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/[^0-9]/g, ''))}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 focus:border-brand focus:outline-none"
                placeholder="123456"
              />
            </label>

            <button
              type="button"
              disabled={!canSubmitOtp || step !== 'verify-otp'}
              onClick={() => {
                void handleVerifyOtp();
              }}
              className="w-full rounded-md bg-brand px-4 py-2 font-medium text-white disabled:bg-slate-300"
            >
              Verify and sign in
            </button>
          </div>
        </section>
      )}

      {step === 'authenticated' && (
        <section className="rounded-2xl bg-white p-6 shadow space-y-4">
          <div className="rounded-md bg-emerald-50 p-4 text-emerald-700">
            {status}
          </div>

          <div className="space-y-2">
            <p className="text-sm text-slate-600">Enhance your account security by registering a device passkey.</p>
            <button
              type="button"
              onClick={() => {
                void registerPasskey();
              }}
              className="w-full rounded-md border border-brand px-4 py-2 font-medium text-brand"
            >
              Register passkey
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl bg-white p-6 shadow space-y-4">
        <h2 className="text-lg font-semibold">Sign in with a passkey</h2>
        <p className="text-sm text-slate-600">
          If you have already registered a passkey, you can sign in with one tap.
        </p>
        <button
          type="button"
          onClick={() => {
            void signInWithPasskey();
          }}
          className="w-full rounded-md border border-slate-200 px-4 py-2 font-medium text-slate-700 hover:border-brand hover:text-brand"
        >
          Use passkey
        </button>
      </section>

      {status && <div className="rounded-md bg-slate-100 p-4 text-slate-700">{status}</div>}
      {error && <div className="rounded-md bg-rose-100 p-4 text-rose-700">{error}</div>}

      {user && (
        <section className="rounded-2xl bg-white p-6 shadow">
          <h2 className="text-lg font-semibold">Profile</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            <li><strong>Email:</strong> {user.email}</li>
            <li><strong>Name:</strong> {user.displayName}</li>
            <li><strong>Status:</strong> {user.status}</li>
          </ul>
        </section>
      )}
    </div>
  );
}
