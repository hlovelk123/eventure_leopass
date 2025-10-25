const PUBLIC_VAPID_KEY = (import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY as string | undefined)?.trim();

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function bufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) {
    throw new Error('Missing subscription key material');
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

export function pushCapabilityAvailable(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'denied';
  }
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!pushCapabilityAvailable()) {
    return null;
  }
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(): Promise<PushSubscription> {
  if (!pushCapabilityAvailable()) {
    throw new Error('Push notifications are not supported on this device');
  }
  if (!PUBLIC_VAPID_KEY) {
    throw new Error('Web Push VAPID public key is not configured');
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return existing;
  }

  const applicationServerKey = urlBase64ToUint8Array(PUBLIC_VAPID_KEY);
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey.buffer as ArrayBuffer
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!pushCapabilityAvailable()) {
    return;
  }
  const subscription = await getPushSubscription();
  if (subscription) {
    await subscription.unsubscribe();
  }
}

export function subscriptionToRegistrationPayload(subscription: PushSubscription): {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime: string | null;
} {
  const json = subscription.toJSON();
  const endpoint = json.endpoint ?? subscription.endpoint;
  const expirationTime =
    json.expirationTime != null ? new Date(json.expirationTime).toISOString() : null;
  const p256dh = json.keys?.p256dh ?? bufferToBase64(subscription.getKey('p256dh'));
  const auth = json.keys?.auth ?? bufferToBase64(subscription.getKey('auth'));

  return {
    endpoint,
    keys: {
      p256dh,
      auth
    },
    expirationTime
  };
}
