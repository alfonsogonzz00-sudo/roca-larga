import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Supabase carga pg_safeupdate para las peticiones de la API: un DELETE o UPDATE
 * sin WHERE dentro de una función falla con «DELETE requires a WHERE clause».
 * PGlite no lo emula, así que se comprueba aquí el SQL de las funciones vigentes.
 */
describe("migraciones", () => {
  it("las funciones vigentes no contienen DELETE/UPDATE sin WHERE", () => {
    const dir = join(process.cwd(), "supabase/migrations");
    const latest = new Map<string, string>();
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      const sql = readFileSync(join(dir, f), "utf8");
      for (const m of sql.matchAll(/create or replace function ([\w.]+)\s*\([\s\S]*?\$\$([\s\S]*?)\$\$;/gi)) latest.set(m[1].toLowerCase(), m[2]);
    }
    const bad: string[] = [];
    for (const [name, body] of latest) {
      const clean = body.replace(/'[^']*'/g, "''").replace(/--.*$/gm, "");
      for (const st of clean.split(";")) {
        const s = st.replace(/\s+/g, " ").trim().toLowerCase();
        const m = s.match(/(?:^|\b(?:then|loop|begin|else)\s+)(delete from [\w.]+|update [\w.]+ set)\b.*/);
        if (m && !/\bwhere\b/.test(m[0]) && !s.includes("on conflict")) bad.push(`${name}: ${m[0].slice(0, 70)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
