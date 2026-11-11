"use client";
import { useState } from "react";
import Link from "next/link";
import { deleteMatchAction, setMatchStatusAction } from "@/app/actions/matches";
import { Button, Field, Input, Card } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { madridLocalToIso } from "@/lib/format";
import type { MatchStatus } from "@/lib/types";

export function StaffActions({ id, status, isAdmin, started }: { id: string; status: MatchStatus; isAdmin: boolean; started: boolean }) {
  const [mode, setMode] = useState<null | "postponed" | "cancelled">(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  let newKick = "";
  try { newKick = date && time ? madridLocalToIso(date, time) : ""; } catch {}
  return (
    <Card className="space-y-3 p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-3">Gestión del partido</div>
      <div className="flex flex-wrap gap-2">
        {status !== "played" && status !== "cancelled" && <Link href={`/partidos/${id}/editar`} className="inline-flex min-h-11 items-center rounded-xl border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2">Editar y convocatoria</Link>}
        {(status === "pending" || status === "postponed") && (
          <ActionForm action={setMatchStatusAction}>
            <input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="confirmed" />
            <SubmitButton pendingLabel="Confirmando…">Confirmar partido</SubmitButton>
          </ActionForm>
        )}
        {(status === "confirmed" || status === "pending") && started && <Link href={`/partidos/${id}/finalizar`} className="inline-flex min-h-11 items-center rounded-xl bg-gold px-4 text-sm font-semibold text-white">Finalizar partido</Link>}
        {status === "played" && <Link href={`/partidos/${id}/finalizar`} className="inline-flex min-h-11 items-center rounded-xl border border-line-strong px-4 text-sm font-semibold hover:bg-surface-2">Editar resultado</Link>}
        {status !== "played" && status !== "cancelled" && (
          <>
            <Button variant="secondary" onClick={() => setMode(mode === "postponed" ? null : "postponed")}>Aplazar</Button>
            <Button variant="ghost" className="text-danger" onClick={() => setMode(mode === "cancelled" ? null : "cancelled")}>Cancelar</Button>
          </>
        )}
        {status === "cancelled" && isAdmin && (
          <ActionForm action={setMatchStatusAction}>
            <input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="pending" />
            <SubmitButton variant="secondary">Reactivar</SubmitButton>
          </ActionForm>
        )}
      </div>
      {mode && (
        <ActionForm action={setMatchStatusAction} className="space-y-3 rounded-xl bg-surface-2 p-3" onSuccess={() => setMode(null)}>
          <input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={mode} />
          <input type="hidden" name="new_kickoff" value={newKick} />
          <Field label="Motivo" htmlFor="reason"><Input id="reason" name="reason" placeholder="Lluvia, campo ocupado…" /></Field>
          {mode === "postponed" && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Nueva fecha (opcional)" htmlFor="nd"><Input id="nd" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label="Hora" htmlFor="nt"><Input id="nt" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            </div>
          )}
          <SubmitButton variant={mode === "cancelled" ? "danger" : "primary"}>{mode === "cancelled" ? "Cancelar partido" : "Aplazar partido"}</SubmitButton>
        </ActionForm>
      )}
      {isAdmin && (
        <ActionForm action={deleteMatchAction} confirm="¿Eliminar este partido y todos sus datos? No se puede deshacer." refresh={false}>
          <input type="hidden" name="id" value={id} />
          <SubmitButton variant="ghost" className="text-danger">Eliminar partido</SubmitButton>
        </ActionForm>
      )}
    </Card>
  );
}
