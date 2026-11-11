"use client";
import { useActionState, useState } from "react";
import { signInWithPassword, signUpWithPassword } from "@/app/actions/auth";
import { Field, Input, Notice, cx } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";

export function EmailForms({ next }: { next: string }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction] = useActionState(signInWithPassword, null);
  const [upState, upAction] = useActionState(signUpWithPassword, null);
  const state = mode === "in" ? inState : upState;
  return (
    <div>
      <div role="tablist" className="mb-4 grid grid-cols-2 rounded-xl bg-surface-2 p-1">
        {(["in", "up"] as const).map((m) => (
          <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => setMode(m)}
            className={cx("min-h-10 rounded-lg text-sm font-semibold", mode === m ? "bg-surface text-ink shadow-card" : "text-ink-3")}>
            {m === "in" ? "Entrar" : "Crear cuenta"}
          </button>
        ))}
      </div>
      <form action={mode === "in" ? inAction : upAction} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required inputMode="email" />
        </Field>
        <Field label="Contraseña" htmlFor="password" hint={mode === "up" ? "Mínimo 8 caracteres" : undefined}>
          <Input id="password" name="password" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} required minLength={8} />
        </Field>
        <SubmitButton className="w-full" pendingLabel={mode === "in" ? "Entrando…" : "Creando…"}>
          {mode === "in" ? "Entrar con email" : "Crear cuenta"}
        </SubmitButton>
        {state && (state.ok ? <Notice tone="ok">{state.message}</Notice> : <Notice tone="danger">{state.error}</Notice>)}
      </form>
    </div>
  );
}
