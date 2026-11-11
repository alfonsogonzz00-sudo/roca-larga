export const dynamic = "force-dynamic";

/** Versión desplegada (commit). La app la compara con la suya para recargarse sola. */
export function GET() {
  return Response.json({ v: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" }, { headers: { "Cache-Control": "no-store" } });
}
