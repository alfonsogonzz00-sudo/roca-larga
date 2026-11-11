import { activateConfigAction, deleteConfigAction, saveSettingAction } from "@/app/actions/admin";
import { Card, Details, Field, Input, PageHeader, Pill, SectionTitle, Select, Stat } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { WeightsEditor } from "@/components/forms/weights-editor";
import { createClient } from "@/lib/supabase/server";
import { getStats, modelContext } from "@/lib/data/stats";
import { backtest, MODEL_VERSION } from "@/lib/stats/model";
import { fmtDateTime, num, pct } from "@/lib/format";
import { FACTOR_KEYS, FACTOR_LABELS, type PredictionConfig } from "@/lib/types";

function JsonSetting({ k, label, value, hint }: { k: string; label: string; value: unknown; hint?: string }) {
  return (
    <ActionForm action={saveSettingAction} className="flex items-end gap-2">
      <input type="hidden" name="key" value={k} />
      <div className="flex-1"><Field label={label} htmlFor={`s-${k}`} hint={hint}><Input id={`s-${k}`} name="value" defaultValue={JSON.stringify(value)} className="font-mono text-sm" /></Field></div>
      <SubmitButton variant="secondary">Guardar</SubmitButton>
    </ActionForm>
  );
}

export default async function AdminStats() {
  const supabase = await createClient();
  const { ds, settings, parts } = await getStats();
  const { data } = await supabase.from("prediction_configs").select("*").order("created_at");
  const configs = (data ?? []) as PredictionConfig[];
  const ctx = await modelContext("next_match");
  const bt = backtest(ds, parts, { weights: ctx.weights, enabled: ctx.enabled, configName: ctx.configName, params: ctx.params, perf: ctx.perf }, settings.model_params.min_matches);
  return (
    <div className="space-y-8">
      <PageHeader title="Estadísticas y modelo" subtitle={`Motor ${MODEL_VERSION}: Poisson con factores ponderados y contracción por tamaño de muestra.`} />

      {(["next_match", "simulation"] as const).map((scope) => {
        const list = configs.filter((c) => c.scope === scope);
        const active = list.find((c) => c.is_active) ?? list[0];
        const original = list.find((c) => c.is_system);
        return (
          <section key={scope} className="space-y-3">
            <SectionTitle>{scope === "next_match" ? "Ponderaciones · pronóstico del próximo partido" : "Ponderaciones · simuladores (partido e individual)"}</SectionTitle>
            {active && <Card className="p-4"><div className="mb-3 flex items-center gap-2 text-sm"><span>Activa:</span><strong>{active.name}</strong></div><WeightsEditor config={active} original={original} /></Card>}
            <Details summary={`Configuraciones guardadas (${list.length})`}>
              <ul className="space-y-2">
                {list.map((c) => (
                  <li key={c.id} className="rounded-xl bg-surface-2 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2"><strong>{c.name}</strong>{c.is_active && <Pill tone="pitch">Activa</Pill>}{c.is_system && <Pill>Original</Pill>}<span className="text-xs text-ink-3">{fmtDateTime(c.created_at)}</span></div>
                    <div className="mt-1 text-xs text-ink-2">{FACTOR_KEYS.map((k) => `${FACTOR_LABELS[k]} ${c.enabled[k] === false ? "off" : `${c.weights[k]} %`}`).join(" · ")}</div>
                    <div className="mt-2 flex gap-2">
                      {!c.is_active && <ActionForm action={activateConfigAction}><input type="hidden" name="id" value={c.id} /><SubmitButton variant="secondary" className="min-h-9">Activar</SubmitButton></ActionForm>}
                      {!c.is_active && !c.is_system && <ActionForm action={deleteConfigAction} confirm="¿Eliminar esta configuración?"><input type="hidden" name="id" value={c.id} /><SubmitButton variant="ghost" className="min-h-9 text-danger">Eliminar</SubmitButton></ActionForm>}
                    </div>
                  </li>
                ))}
              </ul>
            </Details>
          </section>
        );
      })}

      <section className="space-y-3">
        <SectionTitle>Rendimiento del modelo (validación retrospectiva)</SectionTitle>
        {bt.evaluated === 0 ? <p className="text-sm text-ink-3">Hacen falta más de {settings.model_params.min_matches} partidos disputados para evaluar el modelo.</p> : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Partidos evaluados" value={bt.evaluated} />
              <Stat label="Acierto 1X2" value={pct(bt.accuracy)} />
              <Stat label="Log-loss" value={num(bt.logLoss, 3)} hint={`ingenuo: ${num(bt.baselineLogLoss, 3)}`} />
              <Stat label="Brier" value={num(bt.brier, 3)} hint="menor es mejor" />
            </div>
            <p className="text-xs text-ink-3">Cada partido se pronostica usando sólo los anteriores. Si el log-loss del modelo es menor que el del modelo ingenuo (frecuencias históricas), las ponderaciones aportan información.</p>
          </>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle>Votación</SectionTitle>
        <Card className="space-y-4 p-4">
          <p className="text-sm text-ink-2">Cada participante vota al mejor de su equipo y al mejor del partido (MVP). Gana quien más votos recibe en cada categoría.</p>
          <JsonSetting k="vote_tiebreak" label="Criterios de desempate (en orden)" value={settings.vote_tiebreak} hint='Opciones: "other_votes" (más votos en la otra categoría) y "goal_contributions" (goles + asistencias en el partido). Tras cambiarlo, pulsa «Recalcular» en Resumen.' />
          <ActionForm action={saveSettingAction} className="flex items-end gap-2">
            <input type="hidden" name="key" value="mvp_tie_fallback" />
            <div className="flex-1"><Field label="Si persiste el empate" htmlFor="fb">
              <Select id="fb" name="value" defaultValue={JSON.stringify(settings.mvp_tie_fallback)}><option value='"shared"'>Premio compartido</option><option value='"none"'>Queda desierto</option></Select>
            </Field></div>
            <SubmitButton variant="secondary">Guardar</SubmitButton>
          </ActionForm>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle>Valoración de actuaciones</SectionTitle>
        <Card className="p-4">
          <JsonSetting k="performance_weights" label="Pesos" value={settings.performance_weights} hint="goal, assist, mvp, team_best (mejor de su equipo), win, draw y guest_bonus (por cada invitado que trae). Los goles encajados como portero nunca restan." />
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle>Parámetros del motor</SectionTitle>
        <Card className="p-4">
          <JsonSetting k="model_params" label="Contracción (k) y mínimos" value={settings.model_params} hint="k = partidos «virtuales» de la media que se mezclan con cada factor. Mayor k = más prudencia con muestras pequeñas." />
        </Card>
      </section>
    </div>
  );
}
