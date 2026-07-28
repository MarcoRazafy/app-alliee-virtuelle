import { useEffect, useRef } from 'react';

// Constantes et helpers de la page Présence admin (extraits pour alléger AdminPresence).

export const PRESENCE_META = {
  present: { label: 'Present', cls: 'present' },
  late: { label: 'Late', cls: 'late' },
  partial: { label: 'Partial presence', cls: 'partial' },
  outside: { label: 'Off schedule', cls: 'outside' },
  absent: { label: 'Absent', cls: 'absent' },
  waiting: { label: 'Waiting', cls: 'pending' },
  upcoming: { label: 'Upcoming', cls: 'pending' },
  off: { label: 'Off', cls: 'off' },
};

export function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export function formatMinutes(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  return `${m}min`;
}

export function accomplishmentClass(value) {
  if (value == null) return '';
  if (value >= 80) return 'pres-acc--high';
  if (value >= 50) return 'pres-acc--mid';
  return 'pres-acc--low';
}

export function formatDayLabel(date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00`));
}

export function formatMonthLabel(month) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(`${month}-01T12:00:00`)
  );
}

// Piège le focus dans une modale + gère Échap et le focus initial. Renvoie la ref à poser
// sur l'élément dialogue.
export function useDialogFocus(onClose) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const initialTarget = dialog?.querySelector('[data-dialog-initial-focus]') || dialog?.querySelector(focusableSelector);
    initialTarget?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll(focusableSelector)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, []);

  return dialogRef;
}
