import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconChat,
  IconSearch,
  IconUser,
  IconX,
  IconPaperclip,
  IconPencil,
  IconTrash,
  IconDownload,
} from '../icons';
import * as messageService from '../../services/messageService';
import * as userService from '../../services/userService';
import * as teamAvatarService from '../../services/teamAvatarService';
import { getSocket } from '../../services/socket';
import useAuthStore from '../../store/authStore';
import { notifyError, notifyInfo, notifySuccess } from '../../utils/toast';
import '../../styles/messaging.css';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '👏'];
const COMPOSER_EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😅',
  '😉', '🙂', '😢', '😭', '😡', '👍', '👎', '👏', '🙏', '💪',
  '❤️', '🔥', '🎉', '✅', '❌', '⭐', '💯', '👌', '🤝', '😮',
];

function SendIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m4 4 16 8-16 8 3-8-3-8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7.2 12H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function UsersIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.2a3 3 0 0 1 0 5.6M20.5 19a5.2 5.2 0 0 0-3.5-4.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BackIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InfoIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.8" r="1" fill="currentColor" />
    </svg>
  );
}

function SmileyIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="15" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}

function ImageIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8.5" cy="9.5" r="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m5 17 4.5-4.5 3 3L16 12l3 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProfileAvatar({ name, avatarUrl, className = '' }) {
  const initials = String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <span
      className={`profile-avatar ${className}${avatarUrl ? '' : ' profile-avatar--fallback'}`}
      aria-hidden="true"
      title={name}
    >
      {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initials || '?'}</span>}
    </span>
  );
}

function formatMessageTime(isoString) {
  if (!isoString) return '';
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(isoString));
}

function formatConversationTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return formatMessageTime(isoString);
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(date);
}

