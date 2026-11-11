import Link from "next/link";
import { MapPin } from "lucide-react";
import { Crest } from "@/components/ui";
import { BallIcon, BootIcon } from "@/components/match/lineup-pitch";
import { fmtTime } from "@/lib/format";
import { STATUS_LABELS, type Match, type Team, type Venue } from "@/lib/types";

export interface ScorerLine { name: string; goals: number; ownGoal?: boolean }

/** «Alfonso González» → «A. González» (como los marcadores deportivos) */
export function compactName(name: string) {
  const [first, ...rest] = name.split(" ");
  return rest.length ? `${first[0]}. ${rest.join(" ")}` : name;
}

const STATUS_TEXT: Record<Match["status"], string> = {
  played: "text-ink-3", pending: "font-semibold text-ink-3", confirmed: "font-semibold text-info",
  postponed: "font-semibold text-gold", cancelled: "font-semibold text-loss",
};

const pad = (n: number) => String(n).padStart(2, "0");
function datePill(iso: string) {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(d);
  const g = (t: string) => f.find((x) => x.type === t)?.value ?? "";
  return `${pad(Number(g("day")))}/${pad(Number(g("month")))}/${g("year")} • ${fmtTime(iso)}`;
}

function Side({ team }: { team: Team }) {
  return (
    <Link href={`/equipos/${team.slug}`} className="flex min-w-0 flex-col items-center gap-2 text-center">
      <Crest src={team.crest_url} name={team.name} size={64}  />
      <span className="w-full truncate text-sm font-semibold leading-tight text-ink">{team.name}</span>
    </Link>
  );
}

function Scorers({ list, align }: { list: ScorerLine[]; align: "left" | "right" }) {
  return (
    <ul className={align === "right" ? "space-y-0.5 text-right" : "space-y-0.5 text-left"}>
      {list.map((s) => (
        <li key={s.name + (s.ownGoal ? "pp" : "")} className="truncate">
          {compactName(s.name)}{s.ownGoal ? " (p.p.)" : ""}{s.goals > 1 ? <span className="text-ink-3"> ×{s.goals}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Cabecera de la ficha de partido (estilo marcador digital) */
export function MatchHeader({ m, home, away, venue, scorers, assists }: {
  m: Match; home: Team; away: Team; venue?: Venue;
  scorers: { home: ScorerLine[]; away: ScorerLine[] }; assists: { home: ScorerLine[]; away: ScorerLine[] };
}) {
  const played = m.status === "played";
  const status = played ? "Finalizado" : STATUS_LABELS[m.status];
  const hasScorers = played && (scorers.home.length > 0 || scorers.away.length > 0);
  const hasAssists = played && (assists.home.length > 0 || assists.away.length > 0);
  const hs = m.home_score ?? 0, as = m.away_score ?? 0;
  const dim = (mine: number, other: number) => (played && mine < other ? "text-ink-3" : "");
  return (
    <header className="-mx-4 -mt-5 border-b border-line bg-surface px-4 pt-4 pb-5 text-ink lg:mx-0 lg:mt-0 lg:border">
      <div className="flex justify-center">
        <span className="tabular bg-surface-2 px-3 py-1 text-xs font-semibold tracking-wide text-ink-2">{datePill(m.kickoff_at)}</span>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-2">
        <Side team={home} />
        <div className="flex min-w-[7.5rem] flex-col items-center pt-3">
          {played ? (
            <div className="tabular text-[2.75rem] font-bold leading-none">
              <span className={dim(hs, as)}>{m.home_score}</span><span className="mx-2 text-ink-3">-</span><span className={dim(as, hs)}>{m.away_score}</span>
            </div>
          ) : (
            <div className="tabular text-4xl font-bold leading-none">{fmtTime(m.kickoff_at)}</div>
          )}
          <span className={`mt-2 text-sm ${STATUS_TEXT[m.status]}`}>{status}</span>
        </div>
        <Side team={away} />
      </div>
      {(hasScorers || hasAssists) && (
        <div className="mt-4 space-y-2 border-t border-line pt-3 text-[13px] text-ink-2">
          {hasScorers && (
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3" aria-label="Goleadores">
              <Scorers list={scorers.home} align="right" />
              <BallIcon className="mt-0.5 h-4 w-4 rounded-full ring-1 ring-line-strong" />
              <Scorers list={scorers.away} align="left" />
            </div>
          )}
          {hasAssists && (
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3" aria-label="Asistentes">
              <Scorers list={assists.home} align="right" />
              <BootIcon className="mt-0.5 h-4 w-4 rounded-full ring-1 ring-line-strong" />
              <Scorers list={assists.away} align="left" />
            </div>
          )}
        </div>
      )}
      {venue && (
        <div className="mt-4 flex justify-center">
          <Link href={`/estadios/${venue.id}`} className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink"><MapPin size={12} aria-hidden />{venue.name}</Link>
        </div>
      )}
    </header>
  );
}
