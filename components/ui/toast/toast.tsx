import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  id: string;
  title?: string;
  description: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles = {
  success: 'bg-[var(--surface)]/95 border-l-4 border-green-500 text-[var(--text-primary)] shadow-lg shadow-green-500/10 backdrop-blur-md',
  error: 'bg-[var(--surface)]/95 border-l-4 border-red-500 text-[var(--text-primary)] shadow-lg shadow-red-500/10 backdrop-blur-md',
  warning: 'bg-[var(--surface)]/95 border-l-4 border-yellow-500 text-[var(--text-primary)] shadow-lg shadow-yellow-500/10 backdrop-blur-md',
  info: 'bg-[var(--surface)]/95 border-l-4 border-[var(--primary)] text-[var(--text-primary)] shadow-lg shadow-[var(--primary)]/10 backdrop-blur-md',
};

export function Toast({
  id,
  title,
  description,
  type = 'info',
  duration = 5000,
  onClose,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const Icon = icons[type];

  useEffect(() => {
    // Animation frame to ensure transition plays
    requestAnimationFrame(() => setIsVisible(true));

    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300); // Wait for exit animation
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full transform items-start gap-3 rounded-lg p-4 transition-all duration-300 ease-in-out border border-[var(--glass-border)]",
        styles[type],
        isVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
      )}
      role="alert"
    >
      <div className={cn("p-1 rounded-full shrink-0", 
        type === 'success' && "bg-green-100 text-green-600",
        type === 'error' && "bg-red-100 text-red-600",
        type === 'warning' && "bg-yellow-100 text-yellow-600",
        type === 'info' && "bg-blue-100 text-blue-600"
      )}>
        <Icon className="h-4 w-4" />
      </div>
      
      <div className="flex-1 min-w-0">
        {title && <h3 className="font-semibold text-sm mb-0.5 text-[var(--text-primary)]">{title}</h3>}
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{description}</p>
      </div>

      <button
        onClick={handleClose}
        className="shrink-0 rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
