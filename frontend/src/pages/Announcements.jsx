import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import AdminLayout from '../components/admin/AdminLayout';
import useAuthStore from '../store/authStore';
import * as announcementService from '../services/announcementService';
import * as userService from '../services/userService';
import * as avatarService from '../services/avatarService';
import { notifySuccess, notifyError } from '../utils/toast';
import { formatDateTime } from '../utils/formatters';
import {
  IconMegaphone,
  IconBell,
  IconStar,
  IconPin,
  IconUsers,
  IconPencil,
  IconTrash,
  IconCheckCircle,
  IconSearch,
  IconX,
  IconPlus,
  IconArrowRight,
} from '../components/icons';
import RichTextEditor from '../components/RichTextEditor';
import { sanitizeHtml, htmlToText } from '../utils/sanitizeHtml';
import '../styles/announcements.css';

function initialsOf(name) {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

// Couleur d'avatar stable, dérivée du nom (fallback quand pas de photo).
const AVATAR_COLORS = ['#256bff', '#8b5cf6', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444'];
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function roleLabel(role) {
  return role === 'ADMIN' ? 'Admin' : 'Employé';
}

function timeOnly(iso) {
  try {
    return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '';
  }
}

// Avatar : photo réelle si disponible, sinon initiales colorées.
function Avatar({ name, size = 'md', src }) {
  if (src) {
    return <img className={`ann-avatar ann-avatar--${size} ann-avatar--photo`} src={src} alt={`Photo de ${name || ''}`} />;
  }
  return (
    <span className={`ann-avatar ann-avatar--${size}`} style={{ background: avatarColor(name) }} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

function ImagePlaceholderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="24" height="24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="8.5" cy="9.5" r="1.8" stroke="currentColor" strokeWidth="1.5" />
      <path d="m4 18 5-5 4 3 3-2 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const EMPTY_FORM = { title: '', body: '', is_important: false, is_pinned: false, file: null };

function Announcements() {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'ADMIN';
  const Layout = isAdmin ? AdminLayout : EmployeeLayout;
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState([]);
  const [recipients, setRecipients] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all'); // all | unread | important | pinned
  const [sort, setSort] = useState('recent'); // recent | old
  const [search, setSearch] = useState('');

  const [detailId, setDetailId] = useState(null);
  const [readers, setReaders] = useState({});

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Photos d'auteur + images uploadées (blobs authentifiés), mémorisées une fois chacune.
  const [authorAvatars, setAuthorAvatars] = useState({});
  const [imageUrls, setImageUrls] = useState({});
  const avatarFetched = useRef(new Set());
  const imageFetched = useRef(new Set());
  const objectUrls = useRef([]);

  const load = useCallback(() => {
    return announcementService
      .getAnnouncements()
      .then((data) => setItems(data.items || []))
      .catch(() => notifyError('Impossible de charger les annonces'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    userService
      .getUsers()
      .then((users) => setRecipients(Array.isArray(users) ? users.length : 0))
      .catch(() => setRecipients(0));
  }, [load]);

  // Récupère les photos d'auteur (une fois par auteur qui en a une).
  useEffect(() => {
    items.forEach((item) => {
      if (!item.author_has_avatar || !item.author_id || avatarFetched.current.has(item.author_id)) return;
      avatarFetched.current.add(item.author_id);
      avatarService
        .getUserAvatarBlob(item.author_id)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          objectUrls.current.push(url);
          setAuthorAvatars((prev) => ({ ...prev, [item.author_id]: url }));
        })
        .catch(() => avatarFetched.current.delete(item.author_id));
    });
  }, [items]);

  // Récupère les images uploadées (celles sans URL externe).
  useEffect(() => {
    items.forEach((item) => {
      if (!item.has_image || item.image_url || imageFetched.current.has(item.id)) return;
      imageFetched.current.add(item.id);
      announcementService
        .getAnnouncementImageBlob(item.id)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          objectUrls.current.push(url);
          setImageUrls((prev) => ({ ...prev, [item.id]: url }));
        })
        .catch(() => imageFetched.current.delete(item.id));
    });
  }, [items]);

  // Libère les blobs à la sortie de la page.
  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  // Source d'image d'une annonce : URL externe (seed) OU fichier uploadé (blob).
  const imageSrcOf = useCallback((item) => item?.image_url || imageUrls[item?.id] || null, [imageUrls]);

  const openDetail = useCallback(
    async (id) => {
      setDetailId(id);
      try {
        await announcementService.markAnnouncementRead(id);
        const r = await announcementService.getAnnouncementReaders(id);
        setReaders((prev) => ({ ...prev, [id]: r }));
        await load();
      } catch {
        /* silencieux */
      }
    },
    [load]
  );

  // Ouverture directe depuis une notification (?open=<id>). L'effet SUIT le paramètre :
  // avec des dépendances vides, cliquer une notification d'annonce alors qu'on se trouve
  // déjà sur la page ne rouvrait rien (même route → pas de remontage → effet jamais rejoué).
  // Le garde-fou évite de retraiter le même id, tout en se réarmant dès que le paramètre
  // disparaît (on peut donc rouvrir la même annonce plus tard).
  const openParam = searchParams.get('open');
  const handledOpenRef = useRef(null);
  useEffect(() => {
    if (!openParam) {
      handledOpenRef.current = null;
      return;
    }
    if (handledOpenRef.current === openParam) return;
    handledOpenRef.current = openParam;
    openDetail(openParam);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('open');
        return next;
      },
      { replace: true }
    );
  }, [openParam, openDetail, setSearchParams]);

  async function handleMarkRead(id) {
    try {
      await announcementService.markAnnouncementRead(id);
      await load();
    } catch {
      notifyError('Impossible de marquer comme lu');
    }
  }

  const counts = useMemo(
    () => ({
      total: items.length,
      unread: items.filter((item) => !item.is_read).length,
      important: items.filter((item) => item.is_important).length,
      pinned: items.filter((item) => item.is_pinned).length,
    }),
    [items]
  );

  const pinned = useMemo(() => items.find((item) => item.is_pinned) || null, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (tab === 'unread') list = list.filter((item) => !item.is_read);
    if (tab === 'important') list = list.filter((item) => item.is_important);
    if (tab === 'pinned') list = list.filter((item) => item.is_pinned);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (item) =>
          (item.title || '').toLowerCase().includes(q) || htmlToText(item.body).toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const diff = new Date(a.created_at) - new Date(b.created_at);
      return sort === 'recent' ? -diff : diff;
    });
  }, [items, tab, sort, search]);

  const recentActivity = useMemo(
    () => [...items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5),
    [items]
  );

  const detailItem = items.find((item) => item.id === detailId) || null;
  const editingItem = editingId ? items.find((item) => item.id === editingId) : null;
  const editingImageSrc = editingItem ? imageSrcOf(editingItem) : null;

  const filePreview = useMemo(() => (form.file ? URL.createObjectURL(form.file) : null), [form.file]);
  useEffect(() => () => filePreview && URL.revokeObjectURL(filePreview), [filePreview]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(item) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      body: item.body,
      is_important: Boolean(item.is_important),
      is_pinned: Boolean(item.is_pinned),
      file: null,
    });
    setDetailId(null);
    setModalOpen(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.title.trim() || !htmlToText(form.body) || submitting) return;
    setSubmitting(true);
    const payload = {
      title: form.title,
      body: form.body,
      is_important: form.is_important,
      is_pinned: form.is_pinned,
      file: form.file,
    };
    try {
      if (editingId) {
        await announcementService.updateAnnouncement(editingId, payload);
        notifySuccess('Annonce modifiée');
      } else {
        await announcementService.createAnnouncement(payload);
        notifySuccess('Annonce publiée');
      }
      setModalOpen(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
      // Une nouvelle image doit être re-téléchargée : on invalide le cache de cette annonce.
      if (editingId) {
        imageFetched.current.delete(editingId);
        setImageUrls((prev) => {
          const next = { ...prev };
          delete next[editingId];
          return next;
        });
      }
      load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible d’enregistrer');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Supprimer l'annonce « ${item.title} » ?`)) return;
    try {
      await announcementService.deleteAnnouncement(item.id);
      notifySuccess('Annonce supprimée');
      setDetailId(null);
      load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de supprimer');
    }
  }

  const layoutProps = isAdmin ? {} : { title: 'Annonces', subtitle: "Les communications de l'équipe" };

  const TABS = [
    { key: 'all', label: 'Toutes', icon: IconMegaphone, count: counts.total },
    { key: 'unread', label: 'Non lues', icon: IconBell, count: counts.unread },
    { key: 'important', label: 'Importantes', icon: IconStar, count: counts.important },
    { key: 'pinned', label: 'Épinglées', icon: IconPin, count: counts.pinned },
  ];

  function dotClass(item) {
    if (item.is_important) return 'ann-dot ann-dot--important';
    if (!item.is_read) return 'ann-dot ann-dot--unread';
    return 'ann-dot ann-dot--read';
  }

  return (
    <Layout {...layoutProps}>
      <section className="ann-page">
        <div className="ann-toolbar">
          <div className="ann-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`ann-tab${tab === t.key ? ' ann-tab--active' : ''}`}
                onClick={() => setTab(t.key)}
                aria-pressed={tab === t.key}
              >
                <t.icon />
                {t.label}
                <span className="ann-tab-count">{t.count}</span>
              </button>
            ))}
          </div>
          <div className="ann-toolbar-right">
            <label className="ann-search">
              <IconSearch />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher une annonce…"
                aria-label="Rechercher une annonce"
              />
            </label>
            <select className="ann-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Trier les annonces">
              <option value="recent">Plus récentes</option>
              <option value="old">Plus anciennes</option>
            </select>
            {isAdmin && (
              <button type="button" className="btn-primary ann-new-btn" onClick={openCreate}>
                <IconPlus /> Nouvelle annonce
              </button>
            )}
          </div>
        </div>

        <div className="ann-layout">
          <div className="ann-main">
            {loading && <div className="ann-empty">Chargement…</div>}
            {!loading && filtered.length === 0 && (
              <div className="ann-empty">
                <IconMegaphone />
                <strong>Aucune annonce</strong>
                <span>Rien à afficher dans cette vue pour le moment.</span>
              </div>
            )}

            <div className="ann-grid">
              {filtered.map((item) => (
                <article key={item.id} className={`ann-card${item.is_read ? '' : ' ann-card--unread'}`}>
                  <header className="ann-card-head">
                    <Avatar name={item.author_name} src={authorAvatars[item.author_id]} />
                    <div className="ann-card-author">
                      <strong>{item.author_name || 'Admin'}</strong>
                      <span>
                        {roleLabel(item.author_role)} · {formatDateTime(item.created_at)}
                      </span>
                    </div>
                    <span className={dotClass(item)} title={item.is_important ? 'Importante' : item.is_read ? 'Lue' : 'Non lue'} />
                  </header>

                  <h3 className="ann-card-title">
                    {item.is_important && <IconStar className="ann-card-star" />}
                    {item.title}
                  </h3>
                  <p className="ann-card-body">{htmlToText(item.body)}</p>

                  {imageSrcOf(item) && (
                    <div className="ann-card-image">
                      <img src={imageSrcOf(item)} alt="" loading="lazy" />
                    </div>
                  )}

                  <footer className="ann-card-foot">
                    <span className="ann-card-reads">
                      <IconUsers /> {item.read_count}
                    </span>
                    <div className="ann-card-foot-right">
                      {item.is_read ? (
                        <span className="ann-read-badge">
                          <IconCheckCircle /> Lue
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="ann-mark-read"
                          onClick={() => handleMarkRead(item.id)}
                          aria-label={`Marquer « ${item.title} » comme lu`}
                        >
                          <IconCheckCircle /> Marquer comme lu
                        </button>
                      )}
                      <button type="button" className="ann-more" onClick={() => openDetail(item.id)}>
                        Voir plus <IconArrowRight />
                      </button>
                    </div>
                  </footer>
                </article>
              ))}
            </div>
          </div>

          <aside className="ann-sidebar">
            {pinned && (
              <div className="ann-side-card">
                <p className="ann-side-title">📌 Annonce épinglée</p>
                <div className="ann-pinned">
                  <header className="ann-card-head">
                    <Avatar name={pinned.author_name} size="sm" src={authorAvatars[pinned.author_id]} />
                    <div className="ann-card-author">
                      <strong>{pinned.author_name || 'Admin'}</strong>
                      <span>
                        {roleLabel(pinned.author_role)} · {formatDateTime(pinned.created_at)}
                      </span>
                    </div>
                    <span className={dotClass(pinned)} />
                  </header>
                  <h3 className="ann-card-title">{pinned.title}</h3>
                  <p className="ann-card-body ann-card-body--clamp2">{htmlToText(pinned.body)}</p>
                  <button type="button" className="btn-outline ann-pinned-btn" onClick={() => openDetail(pinned.id)}>
                    Voir l'annonce
                  </button>
                </div>
              </div>
            )}

            <div className="ann-side-card">
              <div className="ann-side-head">
                <p className="ann-side-title"><IconBell /> Statistiques</p>
                <span className="ann-side-hint">30 derniers jours</span>
              </div>
              <div className="ann-stats">
                <div className="ann-stat">
                  <span className="ann-stat-icon"><IconMegaphone /></span>
                  <strong>{counts.total}</strong>
                  <span>Total annonces</span>
                </div>
                <div className="ann-stat">
                  <span className="ann-stat-icon"><IconBell /></span>
                  <strong>{counts.unread}</strong>
                  <span>Non lues</span>
                </div>
                <div className="ann-stat">
                  <span className="ann-stat-icon"><IconStar /></span>
                  <strong>{counts.important}</strong>
                  <span>Importantes</span>
                </div>
                <div className="ann-stat">
                  <span className="ann-stat-icon"><IconUsers /></span>
                  <strong>{recipients}</strong>
                  <span>Destinataires</span>
                </div>
              </div>
            </div>

            <div className="ann-side-card">
              <p className="ann-side-title"><IconMegaphone /> Activité récente</p>
              <ul className="ann-activity">
                {recentActivity.length === 0 && <li className="ann-activity-empty">Aucune activité.</li>}
                {recentActivity.map((item) => (
                  <li key={item.id} className="ann-activity-item">
                    <span className="ann-activity-bullet" />
                    <Avatar name={item.author_name} size="sm" src={authorAvatars[item.author_id]} />
                    <div className="ann-activity-copy">
                      <strong>{item.author_name || 'Admin'}</strong> a publié
                      <span>{item.title}</span>
                    </div>
                    <time>{timeOnly(item.created_at)}</time>
                  </li>
                ))}
              </ul>
              {recentActivity.length > 0 && (
                <button type="button" className="ann-activity-all" onClick={() => setTab('all')}>
                  Voir toute l'activité <IconArrowRight />
                </button>
              )}
            </div>
          </aside>
        </div>
      </section>

      {/* Détail d'une annonce */}
      {detailItem && createPortal(
        <div className="ann-modal-backdrop" role="presentation" onMouseDown={() => setDetailId(null)}>
          <section className="ann-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <button type="button" className="ann-modal-close" onClick={() => setDetailId(null)} aria-label="Fermer"><IconX /></button>
            <header className="ann-card-head">
              <Avatar name={detailItem.author_name} src={authorAvatars[detailItem.author_id]} />
              <div className="ann-card-author">
                <strong>{detailItem.author_name || 'Admin'}</strong>
                <span>{roleLabel(detailItem.author_role)} · {formatDateTime(detailItem.created_at)}</span>
              </div>
              {detailItem.is_important && <span className="ann-badge-important"><IconStar /> Importante</span>}
            </header>
            <h2 className="ann-modal-title">{detailItem.title}</h2>
            {imageSrcOf(detailItem) && (
              <div className="ann-modal-image">
                <img src={imageSrcOf(detailItem)} alt="" />
              </div>
            )}
            <div className="ann-modal-body ann-rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(detailItem.body) }} />

            <div className="ann-readers">
              <p className="ann-readers-title"><IconCheckCircle /> Lu par {(readers[detailItem.id] || []).length}</p>
              {(readers[detailItem.id] || []).length === 0 ? (
                <span className="ann-readers-empty">Personne n'a encore lu cette annonce.</span>
              ) : (
                <ul className="ann-readers-list">
                  {(readers[detailItem.id] || []).map((reader) => (
                    <li key={reader.id}>
                      <span>{reader.full_name}</span>
                      <time>{formatDateTime(reader.read_at)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {isAdmin && (
              <div className="ann-modal-actions">
                <button type="button" className="btn-outline" onClick={() => openEdit(detailItem)}><IconPencil /> Modifier</button>
                <button type="button" className="btn-danger" onClick={() => handleDelete(detailItem)}><IconTrash /> Supprimer</button>
              </div>
            )}
          </section>
        </div>,
        document.body
      )}

      {/* Création / édition (admin) */}
      {isAdmin && modalOpen && createPortal(
        <div className="ann-modal-backdrop" role="presentation" onMouseDown={() => setModalOpen(false)}>
          <section className="ann-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <button type="button" className="ann-modal-close" onClick={() => setModalOpen(false)} aria-label="Fermer"><IconX /></button>
            <h2 className="ann-modal-title">{editingId ? "Modifier l'annonce" : 'Nouvelle annonce'}</h2>
            <form className="ann-form" onSubmit={handleSubmit}>
              <label>
                <span>Titre</span>
                <input
                  type="text"
                  className="form-input"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  maxLength={200}
                  placeholder="Titre de l'annonce"
                  autoFocus
                  required
                />
              </label>
              <div className="ann-field">
                <span className="ann-field-label">Contenu</span>
                <RichTextEditor
                  value={form.body}
                  onChange={(html) => setForm((f) => ({ ...f, body: html }))}
                  placeholder="Contenu de l'annonce… (mise en forme disponible)"
                />
              </div>

              <label className="ann-file">
                <span className="ann-file-label">Image (facultatif)</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
                />
                <span className="ann-file-drop">
                  <span className="ann-file-thumb">
                    {filePreview ? (
                      <img src={filePreview} alt="" />
                    ) : editingImageSrc ? (
                      <img src={editingImageSrc} alt="" />
                    ) : (
                      <ImagePlaceholderIcon />
                    )}
                  </span>
                  <span className="ann-file-hint">
                    {form.file ? "Changer l'image" : editingImageSrc ? "Remplacer l'image" : 'Choisir une image (PNG, JPG, WebP)'}
                  </span>
                </span>
              </label>

              <div className="ann-form-flags">
                <label className="ann-check">
                  <input
                    type="checkbox"
                    checked={form.is_important}
                    onChange={(e) => setForm((f) => ({ ...f, is_important: e.target.checked }))}
                  />
                  <IconStar /> Marquer comme importante
                </label>
                <label className="ann-check">
                  <input
                    type="checkbox"
                    checked={form.is_pinned}
                    onChange={(e) => setForm((f) => ({ ...f, is_pinned: e.target.checked }))}
                  />
                  📌 Épingler (remplace l'épinglée actuelle)
                </label>
              </div>
              <div className="ann-modal-actions">
                <button type="button" className="btn-outline" onClick={() => setModalOpen(false)}>Annuler</button>
                <button type="submit" className="btn-primary" disabled={!form.title.trim() || !htmlToText(form.body) || submitting}>
                  {submitting ? 'Enregistrement…' : editingId ? 'Enregistrer' : 'Publier'}
                </button>
              </div>
            </form>
          </section>
        </div>,
        document.body
      )}
    </Layout>
  );
}

export default Announcements;
