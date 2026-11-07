'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  FileText,
  Globe2,
  Heart,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Watch,
  X,
} from 'lucide-react';
import type { Locale, WatchReference, UserWatch } from '@/lib/domain';
import { communities, watchReferences } from '@/lib/demo-data';
import { useClub } from '@/lib/store';
import { localizedPostType, translate, type TranslationKey } from '@/lib/i18n';
import './pages.css';

type Props = {
  page: string;
  locale: Locale;
  onNavigate: (page: string) => void;
  onCompose: () => void;
  query?: string;
  watchId?: string;
};
type Translate = (key: TranslationKey) => string;
const formatDate = (date: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(date));

function Modal({
  locale,
  title,
  children,
  onClose,
}: {
  locale: Locale;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="cpage-dialog"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="cpage-dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button
          className="cpage-icon-button"
          onClick={onClose}
          aria-label={translate(locale, 'close')}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="cpage-heading">
      <p className="eyebrow">{eyebrow}</p>
      <div className="cpage-title-row">
        <h1>{title}</h1>
        {action}
      </div>
      <p>{description}</p>
    </header>
  );
}

function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="cpage-empty">
      <Watch size={28} strokeWidth={1.2} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

function SearchInput({
  value,
  setValue,
  placeholder,
}: {
  value: string;
  setValue: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="cpage-search">
      <Search size={18} />
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </label>
  );
}

function ReferenceCard({
  reference,
  t,
  onSelect,
}: {
  reference: WatchReference;
  t: Translate;
  onSelect: () => void;
}) {
  return (
    <article className="cpage-watch-card">
      <button onClick={onSelect} className="cpage-watch-image">
        <img src={reference.image} alt={t('illustrative-watch-photograph')} loading="lazy" />
        <span className="cpage-image-caption">{t('illustrative-image')}</span>
      </button>
      <div className="cpage-watch-caption">
        <p className="eyebrow">{reference.brand}</p>
        <button className="cpage-title-button" onClick={onSelect}>
          <h3>{reference.model}</h3>
        </button>
        <p className="cpage-reference">{reference.reference}</p>
        <button className="cpage-text-link" onClick={onSelect}>
          {t('view-reference')} <ArrowRight size={14} />
        </button>
      </div>
    </article>
  );
}

function ReferenceDetails({
  reference,
  locale,
  onClose,
  onNavigate,
}: {
  reference: WatchReference;
  locale: Locale;
  onClose: () => void;
  onNavigate: (page: string) => void;
}) {
  const t: Translate = (key) => translate(locale, key);
  const { addWatch, state } = useClub();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState('');
  const alreadyAdded = state.watches.some(
    (watch) => watch.referenceId === reference.id && watch.status === 'wishlist'
  );
  return (
    <Modal locale={locale} title={`${reference.brand} ${reference.model}`} onClose={onClose}>
      <img
        className="cpage-detail-image"
        src={reference.image}
        alt={t('illustrative-watch-photograph')}
      />
      <p className="eyebrow">{t('catalog-reference')}</p>
      <p className="cpage-reference cpage-large-ref">{reference.reference}</p>
      <dl className="cpage-specs">
        <div>
          <dt>{t('brand')}</dt>
          <dd>{reference.brand}</dd>
        </div>
        <div>
          <dt>{t('model')}</dt>
          <dd>{reference.model}</dd>
        </div>
        <div>
          <dt>{t('category')}</dt>
          <dd>{reference.category}</dd>
        </div>
        {reference.movement && (
          <div>
            <dt>{t('movement')}</dt>
            <dd>{reference.movement}</dd>
          </div>
        )}
        <div>
          <dt>{t('review-status')}</dt>
          <dd>{t('demonstration-entry-not-reviewed')}</dd>
        </div>
      </dl>
      <p className="cpage-notice">
        {t('demonstration-catalog-images-are-illustrative-and-may-not-depict-this-exact')}
      </p>
      {reference.source && (
        <p className="cpage-source">
          {t('source')}:{' '}
          <a href={reference.source} target="_blank" rel="noopener noreferrer">
            {t('manufacturer-website')} ↗
          </a>
        </p>
      )}
      {error && (
        <p className="cpage-error" role="alert">
          {error}
        </p>
      )}
      <div className="cpage-form-actions">
        <button
          className="button"
          disabled={added || alreadyAdded}
          onClick={() => {
            try {
              addWatch(reference.id, 'wishlist');
              setAdded(true);
            } catch {
              setError(t('this-reference-is-already-in-your-wishlist'));
            }
          }}
        >
          {added || alreadyAdded ? <Check size={16} /> : <Heart size={16} />}
          {added || alreadyAdded ? t('added-to-wishlist') : t('add-to-wishlist')}
        </button>
        <button
          className="button-outline"
          onClick={() => {
            onClose();
            onNavigate('collection');
          }}
        >
          {t('my-collection')}
        </button>
      </div>
    </Modal>
  );
}

