import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as messageService from '../services/messageService';

function formatTime(isoString) {
  return new Date(isoString).toLocaleString('fr-FR');
}

function Messaging() {
  const [globalMessages, setGlobalMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [openConversation, setOpenConversation] = useState(null);
  const [conversationMessages, setConversationMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [error, setError] = useState('');

  function loadConversations() {
    messageService.getConversations().then(setConversations);
  }

  useEffect(() => {
    messageService.getGlobalMessages().then(setGlobalMessages);
    loadConversations();
  }, []);

  async function openConversationWith(conversation) {
    setError('');
    setOpenConversation(conversation);
    try {
      const messages = await messageService.getPrivateMessages(conversation.other_user_id);
      setConversationMessages(messages);
      loadConversations();
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de charger la conversation');
    }
  }

  async function handleReply(e) {
    e.preventDefault();
    if (!replyText.trim() || !openConversation) return;
    setError('');
    try {
      await messageService.sendPrivateMessage(openConversation.other_user_id, replyText);
      const messages = await messageService.getPrivateMessages(openConversation.other_user_id);
      setConversationMessages(messages);
      setReplyText('');
      loadConversations();
    } catch (err) {
      setError(err.response?.data?.error || "Impossible d'envoyer le message");
    }
  }

  return (
    <div>
      <p>
        <Link to="/dashboard">Retour au tableau de bord</Link>
      </p>
      <h1>Messagerie</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <h2>Chat global</h2>
      <div style={{ border: '1px solid black', padding: '10px', marginBottom: '20px' }}>
        {globalMessages.length === 0 && <p>Aucun message.</p>}
        {globalMessages.map((msg) => (
          <p key={msg.id}>
            <strong>{msg.author_name}</strong> ({formatTime(msg.created_at)}) : {msg.content}
          </p>
        ))}
      </div>

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

export default Messaging;
