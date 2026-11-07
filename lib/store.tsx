'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createClient } from './supabase/client';
import { getSupabaseConfig } from './supabase/config';
import type { PassportEventInput, Post, PostInput, Profile, WatchStatus } from './domain';
import { loadLiveState } from './live/load';
import { loginLiveAccount, signoutLiveAccount, signupLiveAccount } from './live/auth';
import {
  addLivePassportEvent,
  addLiveWatch,
  commentLivePost,
  createLiveCommunity,
  createLivePassport,
  deleteLivePost,
  editLivePost,
  joinLiveCommunity,
  moderateLivePost,
  onboardLiveMember,
  publishLivePost,
  readLiveNotifications,
  reportLivePost,
  saveLivePost,
  setLiveMemberRole,
  suggestLiveReference,
  updateLiveProfile,
  updateLiveWatch,
  voteLivePost,
  type WatchPatch,
} from './live/mutations';
import {
  emptyLiveState,
  type CatalogSuggestion,
  type CommunityInput,
  type LiveAuth,
  type LiveClient,
  type LiveState,
  type ManualWatchInput,
  type OnboardingInput,
  type SignupInput,
} from './live/types';

export type {
  LiveAuth,
  LiveState,
  MemberProfile,
  ManualWatchInput,
  OnboardingInput,
} from './live/types';
export interface ClubStore {
  state: LiveState;
  auth: LiveAuth;
  ready: boolean;
  loading: boolean;
  error: string | null;
  storageError: null;
  refresh(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  signup(input: SignupInput): Promise<{ emailConfirmationRequired: boolean }>;
  onboard(input: OnboardingInput): Promise<void>;
  signout(): Promise<void>;
  publishPost(input: PostInput): Promise<void>;
  editPost(id: string, patch: Pick<Post, 'title' | 'body'>): Promise<void>;
  deletePost(id: string): Promise<void>;
  votePost(id: string, direction: 1 | -1): Promise<void>;
  savePost(id: string): Promise<void>;
  commentPost(id: string, body: string, parentId?: string): Promise<void>;
  toggleCommunity(slug: string): Promise<void>;
  createCommunity(input: CommunityInput): Promise<void>;
  addWatch(referenceId: string, status: WatchStatus): Promise<void>;
  addManualWatch(input: ManualWatchInput): Promise<void>;
  updateWatch(id: string, patch: WatchPatch): Promise<void>;
  createPassport(watchId: string): Promise<void>;
  addPassportEvent(passportId: string, input: PassportEventInput): Promise<void>;
  updateProfile(profile: Profile): Promise<void>;
  markNotificationsRead(): Promise<void>;
  reportPost(id: string, reason: string): Promise<void>;
  moderatePost(id: string): Promise<void>;
  setMemberRole(userId: string, role: 'member' | 'moderator'): Promise<void>;
  suggestReference(input: CatalogSuggestion): Promise<void>;
  exportData(): void;
  exportDemo(): void;
  resetDemo(): never;
}
const ClubContext = createContext<ClubStore | null>(null);

/** PostgreSQL owns every product record; only Supabase persists the session. */
export function ClubProvider({
  children,
  signupEnabled = false,
}: {
  children: ReactNode;
  signupEnabled?: boolean;
}) {
  const [state, setState] = useState<LiveState>(() =>
    emptyLiveState(!!getSupabaseConfig(), signupEnabled)
  );
  const current = useRef(state);
  const clientRef = useRef<LiveClient | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const signupAllowed = useRef(signupEnabled);
  signupAllowed.current = signupEnabled;
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  function commit(next: LiveState) {
    current.current = next;
    if (mounted.current) setState(next);
  }
  function client() {
    const instance = clientRef.current ?? createClient();
    if (!instance) throw new Error('Horion is not connected. Please try again later.');
    clientRef.current = instance;
    return instance;
  }
  function clearIdentity() {
    generation.current++;
    commit(emptyLiveState(!!getSupabaseConfig(), signupAllowed.current));
  }
  async function refresh() {
    const version = ++generation.current;
    if (mounted.current) setPending((count) => count + 1);
    try {
      const next = await loadLiveState(client(), { signupEnabled: signupAllowed.current });
      if (version === generation.current) {
        commit(next);
        if (mounted.current) setError(null);
      }
    } catch (cause) {
      if (version === generation.current && mounted.current) {
        setError(
          cause instanceof Error ? cause.message : 'Horion could not be loaded. Please try again.'
        );
        if (current.current.auth.status === 'loading') {
          const empty = emptyLiveState(!!getSupabaseConfig(), signupAllowed.current);
          commit({ ...empty, auth: { ...empty.auth, status: 'unavailable' } });
        }
      }
      throw cause;
    } finally {
      if (mounted.current) {
        setPending((count) => Math.max(0, count - 1));
        setReady(true);
      }
    }
  }
  useEffect(() => {
    mounted.current = true;
    const instance = createClient();
    clientRef.current = instance;
    if (!instance) {
      commit(emptyLiveState(false, signupAllowed.current));
      setError('Horion is not connected. Please try again later.');
      setReady(true);
      return () => {
        mounted.current = false;
        generation.current++;
      };
    }
    let authTimer: ReturnType<typeof setTimeout> | undefined;
    const {
      data: { subscription },
    } = instance.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      // Clear private state immediately; defer SDK queries until its Auth lock releases.
      if (event === 'SIGNED_OUT' || session?.user.id !== current.current.auth.user?.id)
        clearIdentity();
      clearTimeout(authTimer);
      authTimer = setTimeout(() => {
        if (mounted.current) void refresh().catch(() => {});
      }, 0);
    });
    void refresh().catch(() => {});
    const focus = () => {
      if (document.visibilityState === 'visible') void refresh().catch(() => {});
    };
    window.addEventListener('focus', focus);
    const timer = setInterval(focus, 240_000);
    return () => {
      mounted.current = false;
      generation.current++;
      clearTimeout(authTimer);
      clearInterval(timer);
      window.removeEventListener('focus', focus);
      subscription.unsubscribe();
    };
  }, []);
  function requireMember() {
    const member = current.current.auth.member;
    if (!member || current.current.auth.status !== 'member')
      throw new Error('Sign in and complete your Horion profile to continue.');
    return { supabase: client(), member };
  }
  async function mutate(operation: (supabase: LiveClient, ownerId: string) => Promise<void>) {
    const { supabase, member } = requireMember();
    if (mounted.current) {
      setError(null);
      setPending((count) => count + 1);
    }
    try {
      await operation(supabase, member.id);
      try {
        await refresh();
      } catch {
        throw new Error(
          'Your change was saved, but Horion could not reload it. Refresh before retrying.'
        );
      }
    } catch (cause) {
      if (mounted.current)
        setError(cause instanceof Error ? cause.message : 'Your request could not be completed.');
      throw cause;
    } finally {
      if (mounted.current) setPending((count) => Math.max(0, count - 1));
    }
  }
  function community(slug: string) {
    const found = current.current.communities.find((item) => item.slug === slug);
    if (!found) throw new Error('This community is unavailable.');
    return found;
  }
  function exportData() {
    const { member } = requireMember();
    const data = current.current;
    const file = new Blob(
      [
        JSON.stringify(
          {
            scope: 'currently-loaded-account-records',
            exportedAt: new Date().toISOString(),
            profile: data.profile,
            collection: data.watches,
            passports: data.passports,
            posts: data.posts.filter((post) => post.authorId === member.id),
            memberships: data.joined,
            notifications: data.notifications,
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
    link.download = `horion-records-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const api: ClubStore = {
    state,
    auth: state.auth,
    ready,
    loading: pending > 0,
    error,
    storageError: null,
    refresh,
    async login(email, password) {
      await loginLiveAccount(client(), email, password);
      clearIdentity();
      await refresh();
    },
    async signup(input) {
      const result = await signupLiveAccount(client(), input, {
        enabled: signupAllowed.current,
        origin: window.location.origin,
      });
      clearIdentity();
      await refresh();
      return result;
    },
    async onboard(input) {
      if (!current.current.auth.user)
        throw new Error('Sign in before creating your Horion profile.');
      await onboardLiveMember(client(), input);
      await refresh();
    },
    async signout() {
      await signoutLiveAccount(client());
      clearIdentity();
      await refresh();
    },
    publishPost: (input) =>
      mutate((supabase, id) => publishLivePost(supabase, id, community(input.community).id, input)),
    editPost: (id, patch) => mutate((supabase, owner) => editLivePost(supabase, owner, id, patch)),
    deletePost: (id) => mutate((supabase, owner) => deleteLivePost(supabase, owner, id)),
    votePost: (id, direction) =>
      mutate((supabase, owner) => {
        const post = current.current.posts.find((item) => item.id === id);
        if (!post) throw new Error('This post is unavailable.');
        return voteLivePost(supabase, owner, id, post.vote === direction ? 0 : direction);
      }),
    savePost: (id) =>
      mutate((supabase, owner) =>
        saveLivePost(
          supabase,
          owner,
          id,
          !current.current.posts.find((item) => item.id === id)?.saved
        )
      ),
    commentPost: (id, body, parent) =>
      mutate((supabase, owner) => commentLivePost(supabase, owner, id, body, parent)),
    toggleCommunity: (slug) =>
      mutate((supabase, owner) =>
        joinLiveCommunity(
          supabase,
          owner,
          community(slug).id,
          !current.current.joined.includes(slug)
        )
      ),
    createCommunity: (input) => mutate((supabase) => createLiveCommunity(supabase, input)),
    addWatch: (referenceId, status) =>
      mutate((supabase, owner) => {
        const reference = current.current.references.find((item) => item.id === referenceId);
        if (!reference) throw new Error('This catalog reference is unavailable.');
        return addLiveWatch(
          supabase,
          owner,
          {
            label: `${reference.brand} ${reference.model}`.trim(),
            brand: reference.brand,
            model: reference.model,
            referenceText: reference.reference,
            status,
          },
          reference
        );
      }),
    addManualWatch: (input) => mutate((supabase, owner) => addLiveWatch(supabase, owner, input)),
    updateWatch: (id, patch) =>
      mutate((supabase, owner) => updateLiveWatch(supabase, owner, id, patch)),
    createPassport: (watchId) =>
      mutate((supabase, owner) => {
        const watch = current.current.watches.find((item) => item.id === watchId);
        if (!watch || watch.status !== 'owned')
          throw new Error('A passport requires a watch you currently own.');
        if (current.current.passports.some((item) => item.watchId === watchId))
          return Promise.resolve();
        return createLivePassport(supabase, owner, watchId);
      }),
    addPassportEvent: (passportId, input) =>
      mutate((supabase, owner) => addLivePassportEvent(supabase, owner, passportId, input)),
    updateProfile: (profile) =>
      mutate((supabase, owner) => updateLiveProfile(supabase, owner, profile)),
    markNotificationsRead: () =>
      mutate((supabase, owner) => readLiveNotifications(supabase, owner)),
    reportPost: (id, reason) =>
      mutate((supabase, owner) => reportLivePost(supabase, owner, id, reason)),
    moderatePost: (id) => mutate((supabase) => moderateLivePost(supabase, id)),
    setMemberRole: (userId, role) =>
      mutate((supabase) => {
        if (current.current.auth.role !== 'admin')
          throw new Error('Administrator permission is required.');
        return setLiveMemberRole(supabase, userId, role);
      }),
    suggestReference: (input) =>
      mutate((supabase, owner) => suggestLiveReference(supabase, owner, input)),
    exportData,
    exportDemo: exportData,
    resetDemo() {
      throw new Error(
        'Demo resets are unavailable. Your records are stored in your Horion account.'
      );
    },
  };
  return <ClubContext.Provider value={api}>{children}</ClubContext.Provider>;
}
export function useClub(): ClubStore {
  const store = useContext(ClubContext);
  if (!store) throw new Error('useClub requires ClubProvider.');
  return store;
}
