import test from 'node:test';
import assert from 'node:assert/strict';
import { communities, initialDemoState, watchReferences } from '../lib/demo-data';
import { isStoredDemo, rankPosts, reduceClub, validImage, type PostInput } from '../lib/domain';

const now = '2026-11-06T12:00:00.000Z';
const input: PostInput = {
  title: 'A collector question',
  body: 'What is on your wrist today?',
  community: 'mechanical-watches',
  type: 'Discussion',
  language: 'en',
};

test('posting associates the current profile, sets no reputation, and requires membership', () => {
  const state = initialDemoState();
  const next = reduceClub(state, { type: 'publish', input, id: 'own-post', now });
  assert.equal(next.posts[0].username, state.profile.username);
  assert.equal(next.posts[0].votes, 1);
  assert.equal(state.posts.length, 5, 'input state remains immutable');
  assert.equal(next.posts.length, 6);
  assert.throws(
    () =>
      reduceClub(state, {
        type: 'publish',
        input: { ...input, community: 'watchmaking' },
        id: 'other',
        now,
      }),
    /Join this community/
  );
  assert.throws(
    () => reduceClub(state, { type: 'publish', input: { ...input, title: ' ' }, id: 'other', now }),
    /Title/
  );
});

test('votes toggle and changing direction updates the aggregate exactly once', () => {
  const initial = initialDemoState();
  const score = initial.posts[0].votes;
  const up = reduceClub(initial, { type: 'vote', id: 'p1', direction: 1 });
  assert.equal(up.posts[0].votes, score + 1);
  const down = reduceClub(up, { type: 'vote', id: 'p1', direction: -1 });
  assert.equal(down.posts[0].votes, score - 1);
  const remove = reduceClub(down, { type: 'vote', id: 'p1', direction: -1 });
  assert.equal(remove.posts[0].votes, score);
  assert.equal(remove.posts[0].vote, 0);
});

test('replies must target a comment in the same post', () => {
  const state = initialDemoState();
  const next = reduceClub(state, {
    type: 'comment',
    id: 'p1',
    body: 'A thoughtful response.',
    parentId: 'c-p1-1',
    commentId: 'reply',
    now,
  });
  assert.equal(next.posts[0].comments.at(-1)?.parentId, 'c-p1-1');
  assert.throws(
    () =>
      reduceClub(state, {
        type: 'comment',
        id: 'p1',
        body: 'A response.',
        parentId: 'c-p2-1',
        commentId: 'reply',
        now,
      }),
    /target unavailable/
  );
});

test('only the author can edit or delete; profile rename preserves own posts', () => {
  const state = initialDemoState();
  assert.throws(
    () =>
      reduceClub(state, {
        type: 'edit-post',
        id: 'p1',
        patch: { title: 'Edited title', body: 'Edited text.' },
      }),
    /Only the author/
  );
  assert.throws(() => reduceClub(state, { type: 'delete-post', id: 'p1' }), /Only the author/);
  const created = reduceClub(state, { type: 'publish', input, id: 'mine', now });
  const renamed = reduceClub(created, {
    type: 'profile',
    profile: { ...created.profile, username: 'alex_new' },
  });
  const edited = reduceClub(renamed, {
    type: 'edit-post',
    id: 'mine',
    patch: { title: 'New editorial title', body: 'A useful correction.' },
  });
  assert.equal(edited.posts[0].edited, true);
  const deleted = reduceClub(edited, { type: 'delete-post', id: 'mine' });
  assert.equal(deleted.posts.length, state.posts.length);
});

test('collection entries are private by default and duplicate entries are rejected', () => {
  const state = initialDemoState();
  const next = reduceClub(state, {
    type: 'add-watch',
    referenceId: 'casio-f91w',
    status: 'owned',
    id: 'new-watch',
  });
  assert.equal(next.watches.at(-1)?.visibility, 'private');
  assert.equal(next.watches.at(-1)?.acquiredAt, '');
  assert.throws(
    () =>
      reduceClub(next, {
        type: 'add-watch',
        referenceId: 'casio-f91w',
        status: 'owned',
        id: 'duplicate',
      }),
    /already in this collection/
  );
});

test('passports require an owned watch and duplicate creation is idempotent', () => {
  const state = initialDemoState();
  assert.throws(
    () => reduceClub(state, { type: 'create-passport', watchId: 'w3', id: 'invalid', now }),
    /currently own/
  );
  const next = reduceClub(state, { type: 'create-passport', watchId: 'w2', id: 'valid', now });
  assert.equal(next.passports.length, 2);
  const duplicate = reduceClub(next, {
    type: 'create-passport',
    watchId: 'w2',
    id: 'ignored',
    now,
  });
  assert.equal(duplicate.passports.length, 2);
});

test('passport entries are owner declarations, reject invalid dates and sort chronologically', () => {
  const state = initialDemoState();
  const next = reduceClub(state, {
    type: 'passport-event',
    passportId: 'HWC-DEMO-001',
    id: 'latest',
    input: { type: 'Maintenance', date: '2026-10-10', description: 'A recorded service visit.' },
  });
  assert.equal(next.passports[0].events[0].id, 'latest');
  assert.equal(next.passports[0].events[0].verification, 'owner-declared');
  assert.throws(
    () =>
      reduceClub(state, {
        type: 'passport-event',
        passportId: 'HWC-DEMO-001',
        id: 'invalid',
        input: {
          type: 'Maintenance',
          date: '2026-02-30',
          description: 'Invalid date should fail.',
        },
      }),
    /valid date/
  );
});

