import { defaultFormationAction, deleteVenueAction, saveFormationAction, saveVenueAction, toggleFormationAction } from "@/app/actions/admin";
import { Card, Details, Field, Input, PageHeader, Pill, SectionTitle, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { ImageUpload } from "@/components/forms/image-upload";
import { getStats } from "@/lib/data/stats";
import type { Venue } from "@/lib/types";

function VenueForm({ v }: { v?: Venue }) {
  return (
    <ActionForm action={saveVenueAction} className="grid gap-3 sm:grid-cols-2" resetOnSuccess={!v}>
      {v && <input type="hidden" name="id" value={v.id} />}
      <Field label="Nombre" htmlFor={`vn${v?.id}`}><Input id={`vn${v?.id}`} name="name" defaultValue={v?.name} required /></Field>
      <Field label="Ciudad" htmlFor={`vc${v?.id}`}><Input id={`vc${v?.id}`} name="city" defaultValue={v?.city ?? ""} /></Field>
      <Field label="Dirección" htmlFor={`va${v?.id}`}><Input id={`va${v?.id}`} name="address" defaultValue={v?.address ?? ""} /></Field>
      <Field label="Enlace a mapa" htmlFor={`vm${v?.id}`}><Input id={`vm${v?.id}`} name="maps_url" type="url" defaultValue={v?.maps_url ?? ""} /></Field>
      <Field label="Superficie" htmlFor={`vs${v?.id}`}><Input id={`vs${v?.id}`} name="surface" defaultValue={v?.surface ?? ""} placeholder="Césped artificial…" /></Field>
      <Field label="Teléfono de reservas" htmlFor={`vp${v?.id}`}><Input id={`vp${v?.id}`} name="phone" type="tel" defaultValue={v?.phone ?? ""} placeholder="+34 …" /></Field>
      <Field label="Otros contactos" htmlFor={`vp2${v?.id}`}><Input id={`vp2${v?.id}`} name="phone_alt" defaultValue={v?.phone_alt ?? ""} /></Field>
      <Field label="Web" htmlFor={`vw${v?.id}`}><Input id={`vw${v?.id}`} name="website" type="url" defaultValue={v?.website ?? ""} /></Field>
      <Field label="Enlace de reserva online" htmlFor={`vb${v?.id}`}><Input id={`vb${v?.id}`} name="booking_url" type="url" defaultValue={v?.booking_url ?? ""} /></Field>
      <Field label="Campos y medidas" htmlFor={`vi${v?.id}`}><Input id={`vi${v?.id}`} name="pitch_info" defaultValue={v?.pitch_info ?? ""} placeholder="2 campos de F7, 50×30 m…" /></Field>
      <Field label="Horario" htmlFor={`vh${v?.id}`}><Input id={`vh${v?.id}`} name="hours" defaultValue={v?.hours ?? ""} /></Field>
      <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" name="active" defaultChecked={v?.active ?? true} className="h-4 w-4" /> Activo</label>
      <div className="sm:col-span-2"><ImageUpload name="image_url" defaultValue={v?.image_url} folder="venues" label="Imagen" /></div>
      <div className="sm:col-span-2"><Field label="Notas" htmlFor={`vno${v?.id}`}><Textarea id={`vno${v?.id}`} name="notes" defaultValue={v?.notes ?? ""} /></Field></div>
      <div className="sm:col-span-2"><SubmitButton>{v ? "Guardar" : "Crear estadio"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function AdminVenues() {
  const { ds } = await getStats();
  return (
    <div className="space-y-6">
      <PageHeader title="Estadios y formaciones" />
      <section className="space-y-2">
        <SectionTitle>Estadios</SectionTitle>
        <Details summary="➕ Nuevo estadio" defaultOpen={ds.venues.length === 0}><VenueForm /></Details>
        {ds.venues.map((v) => (
          <Details key={v.id} summary={<span className="flex items-center gap-2">{v.name}{!v.active && <Pill tone="danger">Inactivo</Pill>}{v.is_demo && <Pill tone="gold">Demo</Pill>}</span>}>
            <VenueForm v={v} />
            <ActionForm action={deleteVenueAction} confirm={`¿Eliminar ${v.name}? Los partidos jugados allí quedarán sin estadio.`} className="mt-3">
              <input type="hidden" name="id" value={v.id} /><SubmitButton variant="ghost" className="text-danger">Eliminar</SubmitButton>
            </ActionForm>
          </Details>
        ))}
      </section>
      <section>
        <SectionTitle>Formaciones</SectionTitle>
        <Card className="divide-y divide-line">
          {ds.formations.map((f) => (
            <div key={f.id} className="flex min-h-12 flex-wrap items-center gap-2 px-4 py-2">
              <span className="tabular flex-1 text-lg font-bold">{f.name}</span>
              {f.is_default && <Pill tone="pitch">Por defecto</Pill>}
              {!f.active && <Pill tone="danger">Oculta</Pill>}
              {!f.is_default && <ActionForm action={defaultFormationAction}><input type="hidden" name="id" value={f.id} /><SubmitButton variant="ghost" className="min-h-9">Por defecto</SubmitButton></ActionForm>}
              <ActionForm action={toggleFormationAction}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="active" value={String(!f.active)} /><SubmitButton variant="ghost" className="min-h-9">{f.active ? "Ocultar" : "Mostrar"}</SubmitButton></ActionForm>
            </div>
          ))}
        </Card>
        <ActionForm action={saveFormationAction} className="mt-3 flex gap-2" resetOnSuccess>
          <Input name="name" placeholder="Nueva, p. ej. 1-3-2" aria-label="Nueva formación" pattern="\d(-\d){1,4}" required />
          <SubmitButton variant="secondary">Añadir</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
