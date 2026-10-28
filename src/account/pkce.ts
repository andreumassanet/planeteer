/** PKCE (RFC 7636): a secret kept here, and its hash sent with the sign-in. */

const base64url = (bytes: Uint8Array): string => {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** 43 to 128 characters of `[A-Za-z0-9-._~]`; this is 64. */
export function codeVerifier(random: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes)): string {
  return base64url(random(new Uint8Array(48)));
}

/** `S256`: the verifier's SHA-256, base64url without padding. */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export const VALID_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
