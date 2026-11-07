'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Bell,
  Bookmark,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Crown,
  Ellipsis,
  Flag,
  Globe2,
  Home,
  ImagePlus,
  Layers3,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Watch,
  X,
  LogIn,
  Pencil,
  Trash2,
  Share2,
  FileCheck2,
} from 'lucide-react';
import { ClubProvider, useClub } from '@/lib/store';
import { liveT } from '@/lib/live-i18n';
import { RegistrationError } from '@/lib/live/auth';
import {
  rankPosts,
  type Comment,
  type Locale,
  type Post,
  type PostInput,
  type PostType,
} from '@/lib/domain';
import {
  localizedDate,
  localizedPostType,
  navigation,
  translate,
  type TranslationKey,
} from '@/lib/i18n';
import { ClubPage } from './club-pages';
import './pages.css';
import './live.css';

type AppProps = {
  locale: Locale;
  page: string;
  query?: string;
  sharedPost?: string;
  watchId?: string;
  backendConfigured?: boolean;
  publicPreview?: boolean;
  authError?: boolean;
  signupEnabled?: boolean;
};
const navItems = [
  { id: 'home', icon: Home },
  { id: 'explore', icon: Compass },
  { id: 'communities', icon: Users },
  { id: 'watches', icon: Watch },
  { id: 'collection', icon: Layers3 },
  { id: 'passport', icon: FileCheck2 },
  { id: 'journal', icon: BookOpen },
  { id: 'society', icon: Crown },
];
export function ClubApp(props: AppProps) {
  return (
    <ClubProvider signupEnabled={props.signupEnabled}>
      <ClubShell {...props} />
    </ClubProvider>
  );
}

