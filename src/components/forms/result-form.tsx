"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, Plus, Trash2, UserPlus, Wand2, X } from "lucide-react";
import { createGuestAction, createHistoricalAction, finalizeMatchAction } from "@/app/actions/matches";
import { Avatar, Button, Card, Crest, Field, Input, Notice, Select, Textarea, cx } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { madridLocalToIso, playerName, teamColor } from "@/lib/format";
import { WEATHER_LABELS, type Formation, type Player, type Team, type Venue } from "@/lib/types";

export interface GoalRow { key: string; team_id: string; scorer_id: string; assist_id: string; conceded_gk_id: string; minute: string; is_own_goal: boolean }
export interface SpellRow { key: string; team_id: string; player_id: string; start_minute: string; end_minute: string }
export interface ResultSide { players: string[]; guests: { player_id: string; name: string; brought_by_id: string | null }[] }

export interface ResultInitial {
  id?: string;
  mode: "finalize" | "historical";
  date: string; time: string; venue_id: string; notes: string;
  home_team_id: string; away_team_id: string; home_formation_id: string; away_formation_id: string;
  home: ResultSide; away: ResultSide;
  goals: GoalRow[]; spells: SpellRow[];
  actual_weather: string; actual_temp_c: string; incidents: string; final_notes: string;
  manual_mvp_ids: string[];
  exceptional: boolean;
  historicalOrigin?: boolean;
}

let seq = 0;
const k = () => `r${++seq}`;

