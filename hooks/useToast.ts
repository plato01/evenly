import { useAppDispatch } from '../store';
import { showToast, dismissToast } from '../store/slices/uiSlice';
import { ToastType } from '../store/slices/uiSlice';

export const useToast = () => {
  const dispatch = useAppDispatch();

  const toast = (message: string, type: ToastType = 'info') => {
    dispatch(showToast({ message, type }));
  };

  const dismiss = (id: string) => dispatch(dismissToast(id));

  return {
    success: (msg: string) => toast(msg, 'success'),
    error:   (msg: string) => toast(msg, 'error'),
    info:    (msg: string) => toast(msg, 'info'),
    warning: (msg: string) => toast(msg, 'warning'),
    dismiss,
  };
};
