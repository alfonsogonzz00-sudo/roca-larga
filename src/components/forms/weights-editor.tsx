"use client";
import { useState } from "react";
import { savePredictionConfigAction } from "@/app/actions/admin";
import { Field, Input, cx } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { FACTOR_KEYS, FACTOR_LABELS, type PredictionConfig } from "@/lib/types";

/** Editor de ponderaciones con validación en vivo de la suma (100 %) */
export function WeightsEditor({ config, original }: { config: PredictionConfig; original: PredictionConfig | undefined }) {
  const [w, setW] = useState(config.weights);
  const [en, setEn] = useState(config.enabled);
  const sum = FACTOR_KEYS.reduce((s, k) => s + (en[k] !== false ? Number(w[k]) || 0 : 0), 0);
  const ok = Math.abs(sum - 100) < 0.001;
  return (
    <ActionForm action={savePredictionConfigAction} className="space-y-3">
      <input type="hidden" name="id" value={config.id} />
      <input type="hidden" name="scope" value={config.scope} />
      <input type="hidden" name="as_new" value={config.is_system ? "1" : "0"} />
      <div className="grid gap-2">
        {FACTOR_KEYS.map((k) => (
          <div key={k} className="grid grid-cols-[auto_1fr_5.5rem] items-center gap-3">
            <input type="checkbox" name={`e_${k}`} aria-label={`Activar ${FACTOR_LABELS[k]}`} checked={en[k] !== false} onChange={(e) => setEn({ ...en, [k]: e.target.checked })} className="h-5 w-5 accent-[var(--pitch)]" />
            <span className={cx("text-sm", en[k] === false && "text-ink-3 line-through")}>{FACTOR_LABELS[k]}</span>
            <div className="flex items-center gap-1"><Input name={`w_${k}`} type="number" step={0.5} min={0} max={100} value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} className="min-h-10 px-2 text-right" aria-label={`Peso de ${FACTOR_LABELS[k]}`} /><span className="text-sm text-ink-3">%</span></div>
          </div>
        ))}
      </div>
      <div className={cx("rounded-xl px-3 py-2 text-sm font-semibold", ok ? "bg-pitch-soft text-pitch" : "bg-danger-soft text-danger")}>Suma de pesos activos: {sum.toFixed(1).replace(".", ",")} % {ok ? "✓" : "· debe ser 100 %"}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Nombre de la configuración" htmlFor={`cn${config.id}`}><Input id={`cn${config.id}`} name="name" defaultValue={config.is_system ? `${config.name} (copia)` : config.name} required /></Field>
        <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" name="activate" defaultChecked className="h-4 w-4" /> Activarla al guardar</label>
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton disabled={!ok}>{config.is_system ? "Guardar como nueva" : "Guardar"}</SubmitButton>
        {original && <button type="button" className="min-h-11 rounded-xl px-3 text-sm font-semibold text-ink-2 hover:bg-surface-2" onClick={() => { setW(original.weights); setEn(original.enabled); }}>Recuperar valores originales</button>}
      </div>
    </ActionForm>
  );
}
