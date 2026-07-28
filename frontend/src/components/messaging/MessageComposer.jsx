import { useEffect, useRef, useState } from 'react';
import { IconPaperclip, IconX } from '../icons';
import { MicIcon, ImageIcon, SmileyIcon, SendIcon } from './messagingIcons';
import { isAudioType, isImageType, formatFileSize, formatDuration } from './messagingHelpers';
import { notifyError, notifyInfo } from '../../utils/toast';

const COMPOSER_EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😅',
  '😉', '🙂', '😢', '😭', '😡', '👍', '👎', '👏', '🙏', '💪',
  '❤️', '🔥', '🎉', '✅', '❌', '⭐', '💯', '👌', '🤝', '😮',
];

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
        "To record a voice message over HTTP on desktop, allow the microphone for this address: " +
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
        setFile(new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' }));
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordSec(0);
      recordTimerRef.current = window.setInterval(() => setRecordSec((sec) => sec + 1), 1000);
    } catch {
      notifyError('Microphone unavailable or permission denied');
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
          <span className="msgr-composer-file-name">{isVoiceFile ? 'Voice message' : file.name}</span>
          <span className="msgr-composer-file-size">{formatFileSize(file.size)}</span>
          <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} aria-label="Remove attachment">
            <IconX />
          </button>
        </div>
      )}

      {recording ? (
        <div className="msgr-recording">
          <button type="button" className="msgr-rec-cancel" onClick={() => stopRecording(true)} aria-label="Cancel">
            <IconX />
          </button>
          <span className="msgr-rec-dot" />
          <span className="msgr-rec-time">Recording… {formatDuration(recordSec)}</span>
          <button type="button" className="msgr-rec-stop" onClick={() => stopRecording(false)} aria-label="Stop recording">
            <SendIcon />
          </button>
        </div>
      ) : (
        <div className="msgr-composer-row">
          <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,application/pdf,.doc,.docx,.xls,.xlsx" onChange={pickFile} />
          <input ref={audioRef} type="file" hidden accept="audio/*" capture="user" onChange={pickAudio} />
          <button type="button" className="msgr-composer-icon" onClick={() => { if (fileRef.current) { fileRef.current.setAttribute('accept', 'image/png,image/jpeg,application/pdf,.doc,.docx,.xls,.xlsx'); fileRef.current.click(); } }} disabled={disabled} aria-label="Add an attachment" title="File">
            <IconPaperclip />
          </button>
          <button type="button" className="msgr-composer-icon" onClick={() => { if (fileRef.current) { fileRef.current.setAttribute('accept', 'image/png,image/jpeg'); fileRef.current.click(); } }} disabled={disabled} aria-label="Add a photo" title="Photo">
            <ImageIcon />
          </button>
          <button type="button" className="msgr-composer-icon" onClick={startRecording} disabled={disabled} aria-label="Voice message" title="Voice message">
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
            aria-label="Send message"
            title="Send"
          >
            <SendIcon />
          </button>
        </div>
      )}
    </form>
  );
}

export default MessageComposer;
