import type {
  Comment,
  Community,
  Passport,
  PassportEvent,
  Post,
  UserWatch,
  WatchReference,
} from '../domain';
import type { MemberProfile } from './types';

export type DatabaseRow = Record<string, unknown>;

export function row(value: unknown): DatabaseRow | null {
  if (Array.isArray(value)) return row(value[0]);
  return value !== null && typeof value === 'object' ? (value as DatabaseRow) : null;
}
export function rows(value: unknown): DatabaseRow[] {
  if (!Array.isArray(value)) throw new Error('The service returned an invalid record list.');
  return value.map((item) => {
    const result = row(item);
    if (!result) throw new Error('The service returned an invalid record.');
    return result;
  });
}
export function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function mapProfile(source: DatabaseRow): MemberProfile {
  return {
    id: text(source.id),
    name: text(source.display_name),
    username: text(source.username),
    bio: text(source.bio),
    country: text(source.country),
    accountType: source.account_type === 'store' ? 'store' : 'member',
    website: text(source.website),
    contact: text(source.contact_email),
    joinedAt: text(source.created_at),
  };
}

export function mapCommunity(source: DatabaseRow): Community {
  return {
    id: text(source.id),
    slug: text(source.slug),
    name: text(source.name),
    description: text(source.description),
    image: '',
    category: '',
  };
}

export function mapReference(source: DatabaseRow): WatchReference {
  const model = row(source.watch_models);
  const collection = row(model?.watch_collections);
  const brand = row(collection?.brands);
  const movement = row(source.movements);
  const sources = source.catalog_sources ? rows(source.catalog_sources) : [];
  return {
    id: text(source.id),
    reference: text(source.reference),
    model: text(model?.name),
    brand: text(brand?.name),
    category: text(collection?.name),
    image: '',
    ...(movement?.calibre ? { movement: text(movement.calibre) } : {}),
    ...(sources[0]?.url ? { source: text(sources[0].url) } : {}),
  };
}

export function mapWatch(source: DatabaseRow, references: WatchReference[]): UserWatch {
  const details = row(source.watch_private);
  const reference = references.find((item) => item.id === source.reference_id);
  return {
    id: text(source.id),
    referenceId: text(source.reference_id),
    label: text(source.label),
    brand: text(source.brand_name) || reference?.brand || '',
    model: text(source.model_name) || reference?.model || '',
    referenceText: text(source.reference_label) || reference?.reference || '',
    status:
      source.status === 'wishlist' || source.status === 'previously-owned'
        ? source.status
        : 'owned',
    visibility: source.visibility === 'public' ? 'public' : 'private',
    notes: text(details?.notes),
    acquiredAt: text(details?.acquired_at),
    image: reference?.image || '',
  };
}

export function mapPassport(source: DatabaseRow): Passport {
  return {
    id: text(source.id),
    watchId: text(source.watch_id),
    createdAt: text(source.created_at),
    events: (source.passport_events ? rows(source.passport_events) : [])
      .map((event): PassportEvent => ({
        id: text(event.id),
        type: text(event.event_type),
        date: text(event.occurred_on),
        description: text(event.description),
        verification:
          event.verification === 'partner-verified' || event.verification === 'documents-presented'
            ? event.verification
            : 'owner-declared',
      }))
      .sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export function mapComment(source: DatabaseRow, profiles: Map<string, MemberProfile>): Comment {
  const author = row(source.profiles);
  const profile = profiles.get(text(source.author_id));
  return {
    id: text(source.id),
    authorId: text(source.author_id),
    author: text(author?.display_name) || profile?.name || 'Member',
    username: text(author?.username) || profile?.username || '',
    body: text(source.body),
    createdAt: text(source.created_at),
    ...(source.parent_id ? { parentId: text(source.parent_id) } : {}),
  };
}

export function mapPost(
  source: DatabaseRow,
  context: {
    profiles: Map<string, MemberProfile>;
    communities: Map<string, Community>;
    comments: DatabaseRow[];
    votes: DatabaseRow[];
    savedIds: Set<string>;
    images: Map<string, string>;
    userId?: string;
  }
): Post {
  const author = row(source.profiles);
  const community = row(source.communities);
  const profile = context.profiles.get(text(source.author_id));
  const postVotes = context.votes.filter((item) => item.post_id === source.id);
  const ownVote = postVotes.find((item) => item.user_id === context.userId)?.value;
  const type =
    source.kind === 'photography'
      ? 'Photography'
      : source.kind === 'review'
        ? 'Review'
        : source.kind === 'question'
          ? 'Question'
          : 'Discussion';
  return {
    id: text(source.id),
    authorId: text(source.author_id),
    communityId: text(source.community_id),
    title: text(source.title),
    body: text(source.body),
    author: text(author?.display_name) || profile?.name || 'Member',
    username: text(author?.username) || profile?.username || '',
    community:
      text(community?.slug) || context.communities.get(text(source.community_id))?.slug || '',
    type,
    language: source.language === 'pt-BR' ? 'pt-BR' : 'en',
    createdAt: text(source.created_at),
    edited: !!source.edited_at,
    hidden: source.status !== 'published',
    saved: context.savedIds.has(text(source.id)),
    vote: ownVote === 1 || ownVote === -1 ? ownVote : 0,
    votes: postVotes.reduce(
      (sum, item) => sum + (item.value === 1 ? 1 : item.value === -1 ? -1 : 0),
      0
    ),
    comments: context.comments
      .filter((item) => item.post_id === source.id)
      .map((item) => mapComment(item, context.profiles)),
    ...(context.images.has(text(source.id)) ? { image: context.images.get(text(source.id)) } : {}),
  };
}