function ExplorePage({ locale, onNavigate, query: initialQuery }: Props) {
  const t: Translate = (key) => translate(locale, key);
  const { state } = useClub();
  const [query, setQuery] = useState(initialQuery ?? '');
  useEffect(() => setQuery(initialQuery ?? ''), [initialQuery]);
  const [selected, setSelected] = useState<WatchReference | null>(null);
  const match = (text: string) =>
    text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const refs = watchReferences.filter((ref) => match(`${ref.brand} ${ref.model} ${ref.reference}`));
  const clubs = communities.filter((club) => match(`${club.name} ${club.description}`));
  const posts = state.posts.filter(
    (post) => !post.hidden && match(`${post.title} ${post.body} ${post.author} ${post.community}`)
  );
  return (
    <div className="cpage">
      <Heading
        eyebrow={t('horion-explore')}
        title={t('follow-your-curiosity')}
        description={t('a-new-reference-an-old-story-your-next-conversation')}
      />
      <SearchInput
        value={query}
        setValue={setQuery}
        placeholder={t('search-watches-references-communities-and-stories')}
      />
      <section className="cpage-section">
        <div className="cpage-section-heading">
          <h2>{t('watches-references')}</h2>
          <span>
            {refs.length} {t('results')}
          </span>
        </div>
        <div className="cpage-watch-grid">
          {refs.map((ref) => (
            <ReferenceCard key={ref.id} reference={ref} t={t} onSelect={() => setSelected(ref)} />
          ))}
        </div>
      </section>
      <section className="cpage-section">
        <div className="cpage-section-heading">
          <h2>{t('communities')}</h2>
          <button className="cpage-text-link" onClick={() => onNavigate('communities')}>
            {t('discover-all')} <ArrowRight size={15} />
          </button>
        </div>
        <div className="cpage-compact-grid">
          {clubs.map((club) => (
            <button
              key={club.id}
              className="cpage-result"
              onClick={() => onNavigate(`communities?community=${club.slug}`)}
            >
              <img src={club.image} alt="" />
              <div>
                <h3>{club.name}</h3>
                <p>{club.description}</p>
              </div>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      </section>
      <section className="cpage-section">
        <div className="cpage-section-heading">
          <h2>{t('from-the-conversation')}</h2>
          <button className="cpage-text-link" onClick={() => onNavigate('home')}>
            {t('open-feed')} <ArrowRight size={15} />
          </button>
        </div>
        {posts.map((post) => (
          <button
            className="cpage-search-post"
            key={post.id}
            onClick={() => onNavigate(`home?post=${post.id}`)}
          >
            <div>
              <p className="eyebrow">
                {post.community} · {localizedPostType(post.type, locale)}
              </p>
              <h3>{post.title}</h3>
              <p>
                {post.author} · {post.comments.length} {t('comments')}
              </p>
            </div>
            <ArrowRight size={18} />
          </button>
        ))}
      </section>
      {!refs.length && !clubs.length && !posts.length && (
        <Empty
          title={t('no-discoveries-yet')}
          text={t('try-a-brand-reference-number-or-a-broader-term')}
        />
      )}
      {selected && (
        <ReferenceDetails
          reference={selected}
          locale={locale}
          onClose={() => setSelected(null)}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}

function CommunitiesPage({ locale, onCompose }: Props) {
  const t: Translate = (key) => translate(locale, key);
  const { state, toggleCommunity } = useClub();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [active, setActive] = useState<(typeof communities)[number] | null>(null);
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('community');
    if (slug) setActive(communities.find((item) => item.slug === slug) ?? null);
  }, []);
  const categories = Array.from(new Set(communities.map((club) => club.category)));
  const filtered = communities.filter(
    (club) =>
      `${club.name} ${club.description}`.toLowerCase().includes(query.toLowerCase()) &&
      (category === 'all' || club.category === category)
  );
  return (
    <div className="cpage">
      <Heading
        eyebrow={t('horion-watch-club')}
        title={t('find-your-people-2')}
        description={t(
          'a-shared-fascination-a-thousand-different-perspectives-everyone-has-a-seat'
        )}
        action={
          <button className="button" onClick={onCompose}>
            <Plus size={16} />
            {t('start-a-conversation-2')}
          </button>
        }
      />
      <div className="cpage-toolbar">
        <SearchInput value={query} setValue={setQuery} placeholder={t('find-a-community')} />
        <label className="cpage-select">
          <SlidersHorizontal size={16} />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label={t('category')}
          >
            <option value="all">{t('all-interests')}</option>
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="cpage-community-grid">
        {filtered.map((club) => {
          const joined = state.joined.includes(club.slug);
          return (
            <article className="cpage-community" key={club.id}>
              <button className="cpage-community-image" onClick={() => setActive(club)}>
                <img src={club.image} alt={club.name} loading="lazy" />
              </button>
              <div className="cpage-community-body">
                <p className="eyebrow">{club.category}</p>
                <button className="cpage-title-button" onClick={() => setActive(club)}>
                  <h2>{club.name}</h2>
                </button>
                <p>{club.description}</p>
                <div className="cpage-community-bottom">
                  <span>
                    {new Intl.NumberFormat(locale, {
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(club.members + (joined ? 1 : 0))}{' '}
                    {t('members')}
                  </span>
                  <button
                    className={joined ? 'button-outline' : 'button'}
                    aria-pressed={joined}
                    onClick={() => toggleCommunity(club.slug)}
                  >
                    {joined && <Check size={14} />}
                    {joined ? t('joined') : t('join-community')}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!filtered.length && (
        <Empty
          title={t('no-communities-found')}
          text={t('try-a-different-interest-or-remove-the-category-filter')}
        />
      )}
      <p className="cpage-footnote">
        {t('independent-enthusiast-communities-names-do-not-imply-official-affiliation-with-watch')}
      </p>
      {active && (
        <Modal locale={locale} title={active.name} onClose={() => setActive(null)}>
          <p>{active.description}</p>
          <h3>{t('a-good-conversation-starts-with-respect')}</h3>
          <ol className="cpage-rules">
            <li>{t('welcome-every-collector-whatever-is-on-their-wrist')}</li>
            <li>{t('share-original-images-and-credit-your-sources')}</li>
            <li>{t('discuss-ideas-never-attack-people')}</li>
            <li>{t('no-unsolicited-sales-spam-or-misleading-claims')}</li>
          </ol>
          <button className="button" onClick={() => toggleCommunity(active.slug)}>
            {state.joined.includes(active.slug) ? t('leave-community') : t('join-community-2')}
          </button>
        </Modal>
      )}
    </div>
  );
}

function WatchesPage({ locale, onNavigate }: Props) {
  const t: Translate = (key) => translate(locale, key);
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('all');
  const [selected, setSelected] = useState<WatchReference | null>(null);
  const brands = Array.from(new Set(watchReferences.map((ref) => ref.brand)));
  const refs = watchReferences.filter(
    (ref) =>
      `${ref.brand} ${ref.model} ${ref.reference}`.toLowerCase().includes(query.toLowerCase()) &&
      (brand === 'all' || ref.brand === brand)
  );
  return (
    <div className="cpage">
      <Heading
        eyebrow={t('horion-the-catalog')}
        title={t('every-reference-has-a-story')}
        description={t('an-evolving-archive-of-the-watches-that-bring-us-together-from')}
      />
      <div className="cpage-toolbar">
        <SearchInput
          value={query}
          setValue={setQuery}
          placeholder={t('search-a-brand-model-or-reference')}
        />
        <label className="cpage-select">
          <SlidersHorizontal size={16} />
          <select
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
            aria-label={t('filter-by-brand')}
          >
            <option value="all">{t('all-brands')}</option>
            {brands.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="cpage-results-line">
        <span>
          {refs.length} {t('references-in-this-demonstration')}
        </span>
        <span>{t('editorial-archive-vol-01')}</span>
      </div>
      <div className="cpage-watch-grid">
        {refs.map((ref) => (
          <ReferenceCard key={ref.id} reference={ref} t={t} onSelect={() => setSelected(ref)} />
        ))}
      </div>
      {!refs.length && (
        <Empty
          title={t('a-reference-still-to-be-discovered')}
          text={t('try-a-broader-search-catalog-contributions-will-open-after-the-review')}
        />
      )}
      <aside className="cpage-info-strip">
        <BookOpen size={24} strokeWidth={1.3} />
        <div>
          <h3>{t('knowledge-carefully-collected')}</h3>
          <p>
            {t(
              'entries-and-photography-are-illustrative-unverified-specifications-are-intentionally-omitted-every'
            )}
          </p>
        </div>
      </aside>
      {selected && (
        <ReferenceDetails
          reference={selected}
          locale={locale}
          onClose={() => setSelected(null)}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}

function CollectionPage({ locale, onNavigate }: Props) {
  const t: Translate = (key) => translate(locale, key);
  const { state, addWatch, updateWatch, createPassport } = useClub();
  const [status, setStatus] = useState<UserWatch['status']>('owned');
  const [adding, setAdding] = useState(false);
  const [refId, setRefId] = useState(watchReferences[0]?.id ?? '');
  const [addStatus, setAddStatus] = useState<UserWatch['status']>('owned');
  const [editing, setEditing] = useState<UserWatch | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const tabs: { value: UserWatch['status']; label: string }[] = [
    { value: 'owned', label: t('in-the-collection') },
    { value: 'wishlist', label: t('wishlist') },
    { value: 'previously-owned', label: t('previously-owned') },
  ];
  function add(event: FormEvent) {
    event.preventDefault();
    try {
      addWatch(refId, addStatus);
      setAdding(false);
      setStatus(addStatus);
      setMessage(t('watch-added-to-your-collection'));
      setError('');
    } catch {
      setError(t('this-reference-is-already-in-the-selected-collection-choose-another-watch'));
    }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    try {
      updateWatch(editing.id, {
        notes: String(form.get('notes') ?? ''),
        acquiredAt: String(form.get('acquiredAt') ?? ''),
        visibility: form.get('visibility') === 'public' ? 'public' : 'private',
        status: form.get('status') as UserWatch['status'],
      });
      setEditing(null);
      setMessage(t('collection-record-updated'));
      setError('');
    } catch {
      setError(t('check-the-date-and-record-fields-then-try-again'));
    }
  }
  return (
    <div className="cpage">
      <Heading
        eyebrow={t('horion-my-collection')}
        title={t('a-collection-of-your-stories')}
        description={t('the-watches-you-wear-the-ones-you-remember-the-next-chapter')}
        action={
          <button
            className="button"
            onClick={() => {
              setError('');
              setAdding(true);
            }}
          >
            <Plus size={16} />
            {t('add-a-watch')}
          </button>
        }
      />
      <div className="cpage-collection-intro">
        <div>
          <strong>
            {state.watches
              .filter((w) => w.status === 'owned')
              .length.toString()
              .padStart(2, '0')}
          </strong>
          <span>{t('watches-in-the-collection')}</span>
        </div>
        <div>
          <strong>{state.passports.length.toString().padStart(2, '0')}</strong>
          <span>{t('digital-passports')}</span>
        </div>
        <p>
          <LockKeyhole size={16} />
          {t('new-records-are-private-by-default-this-demo-is-stored-in')}
        </p>
      </div>
      <div className="cpage-tabs" role="group" aria-label={t('collection-status')}>
        {tabs.map((tab) => (
          <button
            key={tab.value}
            aria-pressed={status === tab.value}
            className={status === tab.value ? 'active' : ''}
            onClick={() => setStatus(tab.value)}
          >
            {tab.label}
            <span>{state.watches.filter((w) => w.status === tab.value).length}</span>
          </button>
        ))}
      </div>
      {message && (
        <p role="status" className="cpage-success">
          <Check size={16} />
          {message}
        </p>
      )}
      <div className="cpage-watch-grid">
        {state.watches
          .filter((watch) => watch.status === status)
          .map((watch) => {
            const ref = watchReferences.find((r) => r.id === watch.referenceId);
            if (!ref) return null;
            const hasPassport = state.passports.some((p) => p.watchId === watch.id);
            return (
              <article key={watch.id} className="cpage-watch-card">
                <button
                  className="cpage-watch-image"
                  onClick={() => {
                    setError('');
                    setEditing(watch);
                  }}
                >
                  <img src={ref.image} alt={t('illustrative-watch-photograph')} loading="lazy" />
                  <span className="cpage-image-caption">{t('illustrative-image')}</span>
                  <span className="cpage-privacy">
                    <LockKeyhole size={12} />
                    {watch.visibility === 'private' ? t('private') : t('public')}
                  </span>
                </button>
                <div className="cpage-watch-caption">
                  <p className="eyebrow">{ref.brand}</p>
                  <h3>{ref.model}</h3>
                  <p className="cpage-reference">{ref.reference}</p>
                  {watch.notes && <p className="cpage-watch-note">{watch.notes}</p>}
                  <div className="cpage-card-actions">
                    <button
                      className="cpage-text-link"
                      onClick={() => {
                        setError('');
                        setEditing(watch);
                      }}
                    >
                      {t('edit-record')}
                    </button>
                    {status === 'owned' && (
                      <button
                        className="cpage-text-link"
                        onClick={() => {
                          if (!hasPassport) createPassport(watch.id);
                          onNavigate(`passport?watch=${encodeURIComponent(watch.id)}`);
                        }}
                      >
                        {hasPassport ? t('open-passport') : t('create-passport')}{' '}
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
      </div>
      {!state.watches.some((w) => w.status === status) && (
        <Empty
          title={
            status === 'wishlist' ? t('the-next-chapter-is-yours') : t('your-story-starts-here')
          }
          text={t('add-a-reference-from-the-catalog-to-begin-documenting-your-journey')}
          action={
            <button
              className="button-outline"
              onClick={() => {
                setError('');
                setAdding(true);
              }}
            >
              <Plus size={15} />
              {t('add-a-watch')}
            </button>
          }
        />
      )}
      {adding && (
        <Modal locale={locale} title={t('a-new-chapter')} onClose={() => setAdding(false)}>
          <form className="cpage-form" onSubmit={add}>
            <label>
              {t('watch-reference')}
              <select value={refId} onChange={(event) => setRefId(event.target.value)} required>
                {watchReferences.map((ref) => (
                  <option key={ref.id} value={ref.id}>
                    {ref.brand} · {ref.model} · {ref.reference}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('collection-status-2')}
              <select
                value={addStatus}
                onChange={(event) => setAddStatus(event.target.value as UserWatch['status'])}
              >
                {tabs.map((tab) => (
                  <option value={tab.value} key={tab.value}>
                    {tab.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="cpage-notice">
              {t('no-purchase-price-or-serial-number-is-needed-your-record-starts')}
            </p>
            {error && (
              <p className="cpage-error" role="alert">
                {error}
              </p>
            )}
            <button className="button" type="submit">
              <Plus size={15} />
              {t('add-to-collection')}
            </button>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal locale={locale} title={t('edit-collection-record')} onClose={() => setEditing(null)}>
          <form className="cpage-form" onSubmit={save}>
            <label>
              {t('status')}
              <select name="status" defaultValue={editing.status}>
                {tabs.map((tab) => (
                  <option value={tab.value} key={tab.value}>
                    {tab.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('acquisition-date-optional')}
              <input
                type="date"
                name="acquiredAt"
                defaultValue={editing.acquiredAt}
                max={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label>
              {t('notes')}
              <textarea name="notes" defaultValue={editing.notes} maxLength={1500} rows={4} />
            </label>
            <label>
              {t('visibility')}
              <select name="visibility" defaultValue={editing.visibility}>
                <option value="private">{t('private')}</option>
                <option value="public">{t('public')}</option>
              </select>
            </label>
            <p className="cpage-notice">
              {t('visibility-is-a-preview-setting-in-this-demo-records-remain-only')}
            </p>
            {error && (
              <p className="cpage-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="button">
              {t('save-changes')}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function PassportPage({ locale, onNavigate, watchId }: Props) {
  const t: Translate = (key) => translate(locale, key);
  const { state, addPassportEvent, createPassport } = useClub();
  const [selected, setSelected] = useState(
    watchId ? `watch:${watchId}` : (state.passports[0]?.id ?? '')
  );
  useEffect(() => {
    if (watchId) setSelected(`watch:${watchId}`);
  }, [watchId]);
  const [addingEvent, setAddingEvent] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const available = state.watches.filter(
    (watch) =>
      watch.status === 'owned' && !state.passports.some((passport) => passport.watchId === watch.id)
  );
  const passport =
    state.passports.find(
      (item) =>
        item.id === selected ||
        (selected.startsWith('watch:') && item.watchId === selected.slice(6))
    ) ?? state.passports[0];
  const watch = state.watches.find((item) => item.id === passport?.watchId);
  const reference = watchReferences.find((ref) => ref.id === watch?.referenceId);
  const eventTypes = [
    { value: 'Acquisition', label: t('acquisition') },
    { value: 'Maintenance', label: t('maintenance') },
    { value: 'Service', label: t('service') },
    { value: 'Restoration', label: t('restoration') },
    { value: 'Strap change', label: t('strap-change') },
    { value: 'Component replacement', label: t('component-replacement') },
    { value: 'Inspection', label: t('inspection') },
  ];
  function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passport) return;
    const form = new FormData(event.currentTarget);
    try {
      addPassportEvent(passport.id, {
        type: String(form.get('type')),
        date: String(form.get('date')),
        description: String(form.get('description')),
      });
      setAddingEvent(false);
      setMessage(t('event-recorded-in-this-demonstration-passport'));
    } catch {
      setError(t('check-the-event-date-and-description-then-try-again'));
    }
  }
  return (
    <div className="cpage">
      <Heading
        eyebrow={t('horion-passport')}
        title={t('time-documented')}
        description={t('a-living-archive-for-your-watch-preserve-the-details-that-make')}
        action={
          <button className="button-outline" onClick={() => setCreating(true)}>
            <Plus size={16} />
            {t('create-a-passport')}
          </button>
        }
      />
      {state.passports.length > 1 && (
        <label className="cpage-passport-select">
          {t('your-passports')}
          <select value={passport?.id} onChange={(event) => setSelected(event.target.value)}>
            {state.passports.map((item) => {
              const record = state.watches.find((w) => w.id === item.watchId);
              const ref = watchReferences.find((r) => r.id === record?.referenceId);
              return (
                <option value={item.id} key={item.id}>
                  {ref?.brand} {ref?.model}
                </option>
              );
            })}
          </select>
        </label>
      )}
      {passport && reference ? (
        <>
          <section className="cpage-passport">
            <div className="cpage-passport-photo">
              <img src={reference.image} alt={t('illustrative-watch-photograph')} />
              <span>{t('illustrative-photograph')}</span>
            </div>
            <div className="cpage-passport-record">
              <div className="cpage-passport-brand">
                <span>H</span>
                <div>
                  HORION<small>DIGITAL PASSPORT</small>
                </div>
                <ShieldCheck size={27} strokeWidth={1} />
              </div>
              <p className="eyebrow">{reference.brand}</p>
              <h2>{reference.model}</h2>
              <p className="cpage-reference">{reference.reference}</p>
              <dl className="cpage-specs">
                <div>
                  <dt>{t('archive-number')}</dt>
                  <dd className="cpage-reference">{passport.id}</dd>
                </div>
                <div>
                  <dt>{t('created')}</dt>
                  <dd>{formatDate(passport.createdAt, locale)}</dd>
                </div>
                <div>
                  <dt>{t('record-access')}</dt>
                  <dd>
                    <LockKeyhole size={12} />
                    {t('owners-archive')}
                  </dd>
                </div>
                <div>
                  <dt>{t('information-level')}</dt>
                  <dd>{t('owner-declared')}</dd>
                </div>
              </dl>
              <p className="cpage-passport-statement">
                {t('a-record-of-a-watchs-journey-carefully-kept')}
              </p>
            </div>
          </section>
          <p className="cpage-notice">
            <ShieldCheck size={17} />
            {t('demonstration-only-owner-declarations-are-unverified-a-passport-is-not-proof')}
          </p>
          <section className="cpage-section">
            <div className="cpage-section-heading">
              <div>
                <p className="eyebrow">{t('the-archive')}</p>
                <h2>{t('a-history-worth-preserving')}</h2>
              </div>
              <button
                className="button"
                onClick={() => {
                  setError('');
                  setAddingEvent(true);
                }}
              >
                <Plus size={16} />
                {t('record-an-event')}
              </button>
            </div>
            {message && (
              <p className="cpage-success" role="status">
                <Check size={15} />
                {message}
              </p>
            )}
            <div className="cpage-timeline">
              {[...passport.events]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((event) => (
                  <article className="cpage-event" key={event.id}>
                    <div className="cpage-event-dot" />
                    <time dateTime={event.date}>{formatDate(event.date, locale)}</time>
                    <div>
                      <p className="eyebrow">
                        {eventTypes.find((type) => type.value === event.type)?.label ?? event.type}
                      </p>
                      <p>{event.description}</p>
                      <span className="cpage-verification">
                        <span />
                        {t('owner-declared')}
                      </span>
                    </div>
                  </article>
                ))}
            </div>
            {!passport.events.length && (
              <Empty
                title={t('your-archive-is-ready')}
                text={t('record-the-acquisition-a-service-or-a-detail-worth-remembering')}
              />
            )}
          </section>
          <section className="cpage-document-section">
            <FileText size={28} strokeWidth={1.2} />
            <div>
              <h3>{t('documents-kept-private')}</h3>
              <p>
                {t(
                  'private-document-uploads-become-available-after-supabase-storage-and-access-policies'
                )}
              </p>
            </div>
            <span className="cpage-soon">{t('setup-required')}</span>
          </section>
        </>
      ) : (
        <Empty
          title={t('every-watch-deserves-an-archive')}
          text={t('add-a-watch-you-own-to-your-collection-then-create-its')}
          action={
            <button className="button" onClick={() => onNavigate('collection')}>
              {t('open-my-collection')} <ArrowRight size={16} />
            </button>
          }
        />
      )}
      {creating && (
        <Modal
          locale={locale}
          title={t('create-a-digital-passport')}
          onClose={() => setCreating(false)}
        >
          {available.length ? (
            <>
              <p>{t('choose-a-watch-you-currently-own-the-passport-starts-as-an')}</p>
              {error && (
                <p className="cpage-error" role="alert">
                  {error}
                </p>
              )}
              <div className="cpage-passport-options">
                {available.map((w) => {
                  const ref = watchReferences.find((r) => r.id === w.referenceId);
                  return (
                    <button
                      key={w.id}
                      className="cpage-result"
                      onClick={() => {
                        try {
                          createPassport(w.id);
                          setCreating(false);
                          setSelected(`watch:${w.id}`);
                        } catch {
                          setError(
                            t('this-watch-is-not-eligible-for-a-passport-choose-a-currently')
                          );
                        }
                      }}
                    >
                      <img src={ref?.image} alt="" />
                      <div>
                        <h3>
                          {ref?.brand} {ref?.model}
                        </h3>
                        <p className="cpage-reference">{ref?.reference}</p>
                      </div>
                      <Plus size={18} />
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <Empty
              title={t('your-owned-watches-are-up-to-date')}
              text={t('every-eligible-watch-already-has-a-passport-or-your-collection-has')}
              action={
                <button
                  className="button-outline"
                  onClick={() => {
                    setCreating(false);
                    onNavigate('collection');
                  }}
                >
                  {t('manage-collection')}
                </button>
              }
            />
          )}
        </Modal>
      )}
      {addingEvent && (
        <Modal
          locale={locale}
          title={t('add-to-the-archive')}
          onClose={() => setAddingEvent(false)}
        >
          <form className="cpage-form" onSubmit={submitEvent}>
            <label>
              {t('event-type')}
              <select name="type">
                {eventTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('date')}
              <input
                name="date"
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label>
              {t('what-would-you-like-to-record')}
              <textarea
                name="description"
                required
                minLength={3}
                maxLength={3000}
                rows={4}
                placeholder={t('a-factual-description-without-sensitive-personal-details')}
              />
            </label>
            <p className="cpage-notice">
              {t('this-entry-will-be-labeled-owner-declared-attaching-a-document-never')}
            </p>
            {error && (
              <p role="alert" className="cpage-error">
                {error}
              </p>
            )}
            <button type="submit" className="button">
              {t('record-event')}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

const journalArticles: {
  id: string;
  category: TranslationKey;
  title: TranslationKey;
  excerpt: TranslationKey;
  image: string;
  reading: number;
  sections: [TranslationKey, TranslationKey][];
}[] = [
  {
    id: 'first-collection',
    category: 'collecting',
    title: 'your-first-collection-starts-with-curiosity',
    excerpt: 'a-thoughtful-approach-to-finding-a-watch-that-belongs-in-your',
    image: '/images/watch-field.jpg',
    reading: 4,
    sections: [
      [
        'begin-with-your-everyday-life',
        'before-comparing-references-ask-when-you-will-wear-the-watch-the',
      ],
      ['learn-before-you-add', 'visit-a-watchmaker-try-different-case-sizes-and-ask-owners-what'],
      ['keep-the-story', 'a-photograph-an-acquisition-date-and-a-few-notes-are-enough'],
    ],
  },
  {
    id: 'service-history',
    category: 'the-archive',
    title: 'what-a-service-history-can-tell-you',
    excerpt: 'good-records-bring-context-knowing-their-limits-matters-just-as-much',
    image: '/images/watch-detail.jpg',
    reading: 5,
    sections: [
      ['record-the-facts', 'a-service-record-is-most-useful-when-it-identifies-a-date'],
      [
        'preserve-the-details',
        'photographs-taken-before-and-after-work-can-document-visible-changes-notes',
      ],
      ['understand-the-limits', 'a-document-is-a-piece-of-evidence-not-an-automatic-guarantee'],
    ],
  },
  {
    id: 'vintage-questions',
    category: 'buying-guides',
    title: 'the-questions-to-ask-about-a-vintage-watch',
    excerpt: 'a-considered-conversation-before-a-considered-purchase',
    image: '/images/watch-vintage.jpg',
    reading: 4,
    sections: [
      [
        'ask-about-the-object-not-the-legend',
        'an-appealing-story-deserves-careful-questions-ask-what-is-known-about',
      ],
      [
        'look-beyond-the-first-photograph',
        'request-clear-photographs-from-several-angles-and-discuss-the-condition-of',
      ],
      [
        'make-space-for-maintenance',
        'ask-an-independent-watchmaker-about-inspection-and-possible-service-before-you',
      ],
    ],
  },
];

function JournalPage({ locale }: Props) {
  const t: Translate = (key) => translate(locale, key);
  const [article, setArticle] = useState<(typeof journalArticles)[number] | null>(null);
  return (
    <div className="cpage">
      <Heading
        eyebrow={t('horion-journal')}
        title={t('for-the-love-of-the-details')}
        description={t('stories-ideas-and-a-closer-look-at-the-objects-that-measure')}
      />
      <div className="cpage-journal-grid">
        {journalArticles.map((item, index) => (
          <article
            className={
              index === 0 ? 'cpage-journal-card cpage-journal-featured' : 'cpage-journal-card'
            }
            key={item.id}
          >
            <button onClick={() => setArticle(item)}>
              <img
                src={item.image}
                alt={t('illustrative-editorial-watch-photograph')}
                loading="lazy"
              />
            </button>
            <div>
              <p className="eyebrow">
                {t(item.category)} · {item.reading} MIN
              </p>
              <button className="cpage-title-button" onClick={() => setArticle(item)}>
                <h2>{t(item.title)}</h2>
              </button>
              <p>{t(item.excerpt)}</p>
              <button className="cpage-text-link" onClick={() => setArticle(item)}>
                {t('read-the-story')} <ArrowRight size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
      <p className="cpage-footnote">
        {t(
          'original-editorial-drafts-created-for-this-demonstration-illustrative-photography-no-third'
        )}
      </p>
      {article && (
        <Modal
          locale={locale}
          title={t('horion-journal-editorial-draft')}
          onClose={() => setArticle(null)}
        >
          <article className="cpage-article">
            <p className="eyebrow">{t(article.category)}</p>
            <h1>{t(article.title)}</h1>
            <p className="cpage-article-intro">{t(article.excerpt)}</p>
            <img src={article.image} alt={t('illustrative-watch-photograph')} />
            {article.sections.map((section, index) => (
              <section key={index}>
                <h2>{t(section[0])}</h2>
                <p>{t(section[1])}</p>
              </section>
            ))}
            <p className="cpage-footnote">
              {t(
                'horion-editorial-demonstration-general-educational-content-not-a-valuation-or-authentication'
              )}
            </p>
          </article>
        </Modal>
      )}
    </div>
  );
}

function SocietyPage({ locale }: Props) {
  const t: Translate = (key) => translate(locale, key);
  const [details, setDetails] = useState(false);
  const free = [
    t('community-posts-and-conversations'),
    t('the-watch-catalog'),
    t('your-personal-collection'),
    t('basic-digital-passports'),
    t('reputation-earned-through-contribution'),
  ];
  const premium = [
    t('advanced-passport-records'),
    t('collection-reports-and-exports'),
    t('advanced-organization-and-statistics'),
    t('selected-editorial-content'),
    t('partner-experiences-when-available'),
  ];
  return (
    <div className="cpage">
      <section className="cpage-society-hero">
        <div className="cpage-society-mark">H</div>
        <p className="eyebrow">HORION SOCIETY</p>
        <h1>{t('a-deeper-connection-to-what-you-collect')}</h1>
        <p>{t('more-ways-to-care-for-your-collection-the-same-place-at')}</p>
        <span className="cpage-society-status">{t('in-development-no-payments-enabled')}</span>
      </section>
      <div className="cpage-plans">
        <article>
          <p className="eyebrow">WATCH CLUB</p>
          <h2>{t('a-passion-shared')}</h2>
          <p className="cpage-plan-price">{t('always-a-place-for-you')}</p>
          <p>{t('the-essentials-belong-to-every-enthusiast-regardless-of-the-value-of')}</p>
          <ul>
            {free.map((item) => (
              <li key={item}>
                <Check size={16} />
                {item}
              </li>
            ))}
          </ul>
          <span className="cpage-plan-label">{t('free-membership')}</span>
        </article>
        <article className="cpage-premium-plan">
          <p className="eyebrow">SOCIETY</p>
          <h2>{t('for-the-chapters-ahead')}</h2>
          <p className="cpage-plan-price">{t('tools-for-a-considered-collection')}</p>
          <p>
            {t('a-planned-membership-with-additional-tools-and-experiences-community-merit-is')}
          </p>
          <ul>
            {premium.map((item) => (
              <li key={item}>
                <Check size={16} />
                {item}
              </li>
            ))}
          </ul>
          <button className="button" onClick={() => setDetails(true)}>
            {t('explore-the-proposal')} <ArrowRight size={16} />
          </button>
        </article>
      </div>
      <p className="cpage-footnote">
        {t('reputation-and-merit-badges-are-independent-of-membership-horion-exchange-and')}
      </p>
      {details && (
        <Modal locale={locale} title={t('the-society-proposal')} onClose={() => setDetails(false)}>
          <p>{t('society-is-planned-as-an-optional-toolset-alongside-the-open-watch')}</p>
          <p>{t('the-initial-brazilian-commercial-hypothesis-is-r-24-90-per-month')}</p>
          <p className="cpage-notice">
            {t('no-card-details-are-requested-or-stored-no-partners-or-exclusive')}
          </p>
        </Modal>
      )}
    </div>
  );
}

function ProfilePage({ locale, onNavigate }: Props) {
  const t: Translate = (key) => translate(locale, key);
  const { state, updateProfile } = useClub();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const ownPosts = state.posts.filter(
    (post) => post.username === state.profile.username && !post.hidden
  );
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      updateProfile({
        name: String(form.get('name')),
        username: String(form.get('username')),
        bio: String(form.get('bio') ?? ''),
        country: String(form.get('country') ?? ''),
      });
      setEditing(false);
      setSaved(true);
    } catch {
      setError(t('use-a-name-of-2-60-characters-and-a-username-of'));
    }
  }
  return (
    <div className="cpage">
      <div className="cpage-profile-cover">
        <span>{t('the-people-behind-the-watches')}</span>
        <div className="cpage-profile-monogram">
          {state.profile.name
            .split(' ')
            .map((part) => part.charAt(0))
            .slice(0, 2)
            .join('')}
        </div>
      </div>
      <header className="cpage-profile-head">
        <div>
          <p className="eyebrow">{t('demonstration-member')}</p>
          <h1>{state.profile.name}</h1>
          <p className="cpage-username">@{state.profile.username}</p>
          <p>{state.profile.bio}</p>
          {state.profile.country && (
            <p className="cpage-profile-location">
              <Globe2 size={14} />
              {state.profile.country}
            </p>
          )}
        </div>
        <button
          className="button-outline"
          onClick={() => {
            setError('');
            setEditing(true);
          }}
        >
          {t('edit-profile')}
        </button>
      </header>
      {saved && (
        <p role="status" className="cpage-success">
          <Check size={15} />
          {t('profile-updated-in-this-browser')}
        </p>
      )}
      <div className="cpage-profile-stats">
        <div>
          <strong>{ownPosts.length}</strong>
          <span>{t('posts')}</span>
        </div>
        <div>
          <strong>{state.joined.length}</strong>
          <span>{t('communities-2')}</span>
        </div>
        <div>
          <strong>{state.watches.filter((watch) => watch.status === 'owned').length}</strong>
          <span>{t('watches')}</span>
        </div>
      </div>
      <section className="cpage-section">
        <div className="cpage-section-heading">
          <h2>{t('your-contributions')}</h2>
          <button className="cpage-text-link" onClick={() => onNavigate('home')}>
            {t('open-the-club')} <ArrowRight size={15} />
          </button>
        </div>
        {ownPosts.length ? (
          ownPosts.map((post) => (
            <button
              className="cpage-search-post"
              key={post.id}
              onClick={() => onNavigate(`home?post=${post.id}`)}
            >
              <div>
                <p className="eyebrow">{post.community}</p>
                <h3>{post.title}</h3>
                <p>{formatDate(post.createdAt, locale)}</p>
              </div>
              <ArrowRight size={16} />
            </button>
          ))
        ) : (
          <Empty
            title={t('a-perspective-only-you-can-share')}
            text={t('your-original-posts-will-appear-here-start-with-a-question-or')}
          />
        )}
      </section>
      <section className="cpage-section">
        <div className="cpage-section-heading">
          <h2>{t('reputation-distinctions')}</h2>
        </div>
        <div className="cpage-info-strip">
          <ShieldCheck size={25} strokeWidth={1.3} />
          <div>
            <h3>{t('merit-grows-through-contribution')}</h3>
            <p>{t('no-merit-points-or-badges-have-been-awarded-to-this-demonstration')}</p>
          </div>
        </div>
      </section>
      {editing && (
        <Modal locale={locale} title={t('edit-your-profile')} onClose={() => setEditing(false)}>
          <form className="cpage-form" onSubmit={save}>
            <label>
              {t('display-name')}
              <input
                name="name"
                required
                minLength={2}
                maxLength={60}
                defaultValue={state.profile.name}
                autoComplete="name"
              />
            </label>
            <label>
              {t('username')}
              <input
                name="username"
                required
                minLength={3}
                maxLength={24}
                pattern="[a-z0-9_]+"
                defaultValue={state.profile.username}
                autoComplete="username"
              />
              <small>{t('lowercase-letters-numbers-and-underscores')}</small>
            </label>
            <label>
              {t('biography')}
              <textarea name="bio" maxLength={500} defaultValue={state.profile.bio} rows={3} />
            </label>
            <label>
              {t('country-optional')}
              <input
                name="country"
                maxLength={60}
                defaultValue={state.profile.country}
                autoComplete="country-name"
              />
            </label>
            <p className="cpage-notice">
              {t('this-is-a-local-demonstration-profile-no-account-is-created-and')}
            </p>
            {error && (
              <p className="cpage-error" role="alert">
                {error}
              </p>
            )}
            <button className="button" type="submit">
              {t('save-profile')}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function NotificationsPage({ locale, onNavigate }: Props) {
  const t: Translate = (key) => translate(locale, key);
  const { state, markNotificationsRead } = useClub();
  const unread = state.notifications.filter((item) => !item.read).length;
  return (
    <div className="cpage">
      <Heading
        eyebrow={t('horion-notifications')}
        title={t('from-your-corner-of-the-club')}
        description={t('replies-new-chapters-and-the-conversations-worth-coming-back-to')}
        action={
          <button className="button-outline" disabled={!unread} onClick={markNotificationsRead}>
            <Check size={15} />
            {t('mark-all-as-read')}
          </button>
        }
      />
      <div className="cpage-notifications">
        {state.notifications.map((notification) => (
          <article
            className={notification.read ? 'cpage-notification' : 'cpage-notification unread'}
            key={notification.id}
          >
            <span className="cpage-notification-dot" />
            <div>
              <p>{notification.title}</p>
              <small>
                {notification.read ? t('read') : t('unread')} · {t('demonstration-notification')}
              </small>
            </div>
            <button
              className="cpage-icon-button"
              aria-label={t('open-collection')}
              onClick={() => onNavigate('collection')}
            >
              <ArrowRight size={18} />
            </button>
          </article>
        ))}
      </div>
      {!state.notifications.length && (
        <Empty title={t('all-quiet-for-now')} text={t('new-activity-will-appear-here')} />
      )}
      <p className="cpage-footnote">
        {t('email-and-push-notifications-are-not-active-these-sample-notifications-are')}
      </p>
    </div>
  );
}

function SettingsPage({ locale, onNavigate }: Props) {
  const t: Translate = (key) => translate(locale, key);
  const { resetDemo, exportDemo, storageError } = useClub();
  const [theme, setTheme] = useState('light');
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('horion-theme');
      setTheme(saved === 'dark' ? 'dark' : 'light');
    } catch {
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    }
  }, []);
  function changeTheme(value: string) {
    setTheme(value);
    document.documentElement.dataset.theme = value;
    try {
      localStorage.setItem('horion-theme', value);
    } catch {
      setMessage(t('theme-updated-for-this-visit-your-browser-could-not-save-it'));
    }
  }
  return (
    <div className="cpage">
      <Heading
        eyebrow={t('horion-settings')}
        title={t('make-yourself-at-home')}
        description={t('a-few-thoughtful-preferences-for-the-way-you-spend-time-here')}
      />
      <div className="cpage-settings">
        <section>
          <div>
            <h2>{t('language')}</h2>
            <p>{t('interface-language-community-content-stays-in-its-original-language')}</p>
          </div>
          <label className="cpage-select">
            <Globe2 size={16} />
            <select
              value={locale}
              aria-label={t('interface-language')}
              onChange={(event) => {
                window.location.assign(`/${event.target.value}/settings`);
              }}
            >
              <option value="en">English</option>
              <option value="pt-BR">Português (Brasil)</option>
            </select>
          </label>
        </section>
        <section>
          <div>
            <h2>{t('appearance')}</h2>
            <p>{t('warm-paper-or-a-quieter-evening-motion-follows-your-devices-accessibility')}</p>
          </div>
          <label className="cpage-select">
            <select
              value={theme}
              onChange={(event) => changeTheme(event.target.value)}
              aria-label={t('color-theme')}
            >
              <option value="light">{t('light-ivory')}</option>
              <option value="dark">{t('dark-charcoal')}</option>
            </select>
          </label>
        </section>
        <section>
          <div>
            <h2>{t('your-profile')}</h2>
            <p>{t('manage-your-display-name-biography-and-optional-country')}</p>
          </div>
          <button className="button-outline" onClick={() => onNavigate('profile')}>
            {t('open-profile')} <ArrowRight size={15} />
          </button>
        </section>
        <section>
          <div>
            <h2>{t('export-your-demonstration-data')}</h2>
            <p>{t('download-a-json-copy-of-your-local-profile-posts-collection-and')}</p>
          </div>
          <button
            className="button-outline"
            onClick={() => {
              exportDemo();
              setMessage(t('your-demonstration-data-was-prepared-for-download'));
            }}
          >
            <ArrowDownToLine size={16} />
            {t('export-json')}
          </button>
        </section>
        <section>
          <div>
            <h2>{t('restore-the-demonstration')}</h2>
            <p>{t('remove-changes-made-in-this-browser-and-restore-the-fictional-starting')}</p>
          </div>
          <button className="button-outline cpage-danger" onClick={() => setResetting(true)}>
            {t('restore-demo')}
          </button>
        </section>
      </div>
      {(message || storageError) && (
        <p className={storageError ? 'cpage-error' : 'cpage-success'} role="status">
          {storageError ? t('browser-storage-unavailable') : message}
        </p>
      )}
      <aside className="cpage-info-strip">
        <LockKeyhole size={24} strokeWidth={1.3} />
        <div>
          <h3>{t('about-this-environment')}</h3>
          <p>{t('local-demonstration-data-uses-browser-storage-it-is-not-encrypted-private')}</p>
        </div>
      </aside>
      {resetting && (
        <Modal
          locale={locale}
          title={t('restore-the-demonstration-2')}
          onClose={() => setResetting(false)}
        >
          <p>
            {t('your-local-posts-comments-profile-edits-collection-changes-and-passport-events')}
          </p>
          <div className="cpage-form-actions">
            <button className="button-outline" onClick={() => setResetting(false)}>
              {t('keep-my-changes')}
            </button>
            <button
              className="button"
              onClick={() => {
                resetDemo();
                setResetting(false);
                setMessage(t('the-demonstration-has-been-restored'));
              }}
            >
              {t('restore-demo')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AdminPage({ locale }: Props) {
  const t: Translate = (key) => translate(locale, key);
  const { state, moderatePost } = useClub();
  const [selected, setSelected] = useState<string | null>(null);
  const openReports = state.reports.filter((report) => report.status === 'open');
  return (
    <div className="cpage">
      <Heading
        eyebrow={t('horion-moderation-sandbox')}
        title={t('care-for-the-conversation')}
        description={t('a-local-demonstration-of-the-report-and-review-workflow')}
      />
      <p className="cpage-notice">
        <LockKeyhole size={16} />
        {t('this-is-a-public-demo-sandbox-not-an-administrative-account-actions')}
      </p>
      <div className="cpage-profile-stats">
        <div>
          <strong>{openReports.length}</strong>
          <span>{t('open-reports')}</span>
        </div>
        <div>
          <strong>{state.posts.filter((post) => post.hidden).length}</strong>
          <span>{t('hidden-posts')}</span>
        </div>
        <div>
          <strong>{state.reports.filter((report) => report.status === 'resolved').length}</strong>
          <span>{t('resolved-reports')}</span>
        </div>
      </div>
      <section className="cpage-section">
        <div className="cpage-section-heading">
          <h2>{t('review-queue')}</h2>
        </div>
        {openReports.length ? (
          openReports.map((report) => {
            const post = state.posts.find((item) => item.id === report.postId);
            return (
              <article className="cpage-report" key={report.id}>
                <div>
                  <p className="eyebrow">{t('member-report')}</p>
                  <h3>{post?.title ?? t('post-unavailable')}</h3>
                  <p>{report.reason}</p>
                  <small className="cpage-reference">{report.id}</small>
                </div>
                <button className="button-outline" onClick={() => setSelected(report.postId)}>
                  {t('review-post')}
                </button>
              </article>
            );
          })
        ) : (
          <Empty
            title={t('the-queue-is-clear')}
            text={t('use-report-on-a-feed-post-to-try-the-local-moderation')}
          />
        )}
      </section>
      <section className="cpage-section">
        <h2>{t('administration-foundation')}</h2>
        <p className="cpage-muted">
          {t('user-management-catalog-approvals-billing-events-reputation-awards-and-audit-logs')}
        </p>
      </section>
      {selected && (
        <Modal locale={locale} title={t('review-reported-post')} onClose={() => setSelected(null)}>
          {(() => {
            const post = state.posts.find((item) => item.id === selected);
            return (
              <>
                <p className="eyebrow">
                  {post?.community} · {post?.author}
                </p>
                <h3>{post?.title}</h3>
                <p className="cpage-post-body">{post?.body}</p>
                <div className="cpage-form-actions">
                  <button className="button-outline" onClick={() => setSelected(null)}>
                    {t('keep-for-review')}
                  </button>
                  <button
                    className="button"
                    onClick={() => {
                      moderatePost(selected);
                      setSelected(null);
                    }}
                  >
                    {t('hide-post-resolve-reports')}
                  </button>
                </div>
                <p className="cpage-footnote">
                  {t('local-demonstration-action-the-post-will-be-hidden-from-this-browsers')}
                </p>
              </>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}

export function ClubPage(props: Props) {
  const routes: Record<string, (props: Props) => ReactNode> = {
    explore: ExplorePage,
    communities: CommunitiesPage,
    watches: WatchesPage,
    collection: CollectionPage,
    passport: PassportPage,
    journal: JournalPage,
    society: SocietyPage,
    profile: ProfilePage,
    notifications: NotificationsPage,
    settings: SettingsPage,
    admin: AdminPage,
  };
  const Page = routes[props.page.split('?')[0]];
  if (!Page)
    return (
      <Empty
        title={translate(props.locale, 'a-new-chapter-is-ahead')}
        text={translate(props.locale, 'this-area-is-not-available-yet')}
        action={
          <button className="button-outline" onClick={() => props.onNavigate('home')}>
            {translate(props.locale, 'back-to-the-club')}
          </button>
        }
      />
    );
  return <Page {...props} />;
}
