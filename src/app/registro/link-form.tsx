"use client";
import { useState } from "react";
import { requestLink } from "@/app/actions/profile";
import { Crest, Field, Input, cx } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";

interface Candidate { id: string; full_name: string; pending_requests: number }
interface TeamOpt { id: string; name: string; crest_url: string | null; primary_color: string; candidates: Candidate[] }

export function LinkForm({ teams }: { teams: TeamOpt[] }) {
  const [team, setTeam] = useState<string | null>(null);
  const [player, setPlayer] = useState<string | null>(null);
  const t = teams.find((x) => x.id === team);
  return (
    <ActionForm action={requestLink} className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">1 · Tu equipo</legend>
        <div className="grid grid-cols-2 gap-3">
          {teams.map((x) => (
            <button key={x.id} type="button" onClick={() => { setTeam(x.id); setPlayer(null); }} aria-pressed={team === x.id}
              className={cx("flex flex-col items-center gap-2 rounded-2xl border-2 bg-surface p-4 transition", team === x.id ? "border-pitch" : "border-line")}>
              <Crest src={x.crest_url} name={x.name} size={56} />
              <span className="text-center text-sm font-bold">{x.name}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {t && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">2 · Tu nombre real</legend>
          {t.candidates.length === 0 ? (
            <p className="text-sm text-ink-2">No quedan jugadores libres en este equipo. Pide al administrador que te dé de alta.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {t.candidates.map((c) => (
                <li key={c.id}>
                  <label className={cx("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3", player === c.id ? "border-pitch bg-pitch-soft" : "border-line bg-surface")}>
                    <input type="radio" name="player_id" value={c.id} checked={player === c.id} onChange={() => setPlayer(c.id)} className="h-4 w-4 accent-[var(--pitch)]" />
                    <span className="flex-1 font-medium">{c.full_name}</span>
                    {c.pending_requests > 0 && <span className="text-xs text-ink-3">solicitud en curso</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      )}
      {player && (
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold">3 · Tu apodo en el grupo</legend>
          <Field label="Apodo" htmlFor="nickname" hint="Se mostrará junto a tu nombre. Podrás cambiarlo después.">
            <Input id="nickname" name="nickname" required maxLength={30} autoComplete="off" />
          </Field>
          <SubmitButton className="w-full" pendingLabel="Enviando…">Enviar solicitud</SubmitButton>
        </fieldset>
      )}
    </ActionForm>
  );
}
