import { useEffect, useRef, useState } from 'react';
import { IconPaperclip, IconX, IconListUl, IconListOl, IconBarChart } from '../icons';
import { MicIcon, ImageIcon, SmileyIcon, SendIcon } from './messagingIcons';
import { isAudioType, isImageType, formatFileSize, formatDuration } from './messagingHelpers';
import { htmlToText } from '../../utils/sanitizeHtml';
import { notifyError, notifyInfo } from '../../utils/toast';

const COMPOSER_EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😅',
  '😉', '🙂', '😢', '😭', '😡', '👍', '👎', '👏', '🙏', '💪',
  '❤️', '🔥', '🎉', '✅', '❌', '⭐', '💯', '👌', '🤝', '😮',
];

// Composer avec pièce jointe, emoji et message vocal. onSend reçoit le fichier éventuel.
function MessageComposer({ value, onChange, onSend, disabled, placeholder, onCreatePoll }) {
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
  const editorRef = useRef(null);

  useEffect(() => {
    function onClickOutside(event) {
      if (emojiRef.current && !emojiRef.current.contains(event.target)) setEmojiOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => () => { if (recordTimerRef.current) clearInterval(recordTimerRef.current); }, []);

  // Synchronise le HTML externe (vidage après envoi, insertion d'emoji…) sans casser la frappe.
  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  function submitMessage() {
    if (disabled) return;
    if (!htmlToText(value) && !file) return;
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
  // Mise en forme WYSIWYG (balises sémantiques grâce à styleWithCSS=false → survivent au nettoyage).
  function exec(cmd) {
    if (disabled) return;
    editorRef.current?.focus();
    try {
      window.document.execCommand('styleWithCSS', false, false);
    } catch {
      /* ignoré */
    }
    window.document.execCommand(cmd, false, null);
    onChange(editorRef.current?.innerHTML || '');
  }
  function insertEmoji(emoji) {
    editorRef.current?.focus();
    window.document.execCommand('insertText', false, emoji);
    onChange(editorRef.current?.innerHTML || '');
    setEmojiOpen(false);
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
    // Sur mobile, on passe toujours par l'enregistreur natif du téléphone
    // (<input type="file" accept="audio/*" capture>) : il gère la permission micro de
    // façon fiable, y compris en PWA/standalone où getUserMedia est souvent bloqué (iOS).
    const isMobile = navigator.maxTouchPoints > 0 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile) {
      if (audioRef.current) audioRef.current.click();
      return;
    }
    // Desktop : le micro web (getUserMedia) exige un contexte sécurisé (HTTPS ou localhost).
    // En HTTP sur une IP réseau, il est indisponible.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      // Sur ordinateur, l'enregistrement est impossible en HTTP : on l'explique clairement
      // au lieu d'ouvrir un simple import de fichier.
      notifyInfo(
        'Pour enregistrer un message vocal en HTTP sur ordinateur, autorise le micro pour cette adresse : ' +
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
      notifyError('Micro non disponible ou permission refusée');
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
          <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} aria-label='Retirer la pièce jointe'>
            <IconX />
          </button>
        </div>
      )}

      {recording ? (
        <div className="msgr-recording">
          <button type="button" className="msgr-rec-cancel" onClick={() => stopRecording(true)} aria-label='Annuler'>
            <IconX />
          </button>
          <span className="msgr-rec-dot" />
          <span className="msgr-rec-time">Enregistrement… {formatDuration(recordSec)}</span>
          <button type="button" className="msgr-rec-stop" onClick={() => stopRecording(false)} aria-label="Arrêter l'enregistrement">
            <SendIcon />
          </button>
        </div>
      ) : (
        <>
          <div className="msgr-format-bar">
            <button type="button" className="msgr-format-btn" style={{ fontWeight: 800 }} title="Gras" aria-label="Gras" disabled={disabled} onMouseDown={(e) => { e.preventDefault(); exec('bold'); }}>B</button>
            <button type="button" className="msgr-format-btn" style={{ fontStyle: 'italic' }} title="Italique" aria-label="Italique" disabled={disabled} onMouseDown={(e) => { e.preventDefault(); exec('italic'); }}>I</button>
            <button type="button" className="msgr-format-btn" style={{ textDecoration: 'line-through' }} title="Barré" aria-label="Barré" disabled={disabled} onMouseDown={(e) => { e.preventDefault(); exec('strikeThrough'); }}>S</button>
            <button type="button" className="msgr-format-btn" title="Liste à puces" aria-label="Liste à puces" disabled={disabled} onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }}><IconListUl /></button>
            <button type="button" className="msgr-format-btn" title="Liste numérotée" aria-label="Liste numérotée" disabled={disabled} onMouseDown={(e) => { e.preventDefault(); exec('insertOrderedList'); }}><IconListOl /></button>
          </div>
          <div className="msgr-composer-row">
          <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,application/pdf,.doc,.docx,.xls,.xlsx" onChange={pickFile} />
          <input ref={audioRef} type="file" hidden accept="audio/*" capture onChange={pickAudio} />
          <button type="button" className="msgr-composer-icon" onClick={() => { if (fileRef.current) { fileRef.current.setAttribute('accept', 'image/png,image/jpeg,application/pdf,.doc,.docx,.xls,.xlsx'); fileRef.current.click(); } }} disabled={disabled} aria-label='Ajouter une pièce jointe' title='Fichier'>
            <IconPaperclip />
          </button>
          <button type="button" className="msgr-composer-icon" onClick={() => { if (fileRef.current) { fileRef.current.setAttribute('accept', 'image/*'); fileRef.current.click(); } }} disabled={disabled} aria-label='Ajouter une photo' title="Photo">
            <ImageIcon />
          </button>
          <button type="button" className="msgr-composer-icon" onClick={startRecording} disabled={disabled} aria-label='Message vocal' title='Message vocal'>
            <MicIcon />
          </button>
          {onCreatePoll && (
            <button type="button" className="msgr-composer-icon" onClick={onCreatePoll} disabled={disabled} aria-label='Créer un sondage' title='Sondage'>
              <IconBarChart />
            </button>
          )}
          <div className="msgr-emoji-anchor" ref={emojiRef}>
            <button type="button" className="msgr-composer-icon" onClick={() => setEmojiOpen((v) => !v)} disabled={disabled} aria-label="Emoji" title="Emoji">
              <SmileyIcon />
            </button>
            {emojiOpen && (
              <div className="msgr-emoji-picker">
                {COMPOSER_EMOJIS.map((emoji) => (
                  <button type="button" key={emoji} onMouseDown={(e) => { e.preventDefault(); insertEmoji(emoji); }}>
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div
            ref={editorRef}
            className="msgr-composer-input"
            contentEditable={!disabled}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label={placeholder}
            data-placeholder={placeholder}
            onInput={() => onChange(editorRef.current?.innerHTML || '')}
            onKeyDown={handleKeyDown}
          />
          <button
            type="submit"
            className="msgr-send-button"
            disabled={disabled || (!htmlToText(value) && !file)}
            aria-label='Envoyer le message'
            title='Envoyer'
          >
            <SendIcon />
          </button>
          </div>
        </>
      )}
    </form>
  );
}

export default MessageComposer;
