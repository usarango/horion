-- Applied to the selected shared project as version 20261107004936.
-- Explicit owner authorization covered public,graphql_public,horion and SQL
-- control taking precedence over the Dashboard. Do not replay on another
-- environment without checking its live exposed schemas and role overrides.
begin;
-- Deployment-specific exposure for the selected shared Rango project.
-- Before applying, the live Data API was probed with an invalid Accept-Profile:
-- PGRST106 reported exactly public, graphql_public; no role/database override existed.
-- A different project's Dashboard-only list MUST be checked before this migration.
-- Keep public first so requests from Rango without Profile headers are unchanged.
do $$
declare exposed text; authenticator_id oid;
begin
  if to_regclass('horion.profiles') is null or to_regnamespace('horion_private') is null then
    raise exception 'Apply the reviewed Horion shared foundation first';
  end if;
  select oid into authenticator_id from pg_roles where rolname='authenticator';
  if authenticator_id is null then raise exception 'PostgREST authenticator role was not found'; end if;
  if exists (
    select 1 from pg_db_role_setting s cross join lateral unnest(s.setconfig) cfg
    where s.setdatabase in (0,(select oid from pg_database where datname=current_database()))
      and s.setrole in (0,authenticator_id)
      and not (s.setdatabase=0 and s.setrole=authenticator_id)
      and cfg like 'pgrst.db_schemas=%'
  ) then
    raise exception 'Database-scoped API override requires review; existing configuration preserved';
  end if;
  select substring(cfg from length('pgrst.db_schemas=')+1) into exposed
    from pg_roles r cross join lateral unnest(coalesce(r.rolconfig,'{}')) cfg
    where r.oid=authenticator_id and cfg like 'pgrst.db_schemas=%';
  -- The fallback is the observed live list, not a guess from role settings.
  exposed := coalesce(exposed,'public,graphql_public');
  if btrim(exposed)='' then raise exception 'Empty API schema list requires review'; end if;
  if not ('horion'=any(regexp_split_to_array(exposed,'\s*,\s*'))) then
    execute format('alter role authenticator set pgrst.db_schemas = %L',exposed||',horion');
  end if;
end;
$$;
notify pgrst,'reload config';
notify pgrst,'reload schema';
commit;
-- This documented role override takes precedence over Dashboard configuration.
-- To hand control back to Dashboard, first add horion there, then RESET the role
-- override and reload config/schema after verifying the Dashboard list preserves
-- every existing exposed schema. Do not reset or overwrite blindly.
