"use client";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeftRight, UserPlus, X } from "lucide-react";
import { createGuestAction, createMatchAction, updateMatchAction } from "@/app/actions/matches";
import { Button, Card, Crest, Field, Input, Notice, Select, Textarea, cx } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { madridLocalToIso } from "@/lib/format";
import { POSITION_LABELS, WEATHER_LABELS, type Formation, type Player, type Position, type Team, type Venue } from "@/lib/types";

export interface SideState {
  players: string[];
  guests: { player_id: string; name: string; brought_by_id: string | null }[];
  positions: Record<string, Position | "">;
}

export interface MatchFormInitial {
  id?: string;
  date: string;
  time: string;
  venue_id: string;
  home_team_id: string;
  away_team_id: string;
  home_formation_id: string;
  away_formation_id: string;
  forecast_weather: string;
  forecast_temp_c: string;
  notes: string;
  status: "pending" | "confirmed" | "postponed" | "cancelled";
  exceptional_lineup: boolean;
  exceptional_reason: string;
  home: SideState;
  away: SideState;
}

interface Props {
  teams: Team[];
  players: Player[];
  venues: Venue[];
  formations: Formation[];
  initial: MatchFormInitial;
  isAdmin: boolean;
  perSide: number;
}

export function MatchForm({ teams, players, venues, formations, initial, isAdmin, perSide }: Props) {
  const [s, setS] = useState(initial);
  const editing = Boolean(initial.id);
  const set = <K extends keyof MatchFormInitial>(k: K, v: MatchFormInitial[K]) => setS((p) => ({ ...p, [k]: v }));

  const payload = useMemo(() => {
    let kickoff = "";
    try { kickoff = s.date && s.time ? madridLocalToIso(s.date, s.time) : ""; } catch {}
    const side = (x: SideState) => ({
      players: x.players,
      guests: x.guests.map((g) => ({ player_id: g.player_id, brought_by_id: g.brought_by_id })),
      positions: Object.fromEntries(Object.entries(x.positions).filter(([, v]) => v)),
    });
    return JSON.stringify({
      kickoff_at: kickoff,
      venue_id: s.venue_id || null,
      home_team_id: s.home_team_id,
      away_team_id: s.away_team_id,
      home_formation_id: s.home_formation_id || null,
      away_formation_id: s.away_formation_id || null,
      forecast_weather: s.forecast_weather || null,
      forecast_temp_c: s.forecast_temp_c === "" ? null : Number(s.forecast_temp_c),
      notes: s.notes || null,
      status: editing ? undefined : s.status === "confirmed" ? "confirmed" : "pending",
      exceptional_lineup: s.exceptional_lineup,
      exceptional_reason: s.exceptional_reason || null,
      home: side(s.home),
      away: side(s.away),
    });
  }, [s, editing]);

  const swap = () => setS((p) => ({
    ...p, home_team_id: p.away_team_id, away_team_id: p.home_team_id,
    home_formation_id: p.away_formation_id, away_formation_id: p.home_formation_id, home: p.away, away: p.home,
  }));

  return (
    <ActionForm action={editing ? updateMatchAction : createMatchAction} className="space-y-5" refresh={false}>
      {editing && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="payload" value={payload} />

      <Card className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label="Fecha" htmlFor="date"><Input id="date" type="date" required value={s.date} onChange={(e) => set("date", e.target.value)} /></Field>
        <Field label="Hora (Madrid)" htmlFor="time"><Input id="time" type="time" required step={300} value={s.time} onChange={(e) => set("time", e.target.value)} /></Field>
        <Field label="Estadio" htmlFor="venue" hint={venues.length ? undefined : "Aún no hay estadios: el administrador puede crearlos en Administración → Estadios."}>
          <Select id="venue" value={s.venue_id} onChange={(e) => set("venue_id", e.target.value)}>
            <option value="">Por confirmar</option>
            {venues.filter((v) => v.active || v.id === s.venue_id).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        </Field>
        {!editing && (
          <Field label="Estado inicial" htmlFor="status" hint={`Confirmar exige ${perSide} convocados por equipo y avisa a los convocados.`}>
            <Select id="status" value={s.status} onChange={(e) => set("status", e.target.value as "pending")}>
              <option value="pending">Pendiente de organizar</option>
              <option value="confirmed">Confirmado</option>
            </Select>
          </Field>
        )}
      </Card>

      <div className="flex items-center gap-2">
        <div className="flex-1 text-sm font-semibold text-ink-2">Local / visitante</div>
        <Button type="button" variant="secondary" onClick={swap} className="min-h-10"><ArrowLeftRight size={16} /> Intercambiar</Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {(["home", "away"] as const).map((k) => (
          <SidePicker
            key={k}
            label={k === "home" ? "Local" : "Visitante"}
            teams={teams}
            teamId={k === "home" ? s.home_team_id : s.away_team_id}
            otherTeamId={k === "home" ? s.away_team_id : s.home_team_id}
            onTeam={(id) => setS((p) => ({ ...p, [k === "home" ? "home_team_id" : "away_team_id"]: id, [k]: { players: [], guests: [], positions: {} } }))}
            formationId={k === "home" ? s.home_formation_id : s.away_formation_id}
            onFormation={(id) => set(k === "home" ? "home_formation_id" : "away_formation_id", id)}
            formations={formations}
            players={players}
            value={s[k]}
            otherValue={s[k === "home" ? "away" : "home"]}
            onChange={(v) => set(k, v)}
            perSide={perSide}
          />
        ))}
      </div>

      <Card className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label="Previsión meteorológica" htmlFor="weather">
          <Select id="weather" value={s.forecast_weather} onChange={(e) => set("forecast_weather", e.target.value)}>
            <option value="">Sin información</option>
            {Object.entries(WEATHER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Temperatura prevista (°C)" htmlFor="temp">
          <Input id="temp" type="number" inputMode="decimal" min={-20} max={55} step={0.5} value={s.forecast_temp_c} onChange={(e) => set("forecast_temp_c", e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Observaciones" htmlFor="notes"><Textarea id="notes" maxLength={2000} value={s.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        </div>
        {isAdmin && (
          <div className="space-y-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="h-4 w-4 accent-[var(--pitch)]" checked={s.exceptional_lineup} onChange={(e) => set("exceptional_lineup", e.target.checked)} />
              Incidencia excepcional: permitir un número de jugadores distinto de {perSide}
            </label>
            {s.exceptional_lineup && <Input placeholder="Motivo de la incidencia" value={s.exceptional_reason} onChange={(e) => set("exceptional_reason", e.target.value)} />}
          </div>
        )}
      </Card>

      <SubmitButton className="w-full sm:w-auto" pendingLabel="Guardando…">{editing ? "Guardar cambios" : "Crear partido"}</SubmitButton>
    </ActionForm>
  );
}

function SidePicker({ label, teams, teamId, otherTeamId, onTeam, formationId, onFormation, formations, players, value, otherValue, onChange, perSide }: {
  label: string; teams: Team[]; teamId: string; otherTeamId: string; onTeam: (id: string) => void; formationId: string; onFormation: (id: string) => void;
  formations: Formation[]; players: Player[]; value: SideState; otherValue: SideState; onChange: (v: SideState) => void; perSide: number;
}) {
  const team = teams.find((t) => t.id === teamId);
  const roster = players.filter((p) => p.kind === "member" && p.team_id === teamId && p.active);
  const members = players.filter((p) => p.kind === "member");
  const total = value.players.length + value.guests.length;
  const [guestName, setGuestName] = useState("");
  const [guestBy, setGuestBy] = useState("");
  const [guestError, setGuestError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (id: string) =>
    onChange({ ...value, players: value.players.includes(id) ? value.players.filter((x) => x !== id) : [...value.players, id] });
  const addGuest = () => {
    setGuestError(null);
    start(async () => {
      const r = await createGuestAction(guestName);
      if (!r.ok) return setGuestError(r.error);
      const id = r.data!.id;
      if (value.guests.some((g) => g.player_id === id) || otherValue.guests.some((g) => g.player_id === id)) return setGuestError("Ese invitado ya está en el partido");
      onChange({ ...value, guests: [...value.guests, { player_id: id, name: r.data!.name, brought_by_id: guestBy || null }] });
      setGuestName("");
      setGuestBy("");
    });
  };
  return (
    <Card className="p-4" style={{ borderTop: `4px solid ${team?.primary_color ?? "var(--line)"}` }}>
      <div className="mb-3 flex items-center gap-3">
        {team && <Crest src={team.crest_url} name={team.name} size={36} />}
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-3">{label}</div>
          <Select aria-label={`Equipo ${label.toLowerCase()}`} value={teamId} onChange={(e) => onTeam(e.target.value)} className="mt-1">
            {teams.map((t) => <option key={t.id} value={t.id} disabled={t.id === otherTeamId}>{t.name}</option>)}
          </Select>
        </div>
      </div>
      <Field label="Formación" htmlFor={`f-${label}`} hint="Seis de campo + portero rotatorio">
        <Select id={`f-${label}`} value={formationId} onChange={(e) => onFormation(e.target.value)}>
          <option value="">Sin definir</option>
          {formations.filter((f) => f.active).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
      </Field>
      <div className="mt-4 mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">Convocados</span>
        <span className={cx("tabular rounded-full px-2 py-0.5 text-xs font-bold", total === perSide ? "bg-pitch-soft text-pitch" : "bg-gold-soft text-gold")}>{total} / {perSide}</span>
      </div>
      {roster.length === 0 ? <p className="text-sm text-ink-3">Este equipo no tiene jugadores activos.</p> : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {roster.map((p) => {
            const on = value.players.includes(p.id);
            return (
              <li key={p.id} className="flex min-h-12 items-center gap-3 px-3">
                <input id={`c-${p.id}`} type="checkbox" checked={on} onChange={() => toggle(p.id)} className="h-5 w-5 accent-[var(--pitch)]" />
                <label htmlFor={`c-${p.id}`} className="flex-1 py-2 text-sm">
                  {p.full_name}{p.nickname && <span className="text-ink-3"> · {p.nickname}</span>}
                </label>
                {on && (
                  <select aria-label={`Posición de ${p.full_name}`} className="rounded-lg border border-line bg-elev px-1.5 py-1 text-xs"
                    value={value.positions[p.id] ?? p.usual_position ?? ""}
                    onChange={(e) => onChange({ ...value, positions: { ...value.positions, [p.id]: e.target.value as Position } })}>
                    <option value="">Pos.</option>
                    {Object.entries(POSITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 space-y-2">
        <div className="text-sm font-semibold">Invitados</div>
        {value.guests.map((g) => (
          <div key={g.player_id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <span className="flex-1"><strong>{g.name}</strong>{g.brought_by_id && <span className="text-ink-3"> · lo trae {members.find((m) => m.id === g.brought_by_id)?.full_name}</span>}</span>
            <button type="button" aria-label={`Quitar a ${g.name}`} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-3" onClick={() => onChange({ ...value, guests: value.guests.filter((x) => x.player_id !== g.player_id) })}><X size={16} /></button>
          </div>
        ))}
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input aria-label="Nombre del invitado" placeholder="Nombre del invitado" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
          <Select aria-label="Quién lo trae" value={guestBy} onChange={(e) => setGuestBy(e.target.value)}>
            <option value="">¿Quién lo trae?</option>
            {members.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </Select>
          <Button type="button" variant="secondary" disabled={pending || guestName.trim().length < 2} onClick={addGuest}><UserPlus size={16} /> Añadir</Button>
        </div>
        {guestError && <Notice tone="danger">{guestError}</Notice>}
        <p className="text-xs text-ink-3">Quien trae al invitado suma una bonificación en la valoración de ese partido (configurable).</p>
      </div>
    </Card>
  );
}
