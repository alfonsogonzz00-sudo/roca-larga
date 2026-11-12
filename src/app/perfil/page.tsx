import Link from "next/link";
import { LogOut, PenLine } from "lucide-react";
import { kitPaint, type Kit } from "@/lib/kit";
import { signOut } from "@/app/actions/auth";
import { updateNickname, updatePhysical, updatePrefs } from "@/app/actions/profile";
import { PhysicalFields } from "@/components/forms/physical-fields";
import { PlayerStage } from "@/components/player/player-stage";
import type { PlayerPhysical } from "@/lib/types";
import { ButtonLink, Card, Crest, Field, Input, Notice, PageHeader, ResultBadge, SectionTitle, cx } from "@/components/ui";
import { FormStrip, WdlDonut } from "@/components/charts";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { ThemeToggle } from "@/components/layout/theme";
import { PushToggle } from "@/components/layout/push-toggle";
import { AvatarUpload } from "@/components/forms/avatar-upload";
import { RestartTour } from "@/components/onboarding/tour";
import { getSession } from "@/lib/data/session";
import { getStats } from "@/lib/data/stats";
import { getTexts } from "@/lib/data/config";
import { createClient } from "@/lib/supabase/server";
import { allPlayerTotals, playerTotals } from "@/lib/stats/engine";
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
  let phys: PlayerPhysical | null = null;
  if (s?.player) {
    const { data } = await (await createClient()).from("player_physical").select("player_id, height_cm, weight_kg").eq("player_id", s.player.id).maybeSingle<PlayerPhysical>();
    phys = data;
  }
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

  // Puesto en cada ranking entre los miembros con partidos
  const members = [...allPlayerTotals(parts.filter((x) => !x.isGuest)).values()];
  const rankOf = (k: "goals" | "assists" | "mvps" | "ratingAvg" | "matches") => {
    if (!tot || !tot.matches) return null;
    const sorted = [...members].sort((x, y) => (y[k] as number) - (x[k] as number));
    const pos = sorted.findIndex((x) => (x[k] as number) <= (tot[k] as number)) + 1;
    return { pos, of: sorted.length };
  };
  const avgOf = (k: "goalsPerMatch" | "assistsPerMatch" | "ratingAvg") => members.length ? members.reduce((acc, x) => acc + (x[k] as number), 0) / members.length : 0;
  const last10 = [...mine].reverse();
  const maxContrib = Math.max(1, ...last10.map((x) => x.goals + x.assists));
  const color = teamColor(team);

  return (
    <div className="space-y-6">
      {/* 1 · Quién soy + mis números */}
      {s.player?.model_url && (
        <PlayerStage src={s.player.model_url} poster={s.player.card_photo_url} name={s.player.nickname ?? s.player.full_name} color={color}
          mapUrl={s.player.model_map_url} paint={kitPaint(s.player.kit as Kit, s.player.shirt_number)}>
          {s.player.model_map_url && (
            <Link href="/perfil/personalizar" className="glass press absolute bottom-3 left-3 inline-flex h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold text-ink">
              <PenLine size={17} className="text-pitch" aria-hidden /> Personalizar
            </Link>
          )}
        </PlayerStage>
      )}
      <section className="relative overflow-hidden rounded-3xl bg-surface p-5 shadow-card text-ink shadow-card" style={{ backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${color} 12%, var(--surface)) 0%, var(--surface) 75%)` }}>
        <div className="flex items-center gap-4">
          <AvatarUpload userId={s.userId} name={s.player?.full_name ?? s.profile.display_name ?? "?"} src={s.player?.photo_url ?? s.profile.avatar_url} color={color} size={88} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-bold uppercase leading-none">{s.player?.nickname ?? s.player?.full_name ?? s.profile.display_name}</h1>
            {s.player?.nickname && <p className="mt-1 truncate text-sm text-ink-2">{s.player.full_name}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              {team && <Link href={`/equipos/${team.slug}`} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-1"><Crest src={team.crest_url} name={team.name} size={16} />{team.name}</Link>}
              <span className="rounded-full bg-surface-2 px-2 py-1">{ROLE[s.role]}</span>
              {s.profile.status === "suspended" && <span className="rounded-full bg-loss-soft px-2 py-1 text-loss">Cuenta suspendida</span>}
            </div>
          </div>
        </div>
        {tot && tot.matches > 0 && (
          <>
            <div className="mt-5 flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-ink-3">Nota media</p>
                <p className="font-display tabular text-5xl font-bold leading-none">{num(tot.ratingAvg, 1)}<span className="text-2xl text-ink-3">/10</span></p>
              </div>
              {(() => { const r = rankOf("ratingAvg"); return r && <p className="text-right text-sm text-ink-2"><span className="font-display text-3xl font-bold">{r.pos}.º</span><br />de {r.of} jugadores</p>; })()}
            </div>
            <dl className="mt-4 grid grid-cols-4 divide-x divide-line rounded-2xl bg-surface-2 py-3 text-center">
              {([["Partidos", tot.matches, "matches"], ["Goles", tot.goals, "goals"], ["Asist.", tot.assists, "assists"], ["MVP", tot.mvps, "mvps"]] as const).map(([l, v, k]) => {
                const r = rankOf(k);
                return (
                  <div key={l}>
                    <dd className="font-display tabular text-3xl font-bold leading-none">{v}</dd>
                    <dt className="mt-1 text-[11px] uppercase tracking-wider text-ink-3">{l}</dt>
                    {r && k !== "matches" && <p className="mt-0.5 text-[11px] text-ink-3">{r.pos}.º del grupo</p>}
                  </div>
                );
              })}
            </dl>
          </>
        )}
      </section>

      {!s.player && (
        <Notice tone="warn">
          {s.pendingLink ? t("profile.pending_link") : <>Tu cuenta no está vinculada a ningún jugador. <Link href="/registro" className="font-semibold underline">Solicitar vinculación</Link></>}
        </Notice>
      )}

      {s.player && (!tot || tot.matches === 0) && (
        <Card className="p-5 text-center">
          <p className="font-display text-xl font-bold uppercase">Tus estadísticas empiezan aquí</p>
          <p className="mt-1 text-sm text-ink-2">En cuanto juegues tu primer partido verás tus goles, asistencias, MVP, tu forma y tu puesto en el grupo.</p>
        </Card>
      )}

      {tot && tot.matches > 0 && (
        <>
          {/* 2 · Balance y forma */}
          <section className="grid gap-3 sm:grid-cols-2">
            <Card className="flex items-center gap-4 p-4">
              <WdlDonut wins={tot.wins} draws={tot.draws} losses={tot.losses} size={110} label="Mis partidos" />
              <dl className="flex-1 space-y-1.5 text-sm">
                <div className="flex items-center justify-between"><dt className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-win" />Victorias</dt><dd className="font-display tabular text-xl font-bold">{tot.wins}</dd></div>
                <div className="flex items-center justify-between"><dt className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-draw" />Empates</dt><dd className="font-display tabular text-xl font-bold">{tot.draws}</dd></div>
                <div className="flex items-center justify-between"><dt className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-loss" />Derrotas</dt><dd className="font-display tabular text-xl font-bold">{tot.losses}</dd></div>
              </dl>
            </Card>
            <Card className="p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">Últimos partidos · goles y asistencias</p>
              <div className="flex h-28 gap-1.5" role="img" aria-label="Goles y asistencias en tus últimos partidos">
                {last10.map((x) => (
                  <Link key={x.matchId} href={`/partidos/${x.matchId}`} className="flex h-full flex-1 flex-col items-stretch gap-1" title={`${fmtShortDay(x.kickoff)}: ${x.goals} goles, ${x.assists} asistencias`}>
                    <span className="flex min-h-0 w-full flex-1 flex-col justify-end">
                      <span className="w-full rounded-t-sm bg-gold" style={{ height: `${(x.assists / maxContrib) * 100}%` }} />
                      <span className={cx("w-full bg-pitch", x.assists ? "" : "rounded-t-sm")} style={{ height: `${(x.goals / maxContrib) * 100}%` }} />
                    </span>
                    <span className={cx("h-1.5 w-full rounded-full", x.result === "W" ? "bg-win" : x.result === "D" ? "bg-draw" : "bg-loss")} />
                  </Link>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-ink-3"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-pitch" />Goles</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-gold" />Asist.</span><span className="ml-auto">Racha: <FormStrip results={last10.slice(-5).map((x) => x.result)} /></span></div>
            </Card>
          </section>

          {/* 3 · Comparado con el grupo */}
          <section>
            <SectionTitle>Tú contra la media del grupo</SectionTitle>
            <Card className="space-y-4 p-4">
              {([["Goles por partido", tot.goalsPerMatch, avgOf("goalsPerMatch")], ["Asistencias por partido", tot.assistsPerMatch, avgOf("assistsPerMatch")], ["Nota media", tot.ratingAvg, avgOf("ratingAvg")]] as const).map(([l, me, avg]) => {
                const max = Math.max(me, avg, 0.01) * 1.15;
                return (
                  <div key={l}>
                    <div className="mb-1 flex items-baseline justify-between text-sm"><span>{l}</span><span><strong className="font-display tabular text-lg">{num(me, 2)}</strong> <span className="text-xs text-ink-3">media {num(avg, 2)}</span></span></div>
                    <div className="relative h-2.5 rounded-full bg-surface-3">
                      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(me / max) * 100}%`, background: me >= avg ? "var(--win)" : "var(--gold)" }} />
                      <span className="absolute -top-1 -bottom-1 w-0.5 rounded bg-ink" style={{ left: `${(avg / max) * 100}%` }} aria-hidden />
                    </div>
                  </div>
                );
              })}
            </Card>
          </section>

          {/* 4 · Logros */}
          <section className="grid grid-cols-3 gap-2">
            {([["MVP", tot.mvps, "text-gold"], ["Mejor de su equipo", tot.teamBests, "text-pitch"], ["Victorias", tot.wins, "text-win"]] as const).map(([l, v, c]) => (
              <Card key={l} className="p-3 text-center">
                <p className={`font-display tabular text-3xl font-bold ${c}`}>{v}</p>
                <p className="text-[11px] leading-tight text-ink-3">{l}</p>
              </Card>
            ))}
          </section>

          <section>
            <SectionTitle action={<Link href={`/jugadores/${s.player!.id}`} className="text-sm font-semibold text-pitch">Ficha completa</Link>}>Mis últimos partidos</SectionTitle>
            <ul className="divide-y divide-line rounded-2xl bg-surface shadow-card">
              {mine.map((p) => (
                <li key={p.matchId}><Link href={`/partidos/${p.matchId}`} className="flex min-h-11 items-center gap-3 px-3 text-sm hover:bg-surface-2"><ResultBadge r={p.result} /><span className="flex-1">{fmtShortDay(p.kickoff)} · {p.goalsFor}–{p.goalsAgainst}</span><span className="tabular text-xs text-ink-3">{p.goals}G {p.assists}A{p.isMvp ? " · MVP" : ""}</span></Link></li>
              ))}
            </ul>
          </section>
        </>
      )}

      {/* 5 · Datos de la cuenta y ajustes */}
      {s.player && (
        <section>
          <SectionTitle>Mi apodo</SectionTitle>
          <ActionForm action={updateNickname} className="flex items-end gap-2">
            <div className="flex-1"><Field label="Apodo" htmlFor="nick"><Input id="nick" name="nickname" defaultValue={s.player.nickname ?? ""} maxLength={30} required /></Field></div>
            <SubmitButton>Guardar</SubmitButton>
          </ActionForm>
        </section>
      )}
      {s.player && (
        <section>
          <SectionTitle>Mis datos físicos</SectionTitle>
          {!phys?.height_cm && <Notice tone="warn" className="mb-3">Completa tu altura, peso y posición: salen en tu ficha junto a tu modelo 3D.</Notice>}
          <Card className="p-4">
            <ActionForm action={updatePhysical} className="space-y-4">
              <PhysicalFields height={phys?.height_cm} weight={phys?.weight_kg != null ? Number(phys.weight_kg) : null} position={s.player.usual_position} />
              <SubmitButton className="w-full">Guardar datos</SubmitButton>
            </ActionForm>
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>Mi cuenta</SectionTitle>
        <Card className="divide-y divide-line">
          {[
            ["Equipo", team ? <span className="inline-flex items-center gap-2"><Crest src={team.crest_url} name={team.name} size={20} />{team.name}</span> : "—"],
            ["Rol", ROLE[s.role]],
            ["Método de acceso", provider],
            ["Email", s.email ?? "—"],
            ["Vinculación", s.player ? "Validada" : s.pendingLink ? "Pendiente de validar" : "Sin vincular"],
            ["Miembro desde", fmtShortDay(s.profile.created_at)],
          ].map(([k, v]) => (
            <div key={k as string} className="flex min-h-12 items-center justify-between gap-3 px-4 text-sm"><span className="text-ink-3">{k}</span><span className="truncate text-right font-medium">{v}</span></div>
          ))}
        </Card>
        <p className="mt-1.5 text-xs text-ink-3">El equipo y la identidad sólo los puede cambiar el administrador.</p>
      </section>

      {s.player && (
        <section>
          <SectionTitle>Mis votaciones</SectionTitle>
          {receipts?.length ? (
            <ul className="divide-y divide-line rounded-2xl bg-surface shadow-card text-sm">
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

      <section>
        <SectionTitle>Ayuda</SectionTitle>
        <p className="mb-3 text-sm text-ink-2">¿Te perdiste algo? Vuelve a ver el recorrido por la app.</p>
        <RestartTour />
      </section>

      <form action={signOut}>
        <SubmitButton variant="ghost" className="text-danger"><LogOut size={18} /> Cerrar sesión</SubmitButton>
      </form>
    </div>
  );
}
