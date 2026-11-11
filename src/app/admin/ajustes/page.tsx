import { saveSettingAction } from "@/app/actions/admin";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { getSettings } from "@/lib/data/config";

export default async function AdminSettings() {
  const s = await getSettings();
  return (
    <div className="space-y-6">
      <PageHeader title="Ajustes" subtitle="Identidad de la app y reglas generales. Colores y escudos de cada club se editan en Equipos." />
      <Card className="space-y-4 p-4">
        <SettingInput k="app_name" label="Nombre de la app" value={s.app_name} />
        <SettingInput k="app_tagline" label="Subtítulo" value={s.app_tagline} />
        <SettingInput k="organizers_per_team" label="Organizadores máximos por equipo" value={s.organizers_per_team} number />
      </Card>
      <p className="text-xs text-ink-3">Jugadores por equipo ({s.players_per_side}) y zona horaria ({s.timezone}) son reglas fijas del formato.</p>
    </div>
  );
}

function SettingInput({ k, label, value, number }: { k: string; label: string; value: string | number; number?: boolean }) {
  return (
    <ActionForm action={async (prev, fd) => {
      "use server";
      const raw = String(fd.get("raw") ?? "");
      const next = new FormData();
      next.set("key", k);
      next.set("value", JSON.stringify(number ? Number(raw) : raw));
      return saveSettingAction(prev, next);
    }} className="flex items-end gap-2">
      <div className="flex-1"><Field label={label} htmlFor={`a-${k}`}><Input id={`a-${k}`} name="raw" type={number ? "number" : "text"} defaultValue={value} /></Field></div>
      <SubmitButton variant="secondary">Guardar</SubmitButton>
    </ActionForm>
  );
}
