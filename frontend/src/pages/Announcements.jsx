import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import EmployeeLayout from '../components/employee/EmployeeLayout';
import AdminLayout from '../components/admin/AdminLayout';
import useAuthStore from '../store/authStore';
import * as announcementService from '../services/announcementService';
import { notifySuccess, notifyError } from '../utils/toast';
import { formatDateTime } from '../utils/formatters';
import { IconBell, IconPencil, IconTrash, IconCheckCircle, IconUsers } from '../components/icons';
import '../styles/announcements.css';

function Announcements() {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'ADMIN';
  const Layout = isAdmin ? AdminLayout : EmployeeLayout;
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [readers, setReaders] = useState({}); // id -> [{ id, full_name, read_at }]
  const [form, setForm] = useState({ title: '', body: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', body: '' });

  const load = useCallback(() => {
    return announcementService
      .getAnnouncements()
      .then((data) => setItems(data.items || []))
      .catch(() => notifyError('Impossible de charger les annonces'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCard = useCallback(
    async (id) => {
      setExpandedId(id);
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

  // Ouverture directe d'une annonce depuis le popup (?open=<id>).
  useEffect(() => {
    const openId = searchParams.get('open');
    if (openId) {
      openCard(openId);
      searchParams.delete('open');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleCard(id) {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      openCard(id);
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;
    try {
      await announcementService.createAnnouncement({ title: form.title, body: form.body });
      notifySuccess('Annonce publiée');
      setForm({ title: '', body: '' });
      setShowCreate(false);
      load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de publier');
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditForm({ title: item.title, body: item.body });
  }

  async function handleUpdate(event, id) {
    event.preventDefault();
    try {
      await announcementService.updateAnnouncement(id, editForm);
      notifySuccess('Annonce modifiée');
      setEditingId(null);
      load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de modifier');
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Supprimer l'annonce « ${item.title} » ?`)) return;
    try {
      await announcementService.deleteAnnouncement(item.id);
      notifySuccess('Annonce supprimée');
      load();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de supprimer');
    }
  }

  const layoutProps = isAdmin ? {} : { title: 'Annonces', subtitle: "Les communications de l'équipe" };

  return (
    <Layout {...layoutProps}>
      <section className="announcements-page">
        <header className="announcements-head">
          <div>
            <h1 className="announcements-title"><IconBell /> Annonces</h1>
            <p className="announcements-subtitle">Communications de l'équipe. Cliquez pour lire et marquer comme lu.</p>
          </div>
          {isAdmin && (
            <button type="button" className="btn-primary" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? 'Annuler' : '+ Nouvelle annonce'}
            </button>
          )}
        </header>

        {isAdmin && showCreate && (
          <form className="announcement-form" onSubmit={handleCreate}>
            <input
              type="text"
              className="form-input"
              placeholder="Titre de l'annonce"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={200}
              required
            />
            <textarea
              className="form-input"
              rows="4"
              placeholder="Contenu de l'annonce…"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              required
            />
            <button type="submit" className="btn-primary">Publier</button>
          </form>
        )}

        {loading && <div className="empty-state">Chargement…</div>}
        {!loading && items.length === 0 && (
          <div className="empty-state">
            <IconBell />
            <strong>Aucune annonce</strong>
          </div>
        )}

        <div className="announcements-list">
          {items.map((item) => {
            const expanded = expandedId === item.id;
            const cardReaders = readers[item.id] || [];
            return (
              <article key={item.id} className={`announcement-card${item.is_read ? '' : ' announcement-card--unread'}`}>
                {editingId === item.id ? (
                  <form className="announcement-form" onSubmit={(e) => handleUpdate(e, item.id)}>
                    <input
                      type="text"
                      className="form-input"
                      value={editForm.title}
                      onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                      maxLength={200}
                      required
                    />
                    <textarea
                      className="form-input"
                      rows="4"
                      value={editForm.body}
                      onChange={(e) => setEditForm((f) => ({ ...f, body: e.target.value }))}
                      required
                    />
                    <div className="announcement-form-actions">
                      <button type="submit" className="btn-primary">Enregistrer</button>
                      <button type="button" className="btn-outline" onClick={() => setEditingId(null)}>Annuler</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <button type="button" className="announcement-card-head" onClick={() => toggleCard(item.id)}>
                      <div className="announcement-card-copy">
                        <strong>{item.title}</strong>
                        <span className="announcement-card-meta">
                          {item.author_name || 'Admin'} · {formatDateTime(item.created_at)}
                        </span>
                      </div>
                      <span className="announcement-card-right">
                        {!item.is_read && <span className="announcement-unread-dot" aria-label="Non lue" />}
                        <span className="announcement-read-count"><IconUsers /> {item.read_count}</span>
                      </span>
                    </button>

                    {expanded && (
                      <div className="announcement-card-detail">
                        <p className="announcement-body">{item.body}</p>

                        <div className="announcement-readers">
                          <p className="announcement-readers-title">
                            <IconCheckCircle /> Lu par {cardReaders.length}
                          </p>
                          {cardReaders.length === 0 ? (
                            <span className="announcement-readers-empty">Personne n'a encore lu cette annonce.</span>
                          ) : (
                            <ul className="announcement-readers-list">
                              {cardReaders.map((reader) => (
                                <li key={reader.id}>
                                  <span>{reader.full_name}</span>
                                  <time dateTime={reader.read_at}>{formatDateTime(reader.read_at)}</time>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        {isAdmin && (
                          <div className="announcement-admin-actions">
                            <button type="button" className="btn-outline" onClick={() => startEdit(item)}>
                              <IconPencil /> Modifier
                            </button>
                            <button type="button" className="btn-danger" onClick={() => handleDelete(item)}>
                              <IconTrash /> Supprimer
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </Layout>
  );
}

export default Announcements;
