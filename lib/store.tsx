'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { communities, initialDemoState, watchReferences } from './demo-data';
import {
  isStoredDemo,
  reduceClub,
  type Action,
  type DemoState,
  type PassportEventInput,
  type Post,
  type PostInput,
  type Profile,
  type UserWatch,
  type WatchStatus,
} from './domain';

const STORAGE_KEY = 'horion.demo.v1';

export interface ClubStore {
  state: DemoState;
  ready: boolean;
  storageError: string | null;
  publishPost(input: PostInput): void;
  editPost(id: string, patch: Pick<Post, 'title' | 'body'>): void;
  deletePost(id: string): void;
  votePost(id: string, direction: 1 | -1): void;
  savePost(id: string): void;
  commentPost(id: string, body: string, parentId?: string): void;
  toggleCommunity(slug: string): void;
  addWatch(referenceId: string, status: WatchStatus): void;
  updateWatch(
    id: string,
    patch: Partial<Pick<UserWatch, 'status' | 'notes' | 'acquiredAt' | 'visibility'>>
  ): void;
  createPassport(watchId: string): void;
  addPassportEvent(passportId: string, input: PassportEventInput): void;
  updateProfile(profile: Profile): void;
  markNotificationsRead(): void;
  reportPost(id: string, reason: string): void;
  moderatePost(id: string): void;
  resetDemo(): void;
  exportDemo(): void;
}

const ClubContext = createContext<ClubStore | null>(null);

/** Storage is an explicit single-browser demo, never a production authorization boundary. */
export function ClubProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(initialDemoState);
  const current = useRef(state);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (
          !isStoredDemo(parsed, {
            referenceIds: watchReferences.map((item) => item.id),
            communitySlugs: communities.map((item) => item.slug),
          })
        )
          throw new Error('Invalid demo data');
        current.current = parsed.state;
        setState(parsed.state);
      }
    } catch {
      setStorageError(
        'Saved demo data could not be loaded. Changes currently stay in memory; export your records before leaving.'
      );
    }
    setReady(true);
  }, []);

  function persist(next: DemoState) {
    current.current = next;
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, state: next }));
      setStorageError(null);
    } catch {
      setStorageError(
        'Browser storage is unavailable or full. Your changes stay in memory. Export your records before leaving.'
      );
    }
  }

  function dispatch(action: Action) {
    if (!ready) throw new Error('The demonstration is still loading. Please try again.');
    persist(reduceClub(current.current, action));
  }

  const api: ClubStore = {
    state,
    ready,
    storageError,
    publishPost: (input) =>
      dispatch({ type: 'publish', input, id: crypto.randomUUID(), now: new Date().toISOString() }),
    editPost: (id, patch) => dispatch({ type: 'edit-post', id, patch }),
    deletePost: (id) => dispatch({ type: 'delete-post', id }),
    votePost: (id, direction) => dispatch({ type: 'vote', id, direction }),
    savePost: (id) => dispatch({ type: 'save', id }),
    commentPost: (id, body, parentId) =>
      dispatch({
        type: 'comment',
        id,
        body,
        parentId,
        commentId: crypto.randomUUID(),
        now: new Date().toISOString(),
      }),
    toggleCommunity: (slug) => {
      if (!communities.some((community) => community.slug === slug))
        throw new Error('Community unavailable.');
      dispatch({ type: 'join', slug });
    },
    addWatch: (referenceId, status) => {
      if (!watchReferences.some((reference) => reference.id === referenceId))
        throw new Error('Reference unavailable.');
      dispatch({ type: 'add-watch', referenceId, status, id: crypto.randomUUID() });
    },
    updateWatch: (id, patch) => dispatch({ type: 'update-watch', id, patch }),
    createPassport: (watchId) =>
      dispatch({
        type: 'create-passport',
        watchId,
        id: `HWC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        now: new Date().toISOString(),
      }),
    addPassportEvent: (passportId, input) =>
      dispatch({ type: 'passport-event', passportId, input, id: crypto.randomUUID() }),
    updateProfile: (profile) => dispatch({ type: 'profile', profile }),
    markNotificationsRead: () => dispatch({ type: 'read-notifications' }),
    reportPost: (postId, reason) =>
      dispatch({ type: 'report', postId, reason, id: crypto.randomUUID() }),
    moderatePost: (postId) => dispatch({ type: 'moderate', postId }),
    resetDemo: () => persist(initialDemoState()),
    exportDemo: () => {
      const file = new Blob(
        [
          JSON.stringify(
            {
              notice:
                'Fictional Horion single-browser demonstration export. This is not verified ownership, authentication or a private document vault.',
              exportedAt: new Date().toISOString(),
              state: current.current,
            },
            null,
            2
          ),
        ],
        { type: 'application/json' }
      );
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `horion-demo-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
  return <ClubContext.Provider value={api}>{children}</ClubContext.Provider>;
}

export function useClub(): ClubStore {
  const store = useContext(ClubContext);
  if (!store) throw new Error('useClub requires ClubProvider.');
  return store;
}