test('reports are resolved when moderation hides a post and hidden posts leave every ranking', () => {
  const state = initialDemoState();
  const reported = reduceClub(state, {
    type: 'report',
    postId: 'p1',
    reason: 'A demonstration report.',
    id: 'report',
  });
  const moderated = reduceClub(reported, { type: 'moderate', postId: 'p1' });
  assert.equal(moderated.reports[0].status, 'resolved');
  assert.equal(
    rankPosts(moderated.posts, 'Popular').some((post) => post.id === 'p1'),
    false
  );
  assert.throws(
    () =>
      reduceClub(moderated, {
        type: 'comment',
        id: 'p1',
        body: 'Unavailable',
        commentId: 'late',
        now,
      }),
    /Post unavailable/
  );
});

test('following filters communities and deterministic ranking does not mutate input', () => {
  const state = initialDemoState();
  const original = state.posts.map((post) => post.id);
  const ranked = rankPosts(state.posts, 'Following', ['seiko']);
  assert.deepEqual(
    ranked.map((post) => post.id),
    ['p3']
  );
  assert.deepEqual(
    state.posts.map((post) => post.id),
    original
  );
});

test('unsafe image URLs and active SVG content are rejected', () => {
  assert.equal(validImage('/images/hero-watch.jpg'), '/images/hero-watch.jpg');
  assert.throws(() => validImage('javascript:alert(1)'), /JPEG/);
  assert.throws(() => validImage('data:image/svg+xml;base64,abcd'), /JPEG/);
  assert.throws(() => validImage('/images/../sensitive'), /JPEG/);
});

const catalog = {
  referenceIds: watchReferences.map((item) => item.id),
  communitySlugs: communities.map((item) => item.slug),
};

test('storage hydration accepts the seed and valid user changes', () => {
  const seed = initialDemoState();
  assert.equal(isStoredDemo({ version: 1, state: seed }, catalog), true);
  const withPost = reduceClub(seed, { type: 'publish', input, id: 'mine', now });
  const withReply = reduceClub(withPost, {
    type: 'comment',
    id: 'p1',
    body: 'A nested reply.',
    parentId: 'c-p1-1',
    commentId: 'reply',
    now,
  });
  assert.equal(
    isStoredDemo(JSON.parse(JSON.stringify({ version: 1, state: withReply })), catalog),
    true
  );
});

test('storage hydration safely rejects null entries and unknown state versions', () => {
  const seed = initialDemoState();
  const malformed: unknown[] = [
    null,
    {},
    { version: 2, state: seed },
    { version: 1, state: null },
    ...['posts', 'watches', 'passports', 'notifications', 'reports'].map((key) => ({
      version: 1,
      state: { ...seed, [key]: [null] },
    })),
    { version: 1, state: { ...seed, posts: [{ ...seed.posts[0], comments: [null] }] } },
    { version: 1, state: { ...seed, passports: [{ ...seed.passports[0], events: [null] }] } },
  ];
  for (const value of malformed) {
    assert.doesNotThrow(() => isStoredDemo(value, catalog));
    assert.equal(isStoredDemo(value, catalog), false);
  }
});

test('storage hydration rejects impossible dates before localized rendering', () => {
  const seed = initialDemoState();
  const malformed: unknown[] = [
    { ...seed, posts: [{ ...seed.posts[0], createdAt: 'not-a-date' }] },
    { ...seed, posts: [{ ...seed.posts[0], createdAt: '2026-02-30T10:00:00.000Z' }] },
    {
      ...seed,
      posts: [
        { ...seed.posts[0], comments: [{ ...seed.posts[0].comments[0], createdAt: 'invalid' }] },
      ],
    },
    { ...seed, watches: [{ ...seed.watches[0], acquiredAt: '2026-02-30' }] },
    { ...seed, passports: [{ ...seed.passports[0], createdAt: '' }] },
    {
      ...seed,
      passports: [
        { ...seed.passports[0], events: [{ ...seed.passports[0].events[0], date: '2026-02-30' }] },
      ],
    },
  ];
  for (const state of malformed) assert.equal(isStoredDemo({ version: 1, state }, catalog), false);
});

test('storage hydration enforces enums, foreign references, reply ancestry and unique identifiers', () => {
  const seed = initialDemoState();
  const malformed: unknown[] = [
    { ...seed, joined: ['unknown-community'] },
    { ...seed, posts: [{ ...seed.posts[0], type: 'Unexpected' }] },
    { ...seed, posts: [{ ...seed.posts[0], language: 'xx' }] },
    { ...seed, posts: [{ ...seed.posts[0], community: 'missing' }] },
    { ...seed, posts: [{ ...seed.posts[0], image: 'javascript:alert(1)' }] },
    {
      ...seed,
      posts: [
        { ...seed.posts[0], comments: [{ ...seed.posts[0].comments[0], parentId: 'missing' }] },
      ],
    },
    { ...seed, posts: [seed.posts[0], seed.posts[0]] },
    { ...seed, watches: [{ ...seed.watches[0], referenceId: 'missing' }] },
    { ...seed, watches: [{ ...seed.watches[0], status: 'unexpected' }] },
    { ...seed, watches: [{ ...seed.watches[0], visibility: 'unexpected' }] },
    { ...seed, passports: [{ ...seed.passports[0], watchId: 'missing' }] },
    {
      ...seed,
      passports: [
        {
          ...seed.passports[0],
          events: [{ ...seed.passports[0].events[0], verification: 'partner-verified' }],
        },
      ],
    },
    {
      ...seed,
      reports: [{ id: 'r', postId: 'missing', reason: 'An unknown post.', status: 'open' }],
    },
  ];
  for (const state of malformed) assert.equal(isStoredDemo({ version: 1, state }, catalog), false);
});