export function ResultForm({ teams, players, venues, formations, initial, perSide }: {
  teams: Team[]; players: Player[]; venues: Venue[]; formations: Formation[]; initial: ResultInitial; perSide: number;
}) {
  const [s, setS] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const hist = s.mode === "historical";
  const showMvp = hist || Boolean(s.historicalOrigin);
  const pById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const team = (id: string) => teams.find((t) => t.id === id)!;
  const sideKey = (teamId: string) => (teamId === s.home_team_id ? "home" : "away") as "home" | "away";
  const parts = (teamId: string) => {
    const sd = s[sideKey(teamId)];
    return [...sd.players, ...sd.guests.map((g) => g.player_id)];
  };
  const other = (teamId: string) => (teamId === s.home_team_id ? s.away_team_id : s.home_team_id);
  const score = (teamId: string) => s.goals.filter((g) => g.team_id === teamId).length;

  const shortOf = (id: string) => {
    const p = pById.get(id);
    const g = [...s.home.guests, ...s.away.guests].find((x) => x.player_id === id);
    return p ? p.nickname || playerName(p, "short") : g?.name ?? "?";
  };
  const nameOf = (id: string) => {
    const p = pById.get(id);
    const g = [...s.home.guests, ...s.away.guests].find((x) => x.player_id === id);
    return p ? p.full_name + (p.nickname ? ` · ${p.nickname}` : "") : g?.name ?? "?";
  };

  const autoGk = (g: GoalRow, spells = s.spells): string => {
    if (g.minute === "") return g.conceded_gk_id;
    const m = Number(g.minute);
    const hit = spells.find((sp) => sp.team_id === other(g.team_id) && sp.start_minute !== "" && sp.end_minute !== "" && m >= Number(sp.start_minute) && m < Number(sp.end_minute));
    return hit ? hit.player_id : g.conceded_gk_id;
  };

  const editingGoal = editing ? s.goals.find((g) => g.key === editing) ?? null : null;
  const updGoal = (key: string, patch: Partial<GoalRow>) =>
    setS((p) => ({ ...p, goals: p.goals.map((g) => (g.key === key ? (() => { const n = { ...g, ...patch }; return { ...n, conceded_gk_id: patch.conceded_gk_id ?? autoGk(n) }; })() : g)) }));
  const updSpell = (key: string, patch: Partial<SpellRow>) => setS((p) => ({ ...p, spells: p.spells.map((x) => (x.key === key ? { ...x, ...patch } : x)) }));

  const addSpell = (teamId: string) => setS((p) => {
    const mine = p.spells.filter((x) => x.team_id === teamId);
    const last = mine[mine.length - 1];
    const start = last && last.end_minute !== "" ? Number(last.end_minute) : 0;
    return { ...p, spells: [...p.spells, { key: k(), team_id: teamId, player_id: "", start_minute: String(start), end_minute: String(start + 7) }] };
  });

  const autoRotation = (teamId: string) => setS((p) => {
    const ids = parts(teamId);
    const spells = ids.map((pid, i) => ({ key: k(), team_id: teamId, player_id: pid, start_minute: String(i * 7), end_minute: String(i * 7 + 7) }));
    const all = [...p.spells.filter((x) => x.team_id !== teamId), ...spells];
    return { ...p, spells: all, goals: p.goals.map((g) => ({ ...g, conceded_gk_id: autoGk(g, all) })) };
  });

  const payload = useMemo(() => {
    const side = (sd: ResultSide) => ({ players: sd.players, guests: sd.guests.map((g) => ({ player_id: g.player_id, brought_by_id: g.brought_by_id })), positions: {} });
    const base = {
      home_score: score(s.home_team_id),
      away_score: score(s.away_team_id),
      home: side(s.home),
      away: side(s.away),
      goals: s.goals.map((g) => ({
        team_id: g.team_id, scorer_id: g.scorer_id || null, assist_id: g.is_own_goal ? null : g.assist_id || null,
        conceded_gk_id: g.conceded_gk_id || null, minute: g.minute === "" ? null : Number(g.minute), is_own_goal: g.is_own_goal,
      })),
      gk_spells: s.spells.filter((x) => x.player_id).map((x) => ({
        team_id: x.team_id, player_id: x.player_id,
        start_minute: x.start_minute === "" ? null : Number(x.start_minute), end_minute: x.end_minute === "" ? null : Number(x.end_minute),
      })),
      actual_weather: s.actual_weather || null,
      actual_temp_c: s.actual_temp_c === "" ? null : Number(s.actual_temp_c),
      incidents: s.incidents || null,
      final_notes: s.final_notes || null,
      manual_mvp_ids: showMvp ? s.manual_mvp_ids : undefined,
    };
    if (!hist) return JSON.stringify(base);
    let kickoff = "";
    try { kickoff = s.date && s.time ? madridLocalToIso(s.date, s.time) : ""; } catch {}
    return JSON.stringify({
      ...base, kickoff_at: kickoff, venue_id: s.venue_id || null, home_team_id: s.home_team_id, away_team_id: s.away_team_id,
      home_formation_id: s.home_formation_id || null, away_formation_id: s.away_formation_id || null, notes: s.notes || null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  const countOk = (tid: string) => parts(tid).length === perSide;
  const allParts = [...parts(s.home_team_id), ...parts(s.away_team_id)];

  return (
    <ActionForm action={hist ? createHistoricalAction : finalizeMatchAction} className="space-y-5" refresh={false}>
      {s.id && <input type="hidden" name="id" value={s.id} />}
      <input type="hidden" name="payload" value={payload} />

      {hist && (
        <Card className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Fecha original" htmlFor="hdate"><Input id="hdate" type="date" required value={s.date} onChange={(e) => setS({ ...s, date: e.target.value })} /></Field>
          <Field label="Hora (si se conoce)" htmlFor="htime" hint="Si no la sabes, deja 20:00"><Input id="htime" type="time" value={s.time} onChange={(e) => setS({ ...s, time: e.target.value })} /></Field>
          <Field label="Estadio" htmlFor="hvenue">
            <Select id="hvenue" value={s.venue_id} onChange={(e) => setS({ ...s, venue_id: e.target.value })}>
              <option value="">Desconocido</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </Field>
          <Field label="Local" htmlFor="hhome">
            <Select id="hhome" value={s.home_team_id} onChange={(e) => {
              const h = e.target.value;
              const a = teams.find((t) => t.id !== h)!.id;
              setS({ ...s, home_team_id: h, away_team_id: a, home: { players: [], guests: [] }, away: { players: [], guests: [] }, goals: [], spells: [] });
            }}>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          {(["home_formation_id", "away_formation_id"] as const).map((fk) => (
            <Field key={fk} label={`Formación ${fk.startsWith("home") ? "local" : "visitante"}`} htmlFor={fk}>
              <Select id={fk} value={s[fk]} onChange={(e) => setS({ ...s, [fk]: e.target.value })}>
                <option value="">Desconocida</option>
                {formations.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            </Field>
          ))}
          <div className="sm:col-span-2"><Field label="Información adicional" htmlFor="hnotes"><Textarea id="hnotes" value={s.notes} onChange={(e) => setS({ ...s, notes: e.target.value })} /></Field></div>
        </Card>
      )}

      {/* Marcador derivado de los goles */}
      <Card className="flex items-center justify-around p-4">
        {[s.home_team_id, s.away_team_id].map((tid, i) => (
          <div key={tid} className={cx("flex items-center gap-3", i === 1 && "flex-row-reverse")}>
            <Crest src={team(tid).crest_url} name={team(tid).name} size={40} />
            <span className="font-display tabular text-5xl font-bold">{score(tid)}</span>
          </div>
        ))}
      </Card>
      <p className="-mt-3 text-center text-xs text-ink-3">El marcador se calcula a partir de los goles que añadas abajo.</p>

      {/* Participantes */}
      <div className="grid gap-5 lg:grid-cols-2">
        {[s.home_team_id, s.away_team_id].map((tid) => (
          <ParticipantPicker key={tid} team={team(tid)} players={players} value={s[sideKey(tid)]} other={s[sideKey(other(tid))]}
            perSide={perSide} hist={hist} exceptional={s.exceptional}
            onChange={(v) => setS((p) => ({ ...p, [sideKey(tid)]: v }))} ok={countOk(tid)} />
        ))}
      </div>

      {/* Goles: marcador en directo + panel inferior para cada gol */}
      <Card className="p-4">
        <h3 className="mb-3 font-display text-lg font-bold uppercase">Goles y asistencias</h3>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {[s.home_team_id, s.away_team_id].map((tid, i) => (
            <div key={tid} className={cx("flex flex-col items-center gap-2", i === 1 && "order-3")}>
              <span className="flex items-center gap-1.5 text-sm font-semibold"><Crest src={team(tid).crest_url} name={team(tid).name} size={22} />{team(tid).short_name}</span>
              <Button type="button" className="w-full" onClick={() => { const key = k(); setS((p) => ({ ...p, goals: [...p.goals, { key, team_id: tid, scorer_id: "", assist_id: "", conceded_gk_id: "", minute: "", is_own_goal: false }] })); setEditing(key); }}>
                <Plus size={18} /> Gol
              </Button>
            </div>
          ))}
          <div className="order-2 px-2 text-center font-display tabular text-4xl font-bold">{score(s.home_team_id)}<span className="mx-1 text-ink-3">–</span>{score(s.away_team_id)}</div>
        </div>
        {s.goals.length === 0 ? <p className="mt-4 text-center text-sm text-ink-3">Sin goles: el partido acabará 0-0.</p> : (
          <ol className="mt-4 divide-y divide-line rounded-xl border border-line">
            {s.goals.map((g, i) => (
              <li key={g.key} className="flex items-center gap-2 py-1 pr-1 pl-3" style={{ borderLeft: `4px solid ${teamColor(team(g.team_id))}` }}>
                <button type="button" onClick={() => setEditing(g.key)} className="press min-h-11 min-w-0 flex-1 text-left text-sm">
                  <span className="text-ink-3">{i + 1}. {team(g.team_id).short_name} · </span>
                  <strong>{g.scorer_id ? shortOf(g.scorer_id) : "Goleador sin indicar"}</strong>
                  {g.is_own_goal ? <span className="text-ink-3"> (en propia)</span> : g.assist_id ? <span className="text-ink-3"> · asist. {shortOf(g.assist_id)}</span> : null}
                </button>
                <button type="button" aria-label={`Eliminar gol ${i + 1}`} onClick={() => setS((p) => ({ ...p, goals: p.goals.filter((x) => x.key !== g.key) }))} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2"><Trash2 size={16} /></button>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {editingGoal && (
        <GoalSheet
          goal={editingGoal}
          index={s.goals.findIndex((g) => g.key === editingGoal.key) + 1}
          teamName={team(editingGoal.team_id).short_name}
          color={teamColor(team(editingGoal.team_id))}
          own={parts(editingGoal.team_id)}
          opp={parts(other(editingGoal.team_id))}
          nameOf={shortOf}
          photoOf={(id) => pById.get(id)?.photo_url ?? null}
          onChange={(patch) => updGoal(editingGoal.key, patch)}
          onClose={() => setEditing(null)}
          onDelete={() => { setS((p) => ({ ...p, goals: p.goals.filter((x) => x.key !== editingGoal.key) })); setEditing(null); }}
        />
      )}

      {/* Rotación de portería */}
      <Card className="p-4">
        <h3 className="font-display text-lg font-bold uppercase">Rotación de portería</h3>
        <p className="mb-3 text-xs text-ink-3">Cada ~7 minutos cambia el portero. Apunta quién estuvo en portería y en qué tramos. Los goles encajados en portería no cuentan en la nota de nadie.</p>
        <div className="grid gap-4 lg:grid-cols-2">
          {[s.home_team_id, s.away_team_id].map((tid) => (
            <div key={tid}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{team(tid).name}</span>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" className="min-h-9 px-2 text-xs" disabled={!parts(tid).length} onClick={() => autoRotation(tid)}><Wand2 size={14} /> 1 por jugador</Button>
                  <Button type="button" variant="ghost" className="min-h-9 px-2 text-xs" onClick={() => addSpell(tid)}><Plus size={14} /> Periodo</Button>
                </div>
              </div>
              <ul className="space-y-2">
                {s.spells.filter((x) => x.team_id === tid).map((x, i) => (
                  <li key={x.key} className="grid grid-cols-[2rem_1fr_4rem_4rem_2.25rem] items-center gap-1.5">
                    <span className="tabular text-xs font-bold text-ink-3">{i + 1}.</span>
                    <Select aria-label="Portero" value={x.player_id} onChange={(e) => updSpell(x.key, { player_id: e.target.value })} className="min-h-10 px-2 text-sm">
                      <option value="">Jugador…</option>
                      {parts(tid).map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
                    </Select>
                    <Input aria-label="Desde minuto" type="number" min={0} value={x.start_minute} onChange={(e) => updSpell(x.key, { start_minute: e.target.value })} className="min-h-10 px-2" />
                    <Input aria-label="Hasta minuto" type="number" min={0} value={x.end_minute} onChange={(e) => updSpell(x.key, { end_minute: e.target.value })} className="min-h-10 px-2" />
                    <button type="button" aria-label="Quitar periodo" onClick={() => setS((p) => ({ ...p, spells: p.spells.filter((y) => y.key !== x.key) }))} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2"><Trash2 size={15} /></button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      {showMvp && (
        <Card className="p-4">
          <Field label="MVP (si se conoce)" htmlFor="mvp" hint="En partidos históricos el MVP se indica manualmente.">
            <Select id="mvp" value={s.manual_mvp_ids[0] ?? ""} onChange={(e) => setS({ ...s, manual_mvp_ids: e.target.value ? [e.target.value] : [] })}>
              <option value="">Desconocido</option>
              {(allParts.length ? allParts : players.filter((p) => p.kind === "member").map((p) => p.id)).map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
            </Select>
          </Field>
        </Card>
      )}

      <Card className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label="Clima real" htmlFor="aw">
          <Select id="aw" value={s.actual_weather} onChange={(e) => setS({ ...s, actual_weather: e.target.value })}>
            <option value="">Sin información</option>
            {Object.entries(WEATHER_LABELS).map(([kk, v]) => <option key={kk} value={kk}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Temperatura real (°C)" htmlFor="at"><Input id="at" type="number" step={0.5} min={-20} max={55} value={s.actual_temp_c} onChange={(e) => setS({ ...s, actual_temp_c: e.target.value })} /></Field>
        <Field label="Incidencias" htmlFor="inc"><Textarea id="inc" value={s.incidents} onChange={(e) => setS({ ...s, incidents: e.target.value })} /></Field>
        <Field label="Observaciones finales" htmlFor="fn"><Textarea id="fn" value={s.final_notes} onChange={(e) => setS({ ...s, final_notes: e.target.value })} /></Field>
      </Card>

      {(!countOk(s.home_team_id) || !countOk(s.away_team_id)) && !s.exceptional && !hist && (
        <Notice tone="warn">Un partido disputado necesita exactamente {perSide} participantes por equipo.</Notice>
      )}
      <SubmitButton className="w-full sm:w-auto" pendingLabel="Guardando…">{hist ? "Guardar partido histórico" : initial.goals.length || initial.spells.length ? "Guardar resultado" : "Finalizar partido"}</SubmitButton>
    </ActionForm>
  );
}

function ParticipantPicker({ team, players, value, other, onChange, perSide, ok, hist, exceptional }: {
  team: Team; players: Player[]; value: ResultSide; other: ResultSide; onChange: (v: ResultSide) => void; perSide: number; ok: boolean; hist: boolean; exceptional: boolean;
}) {
  const roster = players.filter((p) => p.kind === "member" && (p.team_id === team.id || value.players.includes(p.id)));
  const members = players.filter((p) => p.kind === "member");
  const total = value.players.length + value.guests.length;
  const [gName, setGName] = useState("");
  const [gBy, setGBy] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (id: string) => onChange({ ...value, players: value.players.includes(id) ? value.players.filter((x) => x !== id) : [...value.players, id] });
  return (
    <Card className="p-4" style={{ borderTop: `4px solid ${teamColor(team)}` }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">Participantes · {team.short_name}</span>
        <span className={cx("tabular rounded-full px-2 py-0.5 text-xs font-bold", ok || (hist && total <= perSide) || exceptional ? "bg-pitch-soft text-pitch" : "bg-gold-soft text-gold")}>{total} / {perSide}</span>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {roster.map((p) => (
          <li key={p.id} className="flex min-h-11 items-center gap-3 px-3">
            <input id={`p-${team.id}-${p.id}`} type="checkbox" className="h-5 w-5 accent-[var(--pitch)]" checked={value.players.includes(p.id)} disabled={other.players.includes(p.id)} onChange={() => toggle(p.id)} />
            <label htmlFor={`p-${team.id}-${p.id}`} className="flex-1 py-2 text-sm">{p.full_name}{p.nickname && <span className="text-ink-3"> · {p.nickname}</span>}</label>
          </li>
        ))}
        {value.guests.map((g) => (
          <li key={g.player_id} className="flex min-h-11 items-center gap-3 px-3 text-sm">
            <span className="flex-1"><strong>{g.name}</strong> <span className="text-ink-3">(invitado{g.brought_by_id ? ` de ${members.find((m) => m.id === g.brought_by_id)?.full_name ?? "?"}` : ""})</span></span>
            <button type="button" aria-label={`Quitar a ${g.name}`} onClick={() => onChange({ ...value, guests: value.guests.filter((x) => x.player_id !== g.player_id) })} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2"><Trash2 size={15} /></button>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input aria-label="Invitado" placeholder="Añadir invitado" value={gName} onChange={(e) => setGName(e.target.value)} />
        <Select aria-label="Quién lo trae" value={gBy} onChange={(e) => setGBy(e.target.value)}>
          <option value="">¿Quién lo trae?</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </Select>
        <Button type="button" variant="secondary" disabled={pending || gName.trim().length < 2} onClick={() => start(async () => {
          setErr(null);
          const r = await createGuestAction(gName);
          if (!r.ok) return setErr(r.error);
          if ([...value.guests, ...other.guests].some((g) => g.player_id === r.data!.id)) return setErr("Ese invitado ya está en el partido");
          onChange({ ...value, guests: [...value.guests, { player_id: r.data!.id, name: r.data!.name, brought_by_id: gBy || null }] });
          setGName(""); setGBy("");
        })}><UserPlus size={16} /></Button>
      </div>
      {err && <Notice tone="danger" className="mt-2">{err}</Notice>}
    </Card>
  );
}


/** Panel inferior para un gol: goleador → asistente, a toques. Sin minutos. */
function GoalSheet({ goal, index, teamName, color, own, opp, nameOf, photoOf, onChange, onClose, onDelete }: {
  goal: GoalRow; index: number; teamName: string; color: string; own: string[]; opp: string[];
  nameOf: (id: string) => string; photoOf: (id: string) => string | null;
  onChange: (patch: Partial<GoalRow>) => void; onClose: () => void; onDelete: () => void;
}) {
  const assistRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  const scorers = goal.is_own_goal ? opp : own;
  const pickScorer = (id: string) => {
    onChange({ scorer_id: id, assist_id: goal.assist_id === id ? "" : goal.assist_id });
    if (!goal.is_own_goal) setTimeout(() => assistRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const tp = { color, nameOf, photoOf };
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="goal-sheet-title">
      <button type="button" aria-label="Cerrar" className="animate-fade absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="animate-rise absolute inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] max-w-xl flex-col rounded-t-3xl border-t border-line bg-elev shadow-card">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="h-3 w-3 rounded-full" style={{ background: color }} aria-hidden />
          <h3 id="goal-sheet-title" className="flex-1 font-display text-xl font-bold uppercase">Gol {index} · {teamName}</h3>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar" className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-3 hover:bg-surface-2"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 py-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{goal.is_own_goal ? "¿Quién la metió en propia?" : "¿Quién marcó?"}</p>
            <label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-ink-2">
              <input type="checkbox" className="h-5 w-5 accent-[var(--pitch)]" checked={goal.is_own_goal} onChange={(e) => onChange({ is_own_goal: e.target.checked, scorer_id: "", assist_id: "" })} /> En propia puerta
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {scorers.map((id) => <PickTile {...tp} key={id} id={id} label={nameOf(id)} selected={goal.scorer_id === id} onPick={() => pickScorer(id)} />)}
            <PickTile {...tp} label="No lo sé" selected={!goal.scorer_id} onPick={() => onChange({ scorer_id: "" })} />
          </div>

          {!goal.is_own_goal && (
            <div ref={assistRef} className="scroll-mt-4 pt-5">
              <p className="mb-2 text-sm font-semibold">¿Quién dio la asistencia?</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                <PickTile {...tp} label="Sin asistencia" selected={!goal.assist_id} onPick={() => onChange({ assist_id: "" })} />
                {own.filter((id) => id !== goal.scorer_id).map((id) => <PickTile {...tp} key={id} id={id} label={nameOf(id)} selected={goal.assist_id === id} onPick={() => onChange({ assist_id: id })} />)}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 border-t border-line px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Button type="button" variant="ghost" className="text-danger" onClick={onDelete}><Trash2 size={16} /> Quitar</Button>
          <Button type="button" className="flex-1" onClick={onClose}><Check size={18} /> Listo</Button>
        </div>
      </div>
    </div>
  );
}

function PickTile({ id, selected, onPick, label, color, nameOf, photoOf }: {
  id?: string; selected: boolean; onPick: () => void; label: string; color: string; nameOf: (id: string) => string; photoOf: (id: string) => string | null;
}) {
  return (
    <button type="button" onClick={onPick} aria-pressed={selected}
      className={cx("press relative flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 text-center", selected ? "border-pitch bg-pitch-soft ring-2 ring-pitch" : "border-line bg-surface")}>
      {selected && <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-pitch text-pitch-ink"><Check size={13} strokeWidth={3} aria-hidden /></span>}
      {id ? <Avatar name={nameOf(id)} src={photoOf(id)} size={36} color={color} /> : <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed border-line-strong text-ink-3">?</span>}
      <span className="line-clamp-2 text-xs font-semibold leading-tight">{label}</span>
    </button>
  );
}
