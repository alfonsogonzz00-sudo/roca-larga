import { saveTeamAction } from "@/app/actions/admin";
import { Card, Crest, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { ImageUpload } from "@/components/forms/image-upload";
import { getStats } from "@/lib/data/stats";

export default async function AdminTeams() {
  const { ds } = await getStats();
  return (
    <div className="space-y-6">
      <PageHeader title="Equipos" subtitle="Nombre, escudo, sede, colores corporativos y descripción." />
      {ds.teams.map((t) => (
        <Card key={t.id} className="p-4" style={{ borderTop: `4px solid ${t.primary_color}` }}>
          <div className="mb-4 flex items-center gap-3"><Crest src={t.crest_url} name={t.name} size={44} /><h2 className="font-display text-xl font-bold uppercase">{t.name}</h2></div>
          <ActionForm action={saveTeamAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={t.id} />
            <Field label="Nombre" htmlFor={`n${t.id}`}><Input id={`n${t.id}`} name="name" defaultValue={t.name} required /></Field>
            <Field label="Nombre corto" htmlFor={`s${t.id}`}><Input id={`s${t.id}`} name="short_name" defaultValue={t.short_name} required /></Field>
            <Field label="Nombre completo" htmlFor={`f${t.id}`}><Input id={`f${t.id}`} name="full_name" defaultValue={t.full_name ?? ""} /></Field>
            <Field label="Sede oficial" htmlFor={`h${t.id}`}><Input id={`h${t.id}`} name="headquarters" defaultValue={t.headquarters ?? ""} /></Field>
            <Field label="Estadio habitual" htmlFor={`v${t.id}`}><Select id={`v${t.id}`} name="home_venue_id" defaultValue={t.home_venue_id ?? ""}><option value="">—</option>{ds.venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
            <Field label="Fundación / lema" htmlFor={`fl${t.id}`}><Input id={`fl${t.id}`} name="founded_label" defaultValue={t.founded_label ?? ""} /></Field>
            <Field label="Color principal" htmlFor={`pc${t.id}`}><Input id={`pc${t.id}`} name="primary_color" type="color" defaultValue={t.primary_color} className="h-11 p-1" /></Field>
            <Field label="Color secundario" htmlFor={`sc${t.id}`}><Input id={`sc${t.id}`} name="secondary_color" type="color" defaultValue={t.secondary_color} className="h-11 p-1" /></Field>
            <div className="sm:col-span-2"><ImageUpload name="crest_url" defaultValue={t.crest_url} folder="crests" label="Escudo" /></div>
            <div className="sm:col-span-2"><Field label="Descripción" htmlFor={`d${t.id}`}><Textarea id={`d${t.id}`} name="description" defaultValue={t.description ?? ""} /></Field></div>
            <div className="sm:col-span-2"><SubmitButton>Guardar equipo</SubmitButton></div>
          </ActionForm>
        </Card>
      ))}
    </div>
  );
}
