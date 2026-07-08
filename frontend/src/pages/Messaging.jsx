import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as messageService from '../services/messageService';
import * as userService from '../services/userService';
import Pagination from '../components/Pagination';
import { notifySuccess, notifyError } from '../utils/toast';

function formatTime(isoString) {
  return new Date(isoString).toLocaleString('fr-FR');
}

function Messaging() {
  const [globalMessages, setGlobalMessages] = useState([]);
  const [globalInput, setGlobalInput] = useState('');
  const [conversations, setConversations] = useState([]);
  const [openConversation, setOpenConversation] = useState(null);
  const [conversationMessages, setConversationMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const [availableUsers, setAvailableUsers] = useState([]);
  const [newRecipientId, setNewRecipientId] = useState('');
  const [newMessageText, setNewMessageText] = useState('');

  function loadConversations() {
    messageService.getConversations().then(setConversations);
  }

  function loadGlobalMessages() {
    messageService.getGlobalMessages().then(setGlobalMessages);
  }

  useEffect(() => {
    loadGlobalMessages();
    loadConversations();
    userService.getUsers().then(setAvailableUsers).catch(() => setAvailableUsers([]));
  }, []);

  async function handleSendGlobal(e) {
    e.preventDefault();
    if (!globalInput.trim()) return;
    try {
      await messageService.sendGlobalMessage(globalInput);
      setGlobalInput('');
      loadGlobalMessages();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'envoyer le message");
    }
  }

  async function openConversationWith(conversation) {
    setOpenConversation(conversation);
    try {
      const messages = await messageService.getPrivateMessages(conversation.other_user_id);
      setConversationMessages(messages);
      loadConversations();
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger la conversation');
    }
  }

  async function handleReply(e) {
    e.preventDefault();
    if (!replyText.trim() || !openConversation) return;
    try {
      await messageService.sendPrivateMessage(openConversation.other_user_id, replyText);
      const messages = await messageService.getPrivateMessages(openConversation.other_user_id);
      setConversationMessages(messages);
      setReplyText('');
      loadConversations();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'envoyer le message");
    }
  }

  async function handleStartConversation(e) {
    e.preventDefault();
    if (!newRecipientId || !newMessageText.trim()) return;
    try {
      await messageService.sendPrivateMessage(newRecipientId, newMessageText);
      notifySuccess('Message envoyé');
      setNewMessageText('');
      setNewRecipientId('');
      const updated = await messageService.getConversations();
      setConversations(updated);
      const conversation = updated.find((c) => c.other_user_id === newRecipientId);
      if (conversation) {
        openConversationWith(conversation);
      }
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'envoyer le message");
    }
  }

  const usersWithoutConversation = availableUsers.filter(
    (user) => !conversations.some((conv) => conv.other_user_id === user.id)
  );

  const paginatedGlobalMessages = globalMessages.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  return (
    <div>
      <p>
        <Link to="/dashboard">Retour au tableau de bord</Link>
      </p>
      <h1>Messagerie</h1>

      <h2>Chat global</h2>
      <div style={{ border: '1px solid black', padding: '10px', marginBottom: '10px' }}>
        {globalMessages.length === 0 && <p>Aucun message.</p>}
        {paginatedGlobalMessages.map((msg) => (
          <p key={msg.id}>
            <strong>{msg.author_name}</strong> ({formatTime(msg.created_at)}) : {msg.content}
          </p>
        ))}
      </div>
      {globalMessages.length > 0 && (
        <div style={{ marginBottom: '10px' }}>
          <Pagination
            page={page}
            totalItems={globalMessages.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setPage}
            onItemsPerPageChange={setItemsPerPage}
          />
        </div>
      )}
      <form onSubmit={handleSendGlobal} style={{ marginBottom: '20px' }}>
        <input value={globalInput} onChange={(e) => setGlobalInput(e.target.value)} placeholder="Votre message" />
        <button type="submit">Envoyer</button>
      </form>

      <h2>Messages privés</h2>

      {usersWithoutConversation.length > 0 && (
        <form onSubmit={handleStartConversation} style={{ marginBottom: '20px' }}>
          <h3>Nouveau message</h3>
          <select value={newRecipientId} onChange={(e) => setNewRecipientId(e.target.value)}>
            <option value="">Choisir un destinataire</option>
            {usersWithoutConversation.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name} ({user.role})
              </option>
            ))}
          </select>
          <input
            value={newMessageText}
            onChange={(e) => setNewMessageText(e.target.value)}
            placeholder="Votre message"
          />
          <button type="submit" disabled={!newRecipientId}>
            Envoyer
          </button>
        </form>
      )}

      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1, border: '1px solid black', padding: '10px' }}>
          {conversations.length === 0 && <p>Aucune conversation.</p>}
          <ul>
            {conversations.map((conv) => (
              <li key={conv.conversation_id}>
                <button onClick={() => openConversationWith(conv)}>
                  {conv.other_user_name} — {conv.last_message_content || 'Aucun message'}
                  {conv.unread_count > 0 && (
                    <span
                      style={{
                        backgroundColor: 'red',
                        color: 'white',
                        borderRadius: '10px',
                        padding: '2px 6px',
                        marginLeft: '6px',
                      }}
                    >
                      {conv.unread_count}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ flex: 2, border: '1px solid black', padding: '10px' }}>
          {!openConversation && <p>Sélectionnez une conversation.</p>}
          {openConversation && (
            <div>
              <h3>Conversation avec {openConversation.other_user_name}</h3>
              {conversationMessages.map((msg) => (
                <p key={msg.id}>
                  <strong>{msg.author_name}</strong> ({formatTime(msg.created_at)}) : {msg.content}
                </p>
              ))}
              <form onSubmit={handleReply}>
                <input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Votre réponse" />
                <button type="submit">Envoyer</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Messaging;
