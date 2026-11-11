import { addTextAction, resetTextAction, saveTextAction } from "@/app/actions/admin";
import { Details, Field, Input, PageHeader, SectionTitle, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { createClient } from "@/lib/supabase/server";

interface T { key: string; value: string; variants: string[]; default_value: string; category: string; description: string | null }

export default async function AdminTexts() {
  const supabase = await createClient();
  const { data } = await supabase.from("ui_texts").select("*").order("category").order("key");
  const rows = (data ?? []) as T[];
  const cats = [...new Set(rows.map((r) => r.category))];
  return (
    <div className="space-y-6">
      <PageHeader title="Textos y humor" subtitle="Cambia cualquier texto sin tocar código. Si añades variantes (una por línea), la app elegirá una al azar cada vez." />
      {cats.map((c) => (
        <section key={c} className="space-y-2">
          <SectionTitle>{c}</SectionTitle>
          {rows.filter((r) => r.category === c).map((r) => (
            <Details key={r.key} summary={<span className="min-w-0"><span className="block truncate">{r.value}</span><span className="block text-xs font-normal text-ink-3">{r.key}{r.description ? ` · ${r.description}` : ""}</span></span>}>
              <ActionForm action={saveTextAction} className="space-y-2">
                <input type="hidden" name="key" value={r.key} />
                <Field label="Texto" htmlFor={`t-${r.key}`}><Input id={`t-${r.key}`} name="value" defaultValue={r.value} required /></Field>
                <Field label="Variantes (opcional, una por línea)" htmlFor={`v-${r.key}`}><Textarea id={`v-${r.key}`} name="variants" defaultValue={r.variants.join("\n")} /></Field>
                <SubmitButton>Guardar</SubmitButton>
              </ActionForm>
              {r.value !== r.default_value && (
                <ActionForm action={resetTextAction} className="mt-2"><input type="hidden" name="key" value={r.key} /><SubmitButton variant="ghost">Restaurar original</SubmitButton></ActionForm>
              )}
            </Details>
          ))}
        </section>
      ))}
      <Details summary="➕ Añadir texto propio">
        <ActionForm action={addTextAction} className="grid gap-2 sm:grid-cols-3" resetOnSuccess>
          <Input name="key" placeholder="clave.ejemplo" required aria-label="Clave" />
          <Input name="value" placeholder="Texto" required aria-label="Texto" />
          <Input name="category" placeholder="Categoría" aria-label="Categoría" />
          <SubmitButton>Añadir</SubmitButton>
        </ActionForm>
      </Details>
    </div>
  );
}
