/**
 * Client-generated idempotency key for a command. Uses crypto.randomUUID where available; on
 * plain-HTTP LAN addresses (not a secure context) it falls back to getRandomValues.
 */
export function createCommandId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
