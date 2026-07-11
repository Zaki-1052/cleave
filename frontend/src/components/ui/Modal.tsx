// frontend/src/components/ui/Modal.tsx — standard app modal: paper header, serif title.
// Outside clicks never dismiss (forms live here); Esc and the close button do.
import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './dialog';
import { cn } from '@/lib/cn';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className={cn(
          'flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0',
          className ?? 'max-w-2xl',
        )}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="flex shrink-0 flex-row items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
          <DialogTitle className="font-display text-xl font-semibold text-foreground">
            {title}
          </DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
