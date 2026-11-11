/**
 * Banco de pruebas de base de datos: Postgres real (PGlite) con las
 * migraciones del proyecto y un esquema `auth` que emula a Supabase.
 * Permite comprobar RLS, permisos y reglas de negocio sin tocar producción.
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");

const SUPABASE_EMULATION = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema if not exists extensions;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth, extensions to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- Igual que Supabase: privilegios por defecto amplios, RLS decide
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

export type Db = PGlite & {
  as: <T = Record<string, unknown>>(user: string | null, sql: string, params?: unknown[]) => Promise<T[]>;
  su: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  createUser: (email: string, opts?: { confirmed?: boolean; provider?: string }) => Promise<string>;
};

export async function createDb(ownerEmail = "owner@example.com"): Promise<Db> {
  const pg = new PGlite({ extensions: { pgcrypto } });
  await pg.exec(SUPABASE_EMULATION);
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && !f.includes("_cron"));
  for (const f of files.sort()) {
    try {
      await pg.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
    } catch (e) {
      throw new Error(`Migración ${f}: ${(e as Error).message}`);
    }
  }
  await pg.query(`insert into private.config(key, value) values ('owner_email', $1)`, [ownerEmail]);

  const db = pg as Db;
  db.su = async (sql, params) => (await pg.query(sql, params as unknown[])).rows as never;
  db.as = async (user, sql, params) => {
    // Ejecuta como 'authenticated' (o 'anon') dentro de una transacción, como PostgREST
    return pg.transaction(async (tx) => {
      await tx.exec(`set local role ${user ? "authenticated" : "anon"}`);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user ?? ""]);
      const r = await tx.query(sql, params as unknown[]);
      return r.rows as never;
    });
  };
  db.createUser = async (email, opts = {}) => {
    const id = randomUUID();
    await pg.query(
      `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data)
       values ($1, $2, $3, $4, $5)`,
      [id, email, opts.confirmed === false ? null : new Date().toISOString(), { full_name: email.split("@")[0] }, { provider: opts.provider ?? "email" }],
    );
    return id;
  };
  return db;
}
