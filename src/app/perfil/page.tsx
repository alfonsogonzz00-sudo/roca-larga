import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { updateNickname, updatePrefs } from "@/app/actions/profile";
import { Avatar, ButtonLink, Card, Crest, Field, Input, Notice, PageHeader, Pill, ResultBadge, SectionTitle, Stat } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { ThemeToggle } from "@/components/layout/theme";
import { PushToggle } from "@/components/layout/push-toggle";
import { getSession } from "@/lib/data/session";
import { getStats } from "@/lib/data/stats";
import { getTexts } from "@/lib/data/config";
import { createClient } from "@/lib/supabase/server";
import { playerTotals } from "@/lib/stats/engine";
import { env } from "@/lib/env";
import { fmtDateTime, fmtShortDay, num, teamColor } from "@/lib/format";

export const metadata = { title: "Perfil" };

const ROLE = { admin: "Administrador", organizer: "Organizador", player: "Jugador" };
const PREFS = [
  ["match_confirmed", "Partido confirmado y convocatoria"],
  ["match_reminder", "Recordatorios antes del partido"],
  ["vote_open", "Apertura de la votación MVP"],
  ["mvp_result", "Resultado del MVP"],
] as const;

export default async function Profile() {
  const s = await getSession();
  const t = await getTexts();
  if (!s) {
    return (
      <div>
        <PageHeader title="Perfil" />
        <Card className="space-y-4 p-5">
          <p className="text-sm text-ink-2">Entra para votar, ver tus estadísticas personales y recibir avisos de partido.</p>
          <ButtonLink href="/login?next=/perfil">Entrar o crear cuenta</ButtonLink>
          <div><div className="mb-2 text-sm font-semibold">Apariencia</div><ThemeToggle /></div>
        </Card>
      </div>
    );
  }
  const { ds, parts } = await getStats();
  const supabase = await createClient();
  const { data: receipts } = s.player ? await supabase.from("mvp_vote_receipts").select("match_id,first_voted_at,last_voted_at,changes").eq("player_id", s.player.id).order("first_voted_at", { ascending: false }) : { data: [] };
  const team = s.player?.team_id ? ds.teamById.get(s.player.team_id) : null;
  const tot = s.player ? playerTotals(s.player.id, parts) : null;
  const mine = s.player ? parts.filter((p) => p.playerId === s.player!.id).sort((a, b) => b.kickoff.localeCompare(a.kickoff)).slice(0, 10) : [];
  const { data: dbVapid } = await supabase.rpc("vapid_public_key");
  const vapidKey = (dbVapid as string | null) || env.vapidPublicKey;
  const provider = s.profile.auth_provider === "google" ? "Google" : "Correo y contraseña";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Avatar name={s.player?.full_name ?? s.profile.display_name ?? "?"} src={s.player?.photo_url ?? s.profile.avatar_url} size={64} color={teamColor(team)} />
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold uppercase leading-none">{s.player?.full_name ?? s.profile.display_name}</h1>
          {s.player?.nickname && <p className="text-gold">«{s.player.nickname}»</p>}
          <div className="mt-1 flex flex-wrap gap-2"><Pill tone={s.isAdmin ? "gold" : s.role === "organizer" ? "pitch" : "neutral"}>{ROLE[s.role]}</Pill>{s.profile.status === "suspended" && <Pill tone="danger">Cuenta suspendida</Pill>}</div>
        </div>
      </div>

      {!s.player && (
        <Notice tone="warn">
          {s.pendingLink ? t("profile.pending_link") : <>Tu cuenta no está vinculada a ningún jugador. <Link href="/registro" className="font-semibold underline">Solicitar vinculación</Link></>}
        </Notice>
      )}

      <Card className="divide-y divide-line">
        {[
          ["Equipo", team ? <span className="inline-flex items-center gap-2"><Crest src={team.crest_url} name={team.name} size={20} />{team.name}</span> : "—"],
          ["Método de acceso", provider],
          ["Email", s.email ?? "—"],
          ["Vinculación", s.player ? "Validada" : s.pendingLink ? "Pendiente de validar" : "Sin vincular"],
          ["Miembro desde", fmtShortDay(s.profile.created_at)],
        ].map(([k, v]) => (
          <div key={k as string} className="flex min-h-12 items-center justify-between gap-3 px-4 text-sm"><span className="text-ink-3">{k}</span><span className="text-right font-medium">{v}</span></div>
        ))}
      </Card>
      <p className="-mt-4 text-xs text-ink-3">El equipo y la identidad sólo los puede cambiar el administrador.</p>

      {s.player && (
        <section>
          <SectionTitle>Mi apodo</SectionTitle>
          <ActionForm action={updateNickname} className="flex items-end gap-2">
            <div className="flex-1"><Field label="Apodo" htmlFor="nick"><Input id="nick" name="nickname" defaultValue={s.player.nickname ?? ""} maxLength={30} required /></Field></div>
            <SubmitButton>Guardar</SubmitButton>
          </ActionForm>
        </section>
      )}

      {tot && tot.matches > 0 && (
        <section>
          <SectionTitle action={<Link href={`/jugadores/${s.player!.id}`} className="text-sm font-semibold text-pitch">Ficha completa</Link>}>Mis estadísticas</SectionTitle>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <Stat label="PJ" value={tot.matches} /><Stat label="Goles" value={tot.goals} /><Stat label="Asist." value={tot.assists} />
            <Stat label="MVP" value={tot.mvps} /><Stat label="Valoración" value={num(tot.ratingAvg, 2)} /><Stat label="🧤 Enc." value={tot.concededAsGk} />
          </div>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {mine.map((p) => (
              <li key={p.matchId}><Link href={`/partidos/${p.matchId}`} className="flex min-h-11 items-center gap-3 px-3 text-sm"><ResultBadge r={p.result} /><span className="flex-1">{fmtShortDay(p.kickoff)} · {p.goalsFor}–{p.goalsAgainst}</span><span className="tabular text-xs text-ink-3">{p.goals}G {p.assists}A</span></Link></li>
            ))}
          </ul>
        </section>
      )}

      {s.player && (
        <section>
          <SectionTitle>Mis votaciones</SectionTitle>
          {receipts?.length ? (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
              {receipts.map((r) => {
                const m = ds.matchById.get(r.match_id);
                return (
                  <li key={r.match_id} className="flex min-h-11 items-center justify-between gap-2 px-3 py-2">
                    <Link href={`/partidos/${r.match_id}`}>{m ? `${ds.teamById.get(m.home_team_id)?.short_name} vs ${ds.teamById.get(m.away_team_id)?.short_name} · ${fmtShortDay(m.kickoff_at)}` : "Partido"}</Link>
                    <span className="text-xs text-ink-3">votado {fmtDateTime(r.first_voted_at)}{r.changes ? ` · ${r.changes} cambio${r.changes > 1 ? "s" : ""}` : ""}</span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-ink-3">Aún no has votado en ningún partido.</p>}
          <p className="mt-1.5 text-xs text-ink-3">Sólo se guarda que votaste y cuándo; nadie puede ver a quién.</p>
        </section>
      )}

      <section>
        <SectionTitle>Notificaciones</SectionTitle>
        <Card className="space-y-4 p-4">
          <PushToggle vapidKey={vapidKey} />
          <ActionForm action={updatePrefs} className="space-y-2">
            {PREFS.map(([k, label]) => (
              <label key={k} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                <span>{label}</span>
                <input type="checkbox" name={k} defaultChecked={s.profile.notification_prefs?.[k] !== false} className="h-5 w-5 accent-[var(--pitch)]" />
              </label>
            ))}
            <SubmitButton variant="secondary">Guardar preferencias</SubmitButton>
          </ActionForm>
        </Card>
      </section>

      <section>
        <SectionTitle>Apariencia</SectionTitle>
        <ThemeToggle />
      </section>

      <form action={signOut}>
        <SubmitButton variant="ghost" className="text-danger"><LogOut size={18} /> Cerrar sesión</SubmitButton>
      </form>
    </div>
  );
}
