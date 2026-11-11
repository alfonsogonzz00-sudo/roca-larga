"use client";
/**
 * Preferencias de onboarding por dispositivo (localStorage).
 * Si el almacenamiento no está disponible (modo privado), las ayudas
 * simplemente no se recuerdan: nunca bloquean la interfaz.
 */
const listeners = new Set<() => void>();
export function subscribeOnboarding(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key?.startsWith("rl-")) cb(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage); };
}
export function getFlag(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function setFlag(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* sin almacenamiento */ }
  listeners.forEach((f) => f());
}
