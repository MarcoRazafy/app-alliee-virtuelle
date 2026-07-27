// Helpers purs de la messagerie (extraits de MessagingView). Aucun état, aucun JSX.

export function formatMessageTime(isoString) {
  if (!isoString) return '';
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(isoString));
}

export function formatConversationTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return formatMessageTime(isoString);
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(date);
}

export function formatDateSeparator(isoString) {
  const date = new Date(isoString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (date.toDateString() === yesterday.toDateString()) return 'Hier';
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

export function sameCalendarDay(firstDate, secondDate) {
  if (!firstDate || !secondDate) return false;
  return new Date(firstDate).toDateString() === new Date(secondDate).toDateString();
}

export function requestErrorMessage(error, fallback) {
  const message = error.response?.data?.error || fallback;
  const status = error.response?.status;
  return status ? `${message} (HTTP ${status})` : message;
}

export function isImageType(type) {
  return typeof type === 'string' && type.startsWith('image/');
}

export function isAudioType(type) {
  return typeof type === 'string' && type.startsWith('audio/');
}

export function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
