"use client";
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, Notice, cx } from "./index";
import type { ActionResult } from "@/lib/errors";

export function SubmitButton({ children, pendingLabel, variant, className, disabled }: { children: ReactNode; pendingLabel?: string; variant?: "primary" | "secondary" | "danger" | "gold" | "ghost"; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
      {pending ? pendingLabel ?? "Guardando…" : children}
    </Button>
  );
}

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/** Formulario que ejecuta una server action y muestra el resultado */
export function ActionForm({ action, children, className, onSuccess, resetOnSuccess, refresh = true, confirm }: {
  action: Action; children: ReactNode; className?: string; onSuccess?: () => void; resetOnSuccess?: boolean; refresh?: boolean; confirm?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      if (refresh) router.refresh();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state && (
        <div className="mt-3">
          {state.ok ? (state.message ? <Notice tone="ok">{state.message}</Notice> : null) : <Notice tone="danger">{state.error}</Notice>}
        </div>
      )}
    </form>
  );
}

export function Tabs({ tabs, initial = 0, className }: { tabs: { label: string; content: ReactNode }[]; initial?: number; className?: string }) {
  const [i, setI] = useState(initial);
  const id = useId();
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const n = (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setI(n);
    document.getElementById(`${id}-t${n}`)?.focus();
  };
  return (
    <div className={className}>
      <div role="tablist" onKeyDown={onKey} className="no-scrollbar mb-4 flex overflow-x-auto border-b border-line">
        {tabs.map((t, idx) => (
          <button
            key={t.label}
            id={`${id}-t${idx}`}
            role="tab"
            type="button"
            aria-selected={i === idx}
            aria-controls={`${id}-p`}
            tabIndex={i === idx ? 0 : -1}
            onClick={() => setI(idx)}
            className={cx("-mb-px min-h-11 flex-1 whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors", i === idx ? "border-pitch text-pitch" : "border-transparent text-ink-3 hover:text-ink")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-p`} aria-labelledby={`${id}-t${i}`} key={i} className="animate-fade">{tabs[i]?.content}</div>
    </div>
  );
}
