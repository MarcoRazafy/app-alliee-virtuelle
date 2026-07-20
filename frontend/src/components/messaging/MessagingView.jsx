import { useEffect, useMemo, useRef, useState } from 'react';
import Pagination from '../Pagination';
import { IconChat, IconSearch, IconUser, IconX } from '../icons';
import * as messageService from '../../services/messageService';
import * as userService from '../../services/userService';
import * as teamAvatarService from '../../services/teamAvatarService';
import useAuthStore from '../../store/authStore';
import { notifyError, notifyInfo, notifySuccess } from '../../utils/toast';
import '../../styles/messaging.css';

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

function PinIcon({ filled = false, ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} aria-hidden="true" {...props}>
      <path
        d="M9 3h6l-.9 5.1 3.4 3.4v1.5H13v7l-1 1-1-1v-7H6.5v-1.5l3.4-3.4L9 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProfileAvatar({ name, avatarUrl, className = '' }) {
  return (
    <span
      className={`profile-avatar ${className}${avatarUrl ? '' : ' profile-avatar--fallback'}`}
      aria-hidden="true"
      title={name}
    >
      {avatarUrl ? <img src={avatarUrl} alt="" /> : <IconUser />}
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

function MessageComposer({ value, onChange, onSend, disabled, placeholder }) {
  function submitMessage() {
    if (!disabled && value.trim()) onSend();
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
  return (
    <form className="message-composer" onSubmit={handleSubmit}>
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
        className="message-send-button"
        disabled={disabled || !value.trim()}
        aria-label="Envoyer le message"
        title="Envoyer"
      >
        <SendIcon />
      </button>
    </form>
  );
}

function MessagingView({ enableBulk = false, initialRecipientId = null, initialChannel = null, channelNonce = null }) {
  const user = useAuthStore((state) => state.user);
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
  // Filtre de la liste piloté par le sous-menu sidebar (?canal=) : 'all' | 'groups' | 'members'
  const [listFilter, setListFilter] = useState('all');

  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const [availableUsers, setAvailableUsers] = useState([]);
  const [avatarUrls, setAvatarUrls] = useState({});
  const [newRecipientId, setNewRecipientId] = useState('');
  const [newMessageText, setNewMessageText] = useState('');
  const [newMessageOpen, setNewMessageOpen] = useState(false);

  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState([]);

  // Envoi groupé (admin uniquement)
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRecipientIds, setBulkRecipientIds] = useState([]);
  const [bulkMessage, setBulkMessage] = useState('');

  const [loadingGlobal, setLoadingGlobal] = useState(true);
  const [loadingPrivate, setLoadingPrivate] = useState(false);
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [sending, setSending] = useState(false);
  const [pinnedMemberIds, setPinnedMemberIds] = useState([]);

  const pinStorageKey = user?.id ? `alliee.messaging.pins.${user.id}` : null;

  const previousConversationUnreadRef = useRef(null);
  const previousGroupUnreadRef = useRef(null);
  const activeChannelRef = useRef(activeChannel);
  const openConversationRef = useRef(openConversation);
  const openGroupRef = useRef(openGroup);
  const initialHandledRef = useRef(false);

  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  useEffect(() => {
    openConversationRef.current = openConversation;
  }, [openConversation]);

  useEffect(() => {
    openGroupRef.current = openGroup;
  }, [openGroup]);

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

  async function loadGlobalMessages({ goToLastPage = false } = {}) {
    setLoadingGlobal(true);
    try {
      const data = await messageService.getGlobalMessages();
      setGlobalMessages(data);
      if (goToLastPage) {
        setPage(Math.max(1, Math.ceil(data.length / itemsPerPage)));
      }
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
    loadGlobalMessages({ goToLastPage: true });
    loadConversations().then((data) => {
      previousConversationUnreadRef.current = new Map(data.map((c) => [c.other_user_id, c.unread_count || 0]));
    });
    loadGroups().then((data) => {
      previousGroupUnreadRef.current = new Map(data.map((group) => [group.id, group.unread_count || 0]));
    });
    userService
      .getUsers()
      .then(setAvailableUsers)
      .catch(() => setAvailableUsers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const interval = window.setInterval(pollConversations, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeChannel !== 'global') return undefined;
    const interval = window.setInterval(async () => {
      try {
        const data = await messageService.getGlobalMessages();
        setGlobalMessages((current) => (data.length !== current.length ? data : current));
      } catch {
        /* silencieux */
      }
    }, 6000);
    return () => window.clearInterval(interval);
  }, [activeChannel]);

  useEffect(() => {
    if (activeChannel !== 'private' || !openConversation) return undefined;
    const otherUserId = openConversation.other_user_id;
    const interval = window.setInterval(async () => {
      try {
        const data = await messageService.getPrivateMessages(otherUserId);
        setConversationMessages((current) => (data.length !== current.length ? data : current));
      } catch {
        /* silencieux */
      }
    }, 6000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel, openConversation?.other_user_id]);

  useEffect(() => {
    if (activeChannel !== 'group' || !openGroup) return undefined;
    const groupId = openGroup.id;
    const interval = window.setInterval(async () => {
      try {
        const data = await messageService.getGroupMessages(groupId);
        setGroupMessages((current) => (data.length !== current.length ? data : current));
      } catch {
        /* silencieux */
      }
    }, 6000);
    return () => window.clearInterval(interval);
  }, [activeChannel, openGroup?.id]);

  useEffect(() => {
    if (!pinStorageKey) return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(pinStorageKey) || '[]');
      setPinnedMemberIds(Array.isArray(stored) ? stored : []);
    } catch {
      setPinnedMemberIds([]);
    }
  }, [pinStorageKey]);

  useEffect(() => {
    let cancelled = false;
    const createdObjectUrls = [];
    async function loadTeamAvatars() {
      const usersWithAvatar = availableUsers.filter((member) => member.has_avatar);
      if (usersWithAvatar.length === 0) {
        setAvatarUrls({});
        return;
      }
      const entries = await Promise.all(
        usersWithAvatar.map(async (member) => {
          try {
            const blob = await teamAvatarService.getUserAvatarBlob(member.id);
            const objectUrl = URL.createObjectURL(blob);
            createdObjectUrls.push(objectUrl);
            return [member.id, objectUrl];
          } catch {
            return [member.id, null];
          }
        })
      );
      if (cancelled) {
        entries.forEach(([, url]) => {
          if (url) URL.revokeObjectURL(url);
        });
        return;
      }
      setAvatarUrls(Object.fromEntries(entries.filter(([, url]) => Boolean(url))));
    }
    loadTeamAvatars();
    return () => {
      cancelled = true;
      createdObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [availableUsers]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') {
        setNewMessageOpen(false);
        setBulkOpen(false);
        setGroupCreateOpen(false);
      }
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const totalGlobalPages = Math.max(1, Math.ceil(globalMessages.length / itemsPerPage));

  useEffect(() => {
    if (page > totalGlobalPages) setPage(totalGlobalPages);
  }, [page, totalGlobalPages]);

  const paginatedGlobalMessages = useMemo(
    () => globalMessages.slice((page - 1) * itemsPerPage, page * itemsPerPage),
    [globalMessages, page, itemsPerPage]
  );

  const teamMembers = useMemo(() => {
    const conversationsByUser = new Map(conversations.map((conversation) => [conversation.other_user_id, conversation]));
    const directoryUserIds = new Set(availableUsers.map((member) => member.id));
    const directoryMembers = availableUsers.map((member) => {
      const conversation = conversationsByUser.get(member.id);
      return {
        conversation_id: conversation?.conversation_id || null,
        other_user_id: member.id,
        other_user_name: member.full_name,
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
    if (!query) return teamMembers;
    return teamMembers.filter((member) => {
      const name = member.other_user_name?.toLowerCase() || '';
      const preview = member.last_message_content?.toLowerCase() || '';
      const role = member.other_user_role === 'ADMIN' ? 'administrateur' : 'employé';
      return name.includes(query) || preview.includes(query) || role.includes(query);
    });
  }, [teamMembers, searchQuery]);

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return groups;
    return groups.filter((group) => {
      const memberNames = (group.members || []).map((member) => member.full_name).join(' ').toLowerCase();
      return group.name.toLowerCase().includes(query) || memberNames.includes(query);
    });
  }, [groups, searchQuery]);

  const pinnedMembers = filteredMembers.filter((member) => pinnedMemberIds.includes(member.other_user_id));
  const unpinnedMembers = filteredMembers.filter((member) => !pinnedMemberIds.includes(member.other_user_id));

  const visibleMessages =
    activeChannel === 'global' ? paginatedGlobalMessages : activeChannel === 'group' ? groupMessages : conversationMessages;
  const activeTitle =
    activeChannel === 'global'
      ? 'Équipe — Général'
      : activeChannel === 'group'
        ? openGroup?.name || 'Groupe'
        : openConversation?.other_user_name || 'Conversation';
  const activeSubtitle =
    activeChannel === 'global'
      ? "Salon général de l'équipe"
      : activeChannel === 'group'
        ? `${openGroup?.member_count || 0} membre${Number(openGroup?.member_count) > 1 ? 's' : ''} · Groupe privé`
        : openConversation?.other_user_role === 'ADMIN'
          ? 'Administrateur · Conversation privée'
          : 'Membre de l’équipe · Conversation privée';
  const latestGlobalMessage = globalMessages[globalMessages.length - 1];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [activeChannel, conversationMessages, groupMessages, paginatedGlobalMessages]);

  function togglePinnedMember(memberId) {
    setPinnedMemberIds((current) => {
      const next = current.includes(memberId) ? current.filter((id) => id !== memberId) : [memberId, ...current];
      if (pinStorageKey) window.localStorage.setItem(pinStorageKey, JSON.stringify(next));
      return next;
    });
  }

  async function handleSendGlobal() {
    const content = globalInput.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const sentMessage = await messageService.sendGlobalMessage(content);
      setGlobalInput('');
      if (sentMessage?.id) {
        setGlobalMessages((current) => [
          ...current,
          { ...sentMessage, author_name: sentMessage.author_name || user?.full_name || 'Vous' },
        ]);
      }
      await loadGlobalMessages({ goToLastPage: true });
    } catch (error) {
      notifyError(requestErrorMessage(error, "Impossible d'envoyer le message"));
    } finally {
      setSending(false);
    }
  }

  function openGlobalChannel() {
    setActiveChannel('global');
    setOpenConversation(null);
    setConversationMessages([]);
    setOpenGroup(null);
    setGroupMessages([]);
    setMobilePanel('chat');
  }

  async function openConversationWith(conversation) {
    setActiveChannel('private');
    setOpenConversation(conversation);
    setOpenGroup(null);
    setGroupMessages([]);
    setMobilePanel('chat');
    setLoadingPrivate(true);
    try {
      const messages = await messageService.getPrivateMessages(conversation.other_user_id);
      setConversationMessages(messages);
      await loadConversations();
    } catch (error) {
      setConversationMessages([]);
      notifyError(error.response?.data?.error || 'Impossible de charger la conversation');
    } finally {
      setLoadingPrivate(false);
    }
  }

  async function openGroupWith(group) {
    setActiveChannel('group');
    setOpenGroup(group);
    setOpenConversation(null);
    setConversationMessages([]);
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
    } finally {
      setLoadingGroup(false);
    }
  }

  // Ouverture automatique d'une conversation (ex : depuis « Voir les messages » d'une fiche employé)
  useEffect(() => {
    if (!initialRecipientId || initialHandledRef.current) return;
    if (availableUsers.length === 0) return;
    initialHandledRef.current = true;
    const member = teamMembers.find((m) => m.other_user_id === initialRecipientId);
    if (member) openConversationWith(member);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRecipientId, availableUsers, teamMembers]);

  // Canal ciblé via le sous-menu sidebar (?canal=global|equipe|groupes).
  // channelNonce (location.key) change à chaque navigation → réapplique même sur le même canal.
  useEffect(() => {
    if (!initialChannel || initialRecipientId) return;
    if (initialChannel === 'global') {
      setListFilter('all');
      openGlobalChannel();
    } else if (initialChannel === 'groupes') {
      setListFilter('groups');
      setMobilePanel('list');
    } else if (initialChannel === 'equipe') {
      setListFilter('members');
      setMobilePanel('list');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChannel, channelNonce]);

  async function handleReply() {
    const content = replyText.trim();
    if (!content || !openConversation || sending) return;
    setSending(true);
    try {
      const sentMessage = await messageService.sendPrivateMessage(openConversation.other_user_id, content);
      setReplyText('');
      if (sentMessage?.id) {
        setConversationMessages((current) => [
          ...current,
          { ...sentMessage, author_name: sentMessage.author_name || user?.full_name || 'Vous' },
        ]);
      }
      const [messages, updatedConversations] = await Promise.all([
        messageService.getPrivateMessages(openConversation.other_user_id),
        loadConversations(),
      ]);
      setConversationMessages(messages);
      const refreshedConversation = updatedConversations.find(
        (item) => item.other_user_id === openConversation.other_user_id
      );
      if (refreshedConversation) {
        setOpenConversation((current) => ({ ...current, ...refreshedConversation }));
      }
    } catch (error) {
      notifyError(requestErrorMessage(error, "Impossible d'envoyer le message"));
    } finally {
      setSending(false);
    }
  }

  async function handleGroupReply() {
    const content = groupReplyText.trim();
    if (!content || !openGroup || sending) return;
    setSending(true);
    try {
      const sentMessage = await messageService.sendGroupMessage(openGroup.id, content);
      setGroupReplyText('');
      setGroupMessages((current) => [
        ...current,
        { ...sentMessage, author_name: sentMessage.author_name || user?.full_name || 'Vous' },
      ]);
      const [messages, updatedGroups] = await Promise.all([
        messageService.getGroupMessages(openGroup.id),
        loadGroups(),
      ]);
      setGroupMessages(messages);
      const refreshedGroup = updatedGroups.find((item) => item.id === openGroup.id);
      if (refreshedGroup) setOpenGroup(refreshedGroup);
    } catch (error) {
      notifyError(requestErrorMessage(error, "Impossible d'envoyer le message au groupe"));
    } finally {
      setSending(false);
    }
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
      if (selectedMember) {
        await openConversationWith({ ...selectedMember, ...(conversation || {}) });
      }
    } catch (error) {
      notifyError(requestErrorMessage(error, "Impossible d'envoyer le message"));
    } finally {
      setSending(false);
    }
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
      const createdGroup = await messageService.createMessageGroup(name, groupMemberIds);
      setGroupName('');
      setGroupMemberIds([]);
      setGroupCreateOpen(false);
      notifySuccess(`Groupe « ${createdGroup.name} » créé`);
      await loadGroups();
      await openGroupWith(createdGroup);
    } catch (error) {
      notifyError(requestErrorMessage(error, 'Impossible de créer le groupe'));
    } finally {
      setSending(false);
    }
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
    } finally {
      setSending(false);
    }
  }

  function renderMember(member) {
    const isActive = activeChannel === 'private' && openConversation?.other_user_id === member.other_user_id;
    const isPinned = pinnedMemberIds.includes(member.other_user_id);
    return (
      <div className={`conversation-entry${isActive ? ' conversation-entry--active' : ''}`} key={member.other_user_id}>
        <button
          type="button"
          className={`conversation-item${isActive ? ' conversation-item--active' : ''}`}
          onClick={() => openConversationWith(member)}
        >
          <ProfileAvatar name={member.other_user_name} avatarUrl={avatarUrls[member.other_user_id]} className="conversation-avatar" />
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
                <span className="conversation-unread" aria-label={`${member.unread_count} message(s) non lu(s)`}>
                  {member.unread_count > 99 ? '99+' : member.unread_count}
                </span>
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
          <PinIcon filled={isPinned} />
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
        <span className="conversation-avatar conversation-avatar--group"><UsersIcon /></span>
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
              <span className="conversation-unread" aria-label={`${group.unread_count} message(s) non lu(s)`}>
                {group.unread_count > 99 ? '99+' : group.unread_count}
              </span>
            )}
          </span>
        </span>
      </button>
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
    if (visibleMessages.length === 0) {
      return (
        <div className="messaging-state">
          <span className="messaging-state-icon"><IconChat /></span>
          <h3>Aucun message</h3>
          <p>Commencez la conversation en envoyant un premier message.</p>
        </div>
      );
    }
    return visibleMessages.map((message, index) => {
      const previousMessage = visibleMessages[index - 1];
      const showDate = !previousMessage || !sameCalendarDay(previousMessage.created_at, message.created_at);
      const isOwnMessage = message.author_id === user?.id;
      return (
        <div key={message.id}>
          {showDate && <div className="message-date-separator"><span>{formatDateSeparator(message.created_at)}</span></div>}
          <div className={`message-row${isOwnMessage ? ' message-row--own' : ''}`}>
            {!isOwnMessage && (
              <ProfileAvatar name={message.author_name} avatarUrl={avatarUrls[message.author_id]} className="message-avatar" />
            )}
            <div className="message-bubble-wrap">
              {!isOwnMessage && activeChannel !== 'private' && <span className="message-author">{message.author_name}</span>}
              <div className={`message-bubble${isOwnMessage ? ' message-bubble--own' : ''}`}>
                <p>{message.content}</p>
              </div>
              <span className="message-time">{formatMessageTime(message.created_at)}</span>
            </div>
          </div>
        </div>
      );
    });
  }

  const bulkRecipients = availableUsers.filter((u) => u.role === 'EMPLOYEE');

  return (
    <section className="messaging-page">
      <div className="messaging-page-toolbar">
        <div>
          <p className="messaging-page-eyebrow">Communication interne</p>
          <p className="messaging-page-description">
            Retrouvez le salon général et tous les membres actifs de l'équipe, même avant le premier échange.
          </p>
        </div>
        <div className="messaging-toolbar-actions">
          <button type="button" className="messaging-secondary-button" onClick={() => setGroupCreateOpen(true)}>
            <UsersIcon />
            Créer un groupe
          </button>
          {enableBulk && (
            <button type="button" className="messaging-secondary-button" onClick={() => setBulkOpen(true)}>
              <UsersIcon />
              Message groupé
            </button>
          )}
          <button type="button" className="messaging-new-button" onClick={() => setNewMessageOpen(true)}>
            <PlusIcon />
            Nouveau message
          </button>
        </div>
      </div>

      <div className={`messaging-shell messaging-shell--${mobilePanel}`}>
        <aside className="conversation-sidebar" aria-label="Liste des conversations">
          <div className="conversation-sidebar-header">
            <div>
              <h2>Conversations</h2>
              <span>
                {groups.length} groupe{groups.length > 1 ? 's' : ''} · {teamMembers.length} membre{teamMembers.length > 1 ? 's' : ''}
              </span>
            </div>
            <button
              type="button"
              className="conversation-new-icon"
              onClick={() => setNewMessageOpen(true)}
              aria-label="Démarrer une nouvelle conversation"
              title="Nouveau message"
            >
              <PlusIcon />
            </button>
          </div>

          <label className="conversation-search">
            <IconSearch />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Rechercher un groupe ou un membre"
              aria-label="Rechercher un groupe ou un membre"
            />
          </label>

          {listFilter !== 'all' && (
            <button
              type="button"
              className="conversation-filter-notice"
              onClick={() => setListFilter('all')}
            >
              <span>{listFilter === 'groups' ? 'Groupes uniquement' : 'Équipe uniquement'}</span>
              <span className="conversation-filter-clear">Tout afficher</span>
            </button>
          )}

          <div className="conversation-list">
            {listFilter === 'all' && (
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
                  <UsersIcon />
                  Créer un groupe
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
                <div className="conversation-section-label">Tous les membres</div>
                {unpinnedMembers.map(renderMember)}
              </>
            )}

            {listFilter !== 'groups' && filteredMembers.length === 0 && listFilter === 'members' && (
              <div className="conversation-empty">
                <IconSearch />
                <p>Aucun membre à afficher.</p>
              </div>
            )}

            {filteredMembers.length === 0 && filteredGroups.length === 0 && searchQuery.trim() && (
              <div className="conversation-empty">
                <IconSearch />
                <p>Aucun groupe ou membre trouvé.</p>
              </div>
            )}
          </div>
        </aside>

        <section className="chat-panel" aria-label={activeTitle}>
          <header className="chat-header">
            <button type="button" className="chat-back-button" onClick={() => setMobilePanel('list')} aria-label="Retour aux conversations">
              <BackIcon />
            </button>
            {activeChannel === 'global' ? (
              <span className="conversation-avatar conversation-avatar--team"><IconChat /></span>
            ) : activeChannel === 'group' ? (
              <span className="conversation-avatar conversation-avatar--group"><UsersIcon /></span>
            ) : (
              <ProfileAvatar name={activeTitle} avatarUrl={avatarUrls[openConversation?.other_user_id]} className="conversation-avatar" />
            )}
            <div className="chat-header-copy">
              <h2>{activeTitle}</h2>
              <p>{activeSubtitle}</p>
            </div>
            {activeChannel === 'private' && openConversation && (
              <button
                type="button"
                className={`chat-pin-button${pinnedMemberIds.includes(openConversation.other_user_id) ? ' chat-pin-button--active' : ''}`}
                onClick={() => togglePinnedMember(openConversation.other_user_id)}
                aria-label={pinnedMemberIds.includes(openConversation.other_user_id) ? 'Désépingler cette conversation' : 'Épingler cette conversation'}
                title={pinnedMemberIds.includes(openConversation.other_user_id) ? 'Désépingler' : 'Épingler'}
              >
                <PinIcon filled={pinnedMemberIds.includes(openConversation.other_user_id)} />
              </button>
            )}
          </header>

          <div className="chat-messages" aria-live="polite">
            {renderMessages()}
            <div ref={messagesEndRef} />
          </div>

          {activeChannel === 'global' && globalMessages.length > itemsPerPage && (
            <div className="chat-pagination">
              <Pagination
                page={page}
                totalItems={globalMessages.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setPage}
                onItemsPerPageChange={(value) => {
                  setItemsPerPage(value);
                  setPage(1);
                }}
              />
            </div>
          )}

          <div className="chat-composer-wrap">
            {activeChannel === 'global' ? (
              <MessageComposer
                value={globalInput}
                onChange={setGlobalInput}
                onSend={handleSendGlobal}
                disabled={sending}
                placeholder="Écrire dans le salon général..."
              />
            ) : activeChannel === 'group' ? (
              <MessageComposer
                value={groupReplyText}
                onChange={setGroupReplyText}
                onSend={handleGroupReply}
                disabled={sending || !openGroup}
                placeholder={`Écrire dans ${openGroup?.name || 'le groupe'}...`}
              />
            ) : (
              <MessageComposer
                value={replyText}
                onChange={setReplyText}
                onSend={handleReply}
                disabled={sending || !openConversation}
                placeholder="Écrire un message..."
              />
            )}
            <p className="composer-hint">Entrée pour envoyer · Maj + Entrée pour revenir à la ligne</p>
          </div>
        </section>
      </div>

      {groupCreateOpen && (
        <div className="messaging-modal-backdrop" role="presentation" onMouseDown={() => setGroupCreateOpen(false)}>
          <section
            className="messaging-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-group-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="messaging-modal-header">
              <div>
                <span className="messaging-modal-icon"><UsersIcon /></span>
                <div>
                  <h2 id="create-group-title">Créer un groupe</h2>
                  <p>Donnez un nom au groupe puis choisissez les personnes qui pourront y participer.</p>
                </div>
              </div>
              <button type="button" className="messaging-modal-close" onClick={() => setGroupCreateOpen(false)} aria-label="Fermer la fenêtre">
                <IconX />
              </button>
            </div>

            <form className="messaging-modal-form" onSubmit={handleCreateGroup}>
              <label>
                <span>Nom du groupe</span>
                <input
                  type="text"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Ex. Dev"
                  minLength="2"
                  maxLength="100"
                  autoFocus
                  required
                />
              </label>

              <div className="msg-bulk-recipients-head">
                <span>Personnes sélectionnées ({groupMemberIds.length})</span>
                <button
                  type="button"
                  className="msg-bulk-selectall"
                  onClick={() =>
                    setGroupMemberIds(
                      groupMemberIds.length === availableUsers.length ? [] : availableUsers.map((member) => member.id)
                    )
                  }
                >
                  {groupMemberIds.length === availableUsers.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
              </div>

              <div className="msg-bulk-recipients">
                {availableUsers.map((member) => (
                  <label
                    key={member.id}
                    className={`msg-bulk-chip${groupMemberIds.includes(member.id) ? ' msg-bulk-chip--on' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={groupMemberIds.includes(member.id)}
                      onChange={() => toggleGroupMember(member.id)}
                    />
                    {member.full_name}
                  </label>
                ))}
                {availableUsers.length === 0 && <p className="messaging-modal-empty">Aucune personne active n'est disponible.</p>}
              </div>

              <p className="messaging-modal-hint">Vous serez automatiquement ajouté au groupe.</p>

              <div className="messaging-modal-actions">
                <button type="button" className="messaging-secondary-button" onClick={() => setGroupCreateOpen(false)}>
                  Annuler
                </button>
                <button
                  type="submit"
                  className="messaging-primary-button"
                  disabled={groupName.trim().length < 2 || groupMemberIds.length === 0 || sending}
                >
                  <UsersIcon />
                  {sending ? 'Création...' : 'Créer le groupe'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {newMessageOpen && (
        <div className="messaging-modal-backdrop" role="presentation" onMouseDown={() => setNewMessageOpen(false)}>
          <section
            className="messaging-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-message-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="messaging-modal-header">
              <div>
                <span className="messaging-modal-icon"><IconUser /></span>
                <div>
                  <h2 id="new-message-title">Nouveau message</h2>
                  <p>Démarrez une conversation privée avec un membre de l'équipe.</p>
                </div>
              </div>
              <button type="button" className="messaging-modal-close" onClick={() => setNewMessageOpen(false)} aria-label="Fermer la fenêtre">
                <IconX />
              </button>
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
                <textarea
                  rows="5"
                  value={newMessageText}
                  onChange={(event) => setNewMessageText(event.target.value)}
                  placeholder="Écrivez votre message..."
                  required
                />
              </label>

              {availableUsers.length === 0 && <p className="messaging-modal-empty">Aucun autre utilisateur actif n'est disponible.</p>}

              <div className="messaging-modal-actions">
                <button type="button" className="messaging-secondary-button" onClick={() => setNewMessageOpen(false)}>
                  Annuler
                </button>
                <button type="submit" className="messaging-primary-button" disabled={!newRecipientId || !newMessageText.trim() || sending}>
                  <SendIcon />
                  {sending ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {enableBulk && bulkOpen && (
        <div className="messaging-modal-backdrop" role="presentation" onMouseDown={() => setBulkOpen(false)}>
          <section
            className="messaging-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-message-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="messaging-modal-header">
              <div>
                <span className="messaging-modal-icon"><UsersIcon /></span>
                <div>
                  <h2 id="bulk-message-title">Message groupé</h2>
                  <p>Chaque destinataire reçoit le message dans sa propre conversation, sans voir les autres.</p>
                </div>
              </div>
              <button type="button" className="messaging-modal-close" onClick={() => setBulkOpen(false)} aria-label="Fermer la fenêtre">
                <IconX />
              </button>
            </div>

            <form className="messaging-modal-form" onSubmit={handleSendBulk}>
              <div className="msg-bulk-recipients-head">
                <span>Destinataires ({bulkRecipientIds.length})</span>
                <button
                  type="button"
                  className="msg-bulk-selectall"
                  onClick={() =>
                    setBulkRecipientIds(
                      bulkRecipientIds.length === bulkRecipients.length ? [] : bulkRecipients.map((r) => r.id)
                    )
                  }
                >
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
                <textarea
                  rows="4"
                  value={bulkMessage}
                  onChange={(event) => setBulkMessage(event.target.value)}
                  placeholder="Message pour les destinataires sélectionnés..."
                  required
                />
              </label>

              <div className="messaging-modal-actions">
                <button type="button" className="messaging-secondary-button" onClick={() => setBulkOpen(false)}>
                  Annuler
                </button>
                <button type="submit" className="messaging-primary-button" disabled={bulkRecipientIds.length === 0 || !bulkMessage.trim() || sending}>
                  <SendIcon />
                  {sending ? 'Envoi...' : `Envoyer (${bulkRecipientIds.length})`}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

export default MessagingView;