function Modal({
  locale,
  title,
  onClose,
  children,
}: {
  locale: Locale;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
      dialog?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="club-dialog"
      aria-labelledby="modal-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">HORION WATCH CLUB</span>
          <h2 id="modal-title">{title}</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label={translate(locale, 'close')}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function ClubShell({
  locale,
  page,
  query = '',
  sharedPost,
  watchId,
  backendConfigured = false,
  publicPreview = false,
  authError,
}: AppProps) {
  const router = useRouter();
  const { state, auth: account, ready, error: loadError, refresh } = useClub();
  const communities = state.communities;
  const [compose, setCompose] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const [auth, setAuth] = useState(false);
  const requireMember = (action: () => void) =>
    account.status === 'member' ? action() : setAuth(true);
  const [search, setSearch] = useState(query);
  const t = (key: TranslationKey) => translate(locale, key);
  const labels = navigation[locale];
  const navigate = (destination: string) => {
    router.push(`/${locale}${destination === 'home' ? '' : '/' + destination}`);
    setMobileNav(false);
  };
  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      document.documentElement.dataset.theme = localStorage.getItem('horion-theme') || 'light';
    } catch {
      /* Theme is optional. */
    }
  }, [locale]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNav(false);
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const sync = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMobileNav(false);
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    if (!isMobile || !mobileNav) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        navigationRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex="0"]'
        ) || []
      );
    focusable()[0]?.focus();
    const containFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', containFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', containFocus);
      previousFocus?.focus();
    };
  }, [isMobile, mobileNav]);
  const unread = state.notifications.filter((n) => !n.read).length;
  return (
    <div className="club-shell" aria-busy={!ready}>
      <a className="skip-link" href="#main-content">
        {t('skip-to-content')}
      </a>
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label={t('close-navigation')}
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside
        ref={navigationRef}
        id="club-navigation"
        className={`sidebar ${mobileNav ? 'is-open' : ''}`}
        aria-label={t('club-navigation')}
        inert={isMobile && !mobileNav}
        role={isMobile ? 'dialog' : undefined}
        aria-modal={isMobile && mobileNav ? true : undefined}
      >
        <Link href={`/${locale}`} className="brand" aria-label="Horion Watch Club">
          <span className="brand-symbol">
            <Watch size={25} strokeWidth={1.1} />
          </span>
          <span className="wordmark">HORION</span>
          <span className="brand-subtitle">WATCH CLUB</span>
        </Link>
        <span className="sidebar-label">{t('your-world-of-watches')}</span>
        <nav className="primary-nav">
          {navItems.map(({ id, icon: Icon }, index) => (
            <Link
              href={`/${locale}${id === 'home' ? '' : '/' + id}`}
              className={`nav-item ${page === id ? 'active' : ''} ${index === 4 || index === 6 ? 'nav-section' : ''}`}
              key={id}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => setMobileNav(false)}
            >
              <Icon size={19} strokeWidth={1.5} />
              <span>{labels[id as keyof typeof labels]}</span>
              {id === 'society' && <span className="tiny-label">CLUB</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-communities">
          <div className="sidebar-section-label">
            <span>{t('my-communities')}</span>
            <button
              className="icon-button"
              onClick={() => navigate('communities')}
              aria-label={t('find-communities')}
            >
              <Plus size={15} />
            </button>
          </div>
          {communities
            .filter((c) => state.joined.includes(c.slug))
            .slice(0, 4)
            .map((c, index) => (
              <button className="community-nav" onClick={() => navigate('communities')} key={c.id}>
                <span className={`community-dot dot-${index}`}>{c.name.charAt(0)}</span>
                <span>{c.name}</span>
              </button>
            ))}
          <Link href={`/${locale}/communities`} className="text-link all-communities">
            {t('discover-communities')}
            <ArrowRight size={14} />
          </Link>
        </div>
        <div className="sidebar-bottom">
          {(account.role === 'admin' ||
            account.role === 'moderator' ||
            account.moderatedCommunityIds.length > 0) && (
            <Link className="nav-item" href={`/${locale}/admin`}>
              <ShieldCheck size={18} />
              <span>{liveT(locale, 'nav.moderation')}</span>
            </Link>
          )}
          <Link className="nav-item" href={`/${locale}/settings`}>
            <Settings size={18} strokeWidth={1.5} />
            <span>{labels.settings}</span>
          </Link>
          <button
            className="profile-switch"
            onClick={() => (account.status === 'member' ? navigate('profile') : setAuth(true))}
          >
            <span className="avatar avatar-you">
              {state.profile.name
                .split(' ')
                .map((s) => s[0])
                .join('')
                .slice(0, 2)}
            </span>
            <span>
              <strong>{state.profile.name || liveT(locale, 'nav.signIn')}</strong>
              <small>
                {state.profile.accountType === 'store'
                  ? liveT(locale, 'common.store')
                  : liveT(locale, 'common.member')}
              </small>
            </span>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>
      <div className="workspace" inert={isMobile && mobileNav}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label={t('open-navigation')}
              aria-controls="club-navigation"
              aria-expanded={mobileNav}
              onClick={() => setMobileNav(true)}
            >
              <Menu />
            </button>
            <span className="topbar-motto">{t('a-shared-passion-a-world-of-watches')}</span>
            <span className="mobile-wordmark">HORION</span>
          </div>
          <div className="topbar-actions">
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                router.push(`/${locale}/explore?q=${encodeURIComponent(search)}`);
              }}
            >
              <Search size={17} />
              <input
                aria-label={t('search-horion')}
                placeholder={t('search-the-world-of-watches')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>↵</kbd>
            </form>
            <Link
              className="language-switch"
              href={`/${locale === 'en' ? 'pt-BR' : 'en'}${page === 'home' ? '' : '/' + page}`}
              aria-label={t('switch-to-portuguese')}
            >
              <Globe2 size={16} />
              {locale === 'en' ? 'EN' : 'PT'}
            </Link>
            <Link
              className="notification-link icon-button"
              href={`/${locale}/notifications`}
              aria-label={`${labels.notifications} (${unread})`}
            >
              <Bell size={20} strokeWidth={1.5} />
              {unread > 0 && <span className="notification-dot" />}
            </Link>
            <button
              className="topbar-avatar avatar avatar-you"
              onClick={() => (account.status === 'member' ? navigate('profile') : setAuth(true))}
              aria-label={labels.profile}
            >
              {state.profile.name.charAt(0) || <LogIn size={17} />}
            </button>
          </div>
        </header>
        {loadError && (
          <div role="alert" className="storage-error">
            {liveT(locale, 'common.connectionError')}{' '}
            <button className="text-link" onClick={() => void refresh().catch(() => {})}>
              {liveT(locale, 'common.retry')}
            </button>
          </div>
        )}
        {authError && (
          <p role="alert" className="storage-error">
            {t('we-could-not-confirm-this-sign-in-link-it-may-have')}
          </p>
        )}
        <main id="main-content" className={`main-content ${page !== 'home' ? 'inner-page' : ''}`}>
          {page === 'home' ? (
            <HomeFeed
              locale={locale}
              onNavigate={navigate}
              onCompose={() => requireMember(() => setCompose(true))}
              sharedPost={sharedPost}
              onAccount={() => setAuth(true)}
            />
          ) : (
            <ClubPage
              page={page}
              locale={locale}
              onNavigate={navigate}
              onCompose={() => requireMember(() => setCompose(true))}
              query={query}
              watchId={watchId}
              onAccount={() => setAuth(true)}
            />
          )}
          <footer className="main-footer">
            <span>© {new Date().getFullYear()} HORION WATCH CLUB</span>
            <span>{t('every-watch-has-a-story-every-enthusiast-belongs')}</span>
            <Link href={`/${locale}/settings`}>{t('privacy-preferences')}</Link>
          </footer>
        </main>
        {!ready && (
          <div className="hydration-status" role="status">
            {t('loading-your-club')}
          </div>
        )}
      </div>
      {compose && <ComposeModal locale={locale} onClose={() => setCompose(false)} />}
      {auth && <AccountModal locale={locale} onClose={() => setAuth(false)} />}
    </div>
  );
}

function HomeFeed({
  locale,
  onNavigate,
  onCompose,
  sharedPost,
  onAccount,
}: {
  locale: Locale;
  onNavigate: (page: string) => void;
  onCompose: () => void;
  sharedPost?: string;
  onAccount: () => void;
}) {
  const { state, auth, toggleCommunity, ready } = useClub();
  const communities = state.communities;
  const [joinError, setJoinError] = useState('');
  const join = async (slug: string) => {
    if (auth.status !== 'member') {
      onAccount();
      return;
    }
    try {
      await toggleCommunity(slug);
      setJoinError('');
    } catch {
      setJoinError(liveT(locale, 'common.requestFailed'));
    }
  };
  const t = (key: TranslationKey) => translate(locale, key);
  const [sort, setSort] = useState('Trending');
  const [type, setType] = useState('All');
  const [language, setLanguage] = useState('all');
  const [saved, setSaved] = useState(false);
  const [pageSize, setPageSize] = useState(5);
  const filteredPosts = rankPosts(state.posts, sort, state.joined).filter(
    (post) =>
      (type === 'All' || post.type === type) &&
      (language === 'all' || post.language === language) &&
      (!saved || post.saved)
  );
  const sharedTarget = sharedPost
    ? state.posts.find((post) => post.id === sharedPost && !post.hidden)
    : undefined;
  const posts = sharedTarget
    ? [sharedTarget, ...filteredPosts.filter((post) => post.id !== sharedTarget.id)]
    : filteredPosts;
  const sortNames: Record<string, string> = {
    Trending: t('trending'),
    New: t('newest'),
    Popular: t('popular'),
    Following: t('following'),
    'Most Discussed': t('most-discussed'),
  };
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">{t('the-horion-community')}</span>
          <h1>
            {t('good-company-great-watches')}
            <span className="intro-period">✳</span>
          </h1>
          <p>{t('discover-something-new-share-what-moves-you')}</p>
        </div>
        <button className="button create-post" onClick={onCompose}>
          <Plus size={17} />
          {t('create-a-post')}
        </button>
      </div>
      <section className="live-welcome" aria-label="Horion Watch Club">
        <div>
          <span className="eyebrow">HORION WATCH CLUB</span>
          <h2>{liveT(locale, 'brand.welcome')}</h2>
          <p>{liveT(locale, 'brand.intro')}</p>
          <button className="button" onClick={auth.status === 'member' ? onCompose : onAccount}>
            {liveT(locale, auth.status === 'member' ? 'feed.create' : 'nav.signUp')}
            <ArrowUpRight size={17} />
          </button>
        </div>
        <button className="live-passport-intro" onClick={() => onNavigate('passport')}>
          <FileCheck2 size={32} strokeWidth={1} />
          <span className="eyebrow">HORION PASSPORT</span>
          <h3>{liveT(locale, 'passport.title')}</h3>
          <p>{liveT(locale, 'passport.subtitle')}</p>
          <ArrowRight size={20} />
        </button>
      </section>
      <div className="community-manifesto">
        <span className="manifesto-mark">H.</span>
        <p>
          {t('from-your-first-casio-to-your-forever-watch')}
          <strong>{t('you-belong-here')}</strong>
        </p>
        <button onClick={() => onNavigate('communities')}>
          {t('find-your-community')}
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="feed-layout">
        <section className="feed-stream" aria-label={t('community-feed')}>
          <div className="section-heading">
            <h2>{t('around-the-club')}</h2>
            <button
              className={`text-link saved-toggle ${saved ? 'selected' : ''}`}
              onClick={() => setSaved(!saved)}
              aria-pressed={saved}
            >
              <Bookmark size={15} fill={saved ? 'currentColor' : 'none'} />
              {t('saved')}
            </button>
          </div>
          <div className="feed-controls">
            <div className="feed-tabs">
              {(['All', 'Photography', 'Discussion', 'Review'] as const).map((tab, i) => (
                <button
                  className={type === tab ? 'active' : ''}
                  key={tab}
                  onClick={() => {
                    setType(tab);
                    setPageSize(5);
                  }}
                >
                  {[t('for-you'), t('photography'), t('discussions'), t('reviews')][i]}
                </button>
              ))}
            </div>
            <label className="sort-select">
              <SlidersHorizontal size={13} />
              <span className="sr-only">{t('sort-feed')}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                {Object.entries(sortNames).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="feed-language">
            <span>{saved ? t('your-saved-stories') : t('from-the-community')}</span>
            <label>
              <Globe2 size={12} />
              <span className="sr-only">{t('content-language')}</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="all">{t('all-languages')}</option>
                <option value="en">English</option>
                <option value="pt-BR">Português</option>
              </select>
            </label>
          </div>
          {posts.length === 0 && (
            <div className="feed-empty">
              <Compass size={32} strokeWidth={1} />
              <h3>{liveT(locale, 'feed.emptyTitle')}</h3>
              <p>{liveT(locale, 'feed.emptyBody')}</p>
              <button className="button" onClick={onCompose}>
                {t('start-a-conversation')}
              </button>
            </div>
          )}
          {sharedPost && ready && !sharedTarget && (
            <p className="inline-feedback" role="status">
              {t('shared-story-unavailable')}
            </p>
          )}
          {posts.slice(0, pageSize).map((post) => (
            <PostCard
              key={post.id}
              post={post}
              locale={locale}
              initiallyOpen={post.id === sharedPost}
              onNavigate={onNavigate}
              onAccount={onAccount}
            />
          ))}
          {posts.length > pageSize && (
            <button
              className="button button-outline load-more"
              onClick={() => setPageSize((n) => n + 5)}
            >
              {t('discover-more-stories')}
              <ArrowDown size={16} />
            </button>
          )}
        </section>
        <aside className="feed-aside">
          <div className="aside-communities">
            <div className="section-heading">
              <h2>{t('find-your-people')}</h2>
              <Users size={18} strokeWidth={1.3} />
            </div>
            <p className="aside-subtitle">{t('different-watches-a-shared-obsession')}</p>
            {communities.length === 0 && (
              <p className="quiet-text">{liveT(locale, 'community.emptyBody')}</p>
            )}
            {joinError && <p role="alert">{joinError}</p>}
            {communities.slice(0, 4).map((community, index) => (
              <div className="community-row" key={community.id}>
                <button
                  className={`community-dot dot-${index}`}
                  onClick={() => onNavigate('communities')}
                >
                  {community.name.slice(0, 1)}
                </button>
                <button className="community-info" onClick={() => onNavigate('communities')}>
                  <strong>{community.name}</strong>
                  {community.members !== undefined && (
                    <small>
                      {new Intl.NumberFormat(locale, { notation: 'compact' }).format(
                        community.members || 0
                      )}{' '}
                      {liveT(locale, 'community.members')}
                    </small>
                  )}
                </button>
                <button
                  className={`join-button ${state.joined.includes(community.slug) ? 'joined' : ''}`}
                  aria-label={`${state.joined.includes(community.slug) ? t('leave') : t('join')} ${community.name}`}
                  onClick={() => void join(community.slug)}
                >
                  {state.joined.includes(community.slug) ? <Check size={14} /> : <Plus size={14} />}
                </button>
              </div>
            ))}
            <button className="aside-link" onClick={() => onNavigate('communities')}>
              {t('explore-all-communities')}
              <ArrowRight size={15} />
            </button>
          </div>
          <div className="community-promise">
            <ShieldCheck size={22} strokeWidth={1.2} />
            <h3>{t('passion-is-the-only-prerequisite')}</h3>
            <p>{t('knowledge-over-price-tags-curiosity-over-status-a-welcoming-space-for')}</p>
            <button className="text-link" onClick={() => onNavigate('communities')}>
              {t('our-community-principles')}
              <ArrowUpRight size={14} />
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}

function PostCard({
  post,
  locale,
  initiallyOpen,
  onNavigate,
  onAccount,
}: {
  post: Post;
  locale: Locale;
  initiallyOpen?: boolean;
  onNavigate: (page: string) => void;
  onAccount: () => void;
}) {
  const { state, auth, votePost, savePost, commentPost, reportPost, deletePost } = useClub();
  const t = (key: TranslationKey) => translate(locale, key);
  const [open, setOpen] = useState(!!initiallyOpen);
  const [menu, setMenu] = useState(false);
  const [comment, setComment] = useState('');
  const [reply, setReply] = useState<string>();
  const [feedback, setFeedback] = useState('');
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (initiallyOpen) {
      setOpen(true);
      document.getElementById(`post-${post.id}`)?.scrollIntoView({ block: 'start' });
    }
  }, [initiallyOpen, post.id]);
  const community = state.communities.find((c) => c.slug === post.community);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    if (auth.status !== 'member') {
      onAccount();
      return;
    }
    setBusy(true);
    setFeedback('');
    try {
      await action();
    } catch {
      setFeedback(liveT(locale, 'common.requestFailed'));
    } finally {
      setBusy(false);
    }
  };
  const own = !!auth.user && post.authorId === auth.user.id;
  const submitComment = async (e: FormEvent) => {
    e.preventDefault();
    if (auth.status !== 'member') {
      onAccount();
      return;
    }
    setBusy(true);
    try {
      await commentPost(post.id, comment, reply);
      setComment('');
      setReply(undefined);
      setFeedback(t('your-comment-was-added'));
    } catch {
      setFeedback(liveT(locale, 'common.requestFailed'));
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    try {
      const url = `${location.origin}/${locale}?post=${encodeURIComponent(post.id)}#post-${post.id}`;
      await navigator.clipboard.writeText(url);
      setFeedback(liveT(locale, 'common.copied'));
    } catch {
      setFeedback(t('your-browser-could-not-copy-the-link'));
    }
  };
  return (
    <article className="post-card" id={`post-${post.id}`}>
      <div className="post-meta">
        <span className={`avatar avatar-${post.id.length % 3}`}>
          {post.author
            .split(' ')
            .map((s) => s[0])
            .join('')
            .slice(0, 2)}
        </span>
        <div className="post-byline">
          <span>
            <strong>{post.author}</strong>
            <span className="byline-in">{t('in')}</span>
            <button onClick={() => onNavigate('communities')}>
              {community?.name || post.community}
            </button>
          </span>
          <small>
            <time dateTime={post.createdAt}>{localizedDate(post.createdAt, locale)}</time>
            <span>·</span>
            {localizedPostType(post.type, locale)}
            {post.edited && (
              <>
                <span>·</span>
                {t('edited')}
              </>
            )}
          </small>
        </div>
        <div className="post-menu-wrap">
          <button
            className="icon-button"
            aria-label={t('post-actions')}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Ellipsis size={19} />
          </button>
          {menu && (
            <div className="post-menu">
              {own && (
                <>
                  <button
                    onClick={() => {
                      setMenu(false);
                      setEditing(true);
                    }}
                  >
                    <Pencil size={14} />
                    {t('edit-post')}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(liveT(locale, 'feed.confirmDelete')))
                        void run(() => deletePost(post.id));
                      setMenu(false);
                    }}
                  >
                    <Trash2 size={14} />
                    {t('delete-post')}
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  const reason = prompt(liveT(locale, 'feed.reportReason'));
                  if (reason)
                    void run(async () => {
                      await reportPost(post.id, reason);
                      setFeedback(liveT(locale, 'feed.reportSent'));
                    });
                  setMenu(false);
                }}
              >
                <Flag size={14} />
                {t('report-post')}
              </button>
            </div>
          )}
        </div>
      </div>
      <button className="post-title" onClick={() => setOpen(!open)} aria-expanded={open}>
        <h3>{post.title}</h3>
      </button>
      <p className={`post-body ${open ? 'expanded' : ''}`}>{post.body}</p>
      {post.image && (
        <button
          className="post-photo"
          onClick={() => setOpen(!open)}
          aria-label={t('open-photo-and-discussion')}
        >
          <img src={post.image} alt={post.title} loading="lazy" />
          <span>{liveT(locale, 'feed.photography')}</span>
        </button>
      )}
      <div className="post-actions">
        <div className="vote-controls">
          <button
            className={post.vote === 1 ? 'voted' : ''}
            aria-label={t('upvote')}
            aria-pressed={post.vote === 1}
            disabled={busy}
            onClick={() => void run(() => votePost(post.id, 1))}
          >
            <ArrowUp size={16} />
          </button>
          <strong>{post.votes}</strong>
          <button
            className={post.vote === -1 ? 'voted' : ''}
            aria-label={t('downvote')}
            aria-pressed={post.vote === -1}
            disabled={busy}
            onClick={() => void run(() => votePost(post.id, -1))}
          >
            <ArrowDown size={16} />
          </button>
        </div>
        <button className="comment-button" onClick={() => setOpen(!open)} aria-expanded={open}>
          <MessageCircle size={16} />
          <span>
            {post.comments.length} <span className="action-label">{t('comments')}</span>
          </span>
        </button>
        <button onClick={share} className="share-button">
          <Share2 size={15} />
          <span className="action-label">{t('share')}</span>
        </button>
        <button
          className={`save-button ${post.saved ? 'saved' : ''}`}
          aria-label={post.saved ? t('unsave-post') : t('save-post')}
          aria-pressed={!!post.saved}
          disabled={busy}
          onClick={() => void run(() => savePost(post.id))}
        >
          <Bookmark size={17} fill={post.saved ? 'currentColor' : 'none'} />
        </button>
      </div>
      {feedback && (
        <p className="inline-feedback" role="status">
          {feedback}
        </p>
      )}
      {open && (
        <div className="post-comments">
          <h4>{t('the-conversation')}</h4>
          {post.comments.length === 0 && (
            <p className="quiet-text">{t('be-the-first-to-share-a-thought')}</p>
          )}
          {post.comments
            .filter((item) => !item.parentId)
            .map((item) => (
              <CommentThread
                key={item.id}
                item={item}
                comments={post.comments}
                locale={locale}
                onReply={(id) => {
                  setReply(id);
                  document.getElementById(`comment-input-${post.id}`)?.focus();
                }}
              />
            ))}
          <form onSubmit={submitComment}>
            <label htmlFor={`comment-input-${post.id}`}>
              {reply ? t('your-reply') : t('add-to-the-conversation')}
            </label>
            {reply && (
              <button type="button" className="text-link" onClick={() => setReply(undefined)}>
                {t('cancel-reply')}
              </button>
            )}
            <textarea
              id={`comment-input-${post.id}`}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('a-thoughtful-word-goes-a-long-way')}
              maxLength={3000}
              required
              rows={3}
            />
            <button className="button" type="submit" disabled={busy}>
              <Send size={14} />
              {t('post-comment')}
            </button>
          </form>
        </div>
      )}
      {editing && <ComposeModal locale={locale} onClose={() => setEditing(false)} post={post} />}
    </article>
  );
}

