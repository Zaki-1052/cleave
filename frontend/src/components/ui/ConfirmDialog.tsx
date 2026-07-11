// frontend/src/components/ui/ConfirmDialog.tsx — the app's single confirmation surface.
// Replaces window.confirm and bespoke delete modals. Built on the Dialog primitive with
// alertdialog semantics: outside clicks never dismiss; the choice must be explicit.
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  loading?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        role="alertdialog"
        className="max-w-md gap-0 p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <div className="p-6">
          <DialogTitle className="font-display text-xl font-semibold text-foreground">
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription className="mt-2 text-sm text-muted-foreground">
              {description}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
