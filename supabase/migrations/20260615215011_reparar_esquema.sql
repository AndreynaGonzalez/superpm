-- ============================================================
-- Reparación: la migración anterior creó tablas e índices
-- pero falló en la función y políticas RLS.
-- Este script agrega lo que faltó.
-- ============================================================

-- Helper en esquema public (no auth, que es restringido en Supabase)
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
