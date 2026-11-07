export type Locale = 'en' | 'pt-BR';
export type PostType = 'Photography' | 'Discussion' | 'Review' | 'Question';
export type WatchStatus = 'owned' | 'previously-owned' | 'wishlist';
export interface Comment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  parentId?: string;
}
export interface Post {
  id: string;
  title: string;
  body: string;
  author: string;
  username: string;
  community: string;
  type: PostType;
  language: Locale;
  image?: string;
  votes: number;
  comments: Comment[];
  createdAt: string;
  edited?: boolean;
  saved?: boolean;
  vote?: -1 | 0 | 1;
  hidden?: boolean;
}
export interface Community {
  id: string;
  slug: string;
  name: string;
  description: string;
  members: number;
  image: string;
  category: string;
}
export interface WatchReference {
  id: string;
  brand: string;
  model: string;
  reference: string;
  image: string;
  category: string;
  movement?: string;
  source?: string;
}
export interface UserWatch {
  id: string;
  referenceId: string;
  status: WatchStatus;
  notes: string;
  acquiredAt: string;
  visibility: 'private' | 'public';
}
export interface PassportEvent {
  id: string;
  type: string;
  date: string;
  description: string;
  verification: 'owner-declared';
}
export interface Passport {
  id: string;
  watchId: string;
  createdAt: string;
  events: PassportEvent[];
}
export interface Profile {
  name: string;
  username: string;
  bio: string;
  country: string;
}
export interface DemoState {
  posts: Post[];
  joined: string[];
  watches: UserWatch[];
  passports: Passport[];
  profile: Profile;
  notifications: { id: string; title: string; read: boolean }[];
  reports: { id: string; postId: string; reason: string; status: 'open' | 'resolved' }[];
}
export type PostInput = Pick<Post, 'title' | 'body' | 'community' | 'type' | 'language' | 'image'>;
export type PassportEventInput = Pick<PassportEvent, 'type' | 'date' | 'description'>;
export type Action =
  | { type: 'publish'; input: PostInput; id: string; now: string }
  | { type: 'edit-post'; id: string; patch: Pick<Post, 'title' | 'body'> }
  | { type: 'delete-post'; id: string }
  | { type: 'vote'; id: string; direction: 1 | -1 }
  | { type: 'save'; id: string }
  | { type: 'comment'; id: string; body: string; parentId?: string; commentId: string; now: string }
  | { type: 'join'; slug: string }
  | { type: 'add-watch'; referenceId: string; status: WatchStatus; id: string }
  | {
      type: 'update-watch';
      id: string;
      patch: Partial<Pick<UserWatch, 'status' | 'notes' | 'acquiredAt' | 'visibility'>>;
    }
  | { type: 'create-passport'; watchId: string; id: string; now: string }
  | { type: 'passport-event'; passportId: string; input: PassportEventInput; id: string }
  | { type: 'profile'; profile: Profile }
  | { type: 'read-notifications' }
  | { type: 'report'; postId: string; reason: string; id: string }
  | { type: 'moderate'; postId: string };

export function requireText(value: string, name: string, min: number, max: number): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
    throw new Error(`${name}: ${min}–${max} characters required.`);
  return value.trim();
}

export function validImage(image?: string) {
  if (!image) return undefined;
  if (image.startsWith('/images/') && !image.includes('..')) return image;
  if (
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) &&
    image.length <= 2_800_000
  )
    return image;
  throw new Error('Use a JPEG, PNG or WebP image smaller than 2 MB.');
}

function dateOnly(date: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new Error('Enter a valid date.');
  return date;
}

