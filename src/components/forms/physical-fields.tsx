"use client";
import { useState } from "react";
import { Field, Input, cx } from "@/components/ui";
import { FIELD_POSITIONS, POSITION_LABELS, type Position } from "@/lib/types";

/** Altura, peso y posición (registro y perfil) */
export function PhysicalFields({ height, weight, position }: { height?: number | null; weight?: number | null; position?: Position | null }) {
  const [pos, setPos] = useState<Position | null>(position && position !== "POR" ? position : null);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Altura (cm)" htmlFor="height_cm">
          <Input id="height_cm" name="height_cm" type="number" inputMode="numeric" min={140} max={220} step={1} required defaultValue={height ?? undefined} placeholder="178" />
        </Field>
        <Field label="Peso (kg)" htmlFor="weight_kg">
          <Input id="weight_kg" name="weight_kg" type="number" inputMode="decimal" min={40} max={160} step={0.5} required defaultValue={weight ?? undefined} placeholder="75" />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Posición habitual</legend>
        <input type="hidden" name="position" value={pos ?? ""} />
        <div role="radiogroup" aria-label="Posición habitual" className="flex gap-1 rounded-[0.875rem] bg-surface-3/70 p-1">
          {FIELD_POSITIONS.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={pos === p} onClick={() => setPos(p)}
              className={cx("min-h-10 flex-1 rounded-[0.625rem] px-2 text-[13px] font-semibold transition-all", pos === p ? "bg-surface text-ink shadow-[0_1px_3px_rgb(16_24_40/0.12)]" : "text-ink-2")}>
              {POSITION_LABELS[p]}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-ink-3">La altura y el peso sólo los ven los jugadores registrados.</p>
    </div>
  );
}
