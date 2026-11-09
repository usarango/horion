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
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  Users,
  Watch,
  X,
} from 'lucide-react';
import type { Locale, UserWatch, WatchReference, WatchStatus } from '@/lib/domain';
import { useClub, type MemberProfile } from '@/lib/store';
import './pages.css';

type Props = {
  page: string;
  locale: Locale;
  onNavigate: (page: string) => void;
  onCompose: () => void;
  onAccount: () => void;
  query?: string;
  watchId?: string;
};
type T = (en: string, pt: string) => string;
const translator =
  (locale: Locale): T =>
  (en, pt) =>
    locale === 'pt-BR' ? pt : en;
const dateLabel = (value: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
const safeWebsite = (value: string) => {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};
function useAction(locale: Locale) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const t = translator(locale);
  async function run(task: () => Promise<unknown>, success = '') {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await task();
      setMessage(success);
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message
          ? reason.message
          : t(
              'The operation could not be completed. Please try again.',
              'Não foi possível concluir a operação. Tente novamente.'
            )
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  function clear() {
    setError('');
    setMessage('');
  }
  return { busy, error, message, run, clear };
}
type ActionFeedback = ReturnType<typeof useAction>;
function Feedback({ action }: { action: ActionFeedback }) {
  return (
    <>
      {action.error && (
        <p className="cpage-error" role="alert">
          {action.error}
        </p>
      )}
      {action.message && (
        <p className="cpage-success" role="status">
          <Check size={15} />
          {action.message}
        </p>
      )}
    </>
  );
}
function Modal({
  title,
  children,
  onClose,
  t,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  t: T;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = ref.current;
    const previous = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="cpage-dialog"
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div className="cpage-dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button className="cpage-icon-button" aria-label={t('Close', 'Fechar')} onClick={onClose}>
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
function SearchBox({
  value,
  setValue,
  label,
}: {
  value: string;
  setValue: (value: string) => void;
  label: string;
}) {
  return (
    <label className="cpage-search">
      <Search size={18} />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={label}
        aria-label={label}
      />
    </label>
  );
}
function MemberGate({
  props,
  title,
  children,
}: {
  props: Props;
  title: string;
  children: ReactNode;
}) {
  const { auth } = useClub();
  const t = translator(props.locale);
  if (auth.status === 'member') return <>{children}</>;
  return (
    <div className="cpage">
      <Heading
        eyebrow="HORION WATCH CLUB"
        title={title}
        description={t(
          'Your watches, your records and your place in the club.',
          'Seus relógios, seus registros e seu lugar no clube.'
        )}
      />
      <Empty
        title={
          auth.user
            ? t('Complete your member profile.', 'Complete seu perfil de membro.')
            : t('Your story starts with you.', 'Sua história começa com você.')
        }
        text={
          auth.user
            ? t(
                'Choose your Horion username to start using your collection and profile.',
                'Escolha seu nome de usuário no Horion para começar a usar sua coleção e seu perfil.'
              )
            : t(
                'Create an account or sign in to manage your own records.',
                'Crie uma conta ou entre para gerenciar seus registros.'
              )
        }
        action={
          <button className="button" onClick={props.onAccount}>
            {auth.user
              ? t('Join Horion', 'Participar do Horion')
              : t('Create account / Sign in', 'Criar conta / Entrar')}
            <ArrowRight size={16} />
          </button>
        }
      />
    </div>
  );
}
function WatchVisual({ image, label }: { image?: string; label: string }) {
  return image ? (
    <img src={image} alt={label} loading="lazy" />
  ) : (
    <div className="cpage-watch-placeholder" aria-label={label}>
      <Watch size={58} strokeWidth={0.8} />
    </div>
  );
}
function MemberDetails({
  member,
  t,
  onClose,
}: {
  member: MemberProfile;
  t: T;
  onClose: () => void;
}) {
  const website = safeWebsite(member.website || '');
  return (
    <Modal title={member.name} t={t} onClose={onClose}>
      <div className="cpage-member-detail">
        <span className="cpage-member-avatar">{initials(member.name)}</span>
        <p className="eyebrow">
          {member.accountType === 'store'
            ? t('STORE PROFILE', 'PERFIL DE LOJA')
            : t('MEMBER PROFILE', 'PERFIL DE MEMBRO')}
        </p>
        <p>@{member.username}</p>
        {member.bio && <p className="cpage-post-body">{member.bio}</p>}
        <dl className="cpage-specs">
          {member.country && (
            <div>
              <dt>{t('Country', 'País')}</dt>
              <dd>{member.country}</dd>
            </div>
          )}
          {member.contact && (
            <div>
              <dt>{t('Public contact', 'Contato público')}</dt>
              <dd>{member.contact}</dd>
            </div>
          )}
          {website && (
            <div>
              <dt>{t('Website', 'Site')}</dt>
              <dd>
                <a href={website} target="_blank" rel="noopener noreferrer">
                  {new URL(website).host} ↗
                </a>
              </dd>
            </div>
          )}
        </dl>
        {member.accountType === 'store' && (
          <p className="cpage-footnote">
            {t(
              'A store profile describes the account type. It does not indicate Horion verification, professional accreditation or a sales guarantee.',
              'O perfil de loja identifica o tipo de conta. Ele não indica verificação pelo Horion, credencial profissional ou garantia comercial.'
            )}
          </p>
        )}
      </div>
    </Modal>
  );
}
function MemberList({ members, t }: { members: MemberProfile[]; t: T }) {
  const [selected, setSelected] = useState<MemberProfile | null>(null);
  return (
    <>
      <div className="cpage-compact-grid">
        {members.map((member) => (
          <button key={member.id} className="cpage-result" onClick={() => setSelected(member)}>
            <span className="cpage-member-avatar">{initials(member.name)}</span>
            <div>
              <h3>{member.name}</h3>
              <p>
                @{member.username} ·{' '}
                {member.accountType === 'store' ? t('Store', 'Loja') : t('Member', 'Membro')}
              </p>
            </div>
            <ChevronRight size={18} />
          </button>
        ))}
      </div>
      {selected && <MemberDetails member={selected} t={t} onClose={() => setSelected(null)} />}
    </>
  );
}
function ReferenceCard({
  reference,
  t,
  onSelect,
}: {
  reference: WatchReference;
  t: T;
  onSelect: () => void;
}) {
  return (
    <article className="cpage-watch-card">
      <button
        className="cpage-watch-image"
        onClick={onSelect}
        aria-label={`${t('View reference', 'Ver referência')}: ${reference.brand} ${reference.model}`}
      >
        <WatchVisual image={reference.image} label={`${reference.brand} ${reference.model}`} />
      </button>
      <div className="cpage-watch-caption">
        <p className="eyebrow">{reference.brand}</p>
        <h3>{reference.model}</h3>
        <p className="cpage-reference">{reference.reference}</p>
        <button className="cpage-text-link" onClick={onSelect}>
          {t('View reference', 'Ver referência')}
          <ArrowRight size={14} />
        </button>
      </div>
    </article>
  );
}
function ReferenceDetails({
  reference,
  props,
  onClose,
}: {
  reference: WatchReference;
  props: Props;
  onClose: () => void;
}) {
  const { auth, state, addWatch } = useClub();
  const t = translator(props.locale);
  const action = useAction(props.locale);
  const existing = state.watches.some(
    (watch) => watch.referenceId === reference.id && watch.status === 'wishlist'
  );
  const source = safeWebsite(reference.source || '');
  return (
    <Modal title={`${reference.brand} ${reference.model}`} t={t} onClose={onClose}>
      <WatchVisual image={reference.image} label={`${reference.brand} ${reference.model}`} />
      <p className="cpage-reference cpage-large-ref">{reference.reference}</p>
      <dl className="cpage-specs">
        <div>
          <dt>{t('Brand', 'Marca')}</dt>
          <dd>{reference.brand}</dd>
        </div>
        <div>
          <dt>{t('Model', 'Modelo')}</dt>
          <dd>{reference.model}</dd>
        </div>
        {reference.category && (
          <div>
            <dt>{t('Category', 'Categoria')}</dt>
            <dd>{reference.category}</dd>
          </div>
        )}
        {reference.movement && (
          <div>
            <dt>{t('Movement', 'Movimento')}</dt>
            <dd>{reference.movement}</dd>
          </div>
        )}
      </dl>
      {source ? (
        <a className="cpage-text-link" href={source} target="_blank" rel="noopener noreferrer">
          {t('Catalog source', 'Fonte do catálogo')} ↗
        </a>
      ) : (
        <p className="cpage-footnote">
          {t(
            'No source has been linked to this entry yet.',
            'Nenhuma fonte foi vinculada a esta entrada ainda.'
          )}
        </p>
      )}
      <Feedback action={action} />
      <div className="cpage-form-actions">
        <button
          className="button"
          disabled={action.busy || existing}
          onClick={async () => {
            if (auth.status !== 'member') {
              onClose();
              props.onAccount();
              return;
            }
            await action.run(
              () => addWatch(reference.id, 'wishlist'),
              t('Added to your wishlist.', 'Adicionado à sua lista de desejos.')
            );
          }}
        >
          {existing
            ? t('In your wishlist', 'Na sua lista de desejos')
            : action.busy
              ? t('Saving…', 'Salvando…')
              : t('Add to wishlist', 'Adicionar aos desejos')}
        </button>
      </div>
    </Modal>
  );
}

function ExplorePage(props: Props) {
  const { state } = useClub();
  const t = translator(props.locale);
  const [query, setQuery] = useState(props.query || '');
  const [selected, setSelected] = useState<WatchReference | null>(null);
  const [kind, setKind] = useState('all');
  useEffect(() => setQuery(props.query || ''), [props.query]);
  const match = (value: string) =>
    value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const references = state.references.filter((ref) =>
    match(`${ref.brand} ${ref.model} ${ref.reference}`)
  );
  const communities = state.communities.filter((community) =>
    match(`${community.name} ${community.description}`)
  );
  const posts = state.posts.filter(
    (post) => !post.hidden && match(`${post.title} ${post.body} ${post.author}`)
  );
  const members = state.members.filter(
    (member) =>
      match(`${member.name} ${member.username} ${member.bio}`) &&
      (kind === 'all' || member.accountType === kind)
  );
  return (
    <div className="cpage">
      <Heading
        eyebrow={t('HORION / EXPLORE', 'HORION / EXPLORAR')}
        title={t('Follow your curiosity.', 'Siga sua curiosidade.')}
        description={t(
          'Discover watches, conversations and the people behind them.',
          'Descubra relógios, conversas e as pessoas por trás deles.'
        )}
      />
      <SearchBox
        value={query}
        setValue={setQuery}
        label={t(
          'Search watches, communities, posts and members…',
          'Busque relógios, comunidades, publicações e membros…'
        )}
      />
      <section className="cpage-section">
        <div className="cpage-section-heading">
          <h2>{t('Members & stores', 'Membros e lojas')}</h2>
          <label className="cpage-select">
            <select
              aria-label={t('Profile type', 'Tipo de perfil')}
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="all">{t('All profiles', 'Todos os perfis')}</option>
              <option value="member">{t('Members', 'Membros')}</option>
              <option value="store">{t('Stores', 'Lojas')}</option>
            </select>
          </label>
        </div>
        <MemberList members={members} t={t} />
        {!members.length && (
          <Empty
            title={t('Meet the first members.', 'Conheça os primeiros membros.')}
            text={t(
              'Public member and store profiles will appear here as people join Horion.',
              'Os perfis públicos de membros e lojas aparecerão aqui conforme as pessoas entrarem no Horion.'
            )}
          />
        )}
      </section>
      <section className="cpage-section">
        <div className="cpage-section-heading">
          <h2>{t('Communities', 'Comunidades')}</h2>
          <button className="cpage-text-link" onClick={() => props.onNavigate('communities')}>
            {t('Open communities', 'Abrir comunidades')}
            <ArrowRight size={15} />
          </button>
        </div>
        <div className="cpage-compact-grid">
          {communities.map((community) => (
            <button
              key={community.id}
              className="cpage-result"
              onClick={() =>
                props.onNavigate(`communities?community=${encodeURIComponent(community.slug)}`)
              }
            >
              <span className="cpage-member-avatar">{initials(community.name)}</span>
              <div>
                <h3>{community.name}</h3>
                <p>{community.description}</p>
              </div>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
        {!communities.length && (
          <p className="cpage-muted">
            {t('No communities match this search.', 'Nenhuma comunidade corresponde a esta busca.')}
          </p>
        )}
      </section>
      <section className="cpage-section">
        <div className="cpage-section-heading">
          <h2>{t('Watches & references', 'Relógios e referências')}</h2>
        </div>
        <div className="cpage-watch-grid">
          {references.map((reference) => (
            <ReferenceCard
              key={reference.id}
              reference={reference}
              t={t}
              onSelect={() => setSelected(reference)}
            />
          ))}
        </div>
        {!references.length && (
          <p className="cpage-muted">
            {t(
              'No catalog references match this search.',
              'Nenhuma referência do catálogo corresponde a esta busca.'
            )}
          </p>
        )}
      </section>
      <section className="cpage-section">
        <div className="cpage-section-heading">
          <h2>{t('Conversations', 'Conversas')}</h2>
        </div>
        {posts.map((post) => (
          <button
            key={post.id}
            className="cpage-search-post"
            onClick={() => props.onNavigate(`home?post=${encodeURIComponent(post.id)}`)}
          >
            <div>
              <p className="eyebrow">{post.author}</p>
              <h3>{post.title}</h3>
              <p>
                {post.comments.length} {t('comments', 'comentários')}
              </p>
            </div>
            <ArrowRight size={18} />
          </button>
        ))}
        {!posts.length && (
          <p className="cpage-muted">
            {t('No conversations match this search.', 'Nenhuma conversa corresponde a esta busca.')}
          </p>
        )}
      </section>
      {selected && (
        <ReferenceDetails reference={selected} props={props} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function CommunitiesPage(props: Props) {
  const { state, auth, toggleCommunity, createCommunity } = useClub();
  const t = translator(props.locale);
  const action = useAction(props.locale);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [activeSlug, setActiveSlug] = useState('');
  useEffect(
    () => setActiveSlug(new URLSearchParams(window.location.search).get('community') || ''),
    []
  );
  const active = state.communities.find((community) => community.slug === activeSlug);
  const communities = state.communities.filter((community) =>
    `${community.name} ${community.description}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase())
  );
  async function join(slug: string) {
    if (auth.status !== 'member') {
      props.onAccount();
      return;
    }
    await action.run(
      () => toggleCommunity(slug),
      t('Community membership updated.', 'Participação na comunidade atualizada.')
    );
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      await action.run(
        () =>
          createCommunity({
            name: String(form.get('name')),
            slug: String(form.get('slug')),
            description: String(form.get('description')),
          }),
        t('Your community is ready.', 'Sua comunidade está pronta.')
      )
    )
      setCreating(false);
  }
  return (
    <div className="cpage">
      <Heading
        eyebrow="HORION / WATCH CLUB"
        title={t('Find your people.', 'Encontre sua comunidade.')}
        description={t(
          'Independent communities, shared knowledge and a place for every enthusiast.',
          'Comunidades independentes, conhecimento compartilhado e um lugar para todo entusiasta.'
        )}
        action={
          <button
            className="button"
            onClick={() => {
              if (auth.status !== 'member') props.onAccount();
              else {
                action.clear();
                setCreating(true);
              }
            }}
          >
            <Plus size={16} />
            {t('Create a community', 'Criar comunidade')}
          </button>
        }
      />
      <SearchBox
        value={query}
        setValue={setQuery}
        label={t('Find a community…', 'Encontre uma comunidade…')}
      />
      {!creating && !active && <Feedback action={action} />}
      <div className="cpage-community-grid cpage-live-community-grid">
        {communities.map((community) => {
          const joined = state.joined.includes(community.slug);
          return (
            <article className="cpage-community" key={community.id}>
              <div className="cpage-community-body">
                <p className="eyebrow">{t('INDEPENDENT COMMUNITY', 'COMUNIDADE INDEPENDENTE')}</p>
                <button
                  className="cpage-title-button"
                  onClick={() => {
                    action.clear();
                    setActiveSlug(community.slug);
                  }}
                >
                  <h2>{community.name}</h2>
                </button>
                <p>{community.description}</p>
                <div className="cpage-community-bottom">
                  <span>
                    {typeof community.members === 'number'
                      ? `${new Intl.NumberFormat(props.locale).format(community.members)} ${t('members', 'membros')}`
                      : t('Public community', 'Comunidade pública')}
                  </span>
                  <button
                    className={joined ? 'button-outline' : 'button'}
                    aria-pressed={joined}
                    disabled={action.busy}
                    onClick={() => join(community.slug)}
                  >
                    {joined && <Check size={14} />}
                    {action.busy
                      ? t('Saving…', 'Salvando…')
                      : joined
                        ? t('Joined', 'Participando')
                        : t('Join community', 'Participar')}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!communities.length && (
        <Empty
          title={
            query
              ? t('No communities found.', 'Nenhuma comunidade encontrada.')
              : t('A club starts with a conversation.', 'Um clube começa com uma conversa.')
          }
          text={
            query
              ? t('Try another search term.', 'Tente outro termo de busca.')
              : t(
                  'The community directory is ready for its first group. Create one around an interest you would like to share.',
                  'O diretório está pronto para seu primeiro grupo. Crie uma comunidade em torno de um interesse que deseja compartilhar.'
                )
          }
        />
      )}
      <p className="cpage-footnote">
        {t(
          'Community names do not imply official affiliation with watch manufacturers. Creating a community grants moderation only within that community.',
          'Nomes de comunidades não indicam vínculo oficial com fabricantes. Criar uma comunidade concede moderação apenas dentro dela.'
        )}
      </p>
      {active && (
        <Modal title={active.name} t={t} onClose={() => setActiveSlug('')}>
          <p className="cpage-post-body">{active.description}</p>
          <p className="cpage-notice">
            {t(
              'Welcome every enthusiast, respect other members and share only content you have permission to use.',
              'Acolha todo entusiasta, respeite os demais membros e compartilhe apenas conteúdo que você tem permissão para usar.'
            )}
          </p>
          <Feedback action={action} />
          <div className="cpage-form-actions">
            <button
              className="button-outline"
              onClick={() => {
                setActiveSlug('');
                props.onNavigate('home');
              }}
            >
              {t('Open the feed', 'Abrir o feed')}
              <ArrowRight size={15} />
            </button>
            <button className="button" disabled={action.busy} onClick={() => join(active.slug)}>
              {state.joined.includes(active.slug)
                ? t('Leave community', 'Sair da comunidade')
                : t('Join community', 'Participar da comunidade')}
            </button>
          </div>
        </Modal>
      )}
      {creating && (
        <Modal
          title={t('Start a community', 'Crie uma comunidade')}
          t={t}
          onClose={() => setCreating(false)}
        >
          <form className="cpage-form" onSubmit={create}>
            <label>
              {t('Community name', 'Nome da comunidade')}
              <input name="name" required minLength={3} maxLength={80} disabled={action.busy} />
            </label>
            <label>
              {t('URL name', 'Nome na URL')}
              <input
                name="slug"
                required
                minLength={3}
                maxLength={60}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                autoCapitalize="none"
                spellCheck={false}
                disabled={action.busy}
              />
              <small>
                {t(
                  'Lowercase letters, numbers and single hyphens.',
                  'Letras minúsculas, números e hífens simples.'
                )}
              </small>
            </label>
            <label>
              {t('Description', 'Descrição')}
              <textarea
                name="description"
                required
                minLength={10}
                maxLength={2000}
                rows={4}
                disabled={action.busy}
              />
            </label>
            <p className="cpage-notice">
              {t(
                'You will moderate this community. Choose a clear, independent name and welcome members at every level of experience.',
                'Você moderará esta comunidade. Escolha um nome claro e independente e acolha membros de todos os níveis de experiência.'
              )}
            </p>
            <Feedback action={action} />
            <button className="button" disabled={action.busy}>
              {action.busy ? t('Creating…', 'Criando…') : t('Create community', 'Criar comunidade')}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function WatchesPage(props: Props) {
  const { state, auth, suggestReference } = useClub();
  const t = translator(props.locale);
  const action = useAction(props.locale);
  const [suggesting, setSuggesting] = useState(false);
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('all');
  const [selected, setSelected] = useState<WatchReference | null>(null);
  const brands = Array.from(new Set(state.references.map((reference) => reference.brand)));
  const references = state.references.filter(
    (reference) =>
      (brand === 'all' || reference.brand === brand) &&
      `${reference.brand} ${reference.model} ${reference.reference}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase())
  );
  async function suggest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      await action.run(
        () =>
          suggestReference({
            brand: String(form.get('brand')),
            model: String(form.get('model')),
            reference: String(form.get('reference')),
            sourceUrl: String(form.get('sourceUrl')),
            notes: String(form.get('notes') || ''),
          }),
        t(
          'Your reference suggestion was submitted for review.',
          'Sua sugestão de referência foi enviada para revisão.'
        )
      )
    )
      setSuggesting(false);
  }
  return (
    <div className="cpage">
      <Heading
        eyebrow={t('HORION / THE CATALOG', 'HORION / O CATÁLOGO')}
        title={t('Every reference has a story.', 'Cada referência tem uma história.')}
        description={t(
          'An archive built from sourced information and reviewed contributions.',
          'Um arquivo construído com informações documentadas e contribuições revisadas.'
        )}
        action={
          <button
            className="button-outline"
            onClick={() => {
              if (auth.status !== 'member') props.onAccount();
              else {
                action.clear();
                setSuggesting(true);
              }
            }}
          >
            <Plus size={16} />
            {t('Suggest a reference', 'Sugerir referência')}
          </button>
        }
      />
      {!suggesting && <Feedback action={action} />}
      <div className="cpage-toolbar">
        <SearchBox
          value={query}
          setValue={setQuery}
          label={t('Search brand, model or reference…', 'Busque marca, modelo ou referência…')}
        />
        <label className="cpage-select">
          <select
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
            aria-label={t('Brand', 'Marca')}
          >
            <option value="all">{t('All brands', 'Todas as marcas')}</option>
            {brands.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="cpage-watch-grid">
        {references.map((reference) => (
          <ReferenceCard
            key={reference.id}
            reference={reference}
            t={t}
            onSelect={() => setSelected(reference)}
          />
        ))}
      </div>
      {!references.length && (
        <Empty
          title={
            state.references.length
              ? t('No references match.', 'Nenhuma referência encontrada.')
              : t('The archive begins here.', 'O arquivo começa aqui.')
          }
          text={
            state.references.length
              ? t('Try a different brand or search term.', 'Tente outra marca ou termo de busca.')
              : t(
                  'No catalog references have been published yet. You can already record your watches manually in My Collection.',
                  'Nenhuma referência foi publicada ainda. Você já pode registrar seus relógios manualmente em Minha Coleção.'
                )
          }
          action={
            <button className="button-outline" onClick={() => props.onNavigate('collection')}>
              {t('Open my collection', 'Abrir minha coleção')}
              <ArrowRight size={15} />
            </button>
          }
        />
      )}
      <aside className="cpage-info-strip">
        <BookOpen size={24} strokeWidth={1.3} />
        <div>
          <h3>{t('Knowledge deserves a source.', 'Conhecimento merece uma fonte.')}</h3>
          <p>
            {t(
              'Unknown specifications remain blank. A community contribution needs review before becoming part of the public catalog.',
              'Especificações desconhecidas permanecem em branco. Uma contribuição precisa de revisão antes de integrar o catálogo público.'
            )}
          </p>
        </div>
      </aside>
      {selected && (
        <ReferenceDetails reference={selected} props={props} onClose={() => setSelected(null)} />
      )}
      {suggesting && (
        <Modal
          title={t('Contribute to the catalog', 'Contribua com o catálogo')}
          t={t}
          onClose={() => setSuggesting(false)}
        >
          <form className="cpage-form" onSubmit={suggest}>
            <label>
              {t('Brand', 'Marca')}
              <input name="brand" required maxLength={100} disabled={action.busy} />
            </label>
            <label>
              {t('Model', 'Modelo')}
              <input name="model" required maxLength={160} disabled={action.busy} />
            </label>
            <label>
              {t('Reference', 'Referência')}
              <input name="reference" required maxLength={120} disabled={action.busy} />
            </label>
            <label>
              {t('Source URL', 'URL da fonte')}
              <input
                name="sourceUrl"
                type="url"
                required
                maxLength={2000}
                pattern="https://.+"
                placeholder="https://"
                disabled={action.busy}
              />
            </label>
            <label>
              {t('Notes (optional)', 'Observações (opcional)')}
              <textarea name="notes" rows={3} maxLength={3000} disabled={action.busy} />
            </label>
            <p className="cpage-notice">
              {t(
                'Use a reliable source and include only information you can support. This submission requires review before publication.',
                'Use uma fonte confiável e inclua somente informações que pode fundamentar. Esta sugestão precisa de revisão antes da publicação.'
              )}
            </p>
            <Feedback action={action} />
            <button className="button" disabled={action.busy}>
              {action.busy
                ? t('Sending…', 'Enviando…')
                : t('Submit for review', 'Enviar para revisão')}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function watchName(watch: UserWatch, references: WatchReference[], t: T) {
  const reference = references.find((item) => item.id === watch.referenceId);
  return (
    watch.label ||
    [watch.brand || reference?.brand, watch.model || reference?.model].filter(Boolean).join(' ') ||
    t('Watch record', 'Registro de relógio')
  );
}
function CollectionPage(props: Props) {
  return (
    <MemberGate props={props} title={translator(props.locale)('Your collection.', 'Sua coleção.')}>
      <CollectionContent props={props} />
    </MemberGate>
  );
}
function CollectionContent({ props }: { props: Props }) {
  const { state, addWatch, addManualWatch, updateWatch, createPassport } = useClub();
  const t = translator(props.locale);
  const action = useAction(props.locale);
  const [status, setStatus] = useState<WatchStatus>('owned');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<UserWatch | null>(null);
  const [mode, setMode] = useState('manual');
  const statuses: { value: WatchStatus; label: string }[] = [
    { value: 'owned', label: t('In the collection', 'Na coleção') },
    { value: 'wishlist', label: t('Wishlist', 'Lista de desejos') },
    { value: 'previously-owned', label: t('Previously owned', 'Já pertenceu') },
  ];
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const chosenStatus = String(form.get('status')) as WatchStatus;
    const success = await action.run(
      () =>
        mode === 'catalog'
          ? addWatch(String(form.get('referenceId')), chosenStatus)
          : addManualWatch({
              label: String(form.get('label')),
              brand: String(form.get('brand') || ''),
              model: String(form.get('model') || ''),
              referenceText: String(form.get('referenceText') || ''),
              status: chosenStatus,
              visibility: 'private',
              notes: String(form.get('notes') || ''),
            }),
      t('Watch added to your collection.', 'Relógio adicionado à sua coleção.')
    );
    if (success) {
      setAdding(false);
      setStatus(chosenStatus);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    if (
      await action.run(
        () =>
          updateWatch(editing.id, {
            label: String(form.get('label') || ''),
            brand: String(form.get('brand') || ''),
            model: String(form.get('model') || ''),
            referenceText: String(form.get('referenceText') || ''),
            notes: String(form.get('notes') || ''),
            acquiredAt: String(form.get('acquiredAt') || ''),
            status: String(form.get('status')) as WatchStatus,
            visibility: 'private',
          }),
        t('Collection record updated.', 'Registro da coleção atualizado.')
      )
    )
      setEditing(null);
  }
  return (
    <div className="cpage">
      <Heading
        eyebrow={t('HORION / MY COLLECTION', 'HORION / MINHA COLEÇÃO')}
        title={t('A collection of your stories.', 'Uma coleção das suas histórias.')}
        description={t(
          'The watches you wear, the ones you remember and the next chapter you have in mind.',
          'Os relógios que você usa, os que guarda na memória e o próximo capítulo que deseja viver.'
        )}
        action={
          <button
            className="button"
            onClick={() => {
              action.clear();
              setMode('manual');
              setAdding(true);
            }}
          >
            <Plus size={16} />
            {t('Add a watch', 'Adicionar relógio')}
          </button>
        }
      />
      <div className="cpage-collection-intro">
        <div>
          <strong>{state.watches.filter((watch) => watch.status === 'owned').length}</strong>
          <span>{t('watches in the collection', 'relógios na coleção')}</span>
        </div>
        <div>
          <strong>{state.passports.length}</strong>
          <span>{t('digital passports', 'passaportes digitais')}</span>
        </div>
        <p>
          <LockKeyhole size={16} />
          {t(
            'New records are private by default. Serial numbers and purchase values are not required.',
            'Novos registros são privados por padrão. Números de série e valores de compra não são obrigatórios.'
          )}
        </p>
      </div>
      <div
        className="cpage-tabs"
        role="group"
        aria-label={t('Collection status', 'Estado da coleção')}
      >
        {statuses.map((tab) => (
          <button
            key={tab.value}
            aria-pressed={status === tab.value}
            className={status === tab.value ? 'active' : ''}
            onClick={() => setStatus(tab.value)}
          >
            {tab.label}
            <span>{state.watches.filter((watch) => watch.status === tab.value).length}</span>
          </button>
        ))}
      </div>
      {!adding && !editing && <Feedback action={action} />}
      <div className="cpage-watch-grid">
        {state.watches
          .filter((watch) => watch.status === status)
          .map((watch) => {
            const reference = state.references.find((item) => item.id === watch.referenceId);
            const name = watchName(watch, state.references, t);
            const passport = state.passports.find((item) => item.watchId === watch.id);
            return (
              <article className="cpage-watch-card" key={watch.id}>
                <button
                  className="cpage-watch-image"
                  aria-label={`${t('Edit record', 'Editar registro')}: ${name}`}
                  onClick={() => {
                    action.clear();
                    setEditing(watch);
                  }}
                >
                  <WatchVisual image={watch.image || reference?.image} label={name} />
                  <span className="cpage-privacy">
                    <LockKeyhole size={12} />
                    {t('Private', 'Privado')}
                  </span>
                </button>
                <div className="cpage-watch-caption">
                  {(watch.brand || reference?.brand) && (
                    <p className="eyebrow">{watch.brand || reference?.brand}</p>
                  )}
                  <h3>{name}</h3>
                  {(watch.referenceText || reference?.reference) && (
                    <p className="cpage-reference">{watch.referenceText || reference?.reference}</p>
                  )}
                  {watch.notes && <p className="cpage-watch-note">{watch.notes}</p>}
                  <div className="cpage-card-actions">
                    <button
                      className="cpage-text-link"
                      disabled={action.busy}
                      onClick={() => {
                        action.clear();
                        setEditing(watch);
                      }}
                    >
                      {t('Edit record', 'Editar registro')}
                    </button>
                    {watch.status === 'owned' && (
                      <button
                        className="cpage-text-link"
                        disabled={action.busy}
                        onClick={async () => {
                          const saved = passport
                            ? true
                            : await action.run(() => createPassport(watch.id));
                          if (saved)
                            props.onNavigate(`passport?watch=${encodeURIComponent(watch.id)}`);
                        }}
                      >
                        {passport
                          ? t('Open passport', 'Abrir passaporte')
                          : action.busy
                            ? t('Creating…', 'Criando…')
                            : t('Create passport', 'Criar passaporte')}
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
      </div>
      {!state.watches.some((watch) => watch.status === status) && (
        <Empty
          title={t('Your next chapter starts here.', 'Seu próximo capítulo começa aqui.')}
          text={t(
            'Add a watch manually or choose a published reference from the catalog.',
            'Adicione um relógio manualmente ou escolha uma referência publicada no catálogo.'
          )}
          action={
            <button
              className="button-outline"
              onClick={() => {
                action.clear();
                setAdding(true);
              }}
            >
              <Plus size={15} />
              {t('Add a watch', 'Adicionar relógio')}
            </button>
          }
        />
      )}
      {adding && (
        <Modal
          title={t('A new chapter', 'Um novo capítulo')}
          t={t}
          onClose={() => setAdding(false)}
        >
          <form className="cpage-form" onSubmit={add}>
            {state.references.length > 0 && (
              <label>
                {t('Record type', 'Tipo de registro')}
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                  disabled={action.busy}
                >
                  <option value="manual">
                    {t('Enter my watch details', 'Informar os dados do relógio')}
                  </option>
                  <option value="catalog">
                    {t('Choose a catalog reference', 'Escolher referência do catálogo')}
                  </option>
                </select>
              </label>
            )}
            {mode === 'catalog' ? (
              <label>
                {t('Catalog reference', 'Referência do catálogo')}
                <select name="referenceId" required disabled={action.busy}>
                  {state.references.map((reference) => (
                    <option key={reference.id} value={reference.id}>
                      {reference.brand} {reference.model} · {reference.reference}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label>
                  {t('Watch name', 'Nome do relógio')}
                  <input
                    name="label"
                    required
                    minLength={1}
                    maxLength={160}
                    disabled={action.busy}
                    placeholder={t(
                      'How you would like to identify this watch',
                      'Como deseja identificar este relógio'
                    )}
                  />
                </label>
                <div className="cpage-form-grid">
                  <label>
                    {t('Brand (optional)', 'Marca (opcional)')}
                    <input name="brand" maxLength={100} disabled={action.busy} />
                  </label>
                  <label>
                    {t('Model (optional)', 'Modelo (opcional)')}
                    <input name="model" maxLength={160} disabled={action.busy} />
                  </label>
                </div>
                <label>
                  {t('Reference (optional)', 'Referência (opcional)')}
                  <input name="referenceText" maxLength={100} disabled={action.busy} />
                </label>
                <label>
                  {t('Notes (optional)', 'Observações (opcional)')}
                  <textarea name="notes" maxLength={3000} rows={3} disabled={action.busy} />
                </label>
              </>
            )}
            <label>
              {t('Collection status', 'Estado na coleção')}
              <select name="status" defaultValue={status} disabled={action.busy}>
                {statuses.map((tab) => (
                  <option key={tab.value} value={tab.value}>
                    {tab.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="cpage-notice">
              {t(
                'This record starts private. Manual details are your own declarations and do not create a verified catalog reference.',
                'Este registro começa privado. Os dados manuais são declarações suas e não criam uma referência verificada no catálogo.'
              )}
            </p>
            <Feedback action={action} />
            <button className="button" disabled={action.busy}>
              {action.busy
                ? t('Saving…', 'Salvando…')
                : t('Add to collection', 'Adicionar à coleção')}
            </button>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal
          title={watchName(editing, state.references, t)}
          t={t}
          onClose={() => setEditing(null)}
        >
          <form className="cpage-form" onSubmit={save}>
            <label>
              {t('Watch name', 'Nome do relógio')}
              <input
                name="label"
                required
                maxLength={160}
                defaultValue={watchName(editing, state.references, t)}
                disabled={action.busy}
              />
            </label>
            <div className="cpage-form-grid">
              <label>
                {t('Brand (optional)', 'Marca (opcional)')}
                <input
                  name="brand"
                  maxLength={100}
                  defaultValue={editing.brand || ''}
                  disabled={action.busy}
                />
              </label>
              <label>
                {t('Model (optional)', 'Modelo (opcional)')}
                <input
                  name="model"
                  maxLength={160}
                  defaultValue={editing.model || ''}
                  disabled={action.busy}
                />
              </label>
            </div>
            <label>
              {t('Reference (optional)', 'Referência (opcional)')}
              <input
                name="referenceText"
                maxLength={160}
                defaultValue={editing.referenceText || ''}
                disabled={action.busy}
              />
            </label>
            <label>
              {t('Collection status', 'Estado na coleção')}
              <select name="status" defaultValue={editing.status} disabled={action.busy}>
                {statuses.map((tab) => (
                  <option key={tab.value} value={tab.value}>
                    {tab.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('Acquisition date (optional)', 'Data de aquisição (opcional)')}
              <input
                name="acquiredAt"
                type="date"
                defaultValue={editing.acquiredAt}
                max={new Date().toISOString().slice(0, 10)}
                disabled={action.busy}
              />
            </label>
            <label>
              {t('Notes', 'Observações')}
              <textarea
                name="notes"
                defaultValue={editing.notes}
                rows={4}
                maxLength={3000}
                disabled={action.busy}
              />
            </label>
            <p className="cpage-notice">
              {t(
                'Collection records remain private. Public collection sharing is not available yet.',
                'Os registros da coleção permanecem privados. O compartilhamento público da coleção ainda não está disponível.'
              )}
            </p>
            <p className="cpage-notice">
              {t(
                'A public watch record can be visible to other visitors. Acquisition details, notes and passport records remain restricted to their owner.',
                'Um registro público de relógio pode ser visto por outros visitantes. Dados de aquisição, observações e registros do passaporte permanecem restritos ao proprietário.'
              )}
            </p>
            <Feedback action={action} />
            <button className="button" disabled={action.busy}>
              {action.busy ? t('Saving…', 'Salvando…') : t('Save changes', 'Salvar alterações')}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function PassportPage(props: Props) {
  return (
    <MemberGate
      props={props}
      title={translator(props.locale)('Time, documented.', 'O tempo, documentado.')}
    >
      <PassportContent props={props} />
    </MemberGate>
  );
}
function PassportContent({ props }: { props: Props }) {
  const { state, createPassport, addPassportEvent } = useClub();
  const t = translator(props.locale);
  const action = useAction(props.locale);
  const [selected, setSelected] = useState(props.watchId ? `watch:${props.watchId}` : '');
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (props.watchId) setSelected(`watch:${props.watchId}`);
  }, [props.watchId]);
  const passport =
    state.passports.find(
      (item) =>
        item.id === selected ||
        (selected.startsWith('watch:') && item.watchId === selected.slice(6))
    ) || state.passports[0];
  const watch = state.watches.find((item) => item.id === passport?.watchId);
  const reference = state.references.find((item) => item.id === watch?.referenceId);
  const available = state.watches.filter(
    (item) =>
      item.status === 'owned' && !state.passports.some((passport) => passport.watchId === item.id)
  );
  const eventTypes = [
    { value: 'acquisition', label: t('Acquisition', 'Aquisição') },
    { value: 'maintenance', label: t('Maintenance', 'Manutenção') },
    { value: 'service', label: t('Service', 'Revisão') },
    { value: 'restoration', label: t('Restoration', 'Restauração') },
    { value: 'strap', label: t('Strap change', 'Troca de pulseira') },
    { value: 'component', label: t('Component replacement', 'Substituição de componente') },
    { value: 'inspection', label: t('Inspection', 'Inspeção') },
    { value: 'valuation', label: t('Valuation', 'Avaliação') },
    { value: 'sale', label: t('Sale', 'Venda') },
  ];
  async function create(watchId: string) {
    if (
      await action.run(() => createPassport(watchId), t('Passport created.', 'Passaporte criado.'))
    ) {
      setSelected(`watch:${watchId}`);
      setCreating(false);
    }
  }
  async function addEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passport) return;
    const form = new FormData(event.currentTarget);
    if (
      await action.run(
        () =>
          addPassportEvent(passport.id, {
            type: String(form.get('type')),
            date: String(form.get('date')),
            description: String(form.get('description')),
          }),
        t('Event added to your archive.', 'Evento adicionado ao seu arquivo.')
      )
    )
      setAdding(false);
  }
  return (
    <div className="cpage">
      <Heading
        eyebrow="HORION / PASSPORT"
        title={t('Time, documented.', 'O tempo, documentado.')}
        description={t(
          'A private, living archive of the watches you own.',
          'Um arquivo privado e vivo dos relógios que você possui.'
        )}
        action={
          <button
            className="button-outline"
            onClick={() => {
              action.clear();
              setCreating(true);
            }}
          >
            <Plus size={16} />
            {t('Create passport', 'Criar passaporte')}
          </button>
        }
      />
      {!creating && !adding && <Feedback action={action} />}
      {state.passports.length > 1 && (
        <label className="cpage-passport-select">
          {t('Your passports', 'Seus passaportes')}
          <select value={passport?.id} onChange={(event) => setSelected(event.target.value)}>
            {state.passports.map((item) => {
              const record = state.watches.find((watch) => watch.id === item.watchId);
              return (
                <option key={item.id} value={item.id}>
                  {record ? watchName(record, state.references, t) : item.id}
                </option>
              );
            })}
          </select>
        </label>
      )}
      {passport && watch ? (
        <>
          <section className="cpage-passport">
            <div className="cpage-passport-photo">
              <WatchVisual
                image={watch.image || reference?.image}
                label={watchName(watch, state.references, t)}
              />
            </div>
            <div className="cpage-passport-record">
              <div className="cpage-passport-brand">
                <span>H</span>
                <div>
                  HORION<small>PASSPORT</small>
                </div>
                <LockKeyhole size={24} strokeWidth={1} />
              </div>
              <p className="eyebrow">{watch.brand || reference?.brand}</p>
              <h2>{watchName(watch, state.references, t)}</h2>
              {(watch.referenceText || reference?.reference) && (
                <p className="cpage-reference">{watch.referenceText || reference?.reference}</p>
              )}
              <dl className="cpage-specs">
                <div>
                  <dt>{t('Archive number', 'Número de arquivo')}</dt>
                  <dd className="cpage-reference">{passport.id}</dd>
                </div>
                <div>
                  <dt>{t('Created', 'Criado em')}</dt>
                  <dd>{dateLabel(passport.createdAt, props.locale)}</dd>
                </div>
                <div>
                  <dt>{t('Access', 'Acesso')}</dt>
                  <dd>{t('Owner only', 'Somente o proprietário')}</dd>
                </div>
                <div>
                  <dt>{t('Information level', 'Nível de informação')}</dt>
                  <dd>{t('Owner declared', 'Declarado pelo proprietário')}</dd>
                </div>
              </dl>
            </div>
          </section>
          <p className="cpage-notice">
            <ShieldCheck size={17} />
            {t(
              'A passport records information supplied by the owner. It is not proof of authenticity or ownership, and an attached document does not automatically verify a claim.',
              'Um passaporte registra informações fornecidas pelo proprietário. Ele não comprova autenticidade ou propriedade; anexar um documento não verifica automaticamente uma declaração.'
            )}
          </p>
          <section className="cpage-section">
            <div className="cpage-section-heading">
              <h2>{t('The history of your watch.', 'A história do seu relógio.')} </h2>
              <button
                className="button"
                onClick={() => {
                  action.clear();
                  setAdding(true);
                }}
              >
                <Plus size={16} />
                {t('Record event', 'Registrar evento')}
              </button>
            </div>
            <div className="cpage-timeline">
              {[...passport.events]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((event) => (
                  <article className="cpage-event" key={event.id}>
                    <div className="cpage-event-dot" />
                    <time dateTime={event.date}>{dateLabel(event.date, props.locale)}</time>
                    <div>
                      <p className="eyebrow">
                        {eventTypes.find((type) => type.value === event.type.toLowerCase())
                          ?.label || event.type}
                      </p>
                      <p>{event.description}</p>
                      <span className="cpage-verification">
                        <span />
                        {event.verification === 'partner-verified'
                          ? t(
                              'Verified by an authorized partner',
                              'Verificado por parceiro autorizado'
                            )
                          : event.verification === 'documents-presented'
                            ? t('Documents presented', 'Documentação apresentada')
                            : t('Owner declared', 'Declarado pelo proprietário')}
                      </span>
                    </div>
                  </article>
                ))}
            </div>
            {!passport.events.length && (
              <Empty
                title={t('Your archive is ready.', 'Seu arquivo está pronto.')}
                text={t(
                  'Record an acquisition, a service or a detail worth remembering.',
                  'Registre uma aquisição, uma revisão ou um detalhe que vale lembrar.'
                )}
              />
            )}
          </section>
          <section className="cpage-document-section">
            <FileText size={28} strokeWidth={1.2} />
            <div>
              <h3>{t('Private documents', 'Documentos privados')}</h3>
              <p>
                {t(
                  'Document upload is not available in this release. Keep original invoices, certificates and service records in your own secure archive.',
                  'O envio de documentos ainda não está disponível nesta versão. Preserve notas fiscais, certificados e comprovantes de manutenção no seu próprio arquivo seguro.'
                )}
              </p>
            </div>
            <span className="cpage-soon">{t('In development', 'Em desenvolvimento')}</span>
          </section>
        </>
      ) : (
        <Empty
          title={t('Every watch deserves an archive.', 'Todo relógio merece um arquivo.')}
          text={t(
            'Add a watch you own to your collection, then create its passport.',
            'Adicione um relógio que você possui à coleção e crie seu passaporte.'
          )}
          action={
            <button className="button" onClick={() => props.onNavigate('collection')}>
              {t('Open collection', 'Abrir coleção')}
              <ArrowRight size={16} />
            </button>
          }
        />
      )}
      {creating && (
        <Modal
          title={t('Create a digital passport', 'Criar passaporte digital')}
          t={t}
          onClose={() => setCreating(false)}
        >
          <p className="cpage-muted">
            {t(
              'Choose a watch you currently own.',
              'Escolha um relógio que você possui atualmente.'
            )}
          </p>
          <Feedback action={action} />
          <div className="cpage-passport-options">
            {available.map((watch) => (
              <button
                className="cpage-result"
                key={watch.id}
                disabled={action.busy}
                onClick={() => create(watch.id)}
              >
                <Watch size={25} strokeWidth={1} />
                <div>
                  <h3>{watchName(watch, state.references, t)}</h3>
                </div>
                <Plus size={18} />
              </button>
            ))}
          </div>
          {!available.length && (
            <Empty
              title={t('No watches need a passport.', 'Nenhum relógio precisa de passaporte.')}
              text={t(
                'Every owned watch already has a passport, or your collection has no owned watches yet.',
                'Todos os relógios próprios já têm passaporte, ou sua coleção ainda não possui relógios próprios.'
              )}
              action={
                <button
                  className="button-outline"
                  onClick={() => {
                    setCreating(false);
                    props.onNavigate('collection');
                  }}
                >
                  {t('Manage collection', 'Gerenciar coleção')}
                </button>
              }
            />
          )}
        </Modal>
      )}
      {adding && (
        <Modal
          title={t('Add to the archive', 'Adicionar ao arquivo')}
          t={t}
          onClose={() => setAdding(false)}
        >
          <form className="cpage-form" onSubmit={addEvent}>
            <label>
              {t('Event type', 'Tipo de evento')}
              <select name="type" disabled={action.busy}>
                {eventTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('Date', 'Data')}
              <input
                name="date"
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
                defaultValue={new Date().toISOString().slice(0, 10)}
                disabled={action.busy}
              />
            </label>
            <label>
              {t('Description', 'Descrição')}
              <textarea
                name="description"
                required
                minLength={3}
                maxLength={3000}
                rows={4}
                disabled={action.busy}
              />
            </label>
            <p className="cpage-notice">
              {t(
                'This event will be labeled Owner declared. Do not include another person’s contact information or personal documents in the description.',
                'Este evento será identificado como Declarado pelo proprietário. Não inclua dados de contato de outra pessoa ou documentos pessoais na descrição.'
              )}
            </p>
            <Feedback action={action} />
            <button className="button" disabled={action.busy}>
              {action.busy ? t('Saving…', 'Salvando…') : t('Record event', 'Registrar evento')}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function JournalPage(props: Props) {
  const t = translator(props.locale);
  return (
    <div className="cpage">
      <Heading
        eyebrow="HORION / JOURNAL"
        title={t('For the love of the details.', 'Pelo amor aos detalhes.')}
        description={t(
          'Watchmaking, collecting and the stories that deserve a closer look.',
          'Relojoaria, colecionismo e histórias que merecem um olhar atento.'
        )}
      />
      <Empty
        title={t('The Journal is taking shape.', 'O Journal está ganhando forma.')}
        text={t(
          'No editorial articles have been published yet. Reviews, interviews and technical guides will appear here when they are ready.',
          'Nenhum artigo editorial foi publicado ainda. Reviews, entrevistas e guias técnicos aparecerão aqui quando estiverem prontos.'
        )}
        action={
          <button className="button-outline" onClick={() => props.onNavigate('home')}>
            {t('Join the conversation', 'Participe da conversa')}
            <ArrowRight size={15} />
          </button>
        }
      />
    </div>
  );
}
function SocietyPage(props: Props) {
  const t = translator(props.locale);
  return (
    <div className="cpage">
      <section className="cpage-society-hero">
        <div className="cpage-society-mark">H</div>
        <p className="eyebrow">HORION SOCIETY</p>
        <h1>{t('More time for your passion.', 'Mais tempo para sua paixão.')}</h1>
        <p>
          {t(
            'Additional tools and experiences for the chapters ahead.',
            'Ferramentas e experiências adicionais para os próximos capítulos.'
          )}
        </p>
        <span className="cpage-society-status">{t('IN DEVELOPMENT', 'EM DESENVOLVIMENTO')}</span>
      </section>
      <div className="cpage-info-strip">
        <Users size={26} strokeWidth={1.2} />
        <div>
          <h3>
            {t('The club is open to every enthusiast.', 'O clube está aberto a todo entusiasta.')}
          </h3>
          <p>
            {t(
              'Community participation, your collection and basic passports belong to the free Watch Club. Society subscriptions are not available yet, and no payments are active.',
              'A participação na comunidade, sua coleção e os passaportes básicos fazem parte do Watch Club gratuito. A assinatura Society ainda não está disponível e não há cobranças ativas.'
            )}
          </p>
        </div>
      </div>
      <section className="cpage-section">
        <h2>
          {t(
            'A considered membership, still in development.',
            'Uma assinatura cuidadosa, ainda em desenvolvimento.'
          )}
        </h2>
        <p className="cpage-muted">
          {t(
            'Advanced collection reports, passport exports and selected experiences are being planned. Benefits, partners and prices will be published only after they are confirmed. Community reputation will remain independent of payment.',
            'Relatórios avançados de coleção, exportações de passaporte e experiências selecionadas estão em planejamento. Benefícios, parceiros e preços serão publicados somente após confirmação. A reputação comunitária continuará independente de pagamentos.'
          )}
        </p>
      </section>
    </div>
  );
}
function ProfilePage(props: Props) {
  return (
    <MemberGate
      props={props}
      title={translator(props.locale)('Your place in the club.', 'Seu lugar no clube.')}
    >
      <ProfileContent props={props} />
    </MemberGate>
  );
}
function ProfileContent({ props }: { props: Props }) {
  const { auth, state, updateProfile } = useClub();
  const t = translator(props.locale);
  const action = useAction(props.locale);
  const [editing, setEditing] = useState(false);
  const [accountType, setAccountType] = useState<'member' | 'store'>(
    auth.member?.accountType || 'member'
  );
  const member = auth.member;
  if (!member) return null;
  const posts = state.posts.filter((post) => post.username === member.username && !post.hidden);
  const website = safeWebsite(member.website || '');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      await action.run(
        () =>
          updateProfile({
            name: String(form.get('name')),
            username: String(form.get('username')),
            bio: String(form.get('bio') || ''),
            country: String(form.get('country') || ''),
            accountType,
            website: accountType === 'store' ? String(form.get('website') || '') : '',
            contact: accountType === 'store' ? String(form.get('contact') || '') : '',
          }),
        t('Profile updated.', 'Perfil atualizado.')
      )
    )
      setEditing(false);
  }
  return (
    <div className="cpage">
      <div className="cpage-profile-cover">
        <span>{t('THE PEOPLE BEHIND THE WATCHES.', 'AS PESSOAS POR TRÁS DOS RELÓGIOS.')}</span>
        <div className="cpage-profile-monogram">{initials(member.name)}</div>
      </div>
      <header className="cpage-profile-head">
        <div>
          <p className="eyebrow">
            {member.accountType === 'store'
              ? t('STORE PROFILE', 'PERFIL DE LOJA')
              : t('MEMBER PROFILE', 'PERFIL DE MEMBRO')}
          </p>
          <h1>{member.name}</h1>
          <p className="cpage-username">@{member.username}</p>
          {member.bio && <p>{member.bio}</p>}
          {member.country && (
            <p className="cpage-profile-location">
              <Globe2 size={14} />
              {member.country}
            </p>
          )}
          {website && (
            <p>
              <a
                className="cpage-text-link"
                href={website}
                target="_blank"
                rel="noopener noreferrer"
              >
                {new URL(website).host} ↗
              </a>
            </p>
          )}
          {member.contact && (
            <p>
              {t('Contact', 'Contato')}: {member.contact}
            </p>
          )}
        </div>
        <button
          className="button-outline"
          onClick={() => {
            action.clear();
            setAccountType(member.accountType);
            setEditing(true);
          }}
        >
          {t('Edit profile', 'Editar perfil')}
        </button>
      </header>
      {!editing && <Feedback action={action} />}
      <div className="cpage-profile-stats">
        <div>
          <strong>{posts.length}</strong>
          <span>{t('posts', 'publicações')}</span>
        </div>
        <div>
          <strong>{state.joined.length}</strong>
          <span>{t('communities', 'comunidades')}</span>
        </div>
        <div>
          <strong>{state.watches.filter((watch) => watch.status === 'owned').length}</strong>
          <span>{t('owned watches', 'relógios próprios')}</span>
        </div>
      </div>
      {member.accountType === 'store' && (
        <p className="cpage-notice">
          {t(
            'Your store profile is self-declared. It does not confer a verification badge, sales permission, community authority or professional credentials.',
            'Seu perfil de loja é declarado por você. Ele não concede selo de verificação, permissão de venda, autoridade comunitária ou credenciais profissionais.'
          )}
        </p>
      )}
      <section className="cpage-section">
        <div className="cpage-section-heading">
          <h2>{t('Your contributions', 'Suas contribuições')}</h2>
          <button className="cpage-text-link" onClick={props.onCompose}>
            {t('Write a post', 'Criar publicação')}
            <Plus size={15} />
          </button>
        </div>
        {posts.map((post) => (
          <button
            className="cpage-search-post"
            key={post.id}
            onClick={() => props.onNavigate(`home?post=${encodeURIComponent(post.id)}`)}
          >
            <div>
              <p className="eyebrow">
                {state.communities.find((community) => community.slug === post.community)?.name ||
                  post.community}
              </p>
              <h3>{post.title}</h3>
              <p>{dateLabel(post.createdAt, props.locale)}</p>
            </div>
            <ArrowRight size={16} />
          </button>
        ))}
        {!posts.length && (
          <Empty
            title={t(
              'A perspective only you can share.',
              'Uma perspectiva que só você pode compartilhar.'
            )}
            text={t(
              'Your published posts will appear here. Start with a question, an experience or the watch on your wrist.',
              'Suas publicações aparecerão aqui. Comece com uma pergunta, uma experiência ou o relógio no seu pulso.'
            )}
          />
        )}
      </section>
      {editing && (
        <Modal
          title={t('Edit your profile', 'Editar seu perfil')}
          t={t}
          onClose={() => setEditing(false)}
        >
          <form className="cpage-form" onSubmit={save}>
            <label>
              {t('Profile type', 'Tipo de perfil')}
              <select
                value={accountType}
                onChange={(event) => setAccountType(event.target.value as 'member' | 'store')}
                disabled={action.busy}
              >
                <option value="member">{t('Member', 'Membro')}</option>
                <option value="store">{t('Store', 'Loja')}</option>
              </select>
            </label>
            <label>
              {accountType === 'store'
                ? t('Store display name', 'Nome de exibição da loja')
                : t('Display name', 'Nome de exibição')}
              <input
                name="name"
                required
                minLength={1}
                maxLength={80}
                autoComplete={accountType === 'store' ? 'organization' : 'name'}
                defaultValue={member.name}
                disabled={action.busy}
              />
            </label>
            <label>
              {t('Username', 'Nome de usuário')}
              <input
                name="username"
                required
                minLength={3}
                maxLength={32}
                pattern="[a-z0-9_]+"
                defaultValue={member.username}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                disabled={action.busy}
              />
              <small>
                {t(
                  'Lowercase letters, numbers and underscores.',
                  'Letras minúsculas, números e sublinhados.'
                )}
              </small>
            </label>
            <label>
              {t('Biography', 'Biografia')}
              <textarea
                name="bio"
                maxLength={500}
                defaultValue={member.bio}
                rows={3}
                disabled={action.busy}
              />
            </label>
            <label>
              {t('Country (optional)', 'País (opcional)')}
              <input
                name="country"
                maxLength={60}
                defaultValue={member.country}
                autoComplete="country-name"
                disabled={action.busy}
              />
            </label>
            {accountType === 'store' && (
              <>
                <label>
                  {t('Public website (optional)', 'Site público (opcional)')}
                  <input
                    name="website"
                    type="url"
                    maxLength={500}
                    defaultValue={member.website}
                    placeholder="https://"
                    disabled={action.busy}
                  />
                </label>
                <label>
                  {t('Public contact email (optional)', 'E-mail de contato público (opcional)')}
                  <input
                    name="contact"
                    type="email"
                    maxLength={254}
                    defaultValue={member.contact}
                    autoComplete="email"
                    disabled={action.busy}
                  />
                </label>
              </>
            )}
            <p className="cpage-notice">
              {t(
                'These profile fields are public. Store identity and community moderation are separate; profile editing cannot grant moderator or administrator access.',
                'Estes campos do perfil são públicos. A identidade de loja e a moderação são independentes; editar o perfil não concede acesso de moderador ou administrador.'
              )}
            </p>
            <Feedback action={action} />
            <button className="button" disabled={action.busy}>
              {action.busy ? t('Saving…', 'Salvando…') : t('Save profile', 'Salvar perfil')}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
function NotificationsPage(props: Props) {
  return (
    <MemberGate
      props={props}
      title={translator(props.locale)('From your corner of the club.', 'Do seu canto do clube.')}
    >
      <NotificationContent props={props} />
    </MemberGate>
  );
}
function NotificationContent({ props }: { props: Props }) {
  const { state, markNotificationsRead } = useClub();
  const t = translator(props.locale);
  const action = useAction(props.locale);
  const unread = state.notifications.filter((item) => !item.read).length;
  return (
    <div className="cpage">
      <Heading
        eyebrow={t('HORION / NOTIFICATIONS', 'HORION / NOTIFICAÇÕES')}
        title={t('From your corner of the club.', 'Do seu canto do clube.')}
        description={t(
          'Replies, new chapters and the conversations worth coming back to.',
          'Respostas, novos capítulos e conversas às quais vale voltar.'
        )}
        action={
          <button
            className="button-outline"
            disabled={!unread || action.busy}
            onClick={() =>
              action.run(
                markNotificationsRead,
                t('Notifications marked as read.', 'Notificações marcadas como lidas.')
              )
            }
          >
            <Check size={15} />
            {action.busy
              ? t('Saving…', 'Salvando…')
              : t('Mark all as read', 'Marcar todas como lidas')}
          </button>
        }
      />
      <Feedback action={action} />
      <div className="cpage-notifications">
        {state.notifications.map((notification) => (
          <article
            className={notification.read ? 'cpage-notification' : 'cpage-notification unread'}
            key={notification.id}
          >
            <span className="cpage-notification-dot" />
            <div>
              <p>{notification.title}</p>
              <small>{notification.read ? t('Read', 'Lida') : t('Unread', 'Não lida')}</small>
            </div>
          </article>
        ))}
      </div>
      {!state.notifications.length && (
        <Empty
          title={t('All quiet, for now.', 'Tudo tranquilo, por enquanto.')}
          text={t(
            'New notifications will appear here when there is activity for your account.',
            'Novas notificações aparecerão aqui quando houver atividade para sua conta.'
          )}
        />
      )}
      <p className="cpage-footnote">
        {t(
          'Email and push notifications are not available yet.',
          'Notificações por e-mail e push ainda não estão disponíveis.'
        )}
      </p>
    </div>
  );
}
function SettingsPage(props: Props) {
  const { auth, exportData } = useClub();
  const t = translator(props.locale);
  const action = useAction(props.locale);
  const [theme, setTheme] = useState('light');
  useEffect(() => {
    try {
      setTheme(localStorage.getItem('horion-theme') === 'dark' ? 'dark' : 'light');
    } catch {
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    }
  }, []);
  async function changeTheme(value: string) {
    setTheme(value);
    document.documentElement.dataset.theme = value;
    await action.run(
      async () => {
        localStorage.setItem('horion-theme', value);
      },
      t('Appearance updated.', 'Aparência atualizada.')
    );
  }
  return (
    <div className="cpage">
      <Heading
        eyebrow={t('HORION / SETTINGS', 'HORION / CONFIGURAÇÕES')}
        title={t('Make yourself at home.', 'Sinta-se em casa.')}
        description={t(
          'Your preferences and account records, in one place.',
          'Suas preferências e os registros da sua conta em um só lugar.'
        )}
      />
      <Feedback action={action} />
      <div className="cpage-settings">
        <section>
          <div>
            <h2>{t('Language', 'Idioma')}</h2>
            <p>
              {t(
                'The interface language changes. Member content stays in its original language.',
                'O idioma da interface muda. O conteúdo dos membros permanece no idioma original.'
              )}
            </p>
          </div>
          <label className="cpage-select">
            <Globe2 size={16} />
            <select
              value={props.locale}
              aria-label={t('Interface language', 'Idioma da interface')}
              onChange={(event) => window.location.assign(`/${event.target.value}/settings`)}
            >
              <option value="en">English</option>
              <option value="pt-BR">Português (Brasil)</option>
            </select>
          </label>
        </section>
        <section>
          <div>
            <h2>{t('Appearance', 'Aparência')}</h2>
            <p>
              {t(
                'Light or dark. Motion follows the accessibility preference on your device.',
                'Claro ou escuro. O movimento segue a preferência de acessibilidade do seu dispositivo.'
              )}
            </p>
          </div>
          <label className="cpage-select">
            <select
              value={theme}
              disabled={action.busy}
              aria-label={t('Appearance', 'Aparência')}
              onChange={(event) => changeTheme(event.target.value)}
            >
              <option value="light">{t('Light · Ivory', 'Claro · Marfim')}</option>
              <option value="dark">{t('Dark · Charcoal', 'Escuro · Carvão')}</option>
            </select>
          </label>
        </section>
        <section>
          <div>
            <h2>{t('Your profile', 'Seu perfil')}</h2>
            <p>
              {t(
                'Manage your member or store identity and the information you choose to publish.',
                'Gerencie sua identidade de membro ou loja e as informações que deseja publicar.'
              )}
            </p>
          </div>
          <button
            className="button-outline"
            onClick={() =>
              auth.status === 'member' ? props.onNavigate('profile') : props.onAccount()
            }
          >
            {auth.status === 'member'
              ? t('Open profile', 'Abrir perfil')
              : t('Account access', 'Acessar conta')}
            <ArrowRight size={15} />
          </button>
        </section>
        <section>
          <div>
            <h2>{t('Export your records', 'Exportar seus registros')}</h2>
            <p>
              {t(
                'Download a JSON copy of your profile, loaded posts, collection and passport records. Private documents are not included in this file.',
                'Baixe uma cópia JSON do seu perfil, publicações carregadas, coleção e registros de passaportes. Documentos privados não são incluídos neste arquivo.'
              )}
            </p>
          </div>
          <button
            className="button-outline"
            disabled={action.busy}
            onClick={() => {
              if (auth.status !== 'member') {
                props.onAccount();
                return;
              }
              action.run(
                async () => {
                  await Promise.resolve(exportData());
                },
                t(
                  'Your account records are ready for download.',
                  'Os registros da sua conta estão prontos para download.'
                )
              );
            }}
          >
            <ArrowDownToLine size={16} />
            {t('Export JSON', 'Exportar JSON')}
          </button>
        </section>
        <section>
          <div>
            <h2>{t('Account access', 'Acesso à conta')}</h2>
            <p>
              {auth.user
                ? t(
                    'Review your connected account and end this session when needed.',
                    'Consulte sua conta conectada e encerre esta sessão quando necessário.'
                  )
                : t(
                    'Create an account or sign in to save your own records.',
                    'Crie uma conta ou entre para salvar seus registros.'
                  )}
            </p>
          </div>
          <button className="button-outline" onClick={props.onAccount}>
            {t('Manage account', 'Gerenciar conta')}
          </button>
        </section>
      </div>
      <aside className="cpage-info-strip">
        <LockKeyhole size={24} strokeWidth={1.3} />
        <div>
          <h3>{t('Privacy begins with a choice.', 'A privacidade começa com uma escolha.')}</h3>
          <p>
            {t(
              'Your profile is public. Collection records and passport history remain private. Never publish another person’s personal information without permission.',
              'Seu perfil é público. Os registros da coleção e o histórico do passaporte permanecem privados. Nunca publique dados pessoais de outra pessoa sem permissão.'
            )}
          </p>
        </div>
      </aside>
    </div>
  );
}
function AdminPage(props: Props) {
  const { state, auth, moderatePost, setMemberRole } = useClub();
  const t = translator(props.locale);
  const action = useAction(props.locale);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const canModerate =
    auth.status === 'member' &&
    (auth.role === 'admin' || auth.role === 'moderator' || auth.moderatedCommunityIds.length > 0);
  const isAllowed = (postId: string) => {
    if (auth.role === 'admin' || auth.role === 'moderator') return true;
    const post = state.posts.find((item) => item.id === postId);
    const community = state.communities.find((item) => item.slug === post?.community);
    return !!community && auth.moderatedCommunityIds.includes(community.id);
  };
  const reports = state.reports.filter((report) => report.status === 'open');
  const selectedPost = state.posts.find((post) => post.id === reviewing);
  if (!canModerate)
    return (
      <div className="cpage">
        <Heading
          eyebrow={t('HORION / MODERATION', 'HORION / MODERAÇÃO')}
          title={t('Community care requires permission.', 'Cuidar da comunidade exige permissão.')}
          description={t(
            'Moderation access is assigned by community or by the platform administration.',
            'O acesso à moderação é atribuído por comunidade ou pela administração da plataforma.'
          )}
        />
        <Empty
          title={t('Access restricted.', 'Acesso restrito.')}
          text={t(
            'Your account does not have access to this area. A store profile does not grant moderation privileges.',
            'Sua conta não possui acesso a esta área. Um perfil de loja não concede privilégios de moderação.'
          )}
          action={
            auth.status !== 'member' ? (
              <button className="button-outline" onClick={props.onAccount}>
                {t('Account access', 'Acessar conta')}
              </button>
            ) : undefined
          }
        />
      </div>
    );
  return (
    <div className="cpage">
      <Heading
        eyebrow={t('HORION / MODERATION', 'HORION / MODERAÇÃO')}
        title={t('Care for the conversation.', 'Cuide da conversa.')}
        description={t(
          'Review reports from the communities you are authorized to moderate.',
          'Revise denúncias das comunidades que você tem autorização para moderar.'
        )}
      />
      <p className="cpage-notice">
        <ShieldCheck size={17} />
        {t(
          'Database permissions control every moderation action. Community moderation and store identity are independent.',
          'As permissões do banco controlam cada ação de moderação. Moderação comunitária e identidade de loja são independentes.'
        )}
      </p>
      {!reviewing && <Feedback action={action} />}
      {auth.role === 'admin' && (
        <section className="cpage-section">
          <h2>{t('Member permissions', 'Permissões dos membros')}</h2>
          <p className="cpage-muted">
            {t(
              'Assign or remove platform moderation access. Member and store profiles keep their own identity.',
              'Atribua ou remova o acesso à moderação da plataforma. Perfis de membros e lojas mantêm sua própria identidade.'
            )}
          </p>
          <form
            className="cpage-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const target = String(form.get('member'));
              const role = form.get('role') === 'moderator' ? 'moderator' : 'member';
              void action.run(
                () => setMemberRole(target, role),
                t('Member permissions updated.', 'Permissões do membro atualizadas.')
              );
            }}
          >
            <label>
              {t('Member', 'Membro')}
              <select name="member" required disabled={action.busy} defaultValue="">
                <option value="" disabled>
                  {t('Choose a member', 'Escolha um membro')}
                </option>
                {state.members
                  .filter((member) => member.id !== auth.user?.id)
                  .map((member) => (
                    <option value={member.id} key={member.id}>
                      {member.name} (@{member.username})
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t('Access', 'Acesso')}
              <select name="role" disabled={action.busy} defaultValue="member">
                <option value="member">{t('Member', 'Membro')}</option>
                <option value="moderator">{t('Moderator', 'Moderador')}</option>
              </select>
            </label>
            <button
              className="button"
              disabled={action.busy || state.members.every((member) => member.id === auth.user?.id)}
            >
              {action.busy
                ? t('Saving…', 'Salvando…')
                : t('Update permissions', 'Atualizar permissões')}
            </button>
          </form>
        </section>
      )}
      <section className="cpage-section">
        <div className="cpage-section-heading">
          <h2>{t('Reports awaiting review', 'Denúncias aguardando revisão')}</h2>
        </div>
        {reports.map((report) => (
          <article className="cpage-report" key={report.id}>
            <div>
              <p className="eyebrow">{t('MEMBER REPORT', 'DENÚNCIA DE MEMBRO')}</p>
              <h3>
                {state.posts.find((post) => post.id === report.postId)?.title ||
                  t('Reported content', 'Conteúdo denunciado')}
              </h3>
              <p>{report.reason}</p>
              <small className="cpage-reference">{report.id}</small>
            </div>
            <button
              className="button-outline"
              onClick={() => {
                action.clear();
                setReviewing(report.postId);
              }}
            >
              {t('Review', 'Revisar')}
            </button>
          </article>
        ))}
        {!reports.length && (
          <Empty
            title={t('The queue is clear.', 'A fila está vazia.')}
            text={t(
              'Reports you are permitted to review will appear here.',
              'As denúncias que você tem permissão para revisar aparecerão aqui.'
            )}
          />
        )}
      </section>
      {reviewing && (
        <Modal
          title={t('Review reported content', 'Revisar conteúdo denunciado')}
          t={t}
          onClose={() => setReviewing(null)}
        >
          {selectedPost ? (
            <>
              <p className="eyebrow">{selectedPost.author}</p>
              <h3>{selectedPost.title}</h3>
              <p className="cpage-post-body">{selectedPost.body}</p>
              {selectedPost.image && (
                <img
                  className="cpage-detail-image"
                  src={selectedPost.image}
                  alt={selectedPost.title}
                />
              )}
            </>
          ) : (
            <p className="cpage-muted">
              {t(
                'The post is not in the currently loaded content. Reload or review the record through an authorized administrative workflow.',
                'A publicação não está no conteúdo carregado. Recarregue ou revise o registro por um fluxo administrativo autorizado.'
              )}
            </p>
          )}
          <Feedback action={action} />
          <div className="cpage-form-actions">
            <button className="button-outline" onClick={() => setReviewing(null)}>
              {t('Keep for review', 'Manter para revisão')}
            </button>
            <button
              className="button"
              disabled={action.busy || !isAllowed(reviewing)}
              onClick={async () => {
                if (
                  await action.run(
                    () => moderatePost(reviewing),
                    t('The post was removed.', 'A publicação foi removida.')
                  )
                )
                  setReviewing(null);
              }}
            >
              {action.busy ? t('Removing…', 'Removendo…') : t('Remove post', 'Remover publicação')}
            </button>
          </div>
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
  const t = translator(props.locale);
  return Page ? (
    <Page {...props} />
  ) : (
    <div className="cpage">
      <Empty
        title={t('A new chapter is ahead.', 'Um novo capítulo está por vir.')}
        text={t('This area is not available yet.', 'Esta área ainda não está disponível.')}
        action={
          <button className="button-outline" onClick={() => props.onNavigate('home')}>
            {t('Back to the club', 'Voltar ao clube')}
          </button>
        }
      />
    </div>
  );
}
