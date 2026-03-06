import { useToastContext } from './toast-context';

export function useToast() {
  const { addToast, removeToast } = useToastContext();

  return {
    toast: (props: {
      title?: string;
      description: string;
      type?: 'success' | 'error' | 'info' | 'warning';
      duration?: number;
    }) => {
      addToast(props);
    },
    dismiss: (id: string) => removeToast(id),
  };
}
