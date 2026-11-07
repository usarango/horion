import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addLivePassportEvent,
  addLiveWatch,
  createLiveCommunity,
  editLivePost,
  moderateLivePost,
  onboardLiveMember,
  parsePhoto,
  publishLivePost,
  setLiveMemberRole,
  updateLiveProfile,
} from '../lib/live/mutations';
import type { LiveClient } from '../lib/live/types';

const owner = 'aaaaaaaa-1111-4111-8111-111111111111';
const recordId = 'bbbbbbbb-2222-4222-8222-222222222222';
type RequestRecord = {
  resource: string;
  action: string;
  payload?: Record<string, unknown>;
  filters: [string, unknown][];
};
type Result = { data: unknown; error: { code: string } | null };

function fakeClient(
  respond: (request: RequestRecord) => Result = () => ({ data: { id: recordId }, error: null })
) {
  const requests: RequestRecord[] = [];
  function query(resource: string) {
    const request: RequestRecord = { resource, action: '', filters: [] };
    const execute = () => {
      requests.push(request);
      return Promise.resolve(respond(request));
    };
    const builder = {
      insert(payload: Record<string, unknown>) {
        request.action = 'insert';
        request.payload = payload;
        return builder;
      },
      upsert(payload: Record<string, unknown>) {
        request.action = 'upsert';
        request.payload = payload;
        return builder;
      },
      update(payload: Record<string, unknown>) {
        request.action = 'update';
        request.payload = payload;
        return builder;
      },
      delete() {
        request.action = 'delete';
        return builder;
      },
      select() {
        return builder;
      },
      eq(field: string, value: unknown) {
        request.filters.push([field, value]);
        return builder;
      },
      is(field: string, value: unknown) {
        request.filters.push([field, value]);
        return builder;
      },
      single: execute,
      then(resolve: (result: Result) => unknown, reject: (error: unknown) => unknown) {
        return execute().then(resolve, reject);
      },
    };
    return builder;
  }
  const client = {
    from: query,
    rpc(resource: string, payload: Record<string, unknown>) {
      const request = { resource, action: 'rpc', payload, filters: [] };
      requests.push(request);
      return Promise.resolve(respond(request));
    },
    storage: {
      from(resource: string) {
        return {
          upload(path: string) {
            const request = { resource, action: 'upload', payload: { path }, filters: [] };
            requests.push(request);
            return Promise.resolve(respond(request));
          },
          remove(paths: string[]) {
            const request = { resource, action: 'remove', payload: { paths }, filters: [] };
            requests.push(request);
            return Promise.resolve(respond(request));
          },
        };
      },
    },
  } as unknown as LiveClient;
  return { client, requests };
}

test('manual collection records persist real owner-declared fields privately without a catalog dependency', async () => {
  const { client, requests } = fakeClient();
  await addLiveWatch(client, owner, {
    label: 'My daily watch',
    brand: 'Seiko',
    model: 'A family watch',
    referenceText: 'Owner-entered',
    status: 'owned',
    notes: 'Personal record',
  });
  assert.deepEqual(requests[0].payload, {
    owner_id: owner,
    reference_id: null,
    label: 'My daily watch',
    brand_name: 'Seiko',
    model_name: 'A family watch',
    reference_label: 'Owner-entered',
    status: 'owned',
    visibility: 'private',
  });
  assert.equal(requests[1].resource, 'watch_private');
  assert.equal(requests[1].payload?.notes, 'Personal record');
  assert.equal(requests[1].payload?.owner_id, owner);
});

test('invalid live inputs fail before writing any records', async () => {
  const { client, requests } = fakeClient();
  await assert.rejects(addLiveWatch(client, owner, { label: '', status: 'owned' }));
  await assert.rejects(
    createLiveCommunity(client, { name: 'A community', slug: 'Bad Slug', description: '' })
  );
  assert.equal(requests.length, 0);
});

test('onboarding and profile updates cannot grant roles through owner-editable fields', async () => {
  const { client, requests } = fakeClient();
  await onboardLiveMember(client, {
    username: 'collector',
    displayName: 'Collector',
    locale: 'en',
    accountType: 'store',
    website: 'https://shop.example',
    contact: 'hello@shop.example',
  });
  assert.equal(requests[0].resource, 'onboard_member');
  assert.equal(requests[0].payload?.p_account_type, 'store');
  assert.equal(Object.hasOwn(requests[0].payload!, 'role'), false);
  const profile = {
    name: 'Collector',
    username: 'collector',
    bio: '',
    country: '',
    accountType: 'store' as const,
    website: 'https://shop.example',
    contact: '',
    role: 'admin',
  };
  await updateLiveProfile(client, owner, profile);
  assert.equal(Object.hasOwn(requests[1].payload!, 'role'), false);
  assert.equal(requests[1].payload?.account_type, 'store');
  assert.deepEqual(requests[1].filters, [['id', owner]]);
});

