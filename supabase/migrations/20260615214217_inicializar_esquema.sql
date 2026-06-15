-- ============================================================
-- SuperPM — Schema Multi-tenant con RLS para Supabase
-- ============================================================

-- 0. Extensión para UUIDs
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. TABLAS
-- ============================================================

-- 1.1 Organizations (tenant raíz)
create table organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  subdomain  text not null unique,
  created_at timestamptz not null default now()
);

-- 1.2 Profiles (vinculado a auth.users)
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  full_name       text not null,
  role            text not null default 'viewer'
                  check (role in ('admin', 'pm', 'viewer')),
  updated_at      timestamptz not null default now()
);

-- 1.3 Jira Integrations (una por organización)
create table jira_integrations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  jira_domain     text not null,
  encrypted_token text not null,
  admin_email     text not null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- 1.4 Design Systems (branding por organización)
create table design_systems (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  primary_color   text not null default '#7C3AED',
  success_color   text not null default '#10B981',
  font_family     text not null default 'Inter',
  border_radius   text not null default '12px',
  custom_rules    jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

-- 1.5 Product Workspaces (salidas de IA por ticket)
create table product_workspaces (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  ticket_key      text not null,
  title           text not null,
  summary_output  text,
  mentor_output   text,
  criteria_output text,
  mermaid_code    text,
  html_prototype  text,
  metrics_output  jsonb,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- 2. ÍNDICES
-- ============================================================

create index idx_profiles_org        on profiles(organization_id);
create index idx_jira_org            on jira_integrations(organization_id);
create index idx_design_org          on design_systems(organization_id);
create index idx_workspaces_org      on product_workspaces(organization_id);
create index idx_workspaces_ticket   on product_workspaces(ticket_key);

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================

alter table organizations      enable row level security;
alter table profiles           enable row level security;
alter table jira_integrations  enable row level security;
alter table design_systems     enable row level security;
alter table product_workspaces enable row level security;

-- Helper: obtiene el organization_id del usuario autenticado
create or replace function public.user_org_id()
returns uuid
language sql
stable
security definer
as $$
  select organization_id
  from profiles
  where id = auth.uid()
$$;

-- ----- organizations -----
create policy "org_select" on organizations
  for select using (
    id = public.user_org_id()
  );

-- ----- profiles -----
create policy "profiles_select" on profiles
  for select using (
    organization_id = public.user_org_id()
  );

create policy "profiles_update" on profiles
  for update using (
    id = auth.uid()
  );

-- ----- jira_integrations -----
create policy "jira_select" on jira_integrations
  for select using (
    organization_id = public.user_org_id()
  );

create policy "jira_insert" on jira_integrations
  for insert with check (
    organization_id = public.user_org_id()
  );

create policy "jira_update" on jira_integrations
  for update using (
    organization_id = public.user_org_id()
  );

-- ----- design_systems -----
create policy "ds_select" on design_systems
  for select using (
    organization_id = public.user_org_id()
  );

create policy "ds_insert" on design_systems
  for insert with check (
    organization_id = public.user_org_id()
  );

create policy "ds_update" on design_systems
  for update using (
    organization_id = public.user_org_id()
  );

-- ----- product_workspaces -----
create policy "ws_select" on product_workspaces
  for select using (
    organization_id = public.user_org_id()
  );

create policy "ws_insert" on product_workspaces
  for insert with check (
    organization_id = public.user_org_id()
  );

create policy "ws_update" on product_workspaces
  for update using (
    organization_id = public.user_org_id()
  );

create policy "ws_delete" on product_workspaces
  for delete using (
    organization_id = public.user_org_id()
  );
