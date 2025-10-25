export function base64UrlToUint8Array(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const decoded = atob(normalized + padding);
  const buffer = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i += 1) {
    buffer[i] = decoded.charCodeAt(i);
  }
  return buffer;
}

export function base64UrlToString(value: string): string {
  const bytes = base64UrlToUint8Array(value);
  return new TextDecoder().decode(bytes);
}

export type JwtHeader = {
  alg: string;
  kid?: string;
  typ?: string;
};

export function decodeJwt<TPayload = Record<string, unknown>>(token: string): {
  header: JwtHeader;
  payload: TPayload;
  encodedHeader: string;
  encodedPayload: string;
  signingInput: Uint8Array;
  signature: Uint8Array;
} {
  const segments = token.split('.');
  if (segments.length !== 3) {
    throw new Error('Malformed token');
  }
  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const headerJson = base64UrlToString(encodedHeader);
  const payloadJson = base64UrlToString(encodedPayload);

  const header = JSON.parse(headerJson) as JwtHeader;
  const payload = JSON.parse(payloadJson) as TPayload;
  const signingInput = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signature = base64UrlToUint8Array(encodedSignature);

  return { header, payload, encodedHeader, encodedPayload, signingInput, signature };
}
