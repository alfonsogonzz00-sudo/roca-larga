import { deletePlayerAction, savePlayerAction } from "@/app/actions/admin";
import { Details, Field, Input, PageHeader, Pill, SectionTitle, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { ImageUpload } from "@/components/forms/image-upload";
import { getStats } from "@/lib/data/stats";
import { POSITION_LABELS, FIELD_POSITIONS, type Player, type Team } from "@/lib/types";

function PlayerForm({ p, teams, kind = "member" }: { p?: Player; teams: Team[]; kind?: "member" | "guest" }) {
  return (
    <ActionForm action={savePlayerAction} className="grid gap-3 sm:grid-cols-2" resetOnSuccess={!p}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <input type="hidden" name="kind" value={p?.kind ?? kind} />
      <Field label="Nombre real" htmlFor={`n-${p?.id}`}><Input id={`n-${p?.id}`} name="full_name" defaultValue={p?.full_name} required /></Field>
      <Field label="Apodo" htmlFor={`k-${p?.id}`}><Input id={`k-${p?.id}`} name="nickname" defaultValue={p?.nickname ?? ""} maxLength={30} /></Field>
      {(p?.kind ?? kind) === "member" && (
        <Field label="Equipo" htmlFor={`t-${p?.id}`}><Select id={`t-${p?.id}`} name="team_id" defaultValue={p?.team_id ?? ""} required><option value="">Elige…</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
      )}
      <Field label="Posición habitual" htmlFor={`pos-${p?.id}`}><Select id={`pos-${p?.id}`} name="usual_position" defaultValue={p?.usual_position ?? ""}><option value="">Sin definir</option>{FIELD_POSITIONS.map((k) => <option key={k} value={k}>{POSITION_LABELS[k]}</option>)}</Select></Field>
      <Field label="Dorsal" htmlFor={`d-${p?.id}`}><Input id={`d-${p?.id}`} name="shirt_number" type="number" min={0} max={99} defaultValue={p?.shirt_number ?? ""} /></Field>
      <div className="sm:col-span-2"><ImageUpload name="photo_url" defaultValue={p?.photo_url} folder="players" label="Fotografía" /></div>
      <div className="sm:col-span-2"><Field label="Nota / bio" htmlFor={`b-${p?.id}`}><Textarea id={`b-${p?.id}`} name="bio" defaultValue={p?.bio ?? ""} maxLength={500} /></Field></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} className="h-4 w-4" /> Activo (aparece en convocatorias)</label>
      <div className="flex justify-end"><SubmitButton>{p ? "Guardar" : "Crear jugador"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function AdminPlayers() {
  const { ds } = await getStats();
  const guests = ds.players.filter((p) => p.kind === "guest");
  return (
    <div className="space-y-6">
      <PageHeader title="Jugadores" subtitle="Plantillas de ambos equipos. Desactiva en lugar de borrar a quien ya tenga partidos." />
      <Details summary="➕ Nuevo jugador"><PlayerForm teams={ds.teams} /></Details>
      {ds.teams.map((t) => (
        <section key={t.id}>
          <SectionTitle>{t.name}</SectionTitle>
          <div className="space-y-2">
            {ds.players.filter((p) => p.kind === "member" && p.team_id === t.id).map((p) => (
              <Details key={p.id} summary={<span className="flex items-center gap-2">{p.full_name}{p.nickname && <span className="font-normal text-ink-3">«{p.nickname}»</span>}{!p.active && <Pill tone="danger">Inactivo</Pill>}{p.is_demo && <Pill tone="gold">Demo</Pill>}</span>}>
                <PlayerForm p={p} teams={ds.teams} />
                <ActionForm action={deletePlayerAction} confirm={`¿Eliminar a ${p.full_name}? Sólo es posible si no tiene partidos.`} className="mt-3">
                  <input type="hidden" name="id" value={p.id} /><SubmitButton variant="ghost" className="text-danger">Eliminar</SubmitButton>
                </ActionForm>
              </Details>
            ))}
          </div>
        </section>
      ))}
      <section>
        <SectionTitle>Invitados ({guests.length})</SectionTitle>
        {guests.length === 0 ? <p className="text-sm text-ink-3">Los invitados se crean al añadirlos a un partido.</p> : (
          <div className="space-y-2">{guests.map((p) => <Details key={p.id} summary={p.full_name}><PlayerForm p={p} teams={ds.teams} /></Details>)}</div>
        )}
      </section>
    </div>
  );
}
