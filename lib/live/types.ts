import type { SupabaseClient } from '@supabase/supabase-js';
import type { Community, DemoState, Locale, Profile, WatchReference, WatchStatus } from '../domain';

export type LiveClient = SupabaseClient;
export interface MemberProfile extends Profile {
  id: string;
  accountType: 'member' | 'store';
  website: string;
  contact: string;
  avatar?: string;
  joinedAt?: string;
}
export interface LiveAuth {
  configured: boolean;
  status: 'loading' | 'guest' | 'onboarding' | 'member' | 'unavailable';
  user: { id: string; email?: string } | null;
  member: MemberProfile | null;
  role: 'member' | 'moderator' | 'admin' | 'editor';
  moderatedCommunityIds: string[];
  signupEnabled: boolean;
}
export interface LiveState extends DemoState {
  profile: MemberProfile;
  communities: Community[];
  references: WatchReference[];
  members: MemberProfile[];
  auth: LiveAuth;
}
export type ManualWatchInput = {
  label: string;
  brand?: string;
  model?: string;
  referenceText?: string;
  status: WatchStatus;
  visibility?: 'private' | 'public';
  notes?: string;
};
export type OnboardingInput = {
  username: string;
  displayName: string;
  locale: Locale;
  accountType: 'member' | 'store';
  website?: string;
  contact?: string;
};
export type SignupInput = { email: string; password: string; displayName: string; locale: Locale };
export type CommunityInput = { name: string; slug: string; description: string; rules?: string };
export type CatalogSuggestion = {
  brand: string;
  model: string;
  reference: string;
  sourceUrl: string;
  notes?: string;
};

export function emptyMember(): MemberProfile {
  return {
    id: '',
    name: '',
    username: '',
    bio: '',
    country: '',
    accountType: 'member',
    website: '',
    contact: '',
  };
}
export function emptyLiveState(configured = false, signupEnabled = false): LiveState {
  return {
    posts: [],
    joined: [],
    watches: [],
    passports: [],
    notifications: [],
    reports: [],
    profile: emptyMember(),
    communities: [],
    references: [],
    members: [],
    auth: {
      configured,
      status: configured ? 'loading' : 'unavailable',
      user: null,
      member: null,
      role: 'member',
      moderatedCommunityIds: [],
      signupEnabled,
    },
  };
}