export function reduceClub(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case 'edit-post': {
      const post = state.posts.find((item) => item.id === action.id);
      if (!post || post.username !== state.profile.username)
        throw new Error('Only the author can edit this post.');
      const title = requireText(action.patch.title, 'Title', 3, 180);
      const body = requireText(action.patch.body, 'Content', 3, 10000);
      return {
        ...state,
        posts: state.posts.map((item) =>
          item.id === action.id ? { ...item, title, body, edited: true } : item
        ),
      };
    }
    case 'delete-post': {
      const post = state.posts.find((item) => item.id === action.id);
      if (!post || post.username !== state.profile.username)
        throw new Error('Only the author can delete this post.');
      return {
        ...state,
        posts: state.posts.filter((item) => item.id !== action.id),
        reports: state.reports.filter((item) => item.postId !== action.id),
      };
    }
    case 'publish': {
      const title = requireText(action.input.title, 'Title', 3, 180);
      const body = requireText(action.input.body, 'Content', 3, 10000);
      if (!['Photography', 'Discussion', 'Review', 'Question'].includes(action.input.type))
        throw new Error('Invalid post type.');
      if (!['en', 'pt-BR'].includes(action.input.language)) throw new Error('Invalid language.');
      const community = requireText(action.input.community, 'Community', 1, 60);
      if (!state.joined.includes(community))
        throw new Error('Join this community before publishing.');
      return {
        ...state,
        posts: [
          {
            id: action.id,
            title,
            body,
            community,
            type: action.input.type,
            language: action.input.language,
            image: validImage(action.input.image),
            author: state.profile.name,
            username: state.profile.username,
            votes: 1,
            vote: 1,
            comments: [],
            createdAt: action.now,
          },
          ...state.posts,
        ],
      };
    }
    case 'vote':
      return {
        ...state,
        posts: state.posts.map((post) => {
          if (post.id !== action.id || post.hidden) return post;
          const vote = post.vote === action.direction ? 0 : action.direction;
          return { ...post, votes: post.votes - (post.vote || 0) + vote, vote };
        }),
      };
    case 'save':
      return {
        ...state,
        posts: state.posts.map((post) =>
          post.id === action.id ? { ...post, saved: !post.saved } : post
        ),
      };
    case 'comment': {
      const body = requireText(action.body, 'Comment', 1, 3000);
      const target = state.posts.find((post) => post.id === action.id);
      if (!target || target.hidden) throw new Error('Post unavailable.');
      if (action.parentId && !target.comments.some((comment) => comment.id === action.parentId))
        throw new Error('Reply target unavailable.');
      return {
        ...state,
        posts: state.posts.map((post) =>
          post.id === action.id
            ? {
                ...post,
                comments: [
                  ...post.comments,
                  {
                    id: action.commentId,
                    author: state.profile.name,
                    body,
                    parentId: action.parentId,
                    createdAt: action.now,
                  },
                ],
              }
            : post
        ),
      };
    }
    case 'join':
      return {
        ...state,
        joined: state.joined.includes(action.slug)
          ? state.joined.filter((slug) => slug !== action.slug)
          : [...state.joined, action.slug],
      };
    case 'add-watch': {
      if (!['owned', 'previously-owned', 'wishlist'].includes(action.status))
        throw new Error('Invalid collection status.');
      if (
        state.watches.some(
          (watch) => watch.referenceId === action.referenceId && watch.status === action.status
        )
      )
        throw new Error('This watch is already in this collection.');
      return {
        ...state,
        watches: [
          ...state.watches,
          {
            id: action.id,
            referenceId: action.referenceId,
            status: action.status,
            notes: '',
            acquiredAt: '',
            visibility: 'private',
          },
        ],
      };
    }
    case 'update-watch': {
      const patch: Partial<UserWatch> = {};
      if (action.patch.notes !== undefined) patch.notes = action.patch.notes.trim().slice(0, 3000);
      if (action.patch.acquiredAt !== undefined)
        patch.acquiredAt = action.patch.acquiredAt ? dateOnly(action.patch.acquiredAt) : '';
      if (action.patch.status !== undefined) {
        if (!['owned', 'previously-owned', 'wishlist'].includes(action.patch.status))
          throw new Error('Invalid collection status.');
        patch.status = action.patch.status;
      }
      if (action.patch.visibility !== undefined) {
        if (!['private', 'public'].includes(action.patch.visibility))
          throw new Error('Invalid privacy setting.');
        patch.visibility = action.patch.visibility;
      }
      return {
        ...state,
        watches: state.watches.map((watch) =>
          watch.id === action.id ? { ...watch, ...patch } : watch
        ),
      };
    }
    case 'create-passport': {
      const watch = state.watches.find((item) => item.id === action.watchId);
      if (!watch || watch.status !== 'owned')
        throw new Error('A passport requires a watch you currently own.');
      if (state.passports.some((passport) => passport.watchId === action.watchId)) return state;
      return {
        ...state,
        passports: [
          ...state.passports,
          { id: action.id, watchId: action.watchId, createdAt: action.now, events: [] },
        ],
      };
    }
    case 'passport-event': {
      const type = requireText(action.input.type, 'Event type', 2, 60);
      const description = requireText(action.input.description, 'Description', 3, 3000);
      const date = dateOnly(action.input.date);
      if (!state.passports.some((passport) => passport.id === action.passportId))
        throw new Error('Passport unavailable.');
      return {
        ...state,
        passports: state.passports.map((passport) =>
          passport.id === action.passportId
            ? {
                ...passport,
                events: [
                  {
                    id: action.id,
                    type,
                    date,
                    description,
                    verification: 'owner-declared' as const,
                  },
                  ...passport.events,
                ].sort((a, b) => b.date.localeCompare(a.date)),
              }
            : passport
        ),
      };
    }
    case 'profile': {
      const name = requireText(action.profile.name, 'Name', 2, 60);
      const username = requireText(action.profile.username, 'Username', 3, 24).toLowerCase();
      if (!/^[a-z0-9_]+$/.test(username))
        throw new Error('Username: use letters, numbers and underscores.');
      if (
        state.posts.some(
          (post) => post.username === username && post.username !== state.profile.username
        )
      )
        throw new Error('This username is already in use in the demonstration.');
      return {
        ...state,
        profile: {
          name,
          username,
          bio: action.profile.bio.trim().slice(0, 500),
          country: action.profile.country.trim().slice(0, 60),
        },
        posts: state.posts.map((post) =>
          post.username === state.profile.username ? { ...post, username, author: name } : post
        ),
      };
    }
    case 'read-notifications':
      return {
        ...state,
        notifications: state.notifications.map((notification) => ({ ...notification, read: true })),
      };
    case 'report': {
      if (!state.posts.some((post) => post.id === action.postId))
        throw new Error('Post unavailable.');
      const reason = requireText(action.reason, 'Report reason', 3, 1000);
      return {
        ...state,
        reports: [
          ...state.reports,
          { id: action.id, postId: action.postId, reason, status: 'open' },
        ],
      };
    }
    case 'moderate':
      return {
        ...state,
        posts: state.posts.map((post) =>
          post.id === action.postId ? { ...post, hidden: true } : post
        ),
        reports: state.reports.map((report) =>
          report.postId === action.postId ? { ...report, status: 'resolved' } : report
        ),
      };
  }
}