test('passport event evidence is always owner-declared regardless of submitted extra fields', async () => {
  const { client, requests } = fakeClient();
  const input = {
    type: 'Maintenance',
    date: '2026-11-07',
    description: 'Owner-entered maintenance notes',
    verification: 'partner-verified',
  };
  await addLivePassportEvent(client, owner, recordId, input);
  assert.equal(requests[0].payload?.verification, 'owner-declared');
  assert.equal(requests[0].payload?.event_type, 'maintenance');
  assert.equal(requests[0].payload?.owner_id, owner);
});

test('RLS or persistence errors reject the operation rather than reporting success', async () => {
  const { client } = fakeClient(() => ({ data: null, error: { code: '42501' } }));
  await assert.rejects(
    editLivePost(client, owner, recordId, { title: 'A real title', body: 'Some content.' }),
    /permission/
  );
});

test('photo upload failure removes partial media and retracts the newly created post', async () => {
  const { client, requests } = fakeClient((request) => ({
    data: { id: recordId },
    error: request.action === 'upload' ? { code: 'network' } : null,
  }));
  const image = 'data:image/jpeg;base64,' + Buffer.from([255, 216, 255, 224]).toString('base64');
  await assert.rejects(
    publishLivePost(client, owner, recordId, {
      title: 'A first watch',
      body: 'A real photograph',
      type: 'Photography',
      language: 'en',
      community: 'a-real-group',
      image,
    }),
    /photograph/
  );
  assert.equal(requests[0].resource, 'posts');
  assert.ok(
    requests.some(
      (request) => request.resource === 'horion-post-media' && request.action === 'remove'
    )
  );
  assert.ok(
    requests.some(
      (request) =>
        request.resource === 'posts' &&
        request.action === 'update' &&
        request.payload?.status === 'deleted'
    )
  );
  assert.equal(
    requests.some((request) => request.resource === 'media' && request.action === 'insert'),
    false
  );
});

test('photo validation rejects active content and mismatched binary signatures', () => {
  assert.throws(() => parsePhoto('data:image/svg+xml;base64,PHN2Zz4='), /JPEG/);
  const fake =
    'data:image/png;base64,' + Buffer.from('<html>not an image</html>').toString('base64');
  assert.throws(() => parsePhoto(fake), /contents/);
  const jpeg = parsePhoto(
    'data:image/jpeg;base64,' + Buffer.from([255, 216, 255, 224]).toString('base64')
  );
  assert.equal(jpeg.contentType, 'image/jpeg');
});

test('member role changes call the trusted RPC and cannot request an administrator grant', async () => {
  const { client, requests } = fakeClient();
  await setLiveMemberRole(client, recordId, 'moderator');
  assert.deepEqual(requests[0], {
    resource: 'set_member_role',
    action: 'rpc',
    payload: { p_user_id: recordId, p_role: 'moderator' },
    filters: [],
  });
  await assert.rejects(setLiveMemberRole(client, recordId, 'admin' as 'member'));
  assert.equal(requests.length, 1);
  const denied = fakeClient(() => ({ data: null, error: { code: '42501' } }));
  await assert.rejects(setLiveMemberRole(denied.client, recordId, 'member'), /permission/);
});

test('reported-post moderation uses the atomic RPC and propagates permission denials', async () => {
  const { client, requests } = fakeClient();
  await moderateLivePost(client, recordId);
  assert.deepEqual(requests, [
    {
      resource: 'moderate_reported_post',
      action: 'rpc',
      payload: { p_post_id: recordId },
      filters: [],
    },
  ]);
  const denied = fakeClient(() => ({ data: null, error: { code: '42501' } }));
  await assert.rejects(moderateLivePost(denied.client, recordId), /permission/);
  await assert.rejects(moderateLivePost(client, 'invalid-post-id'));
  assert.equal(requests.length, 1, 'invalid identifiers never reach the moderation RPC');
});