function CommentThread({
  item,
  comments,
  locale,
  onReply,
  depth = 0,
}: {
  item: Comment;
  comments: Comment[];
  locale: Locale;
  onReply: (id: string) => void;
  depth?: number;
}) {
  return (
    <div className={`comment-thread ${depth > 0 ? 'nested-thread' : ''}`}>
      <div className="comment">
        <span className="avatar small-avatar">{item.author[0]}</span>
        <div>
          <strong>{item.author}</strong>
          <small>{localizedDate(item.createdAt, locale)}</small>
          <p>{item.body}</p>
          <button className="text-link" onClick={() => onReply(item.id)}>
            {translate(locale, 'reply')}
          </button>
        </div>
      </div>
      {comments
        .filter((child) => child.parentId === item.id)
        .map((child) => (
          <CommentThread
            key={child.id}
            item={child}
            comments={comments}
            locale={locale}
            onReply={onReply}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

function ComposeModal({
  locale,
  onClose,
  post,
}: {
  locale: Locale;
  onClose: () => void;
  post?: Post;
}) {
  const { state, publishPost, editPost } = useClub();
  const t = (key: TranslationKey) => translate(locale, key);
  const [title, setTitle] = useState(post?.title || '');
  const [body, setBody] = useState(post?.body || '');
  const [community, setCommunity] = useState(post?.community || state.joined[0] || '');
  const [type, setType] = useState<PostType>(post?.type || 'Discussion');
  const [language, setLanguage] = useState<Locale>(
    post?.language === 'pt-BR' ? 'pt-BR' : post?.language === 'en' ? 'en' : locale
  );
  const [image, setImage] = useState<string | undefined>(post?.image);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (post) await editPost(post.id, { title, body });
      else await publishPost({ title, body, community, type, language, image } as PostInput);
      onClose();
    } catch {
      setError(liveT(locale, 'common.requestFailed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      locale={locale}
      title={post ? t('refine-your-story') : t('every-story-starts-somewhere')}
      onClose={onClose}
    >
      <p className="form-intro">{t('share-a-discovery-ask-a-question-or-show-us-whats-on')}</p>
      {state.joined.length === 0 && !post && (
        <p className="form-note">
          {liveT(locale, 'feed.joinBeforePost')}{' '}
          <Link href={`/${locale}/communities`}>{liveT(locale, 'nav.communities')}</Link>
        </p>
      )}
      <form onSubmit={submit} className="compose-form">
        {!post && (
          <div className="form-row">
            <label>
              {t('community')}
              <select value={community} onChange={(e) => setCommunity(e.target.value)} required>
                <option value="" disabled>
                  {t('choose-a-community')}
                </option>
                {state.communities
                  .filter((c) => state.joined.includes(c.slug))
                  .map((c) => (
                    <option value={c.slug} key={c.slug}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t('post-type')}
              <select value={type} onChange={(e) => setType(e.target.value as PostType)}>
                <option value="Discussion">{t('discussion')}</option>
                <option value="Photography">{t('photography')}</option>
                <option value="Review">{t('review')}</option>
                <option value="Question">{t('question')}</option>
              </select>
            </label>
          </div>
        )}
        <label>
          {t('title')}
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            minLength={3}
            maxLength={180}
            placeholder={t('whats-the-story')}
            required
          />
        </label>
        <label>
          {t('your-story')}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            minLength={3}
            maxLength={10000}
            placeholder={t('make-room-for-a-good-conversation')}
            required
          />
        </label>
        {!post && (
          <>
            <div className="form-row">
              <label>
                {t('content-language')}
                <select value={language} onChange={(e) => setLanguage(e.target.value as Locale)}>
                  <option value="en">English</option>
                  <option value="pt-BR">Português brasileiro</option>
                </select>
              </label>
              <label className="upload-label">
                <ImagePlus size={20} />
                {reading ? t('reading-image') : t('add-a-photograph')}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (
                      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
                      file.size > 2 * 1024 * 1024
                    ) {
                      setError(t('choose-a-jpeg-png-or-webp-smaller-than-2-mb'));
                      return;
                    }
                    setReading(true);
                    const reader = new FileReader();
                    reader.onload = () => {
                      setImage(reader.result as string);
                      setReading(false);
                      setError('');
                    };
                    reader.onerror = () => {
                      setReading(false);
                      setError(t('could-not-read-this-image'));
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                <small>JPEG, PNG, WebP · 2 MB</small>
              </label>
            </div>
            {image && (
              <div className="image-preview">
                <img src={image} alt={t('upload-preview')} />
                <button
                  className="icon-button"
                  type="button"
                  aria-label={t('remove-image')}
                  onClick={() => setImage(undefined)}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <p className="form-note">
              {t('only-share-photographs-you-have-the-right-to-use-do-not')}
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="dialog-footer">
          <button type="button" className="button button-outline" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            type="submit"
            className="button"
            disabled={reading || busy || (!post && !community)}
          >
            {busy ? liveT(locale, 'common.saving') : post ? t('save-changes') : t('publish-story')}
            <ArrowUpRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AccountModal({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const club = useClub();
  const { auth } = club;
  const t = (key: Parameters<typeof liveT>[1]) => liveT(locale, key);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [accountType, setAccountType] = useState<'member' | 'store'>('member');
  const text = (en: string, pt: string) => (locale === 'pt-BR' ? pt : en);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof RegistrationError && cause.code === 'rate_limited'
          ? text(
              'Too many attempts. Wait before trying again.',
              'Muitas tentativas. Aguarde antes de tentar novamente.'
            )
          : t('auth.failed')
      );
    } finally {
      setBusy(false);
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void perform(async () => {
      if (mode === 'signup') {
        await club.signup({
          email: String(data.get('email')),
          password: String(data.get('password')),
          displayName: String(data.get('name')),
          locale,
        });
      } else {
        await club.login(String(data.get('email')), String(data.get('password')));
      }
    });
  };
  const onboard = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void perform(async () => {
      await club.onboard({
        username: String(data.get('username')),
        displayName: String(data.get('name')),
        locale,
        accountType,
        website: String(data.get('website') || ''),
        contact: String(data.get('contact') || ''),
      });
      setMessage(t('auth.profileCreated'));
    });
  };
  return (
    <Modal
      locale={locale}
      title={t(auth.status === 'onboarding' ? 'auth.completeProfile' : 'auth.title')}
      onClose={onClose}
    >
      {auth.status === 'loading' ? (
        <p role="status">{t('auth.checkingSession')}</p>
      ) : auth.status === 'unavailable' ? (
        <p role="alert">{t('common.unconfigured')}</p>
      ) : auth.status === 'member' ? (
        <div className="compose-form">
          <p>
            {t('auth.signedIn')} <strong>{auth.member?.name}</strong>
          </p>
          <p>
            @{auth.member?.username} ·{' '}
            {t(auth.member?.accountType === 'store' ? 'common.storeDeclared' : 'common.member')}
          </p>
          {(auth.role === 'admin' ||
            auth.role === 'moderator' ||
            auth.moderatedCommunityIds.length > 0) && (
            <Link className="text-link" href={`/${locale}/admin`}>
              {t('nav.moderation')} <ArrowUpRight size={15} />
            </Link>
          )}
          <div className="dialog-footer">
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await club.signout();
                  setMessage(t('auth.signedOut'));
                })
              }
            >
              {busy ? t('auth.signingOut') : t('auth.signOut')}
            </button>
            <button className="button" onClick={onClose}>
              {t('common.continue')}
            </button>
          </div>
        </div>
      ) : auth.status === 'onboarding' ? (
        <form className="compose-form" onSubmit={onboard}>
          <p className="form-intro">{t('auth.joinIntro')}</p>
          <label>
            {t('auth.accountType')}
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value as 'member' | 'store')}
            >
              <option value="member">{t('auth.memberType')}</option>
              <option value="store">{t('auth.storeType')}</option>
            </select>
          </label>
          <label>
            {t(accountType === 'store' ? 'auth.storeName' : 'auth.displayName')}
            <input
              name="name"
              autoComplete="name"
              minLength={2}
              maxLength={80}
              required
              defaultValue=""
            />
          </label>
          <label>
            {t('auth.username')}
            <input
              name="username"
              autoComplete="username"
              pattern="[a-z0-9_]{3,32}"
              minLength={3}
              maxLength={32}
              required
            />
            <small>{t('auth.usernameHelp')}</small>
          </label>
          {accountType === 'store' && (
            <>
              <label>
                {t('auth.website')}
                <input name="website" type="url" placeholder="https://" maxLength={500} />
              </label>
              <label>
                {t('auth.contact')}
                <input name="contact" type="email" maxLength={254} />
                <small>{t('auth.publicContactHelp')}</small>
              </label>
              <p className="form-note">{t('auth.storeDisclaimer')}</p>
            </>
          )}
          <p className="form-note">{t('auth.joinConsent')}</p>
          <button className="button" disabled={busy}>
            {busy ? t('common.saving') : t('auth.joinHorion')}
          </button>
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                await club.signout();
                setMode('login');
                setMessage(t('auth.signedOut'));
              })
            }
          >
            {t('auth.signOut')}
          </button>
        </form>
      ) : (
        <form className="compose-form" onSubmit={submit}>
          <p className="form-intro">{t('auth.subtitle')}</p>
          <div className="account-tabs">
            <button
              type="button"
              aria-pressed={mode === 'login'}
              onClick={() => {
                setMode('login');
                setError('');
              }}
            >
              {t('auth.signIn')}
            </button>
            <button
              type="button"
              aria-pressed={mode === 'signup'}
              disabled={!auth.signupEnabled}
              onClick={() => {
                setMode('signup');
                setError('');
              }}
            >
              {t('auth.signUp')}
            </button>
          </div>
          {mode === 'signup' && (
            <label>
              {t('auth.displayName')}
              <input name="name" autoComplete="name" minLength={2} maxLength={80} required />
            </label>
          )}
          <label>
            {t('auth.email')}
            <input type="email" name="email" autoComplete="email" required maxLength={254} />
          </label>
          <label>
            {t('auth.password')}
            <input
              type="password"
              name="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={mode === 'signup' ? 12 : 1}
              maxLength={128}
              pattern={mode === 'signup' ? '(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,128}' : undefined}
              required
            />
            {mode === 'signup' && <small>{t('auth.passwordHelp')}</small>}
          </label>
          {mode === 'signup' && (
            <p className="form-note">
              {text(
                'Create your account and choose a member or store profile. No email confirmation is required. Your sign-in identity is shared with Rango; Horion content and permissions are separate.',
                'Crie sua conta e escolha um perfil de membro ou loja. Não é necessário confirmar o e-mail. Sua identidade de acesso é compartilhada com o Rango; o conteúdo e as permissões do Horion são separados.'
              )}
            </p>
          )}
          <button className="button" disabled={busy || (mode === 'signup' && !auth.signupEnabled)}>
            {busy ? t('common.loading') : t(mode === 'signup' ? 'auth.signUp' : 'auth.signIn')}
            <ArrowUpRight size={16} />
          </button>
          {!auth.signupEnabled && <p className="form-note">{t('auth.registrationDisabled')}</p>}
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="inline-feedback" role="status">
          {message}
        </p>
      )}
    </Modal>
  );
}
