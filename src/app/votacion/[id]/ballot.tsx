"use client";
import { useState } from "react";
import { castVoteAction } from "@/app/actions/votes";
import { Field, Select } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";

export function Ballot({ matchId, candidates, initial }: { matchId: string; candidates: { id: string; label: string; team: string }[]; initial: [string, string, string] | null }) {
  const [v, setV] = useState<[string, string, string]>(initial ?? ["", "", ""]);
  const places = ["1.º · 3 puntos", "2.º · 2 puntos", "3.º · 1 punto"];
  const teams = [...new Set(candidates.map((c) => c.team))];
  return (
    <ActionForm action={castVoteAction} className="space-y-3">
      <input type="hidden" name="match_id" value={matchId} />
      {places.map((label, i) => (
        <Field key={i} label={label} htmlFor={`v${i}`}>
          <Select id={`v${i}`} name={["first", "second", "third"][i]} required value={v[i]} onChange={(e) => setV((p) => { const n = [...p] as typeof p; n[i] = e.target.value; return n; })}>
            <option value="">Elige jugador…</option>
            {teams.map((t) => (
              <optgroup key={t} label={t}>
                {candidates.filter((c) => c.team === t).map((c) => (
                  <option key={c.id} value={c.id} disabled={v.some((x, j) => j !== i && x === c.id)}>{c.label}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
      ))}
      <SubmitButton variant="gold" className="w-full" pendingLabel="Enviando voto…">{initial ? "Cambiar mi voto" : "Votar"}</SubmitButton>
    </ActionForm>
  );
}
