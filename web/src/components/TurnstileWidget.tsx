import { useEffect, useRef, useState } from 'react';

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
        }
      ) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

type TurnstileWidgetProps = {
  siteKey: string;
  onToken: (token: string) => void;
};

export function TurnstileWidget({ siteKey, onToken }: TurnstileWidgetProps): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (window.turnstile) {
      setLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = `${TURNSTILE_SCRIPT_SRC}?render=explicit`;
    script.async = true;
    script.onload = () => setLoaded(true);
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  useEffect(() => {
    if (!loaded || !containerRef.current || !window.turnstile) {
      return;
    }

    window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token) => onToken(token),
      'expired-callback': () => onToken(''),
      'error-callback': () => onToken('')
    });
  }, [loaded, siteKey, onToken]);

  return <div ref={containerRef} className="min-h-[70px]" />;
}
