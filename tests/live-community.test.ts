import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { loadActiveHorionMigrations } from './helpers/shared-migration';

const db=new PGlite();
const MEMBER='a1111111-1111-4111-8111-111111111111';
const STORE='b2222222-2222-4222-8222-222222222222';
const MOD='c3333333-3333-4333-8333-333333333333';
const NOT_JOINED='d4444444-4444-4444-8444-444444444444';
const LIMITED='e5555555-5555-4555-8555-555555555555';
let memberCommunity:string;
let storeCommunity:string;
let publicPost:string;
let privateWatch:string;
let passport:string;
async function as<T extends Record<string,unknown>=Record<string,unknown>>(role:'anon'|'authenticated'|'postgres',uid:string|null,sql:string,args:unknown[]=[]){
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid??'']);
  if(role!=='postgres') await db.exec(`set role ${role}`);
  return db.query<T>(sql,args);
}
async function rejected(query:Promise<unknown>,codes=['42501','23514','23505','22023','P0001']){
  await assert.rejects(query,(error:unknown)=>{assert.ok(codes.includes(String((error as {code?:unknown}).code)),String(error));return true;});
}
before(async()=>{
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,storage to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to anon,authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
  `);
  for(const migration of await loadActiveHorionMigrations()) await db.exec(migration);
});
after(async()=>{await db.close();});

test('live migrations create no fictional content, profiles, communities, roles or references',async()=>{
  for(const table of ['profiles','communities','posts','comments','watch_references','user_watches','editorial_content']){
    assert.equal((await as('postgres',null,`select * from horion.${table}`)).rows.length,0,table);
  }
  assert.equal((await as('postgres',null,'select * from horion_private.user_roles')).rows.length,0);
  await as('postgres',null,"insert into auth.users(id,raw_user_meta_data) values($1,'{}'),($2,'{\"role\":\"admin\",\"account_type\":\"moderator\"}'),($3,'{}'),($4,'{}'),($5,'{}')",[MEMBER,STORE,MOD,NOT_JOINED,LIMITED]);
  assert.equal((await as('postgres',null,'select * from horion.profiles')).rows.length,0);
});

test('member and store onboarding persist their own public categories without granting roles',async()=>{
  const member=await as('authenticated',MEMBER,'select * from horion.onboard_member($1,$2,$3)',['collector_member','Member account','en']);
  assert.equal(member.rows[0].account_type,'member');
  const store=await as('authenticated',STORE,'select * from horion.onboard_member($1,$2,$3,$4,$5,$6)',['public_store','Store account','pt-BR','store','https://example.test','Contact@Example.test']);
  assert.equal(store.rows[0].account_type,'store');
  assert.equal(store.rows[0].website,'https://example.test');
  assert.equal(store.rows[0].contact_email,'contact@example.test');
  assert.equal((await as<{role:string}>('authenticated',STORE,'select horion.get_my_role() as role')).rows[0].role,'member');
  assert.equal((await as('postgres',null,'select * from horion_private.user_roles')).rows.length,0);
  const again=await as('authenticated',STORE,'select * from horion.onboard_member($1,$2,$3,$4,$5,$6)',['different_name','Do not overwrite','en','member',null,null]);
  assert.equal(again.rows[0].username,'public_store');
  assert.equal(again.rows[0].account_type,'store');
});

test('account categories and profile updates cannot grant moderator or administrative permissions',async()=>{
  await rejected(as('authenticated',STORE,"update horion.profiles set account_type='moderator' where id=$1",[STORE]));
  await rejected(as('authenticated',STORE,"insert into horion_private.user_roles(user_id,role) values($1,'admin')",[STORE]));
  await rejected(as('authenticated',STORE,"update horion.profiles set website='javascript:alert(1)' where id=$1",[STORE]));
  await rejected(as('authenticated',NOT_JOINED,'select * from horion.onboard_member($1,$2,$3,$4)',['forged_mod','Forged','en','admin']));
  await rejected(as('authenticated',NOT_JOINED,'select * from horion.onboard_member($1,$2,$3,$4,$5,$6)',['invalid_email','Invalid','en','store',null,'not-an-email']));
  assert.equal((await as('postgres',null,'select id from horion.profiles where id=$1',[NOT_JOINED])).rows.length,0);
  assert.equal((await as('authenticated',STORE,"update horion.profiles set account_type='store',bio='Tamper' where id=$1 returning id",[MEMBER])).rows.length,0);
  assert.equal((await as<{role:string}>('authenticated',STORE,'select horion.get_my_role() as role')).rows[0].role,'member');
});

test('community creation is authenticated, atomic and grants only a scoped moderator role',async()=>{
  await rejected(as('anon',null,"select * from horion.create_community('Public group','public-group')"));
  await rejected(as('authenticated',NOT_JOINED,"select * from horion.create_community('Unjoined group','unjoined-group')"));
  const community=await as('authenticated',MEMBER,"select * from horion.create_community('Member community','member-community','A member-created community','Be considerate')");
  memberCommunity=String(community.rows[0].id);
  assert.equal(community.rows[0].created_by,MEMBER);
  assert.equal(community.rows[0].is_public,true);
  const joined=await as('authenticated',MEMBER,'select community_id from horion.memberships where user_id=$1',[MEMBER]);
  assert.deepEqual(joined.rows,[{community_id:memberCommunity}]);
  assert.deepEqual((await as<{scopes:string[]}>('authenticated',MEMBER,'select horion.get_my_moderated_communities() as scopes')).rows[0].scopes,[memberCommunity]);
  assert.equal((await as<{role:string}>('authenticated',MEMBER,'select horion.get_my_role() as role')).rows[0].role,'member');
  const storeClub=await as('authenticated',STORE,"select * from horion.create_community('Store discussion','store-discussion')");
  storeCommunity=String(storeClub.rows[0].id);
  await rejected(as('authenticated',STORE,"select * from horion.create_community('Collision','member-community')"));
  assert.deepEqual((await as<{scopes:string[]}>('authenticated',STORE,'select horion.get_my_moderated_communities() as scopes')).rows[0].scopes,[storeCommunity]);
  await rejected(as('authenticated',STORE,"insert into horion.communities(name,slug,created_by) values('Forged owner','forged-owner',$1)",[MEMBER]));
  await rejected(as('authenticated',STORE,'update horion.communities set created_by=$1 where id=$2',[STORE,memberCommunity]));
});

test('scoped community moderators can edit their own community but cannot edit another or curate the catalog',async()=>{
  assert.equal((await as('authenticated',MEMBER,"update horion.communities set rules='Updated rules' where id=$1 returning id",[memberCommunity])).rows.length,1);
  assert.equal((await as('authenticated',STORE,"update horion.communities set rules='Unauthorized rules' where id=$1 returning id",[memberCommunity])).rows.length,0);
  await rejected(as('authenticated',MEMBER,"insert into horion.brands(name,slug) values('Unauthorized brand','unauthorized-brand')"));
  await rejected(as('authenticated',STORE,"insert into horion.brands(name,slug) values('Store cannot curate','store-cannot-curate')"));
  assert.equal((await as('authenticated',STORE,'select * from horion.catalog_revisions')).rows.length,0);
});

test('manual collection entries and Passport events work before any catalog reference exists',async()=>{
  const watch=await as('authenticated',MEMBER,"insert into horion.user_watches(owner_id,label,brand_name,model_name,reference_label) values($1,'My watch','Owner-entered brand','Owner-entered model','Owner-entered reference') returning id,reference_id,visibility",[MEMBER]);
  privateWatch=String(watch.rows[0].id);
  assert.equal(watch.rows[0].reference_id,null);
  assert.equal(watch.rows[0].visibility,'private');
  const created=await as('authenticated',MEMBER,'insert into horion.passports(watch_id,owner_id) values($1,$2) returning id',[privateWatch,MEMBER]);
  passport=String(created.rows[0].id);
  await as('authenticated',MEMBER,"insert into horion.passport_events(passport_id,owner_id,event_type,occurred_on,description) values($1,$2,'maintenance','2026-11-07','Owner-recorded maintenance')",[passport,MEMBER]);
  assert.equal((await as('anon',null,'select id from horion.user_watches where id=$1',[privateWatch])).rows.length,0);
  assert.equal((await as('postgres',null,'select * from horion.watch_references')).rows.length,0);
});

test('members submit pending catalog suggestions and cannot self-approve them',async()=>{
  const suggested=await as('authenticated',MEMBER,"insert into horion.catalog_revisions(contributor_id,suggestion,source_url) values($1,'{\"brand\":\"Source-supported suggestion\"}','https://example.test/source') returning id,status",[MEMBER]);
  assert.equal(suggested.rows[0].status,'pending');
  assert.equal((await as('authenticated',MEMBER,"update horion.catalog_revisions set status='approved' where id=$1 returning id",[suggested.rows[0].id])).rows.length,0);
  assert.equal((await as('authenticated',STORE,'select * from horion.catalog_revisions')).rows.length,0);
  await rejected(as('authenticated',MEMBER,"insert into horion.catalog_revisions(contributor_id,suggestion) values($1,'[]')",[MEMBER]));
  await rejected(as('authenticated',STORE,"insert into horion.catalog_revisions(contributor_id,suggestion) values($1,'{}')",[MEMBER]));
});

test('trusted global moderators can curate public data and reports without gaining private collection access',async()=>{
  await as('authenticated',MOD,'select * from horion.onboard_member($1,$2,$3)',['trusted_mod','Trusted moderator','en']);
  assert.equal((await as<{role:string}>('authenticated',MOD,'select horion.get_my_role() as role')).rows[0].role,'member');
  await as('postgres',null,"insert into horion_private.user_roles(user_id,role) values($1,'moderator')",[MOD]);
  assert.equal((await as<{role:string}>('authenticated',MOD,'select horion.get_my_role() as role')).rows[0].role,'moderator');
  assert.equal((await as('authenticated',MOD,"update horion.communities set description='Moderated description' where id=$1 returning id",[memberCommunity])).rows.length,1);
  assert.equal((await as('authenticated',MOD,"insert into horion.brands(name,slug) values('Moderator-approved brand','moderator-approved-brand') returning id")).rows.length,1);
  assert.equal((await as('authenticated',MOD,"update horion.catalog_revisions set status='approved' where contributor_id=$1 returning id",[MEMBER])).rows.length,1);
  assert.equal((await as('authenticated',MOD,'select * from horion.passports where id=$1',[passport])).rows.length,0);
  assert.equal((await as('authenticated',MOD,'select * from horion.user_watches where id=$1',[privateWatch])).rows.length,0);
  assert.equal((await as('authenticated',MOD,'select * from horion.passport_events where passport_id=$1',[passport])).rows.length,0);
  await rejected(as('authenticated',MOD,'select * from horion_private.user_roles'));
  await as('authenticated',MEMBER,"insert into horion.posts(author_id,community_id,title,body) values($1,$2,'Real member post','Written by the member in this test') returning id",[MEMBER,memberCommunity]).then(r=>{publicPost=String(r.rows[0].id);});
  await as('authenticated',STORE,"insert into horion.reports(reporter_id,post_id,reason) values($1,$2,'Please review this test report')",[STORE,publicPost]);
  assert.equal((await as('authenticated',MOD,'select * from horion.reports where post_id=$1',[publicPost])).rows.length,1);
  assert.equal((await as('authenticated',MOD,"update horion.posts set status='removed' where id=$1 returning id",[publicPost])).rows.length,1);
  assert.equal((await as('authenticated',MOD,"update horion.reports set status='resolved' where post_id=$1 returning id",[publicPost])).rows.length,1);
  const audits=await as('postgres',null,"select entity from horion_private.audit_log where actor_id=$1 and entity in ('brands','catalog_revisions','reports')",[MOD]);
  assert.deepEqual(new Set(audits.rows.map(row=>row.entity)),new Set(['brands','catalog_revisions','reports']));
  await as('postgres',null,'delete from horion_private.user_roles where user_id=$1',[MOD]);
  assert.equal((await as<{role:string}>('authenticated',MOD,'select horion.get_my_role() as role')).rows[0].role,'member');
  assert.equal((await as('authenticated',MOD,"update horion.communities set rules='Revoked moderator edit' where id=$1 returning id",[memberCommunity])).rows.length,0);
});

test('community creation limits are durable and do not grant a platform role',async()=>{
  await as('authenticated',LIMITED,'select * from horion.onboard_member($1,$2,$3,$4)',['limited_store','Limited store','en','store']);
  for(let i=0;i<5;i++) await as('authenticated',LIMITED,'select * from horion.create_community($1,$2)',[`Limited community ${i}`,`limited-community-${i}`]);
  await rejected(as('authenticated',LIMITED,"select * from horion.create_community('Excess community','excess-community')"),['P0001']);
  assert.equal((await as<{count:number}>('authenticated',LIMITED,'select cardinality(horion.get_my_moderated_communities()) as count')).rows[0].count,5);
  assert.equal((await as<{role:string}>('authenticated',LIMITED,'select horion.get_my_role() as role')).rows[0].role,'member');
  assert.equal((await as('postgres',null,"select * from horion.communities where slug='excess-community'")).rows.length,0);
});
