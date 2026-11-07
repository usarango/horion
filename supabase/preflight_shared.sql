-- READ ONLY. Run before/after the reviewed additive Horion migration.
-- Hashes catalog metadata without returning function source, credentials or rows.
-- Existing app traffic may independently change metadata: investigate any mismatch.
begin read only;
with protected as (
  select jsonb_build_object(
    'public_relations', (select md5(coalesce(string_agg(
      c.relname||'|'||c.relkind::text||'|'||c.relrowsecurity::text||'|'||c.relforcerowsecurity::text||'|'||coalesce(c.relacl::text,''),
      E'\n' order by c.relname),'')) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p','v','m','S')),
    'public_columns', (select md5(coalesce(string_agg(
      c.relname||'|'||a.attnum::text||'|'||a.attname||'|'||format_type(a.atttypid,a.atttypmod)||'|'||a.attnotnull::text||'|'||coalesce(pg_get_expr(d.adbin,d.adrelid),''),
      E'\n' order by c.relname,a.attnum),'')) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
      where n.nspname='public' and c.relkind in ('r','p','v','m') and a.attnum>0 and not a.attisdropped),
    'public_functions', (select md5(coalesce(string_agg(pg_get_functiondef(p.oid)||'|'||coalesce(p.proacl::text,''),E'\n' order by p.oid::regprocedure::text),''))
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p')),
    'public_indexes', (select md5(coalesce(string_agg(indexdef,E'\n' order by indexname),'')) from pg_indexes where schemaname='public'),
    'public_constraints', (select md5(coalesce(string_agg(c.relname||'|'||con.conname||'|'||pg_get_constraintdef(con.oid),E'\n' order by c.relname,con.conname),''))
      from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
    'public_policies', (select md5(coalesce(string_agg(tablename||'|'||policyname||'|'||permissive||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),E'\n' order by tablename,policyname),''))
      from pg_policies where schemaname='public'),
    'auth_user_hooks', (select md5(coalesce(string_agg(pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text||'|'||pg_get_functiondef(t.tgfoid),E'\n' order by t.tgname),''))
      from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='auth' and c.relname='users' and not t.tgisinternal),
    'existing_storage_policies', (select md5(coalesce(string_agg(policyname||'|'||permissive||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),E'\n' order by policyname),''))
      from pg_policies where schemaname='storage' and tablename='objects' and policyname not like 'horion\_%' escape '\'),
    'existing_buckets', (select md5(coalesce(string_agg((to_jsonb(b)-'created_at'-'updated_at')::text,E'\n' order by id),''))
      from storage.buckets b where id not in ('horion-passport-documents','horion-post-media')),
    'existing_default_privileges', (select md5(coalesce(string_agg(d.defaclrole::regrole::text||'|'||coalesce(n.nspname,'')||'|'||d.defaclobjtype::text||'|'||d.defaclacl::text,E'\n' order by d.defaclrole,n.nspname,d.defaclobjtype),''))
      from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where n.nspname in ('public','auth','storage') or d.defaclnamespace=0)
  ) as snapshot
)
select md5(snapshot::text) as protected_fingerprint, snapshot as protected_components,
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname='objects') as storage_objects_rls_enabled,
  (select coalesce(jsonb_agg(nspname order by nspname),'[]') from pg_namespace where nspname in ('horion','horion_private')) as horion_namespaces,
  (select coalesce(jsonb_agg(id order by id),'[]') from storage.buckets where id in ('horion-passport-documents','horion-post-media')) as horion_buckets,
  (select coalesce(jsonb_agg(policyname order by policyname),'[]') from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'horion\_%' escape '\') as horion_storage_policies
from protected;
commit;
