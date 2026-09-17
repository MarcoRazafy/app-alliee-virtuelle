import toast from 'react-hot-toast';

export const notifySuccess = (msg) => toast.success(msg, { duration: 2000 });
export const notifyError = (msg) => toast.error(msg, { duration: 5000 });
export const notifyInfo = (msg) => toast(msg);
// Avertissement à lire jusqu'au bout (déconnexion imminente) : affiché plus longtemps.
export const notifyWarning = (msg) => toast(msg, { duration: 12000 });
export const notifyLoading = (msg) => toast.loading(msg);
