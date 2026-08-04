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
  IconForward,
  IconPlus,
  IconLogout,
} from '../icons';
import * as messageService from '../../services/messageService';
import * as userService from '../../services/userService';
import * as teamAvatarService from '../../services/teamAvatarService';
import { getSocket } from '../../services/socket';
import useAuthStore from '../../store/authStore';
import { notifyError, notifyInfo, notifySuccess } from '../../utils/toast';
import '../../styles/messaging.css';
import { SendIcon, PlusIcon, UsersIcon, BackIcon, InfoIcon, SmileyIcon, ImageIcon, MicIcon } from './messagingIcons';
import LottieIcon from '../LottieIcon';
import { sanitizeHtml, linkifyHtml, htmlToText } from '../../utils/sanitizeHtml';
import {
  formatMessageTime,
  formatConversationTime,
  formatDateSeparator,
  sameCalendarDay,
  requestErrorMessage,
  isImageType,
  isAudioType,
  formatFileSize,
} from './messagingHelpers';
import MessageComposer from './MessageComposer';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '👏'];

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

  // Gestion de groupe : renommage inline, ajout de membres (modale), transfert de message (modale).
  const [groupRenaming, setGroupRenaming] = useState(false);
  const [groupRenameValue, setGroupRenameValue] = useState('');
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [addMemberIds, setAddMemberIds] = useState([]);
  const [forwardMessageId, setForwardMessageId] = useState(null);
  const [forwardTarget, setForwardTarget] = useState(null); // { type:'global'|'private'|'group', id }
  const groupPhotoInputRef = useRef(null);

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
    // Un groupe a changé (nom, photo, membres) : on rafraîchit la liste et le groupe ouvert.
    async function onGroupChanged(payload) {
      const data = await loadGroups();
      if (activeChannelRef.current !== 'group' || !openGroupRef.current) return;
      const fresh = data.find((group) => group.id === openGroupRef.current.id);
      if (fresh) {
        setOpenGroup(fresh);
      } else if (payload?.groupId === openGroupRef.current.id) {
        // On ne fait plus partie du groupe (retiré) : on ferme.
        setActiveChannel('global');
        setOpenGroup(null);
        setRightPanelOpen(false);
      }
    }
    // Un groupe a été supprimé : on ferme s'il était ouvert, et on rafraîchit la liste.
    function onGroupDeleted(payload) {
      loadGroups();
      if (openGroupRef.current && payload?.groupId === openGroupRef.current.id) {
        setActiveChannel('global');
        setOpenGroup(null);
        setRightPanelOpen(false);
      }
    }
    socket.on('message:new', onNewMessage);
    socket.on('group:changed', onGroupChanged);
    socket.on('group:deleted', onGroupDeleted);
    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('group:changed', onGroupChanged);
      socket.off('group:deleted', onGroupDeleted);
    };
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
      const preview = htmlToText(member.last_message_content).toLowerCase();
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
    const content = htmlToText(editText) ? editText : '';
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
    const content = htmlToText(globalInput) ? globalInput : '';
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
    const content = htmlToText(replyText) ? replyText : '';
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
    const content = htmlToText(groupReplyText) ? groupReplyText : '';
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
                {member.last_message_content
                  ? htmlToText(member.last_message_content)
                  : member.other_user_role === 'ADMIN'
                  ? 'Administrateur · Aucun échange'
                  : 'Membre · Aucun échange'}
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
              {group.last_message_content ? htmlToText(group.last_message_content) : `${group.member_count} membres · Aucun message`}
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
                    <button type="button" onClick={() => { setForwardMessageId(message.id); setForwardTarget(null); }} title="Transférer" aria-label="Transférer"><IconForward /></button>
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
                      <div
                        className="msgr-edit-input"
                        contentEditable
                        suppressContentEditableWarning
                        role="textbox"
                        aria-multiline="true"
                        aria-label="Modifier le message"
                        ref={(el) => { if (el && el.innerHTML !== editText) el.innerHTML = editText; }}
                        onInput={(e) => setEditText(e.currentTarget.innerHTML)}
                      />
                      <div className="msgr-edit-actions">
                        <button type="button" className="msgr-edit-cancel" onClick={() => { setEditingId(null); setEditText(''); }}>Annuler</button>
                        <button type="button" className="msgr-edit-save" onClick={() => saveEdit(message.id)} disabled={!htmlToText(editText)}>Enregistrer</button>
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
                      {message.content && (
                        <div
                          className="msgr-msg-text rich-text"
                          dangerouslySetInnerHTML={{ __html: linkifyHtml(sanitizeHtml(message.content)) }}
                        />
                      )}
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
            <span className="conversation-avatar conversation-avatar--team msgr-profile-avatar"><UsersIcon /></span>
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

        {activeChannel === 'group' && openGroup && (
          <>
            {canManageGroup && (
              <div className="msgr-profile-section">
                <p className="msgr-profile-label">Gérer le groupe</p>
                {groupRenaming ? (
                  <form className="msgr-group-rename" onSubmit={handleRenameGroup}>
                    <input
                      type="text"
                      value={groupRenameValue}
                      onChange={(e) => setGroupRenameValue(e.target.value)}
                      minLength={2}
                      maxLength={100}
                      autoFocus
                    />
                    <div className="msgr-group-rename-actions">
                      <button type="button" className="messaging-secondary-button" onClick={() => setGroupRenaming(false)}>Annuler</button>
                      <button type="submit" className="messaging-primary-button" disabled={groupRenameValue.trim().length < 2}>Renommer</button>
                    </div>
                  </form>
                ) : (
                  <div className="msgr-manage-actions">
                    <button type="button" className="msgr-manage-btn" onClick={startRenameGroup}><IconPencil /> Renommer</button>
                    <button type="button" className="msgr-manage-btn" onClick={() => groupPhotoInputRef.current?.click()}><ImageIcon /> Changer la photo</button>
                    <button type="button" className="msgr-manage-btn" onClick={() => { setAddMemberIds([]); setAddMembersOpen(true); }}><IconPlus /> Ajouter des membres</button>
                  </div>
                )}
                <input ref={groupPhotoInputRef} type="file" accept="image/png,image/jpeg" hidden onChange={handleGroupPhotoChange} />
              </div>
            )}

            {(openGroup.members || []).length > 0 && (
              <div className="msgr-profile-section">
                <p className="msgr-profile-label">Membres ({openGroup.member_count || openGroup.members.length})</p>
                <div className="msgr-profile-members">
                  {(openGroup.members || []).map((member) => (
                    <div className="msgr-profile-member" key={member.id}>
                      <ProfileAvatar name={member.full_name} avatarUrl={avatarUrls[member.id]} className="msgr-member-avatar" />
                      <div>
                        <strong>{member.full_name}{member.id === openGroup.created_by ? ' · Créateur' : ''}</strong>
                        <span>{member.role === 'ADMIN' ? 'Administrateur' : 'Employé'}</span>
                      </div>
                      {onlineUserIds.has(member.id) && <span className="msgr-member-online" title="En ligne" />}
                      {canManageGroup && member.id !== openGroup.created_by && member.id !== user?.id && (
                        <button
                          type="button"
                          className="msgr-member-remove"
                          title="Retirer du groupe"
                          aria-label={`Retirer ${member.full_name}`}
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          <IconX />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="msgr-profile-section msgr-profile-danger">
              <button type="button" className="msgr-leave-btn" onClick={handleLeaveGroup}>
                <IconLogout /> Quitter le groupe
              </button>
              {canManageGroup && (
                <button type="button" className="msgr-delete-btn" onClick={handleDeleteGroup}>
                  <IconTrash /> Supprimer le groupe
                </button>
              )}
            </div>
          </>
        )}
      </aside>
    );
  }

  // --- Gestion du groupe (créateur ou admin ; « Quitter » pour tous les membres) ---
  const canManageGroup =
    activeChannel === 'group' && openGroup && (openGroup.created_by === user?.id || isAdmin);
  // Personnes qui ne sont pas encore dans le groupe (pour « Ajouter des membres »).
  const memberCandidates = availableUsers.filter(
    (candidate) =>
      candidate.id !== user?.id && !(openGroup?.members || []).some((member) => member.id === candidate.id)
  );

  function startRenameGroup() {
    setGroupRenameValue(openGroup?.name || '');
    setGroupRenaming(true);
  }

  async function handleRenameGroup(event) {
    event.preventDefault();
    const name = groupRenameValue.trim();
    if (name.length < 2 || !openGroup) return;
    try {
      const updated = await messageService.updateGroup(openGroup.id, { name });
      setOpenGroup(updated);
      setGroupRenaming(false);
      loadGroups();
      notifySuccess('Groupe renommé');
    } catch (error) {
      notifyError(error.response?.data?.error || 'Impossible de renommer le groupe');
    }
  }

  async function handleGroupPhotoChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !openGroup) return;
    try {
      // Force le rechargement du blob avatar (mémorisé par id de groupe).
      groupAvatarFetchedRef.current.delete(openGroup.id);
      setGroupAvatarUrls((current) => {
        const next = { ...current };
        delete next[openGroup.id];
        return next;
      });
      const updated = await messageService.updateGroup(openGroup.id, { file });
      setOpenGroup(updated);
      await loadGroups();
      notifySuccess('Photo du groupe mise à jour');
    } catch (error) {
      notifyError(error.response?.data?.error || 'Impossible de changer la photo');
    }
  }

  async function handleAddMembers() {
    if (!openGroup || addMemberIds.length === 0) return;
    try {
      const updated = await messageService.addGroupMembers(openGroup.id, addMemberIds);
      setOpenGroup(updated);
      setAddMembersOpen(false);
      setAddMemberIds([]);
      loadGroups();
      notifySuccess('Membre(s) ajouté(s)');
    } catch (error) {
      notifyError(error.response?.data?.error || "Impossible d'ajouter des membres");
    }
  }

  async function handleRemoveMember(memberId) {
    if (!openGroup || !window.confirm('Retirer cette personne du groupe ?')) return;
    try {
      const updated = await messageService.removeGroupMember(openGroup.id, memberId);
      setOpenGroup(updated);
      loadGroups();
      notifySuccess('Membre retiré');
    } catch (error) {
      notifyError(error.response?.data?.error || 'Impossible de retirer ce membre');
    }
  }

  async function handleDeleteGroup() {
    if (!openGroup) return;
    if (!window.confirm(`Supprimer le groupe « ${openGroup.name} » ?\n\nCette action est irréversible : les messages seront perdus.`)) return;
    try {
      await messageService.deleteGroup(openGroup.id);
      setActiveChannel('global');
      setOpenGroup(null);
      setRightPanelOpen(false);
      loadGroups();
      notifySuccess('Groupe supprimé');
    } catch (error) {
      notifyError(error.response?.data?.error || 'Impossible de supprimer le groupe');
    }
  }

  async function handleLeaveGroup() {
    if (!openGroup || !window.confirm(`Quitter le groupe « ${openGroup.name} » ?`)) return;
    try {
      await messageService.leaveGroup(openGroup.id);
      setActiveChannel('global');
      setOpenGroup(null);
      setRightPanelOpen(false);
      loadGroups();
      notifySuccess('Vous avez quitté le groupe');
    } catch (error) {
      notifyError(error.response?.data?.error || 'Impossible de quitter le groupe');
    }
  }

  async function handleForward() {
    if (!forwardMessageId || !forwardTarget) return;
    try {
      await messageService.forwardMessage(forwardMessageId, forwardTarget);
      setForwardMessageId(null);
      setForwardTarget(null);
      loadConversations();
      loadGroups();
      notifySuccess('Message transféré');
    } catch (error) {
      notifyError(error.response?.data?.error || 'Impossible de transférer le message');
    }
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
            <button type="button" onClick={() => setGroupCreateOpen(true)} title="Créer un groupe" aria-label="Créer un groupe">
              <LottieIcon
                src="/icone/group-messege.json"
                trigger="hover"
                color="currentColor"
                style={{ width: 22, height: 22 }}
                fallback={<UsersIcon />}
              />
            </button>
            {enableBulk && (
              <button type="button" onClick={() => setBulkOpen(true)} title="Message groupé" aria-label="Message groupé"><PlusIcon /></button>
            )}
            <button type="button" onClick={() => setNewMessageOpen(true)} title="Nouveau message" aria-label="Nouveau message"><IconPencil /></button>
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
              <span className="conversation-avatar conversation-avatar--team">
              <LottieIcon
                src="/icone/group-messege.json"
                loop
                color="currentColor"
                style={{ width: 24, height: 24 }}
                fallback={<UsersIcon />}
              />
            </span>
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
            <span className="conversation-avatar conversation-avatar--team">
              <LottieIcon
                src="/icone/group-messege.json"
                loop
                color="currentColor"
                style={{ width: 24, height: 24 }}
                fallback={<UsersIcon />}
              />
            </span>
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

      {addMembersOpen && openGroup && (
        <div className="messaging-modal-backdrop" role="presentation" onMouseDown={() => setAddMembersOpen(false)}>
          <section className="messaging-modal" role="dialog" aria-modal="true" aria-labelledby="add-members-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="messaging-modal-header">
              <div>
                <span className="messaging-modal-icon"><IconPlus /></span>
                <div>
                  <h2 id="add-members-title">Ajouter des membres</h2>
                  <p>Choisissez les personnes à ajouter à « {openGroup.name} ».</p>
                </div>
              </div>
              <button type="button" className="messaging-modal-close" onClick={() => setAddMembersOpen(false)} aria-label="Fermer la fenêtre"><IconX /></button>
            </div>
            <div className="messaging-modal-form">
              <div className="msg-bulk-recipients-head">
                <span>Sélectionnées ({addMemberIds.length})</span>
              </div>
              <div className="msg-bulk-recipients">
                {memberCandidates.map((candidate) => (
                  <label key={candidate.id} className={`msg-bulk-chip${addMemberIds.includes(candidate.id) ? ' msg-bulk-chip--on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={addMemberIds.includes(candidate.id)}
                      onChange={() =>
                        setAddMemberIds((current) =>
                          current.includes(candidate.id)
                            ? current.filter((id) => id !== candidate.id)
                            : [...current, candidate.id]
                        )
                      }
                    />
                    {candidate.full_name}
                  </label>
                ))}
                {memberCandidates.length === 0 && <p className="messaging-modal-empty">Tout le monde est déjà dans le groupe.</p>}
              </div>
              <div className="messaging-modal-actions">
                <button type="button" className="messaging-secondary-button" onClick={() => setAddMembersOpen(false)}>Annuler</button>
                <button type="button" className="messaging-primary-button" disabled={addMemberIds.length === 0} onClick={handleAddMembers}>
                  <IconPlus /> Ajouter
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {forwardMessageId && (
        <div className="messaging-modal-backdrop" role="presentation" onMouseDown={() => { setForwardMessageId(null); setForwardTarget(null); }}>
          <section className="messaging-modal" role="dialog" aria-modal="true" aria-labelledby="forward-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="messaging-modal-header">
              <div>
                <span className="messaging-modal-icon"><IconForward /></span>
                <div>
                  <h2 id="forward-title">Transférer le message</h2>
                  <p>Choisissez la discussion de destination.</p>
                </div>
              </div>
              <button type="button" className="messaging-modal-close" onClick={() => { setForwardMessageId(null); setForwardTarget(null); }} aria-label="Fermer la fenêtre"><IconX /></button>
            </div>
            <div className="messaging-modal-form">
              <div className="msgr-forward-list">
                <button
                  type="button"
                  className={`msgr-forward-item${forwardTarget?.type === 'global' ? ' msgr-forward-item--on' : ''}`}
                  onClick={() => setForwardTarget({ type: 'global' })}
                >
                  <span className="conversation-avatar conversation-avatar--team"><UsersIcon /></span>
                  <span>Équipe — Général</span>
                </button>

                {groups.length > 0 && <p className="msgr-forward-label">Groupes</p>}
                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className={`msgr-forward-item${forwardTarget?.type === 'group' && forwardTarget.id === group.id ? ' msgr-forward-item--on' : ''}`}
                    onClick={() => setForwardTarget({ type: 'group', id: group.id })}
                  >
                    {groupAvatarNode(group)}
                    <span>{group.name}</span>
                  </button>
                ))}

                <p className="msgr-forward-label">Personnes</p>
                {availableUsers.filter((person) => person.id !== user?.id).map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    className={`msgr-forward-item${forwardTarget?.type === 'private' && forwardTarget.id === person.id ? ' msgr-forward-item--on' : ''}`}
                    onClick={() => setForwardTarget({ type: 'private', id: person.id })}
                  >
                    <ProfileAvatar name={person.full_name} avatarUrl={avatarUrls[person.id]} className="conversation-avatar" />
                    <span>{person.full_name}</span>
                  </button>
                ))}
              </div>
              <div className="messaging-modal-actions">
                <button type="button" className="messaging-secondary-button" onClick={() => { setForwardMessageId(null); setForwardTarget(null); }}>Annuler</button>
                <button type="button" className="messaging-primary-button" disabled={!forwardTarget} onClick={handleForward}>
                  <IconForward /> Transférer
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

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
