import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as announcementService from '../services/announcementService';
import { getSocket } from '../services/socket';
import { getUser } from '../services/auth';
import { IconBell, IconX } from './icons';
import { htmlToText } from '../utils/sanitizeHtml';
import '../styles/announcement-popup.css';

// Popup affiché quand il existe une annonce non lue (à la connexion / navigation, et en temps
// réel via announcement:new). L'utilisateur peut « Marquer comme lu » ou ouvrir l'annonce.
export default function AnnouncementPopup() {
  const navigate = useNavigate();
  const [announcement, setAnnouncement] = useState(null);
  // Annonces déjà écartées pendant cette session (pour ne pas re-popup en boucle).
  // Un ref (et non un state) pour que la vérif reste correcte dans les callbacks socket,
  // qui capturent la 1re instance de la fonction (deps [] de l'effet).
  const dismissedRef = useRef(new Set());

  function refresh() {
    if (!getUser()) return;
    announcementService
      .getUnread()
      .then((data) => {
        const latest = data.latest;
        setAnnouncement((current) => {
          if (!latest) return null;
          if (dismissedRef.current.has(latest.id)) return current;
          return latest;
        });
      })
      .catch(() => {});
  }

  useEffect(() => {
    refresh();
    const socket = getSocket();
    const onNew = () => refresh();
    socket.on('announcement:new', onNew);
    // Rattrapage : si le socket s'était déconnecté (onglet en arrière-plan, veille, coupure
    // réseau), on re-vérifie à la (re)connexion → l'annonce ratée en direct apparaît sans
    // avoir à rafraîchir la page manuellement.
    socket.on('connect', onNew);
    return () => {
      socket.off('announcement:new', onNew);
      socket.off('connect', onNew);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!announcement) return null;

  function dismiss() {
    dismissedRef.current.add(announcement.id);
    setAnnouncement(null);
  }

  async function handleMarkRead() {
    try {
      await announcementService.markAnnouncementRead(announcement.id);
    } catch {
      /* best-effort */
    }
    dismiss();
  }

  function handleOpen() {
    const id = announcement.id;
    dismiss();
    navigate(`/announcements?open=${id}`);
  }

  return (
    <div className="ann-popup" role="dialog" aria-label="Nouvelle annonce">
      <button type="button" className="ann-popup-close" onClick={dismiss} aria-label="Fermer">
        <IconX />
      </button>
      <div className="ann-popup-head">
        <span className="ann-popup-icon"><IconBell /></span>
        <div>
          <p className="ann-popup-kicker">Nouvelle annonce</p>
          <strong className="ann-popup-title">{announcement.title}</strong>
        </div>
      </div>
      <p className="ann-popup-body">{htmlToText(announcement.body)}</p>
      <div className="ann-popup-actions">
        <button type="button" className="ann-popup-btn ann-popup-btn--ghost" onClick={handleMarkRead}>
          Marquer comme lu
        </button>
        <button type="button" className="ann-popup-btn ann-popup-btn--primary" onClick={handleOpen}>
          Voir l'annonce
        </button>
      </div>
    </div>
  );
}
