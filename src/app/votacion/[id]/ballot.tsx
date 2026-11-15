"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { castVoteAction } from "@/app/actions/votes";
import { Avatar, cx } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";

export interface Candidate { id: string; name: string; nickname: string | null; photo: string | null; teamId: string; rating?: number | null }
export interface BallotTeam { id: string; name: string; color: string }

function PlayerTile({ c, selected, color, onPick }: { c: Candidate; selected: boolean; color: string; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={cx(
        "relative flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl border px-1.5 py-2 text-center transition active:scale-[0.97] motion-reduce:transition-none",
        selected ? "border-gold bg-gold-soft ring-2 ring-gold" : "border-transparent bg-surface shadow-card",
      )}
    >
      {selected && <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-white"><Check size={13} strokeWidth={3} aria-hidden /></span>}
      <Avatar name={c.name} src={c.photo} size={40} color={color} />
      <span className="line-clamp-2 text-xs font-semibold leading-tight">{c.nickname ?? c.name.split(" ")[0]}</span>
      {c.nickname && <span className="-mt-0.5 line-clamp-1 text-[11px] text-ink-3">{c.name.split(" ").slice(0, 2).join(" ")}</span>}
      {c.rating != null && <span className="rounded-full bg-surface-3 px-1.5 text-[11px] font-semibold tabular text-ink-2" aria-label={`Nota del partido ${c.rating}`}>{c.rating.toFixed(1).replace(".", ",")}</span>}
    </button>
  );
}

const POINTS = [0, 1, 2, 3] as const;

function RatingRow({ c, color, value, onChange }: { c: Candidate; color: string; value: number | undefined; onChange: (v: number) => void }) {
  const label = c.nickname ?? c.name.split(" ")[0];
  return (
    <div className="flex items-center gap-3 py-2">
      <Avatar name={c.name} src={c.photo} size={36} color={color} />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{label}</span>
        {c.nickname && <span className="block truncate text-[11px] text-ink-3">{c.name.split(" ").slice(0, 2).join(" ")}</span>}
      </div>
      <div role="radiogroup" aria-label={`Puntos extra para ${label}`} className="flex shrink-0 gap-1">
        {POINTS.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={cx(
              "h-10 w-10 rounded-xl border text-sm font-bold tabular transition active:scale-95 motion-reduce:transition-none",
              value === v ? "border-gold bg-gold text-white" : "border-line bg-surface text-ink-2",
            )}
          >
            +{v}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Ballot({ matchId, myTeamId, teams, candidates, initial, initialRatings, labels }: {
  matchId: string;
  myTeamId: string;
  teams: BallotTeam[];
  candidates: Candidate[];
  initial: { team: string; match: string } | null;
  initialRatings: Record<string, number>;
  labels: { team: string; match: string };
}) {
  const [teamPick, setTeamPick] = useState(initial?.team ?? "");
  const [matchPick, setMatchPick] = useState(initial?.match ?? "");
  const [ratings, setRatings] = useState<Record<string, number>>(initialRatings);
  const colorOf = (teamId: string) => teams.find((t) => t.id === teamId)?.color ?? "var(--pitch)";
  const mates = candidates.filter((c) => c.teamId === myTeamId);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const rated = candidates.filter((c) => ratings[c.id] !== undefined).length;
  const allRated = rated === candidates.length;
  const ratingsChanged = candidates.some((c) => ratings[c.id] !== initialRatings[c.id]);
  const changed = !initial || initial.team !== teamPick || initial.match !== matchPick || ratingsChanged;
  const ready = Boolean(teamPick && matchPick && allRated);

  return (
    <ActionForm action={castVoteAction} className="space-y-6">
      <input type="hidden" name="match_id" value={matchId} />
      <input type="hidden" name="team_pick" value={teamPick} />
      <input type="hidden" name="match_pick" value={matchPick} />
      <input type="hidden" name="ratings" value={JSON.stringify(Object.fromEntries(candidates.filter((c) => ratings[c.id] !== undefined).map((c) => [c.id, ratings[c.id]])))} />

      <fieldset>
        <legend className="mb-2 flex w-full items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-xs font-bold">1</span>
          <span className="font-display text-xl font-bold uppercase">{labels.team}</span>
        </legend>
        <p className="mb-3 text-xs text-ink-3">Sólo compañeros de {teams.find((t) => t.id === myTeamId)?.name}.</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {mates.map((c) => <PlayerTile key={c.id} c={c} color={colorOf(c.teamId)} selected={teamPick === c.id} onPick={() => setTeamPick(c.id)} />)}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 flex w-full items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-xs font-bold">2</span>
          <span className="font-display text-xl font-bold uppercase">{labels.match}</span>
        </legend>
        <p className="mb-3 text-xs text-ink-3">Cualquiera de los dos equipos. Puede ser el mismo que en el paso 1.</p>
        <div className="space-y-3">
          {teams.map((t) => (
            <div key={t.id}>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3"><span className="h-2 w-2 rounded-full" style={{ background: t.color }} aria-hidden />{t.name}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {candidates.filter((c) => c.teamId === t.id).map((c) => <PlayerTile key={c.id} c={c} color={t.color} selected={matchPick === c.id} onPick={() => setMatchPick(c.id)} />)}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 flex w-full items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-xs font-bold">3</span>
          <span className="font-display text-xl font-bold uppercase">Puntos extra</span>
        </legend>
        <p className="mb-3 text-xs text-ink-3">¿Cuántos puntos extra le das a cada uno por cómo ha jugado? De +0 a +3. La media de lo que le dé todo el mundo es el 30 % de su nota; el otro 70 % sale de las estadísticas. Es secreto, como el resto del voto.</p>
        <div className="space-y-4">
          {teams.map((t) => (
            <div key={t.id}>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3"><span className="h-2 w-2 rounded-full" style={{ background: t.color }} aria-hidden />{t.name}</p>
              <div className="divide-y divide-line">
                {candidates.filter((c) => c.teamId === t.id).map((c) => (
                  <RatingRow key={c.id} c={c} color={t.color} value={ratings[c.id]} onChange={(v) => setRatings((r) => ({ ...r, [c.id]: v }))} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="sticky bottom-[var(--nav-total)] z-10 lg:bottom-0 -mx-4 border-t border-line bg-elev/95 px-4 py-3 backdrop-blur lg:bottom-0">
        <div className="mb-2 grid grid-cols-3 gap-2 text-xs">
          <div className="min-w-0"><span className="block text-ink-3">{labels.team}</span><strong className="block truncate">{teamPick ? byId.get(teamPick)?.nickname ?? byId.get(teamPick)?.name : "—"}</strong></div>
          <div className="min-w-0"><span className="block text-ink-3">{labels.match}</span><strong className="block truncate">{matchPick ? byId.get(matchPick)?.nickname ?? byId.get(matchPick)?.name : "—"}</strong></div>
          <div className="min-w-0"><span className="block text-ink-3">Puntos extra</span><strong className={cx("block tabular", !allRated && "text-ink-3")}>{rated} de {candidates.length}</strong></div>
        </div>
        <SubmitButton variant="gold" className="w-full" pendingLabel="Guardando voto…" disabled={!ready || !changed}>
          {!teamPick || !matchPick ? "Elige a los dos" : !allRated ? `Valora a todos (faltan ${candidates.length - rated})` : initial ? (changed ? "Cambiar mi voto" : "Voto guardado") : "Confirmar voto"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