/** Deterministic ranking. No engagement AI, paid weighting, or collection values. */
export function rankPosts(posts: Post[], sort: string, joined: string[] = []): Post[] {
  const visible = posts.filter(
    (post) => !post.hidden && (sort !== 'Following' || joined.includes(post.community))
  );
  return [...visible].sort((a, b) => {
    if (sort === 'Popular') return b.votes - a.votes || b.createdAt.localeCompare(a.createdAt);
    if (sort === 'Most Discussed')
      return b.comments.length - a.comments.length || b.createdAt.localeCompare(a.createdAt);
    if (sort === 'Trending')
      return (
        b.votes + b.comments.length * 2 - (a.votes + a.comments.length * 2) ||
        b.createdAt.localeCompare(a.createdAt)
      );
    return b.createdAt.localeCompare(a.createdAt);
  });
}

type CatalogIds = { referenceIds: readonly string[]; communitySlugs: readonly string[] };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function records(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.length <= 5000 && value.every(record);
}
function textBetween(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}
function timestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
function calendarDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function uniqueIds(items: Record<string, unknown>[]) {
  return (
    items.every((item) => textBetween(item.id, 1, 100)) &&
    new Set(items.map((item) => item.id)).size === items.length
  );
}
function optionalBoolean(value: unknown) {
  return value === undefined || typeof value === 'boolean';
}

