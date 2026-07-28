import toast from 'react-hot-toast';

export const notifySuccess = (msg) => toast.success(msg, { duration: 2000 });
export const notifyError = (msg) => toast.error(msg, { duration: 5000 });
export const notifyInfo = (msg) => toast(msg);
export const notifyLoading = (msg) => toast.loading(msg);