function formatDateSeparator(isoString) {
  const date = new Date(isoString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (date.toDateString() === yesterday.toDateString()) return 'Hier';
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

function sameCalendarDay(firstDate, secondDate) {
  if (!firstDate || !secondDate) return false;
  return new Date(firstDate).toDateString() === new Date(secondDate).toDateString();
}

function requestErrorMessage(error, fallback) {
  const message = error.response?.data?.error || fallback;
  const status = error.response?.status;
  return status ? `${message} (HTTP ${status})` : message;
}

function isImageType(type) {
  return typeof type === 'string' && type.startsWith('image/');
}

function isAudioType(type) {
  return typeof type === 'string' && type.startsWith('audio/');
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function MicIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// Composer avec pièce jointe, emoji et message vocal. onSend reçoit le fichier éventuel.
function MessageComposer({ value, onChange, onSend, disabled, placeholder }) {
  const [file, setFile] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const fileRef = useRef(null);
  const audioRef = useRef(null); // repli d'enregistrement natif (HTTP : micro web bloqué)
  const emojiRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordTimerRef = useRef(null);
  const recordCancelledRef = useRef(false);

  useEffect(() => {
    function onClickOutside(event) {
      if (emojiRef.current && !emojiRef.current.contains(event.target)) setEmojiOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => () => { if (recordTimerRef.current) clearInterval(recordTimerRef.current); }, []);

  function submitMessage() {
    if (disabled) return;
    if (!value.trim() && !file) return;
    onSend(file);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  }
  function handleSubmit(event) {
    event.preventDefault();
    submitMessage();
  }
  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  }
  function pickFile(event) {
    const selected = event.target.files?.[0];
    if (selected) setFile(selected);
  }

  // Fichier audio choisi via l'enregistreur natif (repli quand le micro web est bloqué en HTTP).
  function pickAudio(event) {
    const selected = event.target.files?.[0];
    if (selected) setFile(selected);
    if (audioRef.current) audioRef.current.value = '';
  }

  async function startRecording() {
    // Le micro web (getUserMedia) exige un contexte sécurisé (HTTPS ou localhost).
    // En HTTP sur une IP réseau, il est indisponible.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      // Sur mobile, l'enregistreur natif du téléphone fonctionne sans contexte sécurisé
      // (via <input type="file" accept="audio/*" capture>) : on l'utilise pour enregistrer.
      const isMobile = navigator.maxTouchPoints > 0 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      if (isMobile && audioRef.current) {
        audioRef.current.click();
        return;
      }
      // Sur ordinateur, l'enregistrement est impossible en HTTP : on l'explique clairement
      // au lieu d'ouvrir un simple import de fichier.
      notifyInfo(
        "Pour enregistrer un message vocal en HTTP sur ordinateur, autorise le micro pour cette adresse : " +
          "chrome://flags/#unsafely-treat-insecure-origin-as-secure → ajoute l'URL du site → Relaunch. " +
          "(Sur mobile, l'enregistrement fonctionne directement.)"
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recordCancelledRef.current = false;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (recordCancelledRef.current) return;
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setFile(new File([blob], `vocal-${Date.now()}.webm`, { type: 'audio/webm' }));
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordSec(0);
      recordTimerRef.current = window.setInterval(() => setRecordSec((sec) => sec + 1), 1000);
    } catch {
      notifyError("Micro non disponible ou permission refusée");
    }
  }
  function stopRecording(cancel = false) {
    recordCancelledRef.current = cancel;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    setRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }

  const isVoiceFile = file && isAudioType(file.type);

  return (
    <form className="msgr-composer" onSubmit={handleSubmit}>
      {file && (
        <div className="msgr-composer-file">
          {isVoiceFile ? <MicIcon /> : isImageType(file.type) ? <ImageIcon /> : <IconPaperclip />}
          <span className="msgr-composer-file-name">{isVoiceFile ? 'Message vocal' : file.name}</span>
          <span className="msgr-composer-file-size">{formatFileSize(file.size)}</span>
          <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} aria-label="Retirer la pièce jointe">
            <IconX />
          </button>
        </div>
      )}

      {recording ? (
        <div className="msgr-recording">
          <button type="button" className="msgr-rec-cancel" onClick={() => stopRecording(true)} aria-label="Annuler">
            <IconX />
          </button>
          <span className="msgr-rec-dot" />
          <span className="msgr-rec-time">Enregistrement… {formatDuration(recordSec)}</span>
          <button type="button" className="msgr-rec-stop" onClick={() => stopRecording(false)} aria-label="Arrêter l'enregistrement">
            <SendIcon />
          </button>
        </div>
      ) : (
        <div className="msgr-composer-row">
          <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,application/pdf,.doc,.docx,.xls,.xlsx" onChange={pickFile} />
          <input ref={audioRef} type="file" hidden accept="audio/*" capture="user" onChange={pickAudio} />
          <button type="button" className="msgr-composer-icon" onClick={() => { if (fileRef.current) { fileRef.current.setAttribute('accept', 'image/png,image/jpeg,application/pdf,.doc,.docx,.xls,.xlsx'); fileRef.current.click(); } }} disabled={disabled} aria-label="Ajouter une pièce jointe" title="Fichier">
            <IconPaperclip />
          </button>
          <button type="button" className="msgr-composer-icon" onClick={() => { if (fileRef.current) { fileRef.current.setAttribute('accept', 'image/png,image/jpeg'); fileRef.current.click(); } }} disabled={disabled} aria-label="Ajouter une photo" title="Photo">
            <ImageIcon />
          </button>
          <button type="button" className="msgr-composer-icon" onClick={startRecording} disabled={disabled} aria-label="Message vocal" title="Message vocal">
            <MicIcon />
          </button>
          <div className="msgr-emoji-anchor" ref={emojiRef}>
            <button type="button" className="msgr-composer-icon" onClick={() => setEmojiOpen((v) => !v)} disabled={disabled} aria-label="Emoji" title="Emoji">
              <SmileyIcon />
            </button>
            {emojiOpen && (
              <div className="msgr-emoji-picker">
                {COMPOSER_EMOJIS.map((emoji) => (
                  <button type="button" key={emoji} onClick={() => { onChange(value + emoji); setEmojiOpen(false); }}>
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <textarea
            rows="1"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label={placeholder}
            disabled={disabled}
          />
          <button
            type="submit"
            className="msgr-send-button"
            disabled={disabled || (!value.trim() && !file)}
            aria-label="Envoyer le message"
            title="Envoyer"
          >
            <SendIcon />
          </button>
        </div>
      )}
    </form>
  );
}

function MessagingView({ enableBulk = false, initialRecipientId = null, initialChannel = null, channelNonce = null }) {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'ADMIN';
  const messagesEndRef = useRef(null);

  const [globalMessages, setGlobalMessages] = useState([]);
  const [globalInput, setGlobalInput] = useState('');
  const [conversations, setConversations] = useState([]);
  const [groups, setGroups] = useState([]);
  const [openConversation, setOpenConversation] = useState(null);
  const [conversationMessages, setConversationMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [openGroup, setOpenGroup] = useState(null);
  const [groupMessages, setGroupMessages] = useState([]);
  const [groupReplyText, setGroupReplyText] = useState('');
  const [activeChannel, setActiveChannel] = useState('global');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobilePanel, setMobilePanel] = useState('list');
  // Onglet de liste : 'all' | 'unread' | 'members' | 'groups'
  const [listFilter, setListFilter] = useState('all');

  const [availableUsers, setAvailableUsers] = useState([]);
  const [avatarUrls, setAvatarUrls] = useState({});
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [newRecipientId, setNewRecipientId] = useState('');
  const [newMessageText, setNewMessageText] = useState('');
  const [newMessageOpen, setNewMessageOpen] = useState(false);

  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState([]);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRecipientIds, setBulkRecipientIds] = useState([]);
  const [bulkMessage, setBulkMessage] = useState('');

  const [loadingGlobal, setLoadingGlobal] = useState(true);
  const [loadingPrivate, setLoadingPrivate] = useState(false);
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [sending, setSending] = useState(false);
  const [pinnedMemberIds, setPinnedMemberIds] = useState([]);

  // Actions sur message + panneau profil
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [panelSearch, setPanelSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [reactPickerId, setReactPickerId] = useState(null);
  const [attachmentUrls, setAttachmentUrls] = useState({});
  const attachmentFetchedRef = useRef(new Set());
  const [groupAvatarUrls, setGroupAvatarUrls] = useState({});
  const groupAvatarFetchedRef = useRef(new Set());
  const [groupPhoto, setGroupPhoto] = useState(null);

  const pinStorageKey = user?.id ? `alliee.messaging.pins.${user.id}` : null;

  const previousConversationUnreadRef = useRef(null);
  const previousGroupUnreadRef = useRef(null);
  const activeChannelRef = useRef(activeChannel);
  const openConversationRef = useRef(openConversation);
  const openGroupRef = useRef(openGroup);
  const initialHandledRef = useRef(false);

  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);
  useEffect(() => { openConversationRef.current = openConversation; }, [openConversation]);
  useEffect(() => { openGroupRef.current = openGroup; }, [openGroup]);

  async function loadConversations() {
    try {
      const data = await messageService.getConversations();
      setConversations(data);
      return data;
    } catch (error) {
      setConversations([]);
      notifyError(error.response?.data?.error || 'Impossible de charger les conversations');
      return [];
    }
  }

  async function loadGlobalMessages() {
    setLoadingGlobal(true);
    try {
      const data = await messageService.getGlobalMessages();
      setGlobalMessages(data);
    } catch (error) {
      setGlobalMessages([]);
      notifyError(error.response?.data?.error || 'Impossible de charger le salon général');
    } finally {
      setLoadingGlobal(false);
    }
  }

  async function loadGroups() {
    try {
      const data = await messageService.getMessageGroups();
      setGroups(data);
      return data;
    } catch (error) {
      setGroups([]);
      notifyError(error.response?.data?.error || 'Impossible de charger les groupes');
      return [];
    }
  }

  useEffect(() => {
    loadGlobalMessages();
    loadConversations().then((data) => {
      previousConversationUnreadRef.current = new Map(data.map((c) => [c.other_user_id, c.unread_count || 0]));
    });
    loadGroups().then((data) => {
      previousGroupUnreadRef.current = new Map(data.map((group) => [group.id, group.unread_count || 0]));
    });
    userService.getUsers().then(setAvailableUsers).catch(() => setAvailableUsers([]));
    messageService.getOnlineUsers().then((ids) => setOnlineUserIds(new Set(ids))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Statut en ligne : rafraîchi périodiquement.
  useEffect(() => {
    const interval = window.setInterval(() => {
      messageService.getOnlineUsers().then((ids) => setOnlineUserIds(new Set(ids))).catch(() => {});
    }, 15000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function pollConversations() {
      const [data, groupData] = await Promise.all([loadConversations(), loadGroups()]);
      if (cancelled) return;
      const previous = previousConversationUnreadRef.current;
      if (previous) {
        data.forEach((conversation) => {
          const before = previous.get(conversation.other_user_id) || 0;
          const isOpenConversation =
            activeChannelRef.current === 'private' &&
            openConversationRef.current?.other_user_id === conversation.other_user_id;
          if ((conversation.unread_count || 0) > before && !isOpenConversation) {
            notifyInfo(`Nouveau message de ${conversation.other_user_name}`);
          }
        });
      }
      previousConversationUnreadRef.current = new Map(data.map((c) => [c.other_user_id, c.unread_count || 0]));

      const previousGroups = previousGroupUnreadRef.current;
      if (previousGroups) {
        groupData.forEach((group) => {
          const before = previousGroups.get(group.id) || 0;
          const isOpenGroup = activeChannelRef.current === 'group' && openGroupRef.current?.id === group.id;
          if ((group.unread_count || 0) > before && !isOpenGroup) {
            notifyInfo(`Nouveau message dans ${group.name}`);
          }
        });
      }
      previousGroupUnreadRef.current = new Map(groupData.map((group) => [group.id, group.unread_count || 0]));
    }
    const interval = window.setInterval(pollConversations, 20000);
    return () => { cancelled = true; window.clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeChannel !== 'global') return undefined;
    const interval = window.setInterval(async () => {
      try {
        const data = await messageService.getGlobalMessages();
        setGlobalMessages(data);
      } catch { /* silencieux */ }
    }, 15000);
    return () => window.clearInterval(interval);
  }, [activeChannel]);

  useEffect(() => {
    if (activeChannel !== 'private' || !openConversation) return undefined;
    const otherUserId = openConversation.other_user_id;
    const interval = window.setInterval(async () => {
      try {
        const data = await messageService.getPrivateMessages(otherUserId);
        setConversationMessages(data);
      } catch { /* silencieux */ }
    }, 15000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel, openConversation?.other_user_id]);

  useEffect(() => {
    if (activeChannel !== 'group' || !openGroup) return undefined;
    const groupId = openGroup.id;
    const interval = window.setInterval(async () => {
      try {
        const data = await messageService.getGroupMessages(groupId);
        setGroupMessages(data);
      } catch { /* silencieux */ }
    }, 15000);
    return () => window.clearInterval(interval);
  }, [activeChannel, openGroup?.id]);

  // Temps réel : à réception d'un nouveau message (WebSocket), on rafraîchit
  // immédiatement le canal ouvert + les listes (aperçus / non-lus). Le polling
  // ci-dessus reste en secours (réseau coupé, édition/suppression).
  useEffect(() => {
    const socket = getSocket();
    async function onNewMessage() {
      // Listes (aperçu du dernier message + compteur de non-lus)
      loadConversations();
      loadGroups();
      // Messages du canal actuellement ouvert
      const channel = activeChannelRef.current;
      try {
        if (channel === 'global') {
          setGlobalMessages(await messageService.getGlobalMessages());
        } else if (channel === 'private' && openConversationRef.current) {
          setConversationMessages(await messageService.getPrivateMessages(openConversationRef.current.other_user_id));
        } else if (channel === 'group' && openGroupRef.current) {
          setGroupMessages(await messageService.getGroupMessages(openGroupRef.current.id));
        }
      } catch { /* silencieux */ }
    }
    socket.on('message:new', onNewMessage);
    return () => { socket.off('message:new', onNewMessage); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pinStorageKey) return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(pinStorageKey) || '[]');
      setPinnedMemberIds(Array.isArray(stored) ? stored : []);
    } catch { setPinnedMemberIds([]); }
  }, [pinStorageKey]);

  useEffect(() => {
    let cancelled = false;
    const createdObjectUrls = [];
    async function loadTeamAvatars() {
      const usersWithAvatar = availableUsers.filter((member) => member.has_avatar);
      if (usersWithAvatar.length === 0) { setAvatarUrls({}); return; }
      const entries = await Promise.all(
        usersWithAvatar.map(async (member) => {
          try {
            const blob = await teamAvatarService.getUserAvatarBlob(member.id);
            const objectUrl = URL.createObjectURL(blob);
            createdObjectUrls.push(objectUrl);
            return [member.id, objectUrl];
          } catch { return [member.id, null]; }
        })
      );
      if (cancelled) { entries.forEach(([, url]) => { if (url) URL.revokeObjectURL(url); }); return; }
      setAvatarUrls(Object.fromEntries(entries.filter(([, url]) => Boolean(url))));
    }
    loadTeamAvatars();
    return () => { cancelled = true; createdObjectUrls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [availableUsers]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') {
        setNewMessageOpen(false);
        setBulkOpen(false);
        setGroupCreateOpen(false);
        setReactPickerId(null);
      }
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const teamMembers = useMemo(() => {
    const conversationsByUser = new Map(conversations.map((conversation) => [conversation.other_user_id, conversation]));
    const directoryUserIds = new Set(availableUsers.map((member) => member.id));
    const directoryMembers = availableUsers.map((member) => {
      const conversation = conversationsByUser.get(member.id);
      return {
        conversation_id: conversation?.conversation_id || null,
        other_user_id: member.id,
        other_user_name: member.full_name,
        other_user_email: member.email || null,
        other_user_role: member.role,
        has_avatar: Boolean(member.has_avatar),
        last_message_at: conversation?.last_message_at || null,
        last_message_content: conversation?.last_message_content || null,
        unread_count: conversation?.unread_count || 0,
      };
    });
    const conversationOnlyMembers = conversations
      .filter((conversation) => !directoryUserIds.has(conversation.other_user_id))
      .map((conversation) => ({ ...conversation, has_avatar: false }));
    return [...directoryMembers, ...conversationOnlyMembers].sort((first, second) => {
      const firstPinned = pinnedMemberIds.includes(first.other_user_id);
      const secondPinned = pinnedMemberIds.includes(second.other_user_id);
      if (firstPinned !== secondPinned) return firstPinned ? -1 : 1;
      if (first.last_message_at && second.last_message_at) {
        return new Date(second.last_message_at) - new Date(first.last_message_at);
      }
      if (first.last_message_at) return -1;
      if (second.last_message_at) return 1;
      return (first.other_user_name || '').localeCompare(second.other_user_name || '', 'fr');
    });
  }, [availableUsers, conversations, pinnedMemberIds]);

  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let list = teamMembers;
    if (listFilter === 'unread') list = list.filter((m) => (m.unread_count || 0) > 0);
    if (!query) return list;
    return list.filter((member) => {
      const name = member.other_user_name?.toLowerCase() || '';
      const preview = member.last_message_content?.toLowerCase() || '';
      const role = member.other_user_role === 'ADMIN' ? 'administrateur' : 'employé';
      return name.includes(query) || preview.includes(query) || role.includes(query);
    });
  }, [teamMembers, searchQuery, listFilter]);

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let list = groups;
    if (listFilter === 'unread') list = list.filter((g) => (g.unread_count || 0) > 0);
    if (!query) return list;
    return list.filter((group) => {
      const memberNames = (group.members || []).map((member) => member.full_name).join(' ').toLowerCase();
      return group.name.toLowerCase().includes(query) || memberNames.includes(query);
    });
  }, [groups, searchQuery, listFilter]);

  const pinnedMembers = filteredMembers.filter((member) => pinnedMemberIds.includes(member.other_user_id));
  const unpinnedMembers = filteredMembers.filter((member) => !pinnedMemberIds.includes(member.other_user_id));

  const visibleMessages =
    activeChannel === 'global' ? globalMessages : activeChannel === 'group' ? groupMessages : conversationMessages;

  const displayedMessages = useMemo(() => {
    const query = panelSearch.trim().toLowerCase();
    if (!query) return visibleMessages;
    return visibleMessages.filter((m) => (m.content || '').toLowerCase().includes(query));
  }, [visibleMessages, panelSearch]);

  const activeTitle =
    activeChannel === 'global'
      ? 'Équipe — Général'
      : activeChannel === 'group'
        ? openGroup?.name || 'Groupe'
        : openConversation?.other_user_name || 'Conversation';
  const otherOnline = activeChannel === 'private' && openConversation && onlineUserIds.has(openConversation.other_user_id);
  const activeSubtitle =
    activeChannel === 'global'
      ? "Salon général de l'équipe"
      : activeChannel === 'group'
        ? `${openGroup?.member_count || 0} membre${Number(openGroup?.member_count) > 1 ? 's' : ''} · Groupe privé`
        : otherOnline
          ? 'En ligne'
          : 'Hors ligne';
  const latestGlobalMessage = globalMessages[globalMessages.length - 1];

  // Charge les blobs des pièces jointes image/audio à afficher. Chaque message est traité
  // indépendamment (pas d'annulation globale) : le polling change la référence du tableau
  // toutes les quelques secondes, ce qui ne doit jamais interrompre un chargement en cours.
  useEffect(() => {
    const toFetch = visibleMessages.filter(
      (m) => m.has_attachment && (isImageType(m.attachment_type) || isAudioType(m.attachment_type)) && !attachmentFetchedRef.current.has(m.id)
    );
    toFetch.forEach(async (m) => {
      attachmentFetchedRef.current.add(m.id);
      try {
        const url = URL.createObjectURL(await messageService.getAttachmentBlob(m.id));
        setAttachmentUrls((current) => ({ ...current, [m.id]: url }));
      } catch {
        attachmentFetchedRef.current.delete(m.id); // autoriser une nouvelle tentative
      }
    });
  }, [visibleMessages]);

  // Avatars de groupe (blob authentifié), récupérés une fois par groupe, sans annulation
  // (même raison que pour les pièces jointes : le polling ne doit pas interrompre le chargement).
  useEffect(() => {
    const toFetch = groups.filter((g) => g.has_avatar && !groupAvatarFetchedRef.current.has(g.id));
    toFetch.forEach(async (g) => {
      groupAvatarFetchedRef.current.add(g.id);
      try {
        const url = URL.createObjectURL(await messageService.getGroupAvatarBlob(g.id));
        setGroupAvatarUrls((current) => ({ ...current, [g.id]: url }));
      } catch {
        groupAvatarFetchedRef.current.delete(g.id);
      }
    });
  }, [groups]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [activeChannel, conversationMessages, groupMessages, globalMessages]);

  // Avatar d'un groupe : photo si disponible, sinon icône par défaut.
  function groupAvatarNode(group, className = 'conversation-avatar') {
    const url = group && groupAvatarUrls[group.id];
    if (url) {
      return <span className={`${className} msgr-group-avatar-img`}><img src={url} alt="" /></span>;
    }
    return <span className={`${className} conversation-avatar--group`}><UsersIcon /></span>;
  }

  function togglePinnedMember(memberId) {
    setPinnedMemberIds((current) => {
      const next = current.includes(memberId) ? current.filter((id) => id !== memberId) : [memberId, ...current];
      if (pinStorageKey) window.localStorage.setItem(pinStorageKey, JSON.stringify(next));
      return next;
    });
  }

  // --- Mise à jour d'un message dans l'état (réaction / édition / suppression) ---
  function replaceMessage(updated) {
    const apply = (list) => list.map((m) => (m.id === updated.id ? { ...m, ...updated } : m));
    setGlobalMessages(apply);
    setConversationMessages(apply);
    setGroupMessages(apply);
  }
  function applyDelete(id) {
    const apply = (list) =>
      list.map((m) => (m.id === id ? { ...m, content: null, deleted_at: new Date().toISOString(), has_attachment: false, reactions: [] } : m));
    setGlobalMessages(apply);
    setConversationMessages(apply);
    setGroupMessages(apply);
  }

  async function handleReact(messageId, emoji) {
    setReactPickerId(null);
    try {
      const updated = await messageService.reactMessage(messageId, emoji);
      replaceMessage(updated);
    } catch (error) {
      notifyError(requestErrorMessage(error, "Impossible d'ajouter la réaction"));
    }
  }
  function startEdit(message) {
    setEditingId(message.id);
    setEditText(message.content || '');
  }
  async function saveEdit(messageId) {
    const content = editText.trim();
    if (!content) return;
    try {
      const updated = await messageService.editMessage(messageId, content);
      replaceMessage(updated);
      setEditingId(null);
      setEditText('');
    } catch (error) {
      notifyError(requestErrorMessage(error, 'Impossible de modifier le message'));
    }
  }
  async function handleDelete(messageId) {
    if (!window.confirm('Supprimer ce message ?')) return;
    try {
      await messageService.deleteMessage(messageId);
      applyDelete(messageId);
    } catch (error) {
      notifyError(requestErrorMessage(error, 'Impossible de supprimer le message'));
    }
  }
  async function downloadAttachment(message) {
    try {
      const blob = await messageService.getAttachmentBlob(message.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = message.attachment_name || 'piece-jointe';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      notifyError(requestErrorMessage(error, 'Impossible de télécharger la pièce jointe'));
    }
  }

  async function handleSendGlobal(file) {
    const content = globalInput.trim();
    if ((!content && !file) || sending) return;
    setSending(true);
    try {
      await messageService.sendGlobalMessage(content, file);
      setGlobalInput('');
      await loadGlobalMessages();
    } catch (error) {
      notifyError(requestErrorMessage(error, "Impossible d'envoyer le message"));
    } finally { setSending(false); }
  }

  function openGlobalChannel() {
    setActiveChannel('global');
    setOpenConversation(null);
    setConversationMessages([]);
    setOpenGroup(null);
    setGroupMessages([]);
    setPanelSearch('');
    setMobilePanel('chat');
  }

  async function openConversationWith(conversation) {
    setActiveChannel('private');
    setOpenConversation(conversation);
    setOpenGroup(null);
    setGroupMessages([]);
    setPanelSearch('');
    setMobilePanel('chat');
    setLoadingPrivate(true);
    try {
      const messages = await messageService.getPrivateMessages(conversation.other_user_id);
      setConversationMessages(messages);
      await loadConversations();
    } catch (error) {
      setConversationMessages([]);
      notifyError(error.response?.data?.error || 'Impossible de charger la conversation');
    } finally { setLoadingPrivate(false); }
  }

  async function openGroupWith(group) {
    setActiveChannel('group');
    setOpenGroup(group);
    setOpenConversation(null);
    setConversationMessages([]);
    setPanelSearch('');
    setMobilePanel('chat');
    setLoadingGroup(true);
    try {
      const messages = await messageService.getGroupMessages(group.id);
      setGroupMessages(messages);
      const updatedGroups = await loadGroups();
      const refreshedGroup = updatedGroups.find((item) => item.id === group.id);
      if (refreshedGroup) setOpenGroup(refreshedGroup);
    } catch (error) {
      setGroupMessages([]);
      notifyError(error.response?.data?.error || 'Impossible de charger le groupe');
    } finally { setLoadingGroup(false); }
  }

  useEffect(() => {
    if (!initialRecipientId || initialHandledRef.current) return;
    if (availableUsers.length === 0) return;
    initialHandledRef.current = true;
    const member = teamMembers.find((m) => m.other_user_id === initialRecipientId);
    if (member) openConversationWith(member);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRecipientId, availableUsers, teamMembers]);

  useEffect(() => {
    if (!initialChannel || initialRecipientId) return;
    if (initialChannel === 'global') { setListFilter('all'); openGlobalChannel(); }
    else if (initialChannel === 'groupes') { setListFilter('groups'); setMobilePanel('list'); }
    else if (initialChannel === 'equipe') { setListFilter('members'); setMobilePanel('list'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChannel, channelNonce]);

  async function handleReply(file) {
    const content = replyText.trim();
    if ((!content && !file) || !openConversation || sending) return;
    setSending(true);
    try {
      await messageService.sendPrivateMessage(openConversation.other_user_id, content, file);
      setReplyText('');
      const [messages] = await Promise.all([
        messageService.getPrivateMessages(openConversation.other_user_id),
        loadConversations(),
      ]);
      setConversationMessages(messages);
    } catch (error) {
      notifyError(requestErrorMessage(error, "Impossible d'envoyer le message"));
    } finally { setSending(false); }
  }

  async function handleGroupReply(file) {
    const content = groupReplyText.trim();
    if ((!content && !file) || !openGroup || sending) return;
    setSending(true);
    try {
      await messageService.sendGroupMessage(openGroup.id, content, file);
      setGroupReplyText('');
      const [messages] = await Promise.all([
        messageService.getGroupMessages(openGroup.id),
        loadGroups(),
      ]);
      setGroupMessages(messages);
    } catch (error) {
      notifyError(requestErrorMessage(error, "Impossible d'envoyer le message au groupe"));
    } finally { setSending(false); }
  }

  async function handleStartConversation(event) {
    event.preventDefault();
    const recipientId = newRecipientId;
    const content = newMessageText.trim();
    if (!recipientId || !content || sending) return;
    setSending(true);
    try {
      await messageService.sendPrivateMessage(recipientId, content);
      const updatedConversations = await loadConversations();
      const conversation = updatedConversations.find((item) => item.other_user_id === recipientId);
      setNewMessageText('');
      setNewRecipientId('');
      setNewMessageOpen(false);
      notifySuccess('Message envoyé');
      const selectedMember = teamMembers.find((member) => member.other_user_id === recipientId);
      if (selectedMember) await openConversationWith({ ...selectedMember, ...(conversation || {}) });
    } catch (error) {
      notifyError(requestErrorMessage(error, "Impossible d'envoyer le message"));
    } finally { setSending(false); }
  }

  function toggleGroupMember(id) {
    setGroupMemberIds((current) => (current.includes(id) ? current.filter((memberId) => memberId !== id) : [...current, id]));
  }

  async function handleCreateGroup(event) {
    event.preventDefault();
    const name = groupName.trim();
    if (name.length < 2 || groupMemberIds.length === 0 || sending) return;
    setSending(true);
    try {
      const createdGroup = await messageService.createMessageGroup(name, groupMemberIds, groupPhoto);
      setGroupName('');
      setGroupMemberIds([]);
      setGroupPhoto(null);
      setGroupCreateOpen(false);
      notifySuccess(`Groupe « ${createdGroup.name} » créé`);
      await loadGroups();
      await openGroupWith(createdGroup);
    } catch (error) {
      notifyError(requestErrorMessage(error, 'Impossible de créer le groupe'));
    } finally { setSending(false); }
  }

  function toggleBulkRecipient(id) {
    setBulkRecipientIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSendBulk(event) {
    event.preventDefault();
    const content = bulkMessage.trim();
    if (bulkRecipientIds.length === 0 || !content || sending) return;
    setSending(true);
    try {
      await messageService.sendMessageToMultiple(bulkRecipientIds, content);
      notifySuccess(`Message envoyé à ${bulkRecipientIds.length} destinataire(s)`);
      setBulkRecipientIds([]);
      setBulkMessage('');
      setBulkOpen(false);
      await loadConversations();
    } catch (error) {
      notifyError(requestErrorMessage(error, "Impossible d'envoyer le message groupé"));
    } finally { setSending(false); }
  }

  function renderMember(member) {
    const isActive = activeChannel === 'private' && openConversation?.other_user_id === member.other_user_id;
    const isPinned = pinnedMemberIds.includes(member.other_user_id);
    const online = onlineUserIds.has(member.other_user_id);
    return (
      <div className={`conversation-entry${isActive ? ' conversation-entry--active' : ''}`} key={member.other_user_id}>
        <button
          type="button"
          className={`conversation-item${isActive ? ' conversation-item--active' : ''}`}
          onClick={() => openConversationWith(member)}
        >
          <span className={`msgr-avatar-wrap${online ? ' msgr-avatar-wrap--online' : ''}`}>
            <ProfileAvatar name={member.other_user_name} avatarUrl={avatarUrls[member.other_user_id]} className="conversation-avatar" />
          </span>
          <span className="conversation-content">
            <span className="conversation-name-row">
              <strong>{member.other_user_name}</strong>
              <time>{formatConversationTime(member.last_message_at)}</time>
            </span>
            <span className="conversation-preview-row">
              <span className="conversation-preview">
                {member.last_message_content ||
                  (member.other_user_role === 'ADMIN' ? 'Administrateur · Aucun échange' : 'Membre · Aucun échange')}
              </span>
              {member.unread_count > 0 && (
                <span className="conversation-unread">{member.unread_count > 99 ? '99+' : member.unread_count}</span>
              )}
            </span>
          </span>
        </button>
        <button
          type="button"
          className={`conversation-pin-button${isPinned ? ' conversation-pin-button--active' : ''}`}
          onClick={() => togglePinnedMember(member.other_user_id)}
          aria-label={isPinned ? `Désépingler ${member.other_user_name}` : `Épingler ${member.other_user_name}`}
          title={isPinned ? 'Désépingler' : 'Épingler'}
        >
          ★
        </button>
      </div>
    );
  }

  function renderGroup(group) {
    const isActive = activeChannel === 'group' && openGroup?.id === group.id;
    return (
      <button
        type="button"
        className={`conversation-item${isActive ? ' conversation-item--active' : ''}`}
        onClick={() => openGroupWith(group)}
        key={group.id}
      >
        {groupAvatarNode(group)}
        <span className="conversation-content">
          <span className="conversation-name-row">
            <strong>{group.name}</strong>
            <time>{formatConversationTime(group.last_message_at)}</time>
          </span>
          <span className="conversation-preview-row">
            <span className="conversation-preview">
              {group.last_message_content || `${group.member_count} membres · Aucun message`}
            </span>
            {group.unread_count > 0 && (
              <span className="conversation-unread">{group.unread_count > 99 ? '99+' : group.unread_count}</span>
            )}
          </span>
        </span>
      </button>
    );
  }

  function renderReactions(message) {
    if (!message.reactions || message.reactions.length === 0) return null;
    return (
      <div className="msgr-reactions">
        {message.reactions.map((reaction) => (
          <button
            type="button"
            key={reaction.emoji}
            className={`msgr-reaction${reaction.mine ? ' msgr-reaction--mine' : ''}`}
            onClick={() => handleReact(message.id, reaction.emoji)}
            title={reaction.mine ? 'Retirer ma réaction' : 'Réagir'}
          >
            <span>{reaction.emoji}</span>
            <span className="msgr-reaction-count">{reaction.count}</span>
          </button>
        ))}
      </div>
    );
  }

  function renderMessages() {
    const isLoading = activeChannel === 'global' ? loadingGlobal : activeChannel === 'group' ? loadingGroup : loadingPrivate;
    if (isLoading) {
      return (
        <div className="messaging-state" role="status">
          <span className="messaging-loader" />
          <p>Chargement des messages...</p>
        </div>
      );
    }
    if (displayedMessages.length === 0) {
      return (
        <div className="messaging-state">
          <span className="messaging-state-icon"><IconChat /></span>
          <h3>{panelSearch ? 'Aucun résultat' : 'Aucun message'}</h3>
          <p>{panelSearch ? 'Aucun message ne correspond à votre recherche.' : 'Commencez la conversation en envoyant un premier message.'}</p>
        </div>
      );
    }
    return displayedMessages.map((message, index) => {
      const previousMessage = displayedMessages[index - 1];
      const showDate = !previousMessage || !sameCalendarDay(previousMessage.created_at, message.created_at);
      const isOwnMessage = message.author_id === user?.id;
      const isDeleted = Boolean(message.deleted_at);
      const canEdit = isOwnMessage && !isDeleted && message.content;
      const canDelete = (isOwnMessage || isAdmin) && !isDeleted;
      const isEditing = editingId === message.id;
      return (
        <div key={message.id}>
          {showDate && <div className="message-date-separator"><span>{formatDateSeparator(message.created_at)}</span></div>}
          <div className={`msgr-msg${isOwnMessage ? ' msgr-msg--own' : ''}`}>
            {!isOwnMessage && (
              <ProfileAvatar name={message.author_name} avatarUrl={avatarUrls[message.author_id]} className="message-avatar" />
            )}
            <div className="msgr-msg-main">
              {!isOwnMessage && activeChannel !== 'private' && <span className="message-author">{message.author_name}</span>}
              <div className="msgr-msg-line">
                {!isDeleted && !isEditing && (
                  <div className="msgr-msg-actions">
                    <button type="button" onClick={() => setReactPickerId((id) => (id === message.id ? null : message.id))} title="Réagir" aria-label="Réagir"><SmileyIcon /></button>
                    {canEdit && <button type="button" onClick={() => startEdit(message)} title="Modifier" aria-label="Modifier"><IconPencil /></button>}
                    {canDelete && <button type="button" onClick={() => handleDelete(message.id)} title="Supprimer" aria-label="Supprimer"><IconTrash /></button>}
                    {reactPickerId === message.id && (
                      <div className="msgr-react-picker">
                        {REACTIONS.map((emoji) => (
                          <button type="button" key={emoji} onClick={() => handleReact(message.id, emoji)}>{emoji}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className={`message-bubble${isOwnMessage ? ' message-bubble--own' : ''}${isDeleted ? ' message-bubble--deleted' : ''}`}>
                  {isDeleted ? (
                    <p className="msgr-deleted">Message supprimé</p>
                  ) : isEditing ? (
                    <div className="msgr-edit">
                      <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} autoFocus />
                      <div className="msgr-edit-actions">
                        <button type="button" className="msgr-edit-cancel" onClick={() => { setEditingId(null); setEditText(''); }}>Annuler</button>
                        <button type="button" className="msgr-edit-save" onClick={() => saveEdit(message.id)} disabled={!editText.trim()}>Enregistrer</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {message.has_attachment && (
                        isImageType(message.attachment_type) ? (
                          attachmentUrls[message.id] ? (
                            <a href={attachmentUrls[message.id]} target="_blank" rel="noreferrer" className="msgr-attach-image">
                              <img src={attachmentUrls[message.id]} alt={message.attachment_name || 'image'} />
                            </a>
                          ) : (
                            <div className="msgr-attach-loading"><ImageIcon /> Chargement…</div>
                          )
                        ) : isAudioType(message.attachment_type) ? (
                          attachmentUrls[message.id] ? (
                            <audio className="msgr-attach-audio" controls src={attachmentUrls[message.id]} />
                          ) : (
                            <div className="msgr-attach-loading"><MicIcon /> Chargement…</div>
                          )
                        ) : (
                          <button type="button" className="msgr-attach-file" onClick={() => downloadAttachment(message)}>
                            <IconPaperclip />
                            <span className="msgr-attach-file-name">{message.attachment_name}</span>
                            <span className="msgr-attach-file-size">{formatFileSize(message.attachment_size)}</span>
                            <IconDownload />
                          </button>
                        )
                      )}
                      {message.content && <p>{message.content}</p>}
                    </>
                  )}
                </div>
              </div>
              {!isEditing && renderReactions(message)}
              {!isDeleted && (
                <span className="message-time">
                  {formatMessageTime(message.created_at)}
                  {message.edited_at && <span className="msgr-edited"> · modifié</span>}
                </span>
              )}
            </div>
          </div>
        </div>
      );
    });
  }

  function renderRightPanel() {
    const online = otherOnline;
    const otherEmail =
      openConversation &&
      (openConversation.other_user_email ||
        availableUsers.find((u) => u.id === openConversation.other_user_id)?.email ||
        null);
    return (
      <aside className="msgr-profile">
        <button type="button" className="msgr-profile-close" onClick={() => setRightPanelOpen(false)} aria-label="Fermer">
          <IconX />
        </button>
        <div className="msgr-profile-hero">
          {activeChannel === 'group' ? (
            groupAvatarNode(openGroup, 'conversation-avatar msgr-profile-avatar')
          ) : activeChannel === 'global' ? (
            <span className="conversation-avatar conversation-avatar--team msgr-profile-avatar"><IconChat /></span>
          ) : (
            <ProfileAvatar name={activeTitle} avatarUrl={avatarUrls[openConversation?.other_user_id]} className="msgr-profile-avatar" />
          )}
          <h3>{activeTitle}</h3>
          {activeChannel === 'private' && openConversation && (
            <>
              <span className={`msgr-role-badge msgr-role-badge--${openConversation.other_user_role === 'ADMIN' ? 'admin' : 'employee'}`}>
                {openConversation.other_user_role === 'ADMIN' ? 'Administrateur' : 'Employé'}
              </span>
              <p className={`msgr-online-line${online ? ' msgr-online-line--on' : ''}`}>
                <span className="msgr-online-dot" /> {online ? 'En ligne' : 'Hors ligne'}
              </p>
            </>
          )}
          {activeChannel === 'group' && <p className="msgr-profile-sub">{openGroup?.member_count || 0} membres · Groupe privé</p>}
          {activeChannel === 'global' && <p className="msgr-profile-sub">Salon général de l'équipe</p>}
        </div>

        <div className="msgr-profile-section">
          <label className="msgr-profile-search">
            <IconSearch />
            <input
              type="search"
              value={panelSearch}
              onChange={(e) => setPanelSearch(e.target.value)}
              placeholder="Rechercher dans la conversation"
            />
          </label>
          {panelSearch && <p className="msgr-profile-hint">{displayedMessages.length} résultat{displayedMessages.length > 1 ? 's' : ''}</p>}
        </div>

        {activeChannel === 'private' && otherEmail && (
          <div className="msgr-profile-section">
            <p className="msgr-profile-label">Coordonnées</p>
            <a className="msgr-profile-contact" href={`mailto:${otherEmail}`} title={`Écrire à ${otherEmail}`}>
              <span className="msgr-contact-icon">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
                  <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="msgr-contact-text">
                <span className="msgr-contact-kind">E-mail</span>
                <span className="msgr-contact-value">{otherEmail}</span>
              </span>
            </a>
          </div>
        )}

        {activeChannel === 'group' && (openGroup?.members || []).length > 0 && (
          <div className="msgr-profile-section">
            <p className="msgr-profile-label">Membres de la discussion</p>
            <div className="msgr-profile-members">
              {(openGroup.members || []).map((member) => (
                <div className="msgr-profile-member" key={member.id}>
                  <ProfileAvatar name={member.full_name} avatarUrl={avatarUrls[member.id]} className="msgr-member-avatar" />
                  <div>
                    <strong>{member.full_name}</strong>
                    <span>{member.role === 'ADMIN' ? 'Administrateur' : 'Employé'}</span>
                  </div>
                  {onlineUserIds.has(member.id) && <span className="msgr-member-online" title="En ligne" />}
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    );
  }

  const bulkRecipients = availableUsers.filter((u) => u.role === 'EMPLOYEE');
  const groupPhotoUrl = useMemo(() => (groupPhoto ? URL.createObjectURL(groupPhoto) : null), [groupPhoto]);
  const TABS = [
    { key: 'all', label: 'Tout' },
    { key: 'unread', label: 'Non lu' },
    { key: 'members', label: 'Équipe' },
    { key: 'groups', label: 'Groupes' },
  ];

  return (
    <div className={`msgr msgr--${mobilePanel}${rightPanelOpen ? ' msgr--with-profile' : ''}`}>
      <aside className="msgr-sidebar" aria-label="Liste des conversations">
        <div className="msgr-sidebar-head">
          <h2>Discussions</h2>
          <div className="msgr-sidebar-head-actions">
            <button type="button" onClick={() => setGroupCreateOpen(true)} title="Créer un groupe" aria-label="Créer un groupe"><UsersIcon /></button>
            {enableBulk && (
              <button type="button" onClick={() => setBulkOpen(true)} title="Message groupé" aria-label="Message groupé"><PlusIcon /></button>
            )}
            <button type="button" onClick={() => setNewMessageOpen(true)} title="Nouveau message" aria-label="Nouveau message"><PlusIcon /></button>
          </div>
        </div>

        <label className="conversation-search">
          <IconSearch />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Rechercher dans Messenger"
            aria-label="Rechercher un groupe ou un membre"
          />
        </label>

        <div className="msgr-tabs">
          {TABS.map((tab) => (
            <button
              type="button"
              key={tab.key}
              className={`msgr-tab${listFilter === tab.key ? ' msgr-tab--active' : ''}`}
              onClick={() => setListFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="conversation-list">
          {(listFilter === 'all' || listFilter === 'unread') && (
            <button
              type="button"
              className={`conversation-item${activeChannel === 'global' ? ' conversation-item--active' : ''}`}
              onClick={openGlobalChannel}
            >
              <span className="conversation-avatar conversation-avatar--team"><IconChat /></span>
              <span className="conversation-content">
                <span className="conversation-name-row">
                  <strong>Équipe — Général</strong>
                  <time>{formatConversationTime(latestGlobalMessage?.created_at)}</time>
                </span>
                <span className="conversation-preview">{latestGlobalMessage?.content || "Salon général de l'équipe"}</span>
              </span>
            </button>
          )}

          {listFilter !== 'members' && filteredGroups.length > 0 && (
            <>
              <div className="conversation-section-label">Groupes</div>
              {filteredGroups.map(renderGroup)}
            </>
          )}

          {listFilter === 'groups' && filteredGroups.length === 0 && (
            <div className="conversation-empty">
              <UsersIcon />
              <p>Aucun groupe pour le moment.</p>
              <button type="button" className="messaging-secondary-button" onClick={() => setGroupCreateOpen(true)}>
                <UsersIcon /> Créer un groupe
              </button>
            </div>
          )}

          {listFilter !== 'groups' && pinnedMembers.length > 0 && (
            <>
              <div className="conversation-section-label">Épinglés</div>
              {pinnedMembers.map(renderMember)}
            </>
          )}

          {listFilter !== 'groups' && unpinnedMembers.length > 0 && (
            <>
              <div className="conversation-section-label">{listFilter === 'unread' ? 'Non lus' : 'Membres'}</div>
              {unpinnedMembers.map(renderMember)}
            </>
          )}

          {listFilter === 'unread' && filteredMembers.length === 0 && filteredGroups.length === 0 && (
            <div className="conversation-empty"><IconChat /><p>Aucun message non lu.</p></div>
          )}

          {filteredMembers.length === 0 && filteredGroups.length === 0 && searchQuery.trim() && (
            <div className="conversation-empty"><IconSearch /><p>Aucun groupe ou membre trouvé.</p></div>
          )}
        </div>
      </aside>

      <section className="msgr-chat" aria-label={activeTitle}>
        <header className="msgr-chat-head">
          <button type="button" className="msgr-back" onClick={() => setMobilePanel('list')} aria-label="Retour aux conversations">
            <BackIcon />
          </button>
          {activeChannel === 'global' ? (
            <span className="conversation-avatar conversation-avatar--team"><IconChat /></span>
          ) : activeChannel === 'group' ? (
            groupAvatarNode(openGroup)
          ) : (
            <span className={`msgr-avatar-wrap${otherOnline ? ' msgr-avatar-wrap--online' : ''}`}>
              <ProfileAvatar name={activeTitle} avatarUrl={avatarUrls[openConversation?.other_user_id]} className="conversation-avatar" />
            </span>
          )}
          <div className="msgr-chat-head-copy">
            <h2>{activeTitle}</h2>
            <p className={otherOnline ? 'msgr-head-online' : ''}>{activeSubtitle}</p>
          </div>
          <div className="msgr-chat-head-actions">
            <button type="button" onClick={() => { setRightPanelOpen(true); }} title="Rechercher" aria-label="Rechercher"><IconSearch /></button>
            <button
              type="button"
              className={rightPanelOpen ? 'msgr-head-btn--active' : ''}
              onClick={() => setRightPanelOpen((v) => !v)}
              title="Informations"
              aria-label="Informations"
            >
              <InfoIcon />
            </button>
          </div>
        </header>

        <div className="msgr-messages" aria-live="polite">
          {renderMessages()}
          <div ref={messagesEndRef} />
        </div>

        <div className="msgr-composer-wrap">
          {activeChannel === 'global' ? (
            <MessageComposer value={globalInput} onChange={setGlobalInput} onSend={handleSendGlobal} disabled={sending} placeholder="Écrire dans le salon général..." />
          ) : activeChannel === 'group' ? (
            <MessageComposer value={groupReplyText} onChange={setGroupReplyText} onSend={handleGroupReply} disabled={sending || !openGroup} placeholder={`Écrire dans ${openGroup?.name || 'le groupe'}...`} />
          ) : (
            <MessageComposer value={replyText} onChange={setReplyText} onSend={handleReply} disabled={sending || !openConversation} placeholder="Écrire un message..." />
          )}
        </div>
      </section>

      {rightPanelOpen && renderRightPanel()}

      {groupCreateOpen && (
        <div className="messaging-modal-backdrop" role="presentation" onMouseDown={() => setGroupCreateOpen(false)}>
          <section className="messaging-modal" role="dialog" aria-modal="true" aria-labelledby="create-group-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="messaging-modal-header">
              <div>
                <span className="messaging-modal-icon"><UsersIcon /></span>
                <div>
                  <h2 id="create-group-title">Créer un groupe</h2>
                  <p>Donnez un nom au groupe puis choisissez les personnes qui pourront y participer.</p>
                </div>
              </div>
              <button type="button" className="messaging-modal-close" onClick={() => setGroupCreateOpen(false)} aria-label="Fermer la fenêtre"><IconX /></button>
            </div>
            <form className="messaging-modal-form" onSubmit={handleCreateGroup}>
              <label className="msgr-group-photo">
                <input type="file" hidden accept="image/png,image/jpeg" onChange={(event) => setGroupPhoto(event.target.files?.[0] || null)} />
                <span className="msgr-group-photo-preview">
                  {groupPhotoUrl ? <img src={groupPhotoUrl} alt="" /> : <ImageIcon />}
                </span>
                <span className="msgr-group-photo-hint">{groupPhoto ? 'Changer la photo' : 'Ajouter une photo (facultatif)'}</span>
              </label>
              <label>
                <span>Nom du groupe</span>
                <input type="text" value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Ex. Dev" minLength="2" maxLength="100" autoFocus required />
              </label>
              <div className="msg-bulk-recipients-head">
                <span>Personnes sélectionnées ({groupMemberIds.length})</span>
                <button type="button" className="msg-bulk-selectall" onClick={() => setGroupMemberIds(groupMemberIds.length === availableUsers.length ? [] : availableUsers.map((member) => member.id))}>
                  {groupMemberIds.length === availableUsers.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
              </div>
              <div className="msg-bulk-recipients">
                {availableUsers.map((member) => (
                  <label key={member.id} className={`msg-bulk-chip${groupMemberIds.includes(member.id) ? ' msg-bulk-chip--on' : ''}`}>
                    <input type="checkbox" checked={groupMemberIds.includes(member.id)} onChange={() => toggleGroupMember(member.id)} />
                    {member.full_name}
                  </label>
                ))}
                {availableUsers.length === 0 && <p className="messaging-modal-empty">Aucune personne active n'est disponible.</p>}
              </div>
              <p className="messaging-modal-hint">Vous serez automatiquement ajouté au groupe.</p>
              <div className="messaging-modal-actions">
                <button type="button" className="messaging-secondary-button" onClick={() => setGroupCreateOpen(false)}>Annuler</button>
                <button type="submit" className="messaging-primary-button" disabled={groupName.trim().length < 2 || groupMemberIds.length === 0 || sending}>
                  <UsersIcon /> {sending ? 'Création...' : 'Créer le groupe'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {newMessageOpen && (
        <div className="messaging-modal-backdrop" role="presentation" onMouseDown={() => setNewMessageOpen(false)}>
          <section className="messaging-modal" role="dialog" aria-modal="true" aria-labelledby="new-message-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="messaging-modal-header">
              <div>
                <span className="messaging-modal-icon"><IconUser /></span>
                <div>
                  <h2 id="new-message-title">Nouveau message</h2>
                  <p>Démarrez une conversation privée avec un membre de l'équipe.</p>
                </div>
              </div>
              <button type="button" className="messaging-modal-close" onClick={() => setNewMessageOpen(false)} aria-label="Fermer la fenêtre"><IconX /></button>
            </div>
            <form className="messaging-modal-form" onSubmit={handleStartConversation}>
              <label>
                <span>Destinataire</span>
                <select value={newRecipientId} onChange={(event) => setNewRecipientId(event.target.value)} required>
                  <option value="">Choisir un membre de l'équipe</option>
                  {availableUsers.map((availableUser) => (
                    <option key={availableUser.id} value={availableUser.id}>
                      {availableUser.full_name} — {availableUser.role === 'ADMIN' ? 'Administrateur' : 'Employé'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Message</span>
                <textarea rows="5" value={newMessageText} onChange={(event) => setNewMessageText(event.target.value)} placeholder="Écrivez votre message..." required />
              </label>
              {availableUsers.length === 0 && <p className="messaging-modal-empty">Aucun autre utilisateur actif n'est disponible.</p>}
              <div className="messaging-modal-actions">
                <button type="button" className="messaging-secondary-button" onClick={() => setNewMessageOpen(false)}>Annuler</button>
                <button type="submit" className="messaging-primary-button" disabled={!newRecipientId || !newMessageText.trim() || sending}>
                  <SendIcon /> {sending ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {enableBulk && bulkOpen && (
        <div className="messaging-modal-backdrop" role="presentation" onMouseDown={() => setBulkOpen(false)}>
          <section className="messaging-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-message-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="messaging-modal-header">
              <div>
                <span className="messaging-modal-icon"><UsersIcon /></span>
                <div>
                  <h2 id="bulk-message-title">Message groupé</h2>
                  <p>Chaque destinataire reçoit le message dans sa propre conversation, sans voir les autres.</p>
                </div>
              </div>
              <button type="button" className="messaging-modal-close" onClick={() => setBulkOpen(false)} aria-label="Fermer la fenêtre"><IconX /></button>
            </div>
            <form className="messaging-modal-form" onSubmit={handleSendBulk}>
              <div className="msg-bulk-recipients-head">
                <span>Destinataires ({bulkRecipientIds.length})</span>
                <button type="button" className="msg-bulk-selectall" onClick={() => setBulkRecipientIds(bulkRecipientIds.length === bulkRecipients.length ? [] : bulkRecipients.map((r) => r.id))}>
                  {bulkRecipientIds.length === bulkRecipients.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
              </div>
              <div className="msg-bulk-recipients">
                {bulkRecipients.map((emp) => (
                  <label key={emp.id} className={`msg-bulk-chip${bulkRecipientIds.includes(emp.id) ? ' msg-bulk-chip--on' : ''}`}>
                    <input type="checkbox" checked={bulkRecipientIds.includes(emp.id)} onChange={() => toggleBulkRecipient(emp.id)} />
                    {emp.full_name}
                  </label>
                ))}
                {bulkRecipients.length === 0 && <p className="messaging-modal-empty">Aucun employé actif disponible.</p>}
              </div>
              <label>
                <span>Message</span>
                <textarea rows="4" value={bulkMessage} onChange={(event) => setBulkMessage(event.target.value)} placeholder="Message pour les destinataires sélectionnés..." required />
              </label>
              <div className="messaging-modal-actions">
                <button type="button" className="messaging-secondary-button" onClick={() => setBulkOpen(false)}>Annuler</button>
                <button type="submit" className="messaging-primary-button" disabled={bulkRecipientIds.length === 0 || !bulkMessage.trim() || sending}>
                  <SendIcon /> {sending ? 'Envoi...' : `Envoyer (${bulkRecipientIds.length})`}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default MessagingView;
