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
import { communities } from '@/lib/demo-data';
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

type AppProps = {
  locale: Locale;
  page: string;
  query?: string;
  sharedPost?: string;
  watchId?: string;
  backendConfigured?: boolean;
  authError?: boolean;
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
    <ClubProvider>
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
  authError,
}: AppProps) {
  const router = useRouter();
  const { state, ready, storageError } = useClub();
  const [compose, setCompose] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const [auth, setAuth] = useState(false);
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
    <div className="club-shell" inert={!ready} aria-busy={!ready}>
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
          <Link className="nav-item" href={`/${locale}/settings`}>
            <Settings size={18} strokeWidth={1.5} />
            <span>{labels.settings}</span>
          </Link>
          <button className="profile-switch" onClick={() => navigate('profile')}>
            <span className="avatar avatar-you">
              {state.profile.name
                .split(' ')
                .map((s) => s[0])
                .join('')
                .slice(0, 2)}
            </span>
            <span>
              <strong>{state.profile.name}</strong>
              <small>{t('demo-member')}</small>
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
              onClick={() => navigate('profile')}
              aria-label={labels.profile}
            >
              {state.profile.name.charAt(0)}
            </button>
          </div>
        </header>
        <div className="demo-strip">
          <span>
            <span className="live-dot" />
            {t('preview-edition')}
            <span className="demo-explainer">
              {t('fictitious-community-changes-saved-in-this-browser')}
            </span>
          </span>
          <button onClick={() => setAuth(true)}>
            {t('account-access')}
            <ArrowUpRight size={13} />
          </button>
        </div>
        {storageError && (
          <p role="alert" className="storage-error">
            {t('your-browser-could-not-save-changes-export-your-data-in-settings')}
          </p>
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
              onCompose={() => setCompose(true)}
              sharedPost={sharedPost}
            />
          ) : (
            <ClubPage
              page={page}
              locale={locale}
              onNavigate={navigate}
              onCompose={() => setCompose(true)}
              query={query}
              watchId={watchId}
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
      {auth && (
        <AccountModal
          locale={locale}
          onClose={() => setAuth(false)}
          configured={backendConfigured}
        />
      )}
    </div>
  );
}

function HomeFeed({
  locale,
  onNavigate,
  onCompose,
  sharedPost,
}: {
  locale: Locale;
  onNavigate: (page: string) => void;
  onCompose: () => void;
  sharedPost?: string;
}) {
  const { state, toggleCommunity, ready } = useClub();
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
      <section className="editorial-grid" aria-label={t('featured-at-horion')}>
        <button className="hero-story" onClick={() => onNavigate('journal')}>
          <img
            src="/images/hero-watch.jpg"
            alt={t('editorial-close-up-of-a-steel-wristwatch-resting-on-an-archival')}
            fetchPriority="high"
            width={1800}
            height={1200}
          />
          <div className="hero-shade" />
          <div className="hero-content">
            <span className="hero-category">
              <span />
              {t('the-collectors-perspective')}
            </span>
            <h2>
              {t('some-keep-time')}
              <br />
              <em>{t('others-tell-stories')}</em>
            </h2>
            <p>{t('the-watches-we-wear-the-lives-we-live')}</p>
            <span className="hero-link">
              {t('explore-the-journal')}
              <ArrowUpRight size={18} />
            </span>
          </div>
          <span className="hero-index">JOURNAL / VOL. 01</span>
        </button>
        <div className="feature-stack">
          <button className="passport-feature" onClick={() => onNavigate('passport')}>
            <div className="feature-top">
              <span className="eyebrow">HORION PASSPORT</span>
              <ArrowUpRight size={20} strokeWidth={1.4} />
            </div>
            <div className="passport-art" aria-hidden="true">
              <span className="passport-book">
                <Watch size={24} strokeWidth={1} />
                <span>HORION</span>
                <small>WATCH PASSPORT</small>
                <i>H</i>
              </span>
              <span className="archive-stamp">
                PRESERVE
                <br />
                THE STORY
                <br />
                <span>✳</span>
              </span>
            </div>
            <h3>{t('a-story-worth-keeping')}</h3>
            <p>{t('your-watch-its-history-one-timeless-record')}</p>
          </button>
          <button className="society-feature" onClick={() => onNavigate('society')}>
            <span className="society-emblem">
              <Crown size={24} strokeWidth={1} />
            </span>
            <div>
              <span className="eyebrow">HORION SOCIETY</span>
              <h3>{t('take-your-passion-further')}</h3>
              <span className="society-link">
                {t('discover-the-club')}
                <ArrowRight size={14} />
              </span>
            </div>
          </button>
        </div>
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
              <h3>{t('a-little-quiet-here')}</h3>
              <p>{t('try-another-filter-or-start-a-conversation-of-your-own')}</p>
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
                  <small>
                    {new Intl.NumberFormat(locale, { notation: 'compact' }).format(
                      community.members
                    )}{' '}
                    {t('demo-members')}
                  </small>
                </button>
                <button
                  className={`join-button ${state.joined.includes(community.slug) ? 'joined' : ''}`}
                  aria-label={`${state.joined.includes(community.slug) ? t('leave') : t('join')} ${community.name}`}
                  onClick={() => toggleCommunity(community.slug)}
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
          <div className="journal-aside">
            <div className="section-heading">
              <span className="eyebrow">THE HORION JOURNAL</span>
              <ArrowUpRight size={17} />
            </div>
            <button onClick={() => onNavigate('journal')} className="journal-story">
              <img
                src="/images/watch-vintage.jpg"
                alt={t('illustrative-watch-photography')}
                loading="lazy"
              />
              <span className="eyebrow">{t('the-essentials')}</span>
              <h3>{t('your-first-mechanical-watch-where-to-begin')}</h3>
              <span className="read-time">{t('a-beginners-guide-original-demo-article')}</span>
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
}: {
  post: Post;
  locale: Locale;
  initiallyOpen?: boolean;
  onNavigate: (page: string) => void;
}) {
  const { state, votePost, savePost, commentPost, reportPost, deletePost } = useClub();
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
  const community = communities.find((c) => c.slug === post.community);
  const own = post.username === state.profile.username;
  const submitComment = (e: FormEvent) => {
    e.preventDefault();
    try {
      commentPost(post.id, comment, reply);
      setComment('');
      setReply(undefined);
      setFeedback(t('your-comment-was-added'));
    } catch {
      setFeedback(t('write-a-comment-between-1-and-3-000-characters'));
    }
  };
  const share = async () => {
    try {
      const url = `${location.origin}/${locale}?post=${encodeURIComponent(post.id)}#post-${post.id}`;
      await navigator.clipboard.writeText(url);
      setFeedback(t('link-copied-demo-content-exists-only-in-this-browser'));
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
            <span>·</span>
            {t('demo')}
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
                      if (confirm(t('delete-this-demo-post'))) deletePost(post.id);
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
                  const reason = prompt(
                    t('tell-us-why-you-are-reporting-this-post-demo-moderation')
                  );
                  if (reason) {
                    try {
                      reportPost(post.id, reason);
                      setFeedback(t('report-recorded-in-the-local-moderation-sandbox'));
                    } catch {
                      setFeedback(t('please-give-a-reason-with-at-least-3-characters'));
                    }
                  }
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
          <span>{t('community-photography-demo')}</span>
        </button>
      )}
      <div className="post-actions">
        <div className="vote-controls">
          <button
            className={post.vote === 1 ? 'voted' : ''}
            aria-label={t('upvote')}
            aria-pressed={post.vote === 1}
            onClick={() => votePost(post.id, 1)}
          >
            <ArrowUp size={16} />
          </button>
          <strong>{post.votes}</strong>
          <button
            className={post.vote === -1 ? 'voted' : ''}
            aria-label={t('downvote')}
            aria-pressed={post.vote === -1}
            onClick={() => votePost(post.id, -1)}
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
          onClick={() => savePost(post.id)}
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
            <button className="button" type="submit">
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
  const [language, setLanguage] = useState<Locale>(post?.language || locale);
  const [image, setImage] = useState<string | undefined>(post?.image);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      if (post) editPost(post.id, { title, body });
      else publishPost({ title, body, community, type, language, image } as PostInput);
      onClose();
    } catch {
      setError(t('check-the-title-content-and-community-join-a-community-before-publishing'));
    }
  };
  return (
    <Modal
      locale={locale}
      title={post ? t('refine-your-story') : t('every-story-starts-somewhere')}
      onClose={onClose}
    >
      <p className="form-intro">
        {t('share-a-discovery-ask-a-question-or-show-us-whats-on')}
        <span>{t('demo-post-visible-in-this-browser-only')}</span>
      </p>
      <form onSubmit={submit} className="compose-form">
        {!post && (
          <div className="form-row">
            <label>
              {t('community')}
              <select value={community} onChange={(e) => setCommunity(e.target.value)} required>
                <option value="" disabled>
                  {t('choose-a-community')}
                </option>
                {communities
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
          <button type="submit" className="button" disabled={reading || (!post && !community)}>
            {post ? t('save-changes') : t('publish-story')}
            <ArrowUpRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AccountModal({
  locale,
  onClose,
  configured,
}: {
  locale: Locale;
  onClose: () => void;
  configured: boolean;
}) {
  const t = (key: TranslationKey) => translate(locale, key);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  useEffect(() => {
    if (!configured) return;
    let active = true;
    fetch('/api/auth')
      .then((res) => res.json())
      .then((data) => {
        if (active) setUser(data.user?.email || null);
      })
      .catch(() => {
        if (active) setStatus(t('could-not-check-the-account-connection'));
      });
    return () => {
      active = false;
    };
  }, [configured]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    const values = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: user ? 'logout' : mode,
          ...(user
            ? {}
            : {
                email: values.get('email'),
                password: values.get('password'),
                ...(mode === 'signup' ? { displayName: values.get('name'), locale } : {}),
              }),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error();
      if (user) {
        setUser(null);
        setStatus(t('signed-out-of-supabase'));
      } else if (data.emailConfirmationRequired)
        setStatus(t('check-your-email-to-confirm-your-account-the-local-demo-remains'));
      else {
        setUser(String(values.get('email')));
        setStatus(
          t('authenticated-with-supabase-this-product-preview-continues-to-use-local-demo')
        );
      }
    } catch {
      setStatus(
        t('account-request-failed-check-your-details-connection-and-supabase-configuration')
      );
    } finally {
      setBusy(false);
    }
  }
  if (configured)
    return (
      <Modal locale={locale} title={t('your-place-in-the-club')} onClose={onClose}>
        <p className="form-intro">
          {t('supabase-account-access-product-interactions-in-this-preview-still-use-separate')}
        </p>
        <form onSubmit={submit} className="compose-form">
          {user ? (
            <p>
              {t('signed-in-as')} {user}
            </p>
          ) : (
            <>
              {mode === 'signup' && (
                <label>
                  {t('display-name')}
                  <input name="name" autoComplete="name" minLength={2} maxLength={60} required />
                </label>
              )}
              <label>
                {t('email')}
                <input name="email" type="email" autoComplete="email" required maxLength={254} />
              </label>
              <label>
                {t('password')}
                <input
                  name="password"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={12}
                  maxLength={128}
                  required
                />
              </label>
              <p className="form-note">
                {t('at-least-12-characters-never-reuse-an-important-password')}
              </p>
            </>
          )}
          {status && (
            <p role="status" className="inline-feedback">
              {status}
            </p>
          )}
          <button className="button" type="submit" disabled={busy}>
            {busy
              ? t('please-wait')
              : user
                ? t('sign-out')
                : mode === 'login'
                  ? t('sign-in')
                  : t('create-account')}
          </button>
          {!user && (
            <button
              className="text-link"
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setStatus('');
              }}
            >
              {mode === 'login' ? t('new-here-create-an-account') : t('already-a-member-sign-in')}
            </button>
          )}
        </form>
      </Modal>
    );
  return (
    <Modal locale={locale} title={t('your-place-in-the-club')} onClose={onClose}>
      <div className="account-intro">
        <LogIn size={30} strokeWidth={1} />
        <p>{t('youre-exploring-the-local-demonstration-creating-a-real-member-account-will')}</p>
        <p className="form-note">{t('the-demo-profile-is-not-a-real-account-posts-votes-and')}</p>
        <button className="button" onClick={onClose}>
          {t('continue-exploring')}
          <ArrowRight size={16} />
        </button>
      </div>
    </Modal>
  );
}
