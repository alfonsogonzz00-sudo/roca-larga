"use client";
import { useOptimistic, useState, useTransition } from "react";
import { Check, ChevronDown, Wallet } from "lucide-react";
import { setPaymentAction } from "@/app/actions/payments";
import { cx } from "@/components/ui";

export interface PaymentRow { id: string; name: string; paid: boolean; payer: boolean; canEdit: boolean }
export interface PaymentTeam { id: string; name: string; color: string; rows: PaymentRow[] }

/** Botón «Pagos» y, al abrirlo, una columna por equipo con quién ha pagado */
export function PaymentsPanel({ matchId, teams }: { matchId: string; teams: PaymentTeam[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const initial = Object.fromEntries(teams.flatMap((t) => t.rows.map((r) => [r.id, r.paid || r.payer])));
  const [paid, setPaid] = useOptimistic(initial, (s: Record<string, boolean>, u: { id: string; v: boolean }) => ({ ...s, [u.id]: u.v }));
  const all = teams.flatMap((t) => t.rows);
  const done = all.filter((r) => paid[r.id]).length;

  const toggle = (r: PaymentRow) => {
    if (!r.canEdit || r.payer) return;
    const v = !paid[r.id];
    setError(null);
    start(async () => {
      setPaid({ id: r.id, v });
      const res = await setPaymentAction(matchId, r.id, v);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="press flex min-h-11 w-full items-center gap-2 rounded-2xl bg-surface px-4 text-sm font-semibold shadow-card">
        <Wallet size={18} aria-hidden className="text-ink-3" />
        <span className="flex-1 text-left">Pagos</span>
        <span className={cx("tabular text-xs font-semibold", done === all.length ? "text-pitch" : "text-ink-3")}>{done} de {all.length}</span>
        <ChevronDown size={18} aria-hidden className={cx("text-ink-3 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 rounded-2xl bg-surface p-3 shadow-card">
          <div className="grid grid-cols-2 gap-3">
            {teams.map((t) => (
              <div key={t.id} className="min-w-0">
                <p className="mb-1.5 flex items-center gap-1.5 truncate text-xs font-semibold uppercase tracking-wider text-ink-3">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.color }} aria-hidden />{t.name}
                </p>
                <ul className="space-y-1">
                  {t.rows.map((r) => {
                    const ok = paid[r.id];
                    const editable = r.canEdit && !r.payer;
                    return (
                      <li key={r.id}>
                        <button type="button" onClick={() => toggle(r)} disabled={!editable || pending}
                          aria-pressed={ok} aria-label={`${r.name}: ${ok ? "ha pagado" : "no ha pagado"}${editable ? ". Toca para cambiar" : ""}`}
                          className={cx("flex min-h-10 w-full items-center gap-2 rounded-xl px-2 text-left text-sm", editable ? "press bg-surface-2" : "cursor-default")}>
                          <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                            ok ? "border-pitch bg-pitch text-white" : "border-line text-transparent")}>
                            <Check size={14} strokeWidth={3} aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1 truncate">{r.name}</span>
                          {r.payer && <span className="shrink-0 text-[10px] font-semibold uppercase text-gold">Pista</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-ink-3">Marca tu tick cuando le hayas pagado al capitán. «Pista» es quien pagó el campo.</p>
          {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
