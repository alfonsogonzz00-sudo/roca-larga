import "server-only";

/** Secretos de servidor. Nunca importar desde componentes cliente. */
export const serverEnv = {
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
  dispatchSecret: process.env.NOTIFICATIONS_DISPATCH_SECRET ?? "",
};