/** Reject malformed or incompatible local records before they reach rendering or mutations. */
export function isStoredDemo(
  value: unknown,
  catalog: CatalogIds
): value is { version: 1; state: DemoState } {
  if (!record(value) || value.version !== 1 || !record(value.state)) return false;
  const state = value.state;
  const profile = state.profile;
  if (
    !record(profile) ||
    !textBetween(profile.name, 2, 60) ||
    !textBetween(profile.username, 3, 24) ||
    !/^[a-z0-9_]+$/.test(profile.username) ||
    !textBetween(profile.bio, 0, 500) ||
    !textBetween(profile.country, 0, 60)
  )
    return false;
  if (
    !records(state.posts) ||
    !records(state.watches) ||
    !records(state.passports) ||
    !records(state.notifications) ||
    !records(state.reports)
  )
    return false;
  if (
    ![state.posts, state.watches, state.passports, state.notifications, state.reports].every(
      uniqueIds
    )
  )
    return false;
  const communitySlugs = new Set(catalog.communitySlugs);
  const referenceIds = new Set(catalog.referenceIds);
  if (
    !Array.isArray(state.joined) ||
    state.joined.some((slug) => typeof slug !== 'string' || !communitySlugs.has(slug)) ||
    new Set(state.joined).size !== state.joined.length
  )
    return false;

  for (const post of state.posts) {
    if (
      !textBetween(post.title, 3, 180) ||
      !textBetween(post.body, 3, 10000) ||
      !textBetween(post.author, 1, 60) ||
      !textBetween(post.username, 3, 24) ||
      typeof post.community !== 'string' ||
      !communitySlugs.has(post.community) ||
      !['Photography', 'Discussion', 'Review', 'Question'].includes(String(post.type)) ||
      !['en', 'pt-BR'].includes(String(post.language)) ||
      !timestamp(post.createdAt) ||
      !Number.isSafeInteger(post.votes) ||
      !optionalBoolean(post.saved) ||
      !optionalBoolean(post.hidden) ||
      !optionalBoolean(post.edited) ||
      (post.vote !== undefined && post.vote !== -1 && post.vote !== 0 && post.vote !== 1) ||
      !records(post.comments) ||
      !uniqueIds(post.comments)
    )
      return false;
    if (post.image !== undefined) {
      if (typeof post.image !== 'string') return false;
      try {
        validImage(post.image);
      } catch {
        return false;
      }
    }
    const comments = post.comments;
    for (const comment of comments) {
      if (
        !textBetween(comment.author, 1, 60) ||
        !textBetween(comment.body, 1, 3000) ||
        !timestamp(comment.createdAt)
      )
        return false;
      // Every reply must reference an earlier comment; this also rules out reply cycles.
      if (
        comment.parentId !== undefined &&
        (typeof comment.parentId !== 'string' ||
          !comments
            .slice(0, comments.indexOf(comment))
            .some((parent) => parent.id === comment.parentId))
      )
        return false;
    }
  }
  for (const watch of state.watches) {
    if (
      typeof watch.referenceId !== 'string' ||
      !referenceIds.has(watch.referenceId) ||
      !['owned', 'previously-owned', 'wishlist'].includes(String(watch.status)) ||
      !['private', 'public'].includes(String(watch.visibility)) ||
      !textBetween(watch.notes, 0, 3000) ||
      (watch.acquiredAt !== '' && !calendarDate(watch.acquiredAt))
    )
      return false;
  }
  const watchIds = new Set(state.watches.map((watch) => watch.id));
  if (new Set(state.passports.map((passport) => passport.watchId)).size !== state.passports.length)
    return false;
  for (const passport of state.passports) {
    if (
      typeof passport.watchId !== 'string' ||
      !watchIds.has(passport.watchId) ||
      !timestamp(passport.createdAt) ||
      !records(passport.events) ||
      !uniqueIds(passport.events)
    )
      return false;
    for (const event of passport.events) {
      if (
        !textBetween(event.type, 2, 60) ||
        !calendarDate(event.date) ||
        !textBetween(event.description, 3, 3000) ||
        event.verification !== 'owner-declared'
      )
        return false;
    }
  }
  if (
    !state.notifications.every(
      (item) => textBetween(item.title, 1, 500) && typeof item.read === 'boolean'
    )
  )
    return false;
  const postIds = new Set(state.posts.map((post) => post.id));
  return state.reports.every(
    (item) =>
      typeof item.postId === 'string' &&
      postIds.has(item.postId) &&
      textBetween(item.reason, 3, 1000) &&
      ['open', 'resolved'].includes(String(item.status))
  );
}
