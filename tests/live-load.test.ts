import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLiveState } from '../lib/live/load';
import {
  mapCommunity,
  mapPassport,
  mapProfile,
  mapReference,
  mapWatch,
  type DatabaseRow,
} from '../lib/live/mappers';
import type { LiveClient } from '../lib/live/types';

const date = '2026-11-07T01:00:00.000Z';
const profile = {
  id: 'member-1',
  username: 'collector',
  display_name: 'A Collector',
  bio: '',
  country: null,
  account_type: 'store',
  website: 'https://store.example',
  contact_email: 'contact@example.test',
  created_at: date,
};
const community = {
  id: 'community-1',
  slug: 'horology',
  name: 'Horology',
  description: 'Actual server description',
  is_public: true,
};
const post = {
  id: 'post-1',
  author_id: 'member-1',
  community_id: 'community-1',
  title: 'An actual server post',
  body: 'Written by a member.',
  kind: 'photography',
  language: 'en',
  status: 'published',
  created_at: date,
};

function fixture(
  options: {
    user?: boolean;
    member?: boolean;
    authError?: { name: string };
    tableError?: string;
    signedError?: boolean;
    tables?: Record<string, DatabaseRow[]>;
    role?: string;
  } = {}
) {
  const calls: { table: string; filters: [string, unknown][]; range?: [number, number] }[] = [];
  const rpcCalls: string[] = [];
  const storageCalls: string[][] = [];
  const data: Record<string, DatabaseRow[]> = {
    profiles: options.member ? [profile] : [],
    communities: [],
    watch_references: [],
    posts: [],
    memberships: [],
    saved_posts: [],
    user_watches: [],
    passports: [],
    notifications: [],
    reports: [],
    comments: [],
    votes: [],
    media: [],
    ...options.tables,
  };
  const client = {
    auth: {
      getUser: async () => ({
        data: {
          user: options.user
            ? { id: 'member-1', email: 'member@example.test', user_metadata: { role: 'admin' } }
            : null,
        },
        error: options.authError || null,
      }),
    },
    from(table: string) {
      const call: (typeof calls)[number] = { table, filters: [] };
      calls.push(call);
      let records = [...(data[table] || [])];
      let single = false;
      const chain = {
        select: (_fields: string) => chain,
        eq: (key: string, value: unknown) => {
          call.filters.push([key, value]);
          records = records.filter((item) => item[key] === value);
          return chain;
        },
        in: (key: string, values: unknown[]) => {
          records = records.filter((item) => values.includes(item[key]));
          return chain;
        },
        order: (_field: string, _options?: unknown) => chain,
        limit: (count: number) => {
          records = records.slice(0, count);
          return chain;
        },
        range: (from: number, to: number) => {
          call.range = [from, to];
          records = records.slice(from, to + 1);
          return chain;
        },
        maybeSingle: () => {
          single = true;
          return chain;
        },
        then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
          Promise.resolve({
            data: single ? records[0] || null : records,
            error: options.tableError === table ? { code: 'test-error' } : null,
          }).then(resolve, reject),
      };
      return chain;
    },
    rpc: async (name: string) => {
      rpcCalls.push(name);
      return {
        data: name === 'get_my_role' ? options.role || 'member' : ['community-1'],
        error: null,
      };
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[], expires: number) => {
          assert.equal(bucket, 'horion-post-media');
          assert.equal(expires, 300);
          storageCalls.push(paths);
          return {
            data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}` })),
            error: options.signedError ? { message: 'denied' } : null,
          };
        },
      }),
    },
  } as unknown as LiveClient;
  return { client, calls, rpcCalls, storageCalls };
}

test('an empty real backend stays empty without demo identities, watches or community counts', async () => {
  const stub = fixture({ authError: { name: 'AuthSessionMissingError' } });
  const state = await loadLiveState(stub.client, { signupEnabled: false });
  assert.equal(state.auth.status, 'guest');
  assert.equal(state.auth.user, null);
  assert.equal(state.profile.name, '');
  assert.deepEqual(state.posts, []);
  assert.deepEqual(state.communities, []);
  assert.deepEqual(state.watches, []);
  assert.deepEqual(state.passports, []);
  assert.deepEqual(stub.rpcCalls, []);
  assert.ok(
    stub.calls.every((call) =>
      ['communities', 'profiles', 'watch_references', 'posts'].includes(call.table)
    )
  );
  assert.equal(mapCommunity(community).members, undefined);
  assert.equal(mapCommunity(community).image, '');
});

test('a shared identity without Horion membership does not query private member records', async () => {
  const stub = fixture({ user: true });
  const state = await loadLiveState(stub.client, { signupEnabled: true });
  assert.equal(state.auth.status, 'onboarding');
  assert.equal(state.auth.user?.id, 'member-1');
  assert.equal(state.auth.member, null);
  assert.deepEqual(stub.rpcCalls, []);
  assert.ok(
    stub.calls.every((call) =>
      ['communities', 'profiles', 'watch_references', 'posts'].includes(call.table)
    )
  );
});

test('member data is scoped to the authenticated owner and role comes from a trusted RPC', async () => {
  const stub = fixture({
    user: true,
    member: true,
    tables: {
      communities: [community],
      memberships: [{ community_id: 'community-1', user_id: 'member-1' }],
      user_watches: [
        {
          id: 'watch-1',
          owner_id: 'member-1',
          reference_id: null,
          label: 'My first watch',
          brand_name: 'Owner declared brand',
          status: 'owned',
          visibility: 'private',
          watch_private: { notes: 'Private note', acquired_at: '2026-11-01' },
        },
      ],
      notifications: [
        { id: 'notice-1', recipient_id: 'member-1', title: 'A real notification', read_at: null },
      ],
    },
  });
  const state = await loadLiveState(stub.client, { signupEnabled: false });
  assert.equal(state.auth.status, 'member');
  assert.equal(state.auth.role, 'member', 'user-editable metadata must not confer admin rights');
  assert.equal(state.auth.member?.accountType, 'store');
  assert.deepEqual(state.auth.moderatedCommunityIds, ['community-1']);
  assert.deepEqual(state.joined, ['horology']);
  assert.equal(state.watches[0].notes, 'Private note');
  assert.equal(state.watches[0].referenceId, '');
  assert.equal(state.notifications[0].read, false);
  for (const table of ['user_watches', 'passports'])
    assert.ok(
      stub.calls
        .find((call) => call.table === table)
        ?.filters.some(([key, value]) => key === 'owner_id' && value === 'member-1')
    );
});

test('public posts join real authors, replies, votes and authorized uploaded media', async () => {
  const stub = fixture({
    tables: {
      profiles: [profile],
      communities: [community],
      posts: [post],
      comments: [
        {
          id: 'comment-1',
          post_id: 'post-1',
          author_id: 'member-1',
          body: 'A real reply',
          parent_id: null,
          created_at: date,
        },
      ],
      votes: [
        { post_id: 'post-1', user_id: 'voter-1', value: 1 },
        { post_id: 'post-1', user_id: 'voter-2', value: -1 },
      ],
      media: [{ id: 'media-1', post_id: 'post-1', storage_path: 'member-1/post-1/image' }],
    },
  });
  const state = await loadLiveState(stub.client, { signupEnabled: false });
  assert.equal(state.posts[0].author, 'A Collector');
  assert.equal(state.posts[0].community, 'horology');
  assert.equal(state.posts[0].votes, 0);
  assert.equal(state.posts[0].comments[0].body, 'A real reply');
  assert.equal(state.posts[0].image, 'https://signed.example/member-1/post-1/image');
  assert.deepEqual(stub.storageCalls, [['member-1/post-1/image']]);
});

test('vote totals read the next server page instead of silently truncating at one result page', async () => {
  const votes = Array.from({ length: 501 }, (_, index) => ({
    post_id: 'post-1',
    user_id: `voter-${index}`,
    value: 1,
  }));
  const stub = fixture({ tables: { communities: [community], posts: [post], votes } });
  const state = await loadLiveState(stub.client, { signupEnabled: false });
  assert.equal(state.posts[0].votes, 501);
  assert.deepEqual(
    stub.calls.filter((call) => call.table === 'votes').map((call) => call.range),
    [
      [0, 499],
      [500, 999],
    ]
  );
});

test('connection, permission and signed-media failures propagate instead of showing success or fixtures', async () => {
  await assert.rejects(
    loadLiveState(fixture({ authError: { name: 'NetworkError' } }).client, {
      signupEnabled: false,
    }),
    /verify your session/
  );
  await assert.rejects(
    loadLiveState(fixture({ tableError: 'communities' }).client, { signupEnabled: false }),
    /load communities/
  );
  await assert.rejects(
    loadLiveState(fixture({ user: true, member: true, role: 'owner-from-metadata' }).client, {
      signupEnabled: false,
    }),
    /permissions/
  );
  await assert.rejects(
    loadLiveState(
      fixture({
        signedError: true,
        tables: {
          posts: [post],
          media: [{ post_id: 'post-1', storage_path: 'member-1/post-1/image' }],
        },
      }).client,
      { signupEnabled: false }
    ),
    /authorize the post images/
  );
});

test('reference and passport mapping preserves sourced facts and verification levels only', () => {
  const mapped = mapReference({
    id: 'ref-1',
    reference: 'Reference 1',
    watch_models: {
      name: 'Model',
      watch_collections: { name: 'Collection', brands: { name: 'Brand' } },
    },
    catalog_sources: [{ url: 'https://manufacturer.example/reference' }],
  });
  assert.equal(mapped.brand, 'Brand');
  assert.equal(mapped.movement, undefined);
  assert.equal(mapped.image, '');
  const watch = mapWatch(
    {
      id: 'watch-1',
      label: 'Owner title',
      reference_id: null,
      status: 'wishlist',
      visibility: 'private',
      brand_name: 'Owner brand',
    },
    []
  );
  assert.equal(watch.label, 'Owner title');
  assert.equal(watch.referenceId, '');
  assert.equal(watch.notes, '');
  const passport = mapPassport({
    id: 'pass-1',
    watch_id: 'watch-1',
    created_at: date,
    passport_events: [
      {
        id: 'event-1',
        event_type: 'inspection',
        occurred_on: '2026-11-06',
        description: 'Recorded inspection',
        verification: 'documents-presented',
      },
    ],
  });
  assert.equal(passport.events[0].verification, 'documents-presented');
  assert.equal(mapProfile(profile).accountType, 'store');
});
