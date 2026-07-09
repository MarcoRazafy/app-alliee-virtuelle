import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import * as messageService from '../../services/messageService';
import * as userService from '../../services/userService';
import { notifySuccess, notifyError } from '../../utils/toast';

function formatTime(isoString) {
  return new Date(isoString).toLocaleString('fr-FR');
}

function AdminMessaging() {
  const location = useLocation();
  const [globalMessages, setGlobalMessages] = useState([]);
  const [globalInput, setGlobalInput] = useState('');
  const [conversations, setConversations] = useState([]);
  const [openConversation, setOpenConversation] = useState(null);
  const [conversationMessages, setConversationMessages] = useState([]);
  const [replyText, setReplyText] = useState('');

  const [employees, setEmployees] = useState([]);
  const [bulkRecipientIds, setBulkRecipientIds] = useState([]);
  const [bulkMessage, setBulkMessage] = useState('');

  function loadGlobal() {
    messageService.getGlobalMessages().then(setGlobalMessages);
  }

  function loadConversations() {
    return messageService.getConversations().then(setConversations);
  }

  useEffect(() => {
    loadGlobal();
    loadConversations();
    userService.getAllUsers({ role: 'EMPLOYEE', status: 'ACTIF' }).then(setEmployees);
  }, []);

  // Ouvre automatiquement la conversation avec l'employé passé depuis le détail employé
  useEffect(() => {
    const employeeId = location.state?.employeeId;
    if (!employeeId) return;

    messageService.getConversations().then((convs) => {
      setConversations(convs);
      const conv = convs.find((c) => c.other_user_id === employeeId);
      if (conv) {
        openConversationWith(conv);
        return;
      }
      // Pas encore de conversation : on en amorce une à partir de l'employé
      userService.getAllUsers({ role: 'EMPLOYEE' }).then((users) => {
        const employee = users.find((u) => u.id === employeeId);
        if (employee) {
          setOpenConversation({ other_user_id: employee.id, other_user_name: employee.full_name });
          setConversationMessages([]);
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  async function handleSendGlobal(e) {
    e.preventDefault();
    if (!globalInput.trim()) return;
    try {
      await messageService.sendGlobalMessage(globalInput);
      setGlobalInput('');
      loadGlobal();
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

  function toggleBulkRecipient(id) {
    setBulkRecipientIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSendBulk(e) {
    e.preventDefault();
    if (bulkRecipientIds.length === 0 || !bulkMessage.trim()) return;
    if (
      !window.confirm(
        `Envoyer ce message à ${bulkRecipientIds.length} employé(s) ? Chacun recevra le message dans sa propre conversation, sans voir les autres destinataires.`
      )
    ) {
      return;
    }
    try {
      await messageService.sendMessageToMultiple(bulkRecipientIds, bulkMessage);
      notifySuccess(`Message envoyé à ${bulkRecipientIds.length} employé(s)`);
      setBulkRecipientIds([]);
      setBulkMessage('');
      loadConversations();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'envoyer le message groupé");
    }
  }

  return (
    <div>
      <h1>Messagerie</h1>

      <h2>Chat global</h2>
      <div style={{ border: '1px solid black', padding: '10px', marginBottom: '10px' }}>
        {globalMessages.length === 0 && <p>Aucun message.</p>}
        {globalMessages.map((msg) => (
          <p key={msg.id}>
            <strong>{msg.author_name}</strong> ({formatTime(msg.created_at)}) : {msg.content}
          </p>
        ))}
      </div>
      <form onSubmit={handleSendGlobal} style={{ marginBottom: '20px' }}>
        <input value={globalInput} onChange={(e) => setGlobalInput(e.target.value)} placeholder="Votre message" />
        <button type="submit">Envoyer</button>
      </form>

      <h2>Envoyer un message à plusieurs</h2>
      <form onSubmit={handleSendBulk} style={{ border: '1px solid black', padding: '10px', marginBottom: '20px' }}>
        {employees.map((emp) => (
          <label key={emp.id} style={{ marginRight: '10px' }}>
            <input
              type="checkbox"
              checked={bulkRecipientIds.includes(emp.id)}
              onChange={() => toggleBulkRecipient(emp.id)}
            />
            {emp.full_name}
          </label>
        ))}
        <div>
          <input
            value={bulkMessage}
            onChange={(e) => setBulkMessage(e.target.value)}
            placeholder="Message pour les destinataires sélectionnés"
          />
          <button type="submit" disabled={bulkRecipientIds.length === 0}>
            Envoyer à {bulkRecipientIds.length} employé(s)
          </button>
        </div>
      </form>

      <h2>Messages privés</h2>
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

export default AdminMessaging;
