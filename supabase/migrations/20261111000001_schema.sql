-- =====================================================================
-- ROCA LARGA · Caravelle F.C. vs S.D. Monecillo
-- 0001 · Esquema base (tipos, tablas, índices)
--
-- Principios:
--  * Las estadísticas NO se almacenan de forma redundante: se derivan de
--    match_players, goals, goalkeeper_spells y match_mvps. Corregir un
--    partido = reemplazar sus filas; todo lo demás se recalcula solo.
--  * Los votos MVP se guardan sin identificador del votante. Sólo una
--    huella HMAC (con sal privada) permite al servidor sustituir un voto.
--  * Fechas siempre en timestamptz (UTC). Se muestran en Europe/Madrid.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.app_role        as enum ('admin', 'organizer', 'player');
create type public.account_status  as enum ('active', 'suspended');
create type public.link_status     as enum ('pending', 'approved', 'rejected', 'revoked');
create type public.match_status    as enum ('pending', 'confirmed', 'played', 'postponed', 'cancelled');
create type public.match_origin    as enum ('scheduled', 'historical');
create type public.field_position  as enum ('POR', 'DEF', 'MED', 'DEL');
create type public.player_kind     as enum ('member', 'guest');
create type public.weather_kind    as enum ('despejado', 'nublado', 'lluvia', 'viento', 'niebla', 'otro');

-- ---------------------------------------------------------------------
-- Configuración privada (sal de votos, secreto del despachador, email
-- del propietario). Nunca expuesta por la API.
-- ---------------------------------------------------------------------
create table private.config (
  key   text primary key,
  value text not null
);

-- ---------------------------------------------------------------------
-- Estadios
-- ---------------------------------------------------------------------
create table public.venues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) between 1 and 80),
  address     text,
  city        text,
  maps_url    text,
  image_url   text,
  surface     text,
  notes       text,
  active      boolean not null default true,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Equipos (exactamente dos; no hay política de inserción)
-- ---------------------------------------------------------------------
create table public.teams (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name             text not null,
  short_name       text not null,
  full_name        text,
  crest_url        text,
  headquarters     text,                       -- sede oficial (texto libre)
  home_venue_id    uuid references public.venues(id) on delete set null,
  primary_color    text not null default '#1f7a3c' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color  text not null default '#f5f1e6' check (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  founded_label    text,
  description      text,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Jugadores (plantilla) e invitados
--   kind = member : integrante de la plantilla de team_id
--   kind = guest  : invitado puntual (team_id nulo, juega en cualquier lado)
-- ---------------------------------------------------------------------
create table public.players (
  id              uuid primary key default gen_random_uuid(),
  kind            public.player_kind not null default 'member',
  team_id         uuid references public.teams(id) on delete restrict,
  full_name       text not null check (length(trim(full_name)) between 1 and 80),
  nickname        text check (nickname is null or length(trim(nickname)) between 1 and 30),
  usual_position  public.field_position,
  shirt_number    smallint check (shirt_number between 0 and 99),
  photo_url       text,
  bio             text,
  active          boolean not null default true,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint players_member_has_team check (kind = 'guest' or team_id is not null)
);
create index players_team_idx on public.players(team_id);

-- ---------------------------------------------------------------------
-- Perfiles de usuario (1:1 con auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text,
  display_name        text,
  avatar_url          text,
  auth_provider       text,
  role                public.app_role not null default 'player',
  status              public.account_status not null default 'active',
  player_id           uuid unique references public.players(id) on delete set null,
  notification_prefs  jsonb not null default
    '{"match_confirmed": true, "match_reminder": true, "vote_open": true, "mvp_result": true}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  last_seen_at        timestamptz
);
-- Un único administrador principal.
create unique index profiles_single_admin on public.profiles ((true)) where role = 'admin';

-- Solicitudes de vinculación cuenta ↔ jugador
create table public.player_links (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  player_id           uuid not null references public.players(id) on delete cascade,
  requested_nickname  text check (requested_nickname is null or length(trim(requested_nickname)) between 1 and 30),
  status              public.link_status not null default 'pending',
  review_note         text,
  reviewed_by         uuid references public.profiles(id) on delete set null,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now()
);
create unique index player_links_one_open_per_user on public.player_links(user_id) where status in ('pending', 'approved');
create unique index player_links_one_owner_per_player on public.player_links(player_id) where status = 'approved';

-- ---------------------------------------------------------------------
-- Formaciones: líneas de campo que suman 6 (+ portero rotatorio)
-- ---------------------------------------------------------------------
create or replace function public.int_array_sum(arr smallint[])
returns int language sql immutable parallel safe
set search_path = ''
as $$ select coalesce(sum(x), 0)::int from unnest(arr) as x $$;

create or replace function public.int_array_all_positive(arr smallint[])
returns boolean language sql immutable parallel safe
set search_path = ''
as $$ select coalesce(bool_and(x > 0), false) from unnest(arr) as x $$;

create table public.formations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  lines       smallint[] not null,
  is_default  boolean not null default false,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  constraint formations_six_outfield check (
    array_length(lines, 1) between 1 and 5
    and public.int_array_sum(lines) = 6
    and public.int_array_all_positive(lines)
  )
);
create unique index formations_single_default on public.formations ((true)) where is_default;

-- ---------------------------------------------------------------------
-- Partidos
-- ---------------------------------------------------------------------
create table public.matches (
  id                 uuid primary key default gen_random_uuid(),
  kickoff_at         timestamptz not null,
  venue_id           uuid references public.venues(id) on delete set null,
  home_team_id       uuid not null references public.teams(id),
  away_team_id       uuid not null references public.teams(id),
  status             public.match_status not null default 'pending',
  origin             public.match_origin not null default 'scheduled',
  home_formation_id  uuid references public.formations(id) on delete set null,
  away_formation_id  uuid references public.formations(id) on delete set null,
  forecast_weather   public.weather_kind,
  forecast_temp_c    numeric(4,1) check (forecast_temp_c between -20 and 55),
  actual_weather     public.weather_kind,
  actual_temp_c      numeric(4,1) check (actual_temp_c between -20 and 55),
  notes              text,
  incidents          text,
  final_notes        text,
  home_score         smallint check (home_score between 0 and 99),
  away_score         smallint check (away_score between 0 and 99),
  exceptional_lineup boolean not null default false,
  exceptional_reason text,
  status_reason      text,
  vote_enabled       boolean not null default true,
  vote_opens_at      timestamptz,
  vote_closes_at     timestamptz,
  vote_closed_at     timestamptz,
  is_demo            boolean not null default false,
  created_by         uuid references public.profiles(id) on delete set null,
  updated_by         uuid references public.profiles(id) on delete set null,
  finalized_by       uuid references public.profiles(id) on delete set null,
  finalized_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint matches_distinct_teams check (home_team_id <> away_team_id),
  constraint matches_played_has_score check (status <> 'played' or (home_score is not null and away_score is not null))
);
create index matches_kickoff_idx on public.matches(kickoff_at desc);
create index matches_status_idx on public.matches(status);
create index matches_vote_close_idx on public.matches(vote_closes_at) where vote_closed_at is null;

-- Convocatoria + participación (una fila por jugador y partido)
--   called        : convocado
--   participated  : jugó (provisional = convocado hasta finalizar)
create table public.match_players (
  match_id         uuid not null references public.matches(id) on delete cascade,
  player_id        uuid not null references public.players(id) on delete restrict,
  team_id          uuid not null references public.teams(id),
  called           boolean not null default true,
  participated     boolean not null default true,
  lineup_position  public.field_position,
  brought_by_id    uuid references public.players(id) on delete set null,  -- sólo invitados
  attendance       text not null default 'pending' check (attendance in ('pending', 'yes', 'no')),
  attendance_at    timestamptz,
  created_at       timestamptz not null default now(),
  primary key (match_id, player_id),
  constraint match_players_some_flag check (called or participated),
  constraint match_players_not_self_bring check (brought_by_id is null or brought_by_id <> player_id)
);
create index match_players_player_idx on public.match_players(player_id);

-- Periodos de portería (rotación cada ~7 minutos)
create table public.goalkeeper_spells (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references public.matches(id) on delete cascade,
  team_id       uuid not null references public.teams(id),
  player_id     uuid not null references public.players(id) on delete restrict,
  seq           smallint not null check (seq between 1 and 40),
  start_minute  smallint check (start_minute between 0 and 200),
  end_minute    smallint check (end_minute between 0 and 200),
  unique (match_id, team_id, seq),
  constraint gk_spell_order check (start_minute is null or end_minute is null or end_minute >= start_minute)
);
create index goalkeeper_spells_player_idx on public.goalkeeper_spells(player_id);

-- Goles (una fila por gol). team_id = equipo que suma el gol.
create table public.goals (
  id              uuid primary key default gen_random_uuid(),
  match_id        uuid not null references public.matches(id) on delete cascade,
  team_id         uuid not null references public.teams(id),
  seq             smallint not null,
  scorer_id       uuid references public.players(id) on delete restrict,
  assist_id       uuid references public.players(id) on delete restrict,
  conceded_gk_id  uuid references public.players(id) on delete restrict,  -- portero rival en ese momento
  minute          smallint check (minute between 0 and 200),
  is_own_goal     boolean not null default false,
  unique (match_id, seq),
  constraint goals_scorer_not_assist check (scorer_id is null or assist_id is null or scorer_id <> assist_id),
  constraint goals_own_goal_no_assist check (not is_own_goal or assist_id is null)
);
create index goals_scorer_idx on public.goals(scorer_id);
create index goals_assist_idx on public.goals(assist_id);
create index goals_gk_idx on public.goals(conceded_gk_id);

-- MVP del partido (normalmente uno; varios si el desempate es "compartido")
create table public.match_mvps (
  match_id   uuid not null references public.matches(id) on delete cascade,
  player_id  uuid not null references public.players(id) on delete restrict,
  source     text not null check (source in ('vote', 'manual')),
  points     int,
  primary key (match_id, player_id)
);

-- ---------------------------------------------------------------------
-- Votación MVP anónima
-- ---------------------------------------------------------------------
-- Papeletas: sin usuario ni jugador votante. voter_hash = HMAC(match:player, sal privada)
create table public.mvp_ballots (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches(id) on delete cascade,
  voter_hash  text not null,
  first_id    uuid not null references public.players(id) on delete cascade,
  second_id   uuid not null references public.players(id) on delete cascade,
  third_id    uuid not null references public.players(id) on delete cascade,
  created_at  timestamptz not null default date_trunc('hour', now()),
  unique (match_id, voter_hash),
  constraint ballots_distinct check (first_id <> second_id and first_id <> third_id and second_id <> third_id)
);

-- Justificantes de participación (quién y cuándo, nunca a quién)
create table public.mvp_vote_receipts (
  match_id        uuid not null references public.matches(id) on delete cascade,
  player_id       uuid not null references public.players(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete set null,
  first_voted_at  timestamptz not null default now(),
  last_voted_at   timestamptz not null default now(),
  changes         int not null default 0,
  primary key (match_id, player_id)
);

-- Recuento publicado al cerrar la votación
create table public.mvp_tallies (
  match_id   uuid not null references public.matches(id) on delete cascade,
  player_id  uuid not null references public.players(id) on delete cascade,
  points     int not null,
  firsts     int not null,
  seconds    int not null,
  thirds     int not null,
  rank       int not null,
  ballots    int not null,
  primary key (match_id, player_id)
);

-- ---------------------------------------------------------------------
-- Configuración general, textos personalizables y modelo predictivo
-- ---------------------------------------------------------------------
create table public.app_settings (
  key          text primary key,
  value        jsonb not null,
  description  text,
  updated_by   uuid references public.profiles(id) on delete set null,
  updated_at   timestamptz not null default now()
);

create table public.ui_texts (
  key            text primary key check (key ~ '^[a-z0-9_.]+$'),
  value          text not null,
  variants       text[] not null default '{}',
  default_value  text not null,
  category       text not null default 'general',
  description    text,
  updated_by     uuid references public.profiles(id) on delete set null,
  updated_at     timestamptz not null default now()
);

create table public.prediction_configs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  scope       text not null check (scope in ('next_match', 'simulation')),
  weights     jsonb not null,
  enabled     jsonb not null,
  is_active   boolean not null default false,
  is_system   boolean not null default false,
  notes       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index prediction_configs_one_active on public.prediction_configs(scope) where is_active;

create table public.simulation_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('match', 'individual')),
  config_id   uuid references public.prediction_configs(id) on delete set null,
  input       jsonb not null,
  output      jsonb not null,
  created_at  timestamptz not null default now()
);
create index simulation_runs_user_idx on public.simulation_runs(user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Notificaciones push
-- ---------------------------------------------------------------------
create table public.notification_types (
  type            text primary key,
  label           text not null,
  enabled         boolean not null default true,
  title_template  text not null,
  body_template   text not null,
  lead_minutes    int[] not null default '{}',
  description     text,
  updated_at      timestamptz not null default now()
);

create table public.push_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  endpoint       text not null unique,
  p256dh         text not null,
  auth           text not null,
  user_agent     text,
  failure_count  int not null default 0,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);

create table public.notifications (
  id                uuid primary key default gen_random_uuid(),
  type              text not null references public.notification_types(type) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  match_id          uuid references public.matches(id) on delete cascade,
  kickoff_snapshot  timestamptz,
  title             text not null,
  body              text not null,
  url               text,
  dedupe_key        text not null unique,
  status            text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  scheduled_for     timestamptz not null default now(),
  attempts          int not null default 0,
  sent_at           timestamptz,
  read_at           timestamptz,
  error             text,
  created_at        timestamptz not null default now()
);
create index notifications_due_idx on public.notifications(scheduled_for) where status = 'pending';
create index notifications_user_idx on public.notifications(user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Registro de actividad
-- ---------------------------------------------------------------------
create table public.activity_log (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  actor_id     uuid references public.profiles(id) on delete set null,
  actor_name   text,
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  summary      text not null,
  changes      jsonb,
  is_system    boolean not null default false
);
create index activity_log_created_idx on public.activity_log(created_at desc);
create index activity_log_entity_idx on public.activity_log(entity_type, entity_id);
