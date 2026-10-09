import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Loader2, X } from 'lucide-react';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'session';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
  ghost: 'btn btn-ghost',
  danger: 'btn btn-danger',
  session: 'btn btn-secondary btn-session',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    pending?: boolean;
    pendingLabel?: string;
  }
>(function Button(
  {
    variant = 'primary',
    pending = false,
    pendingLabel,
    className,
    children,
    type = 'button',
    onMouseDown,
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={cn(VARIANT[variant], className)}
      disabled={props.disabled || pending}
      aria-busy={pending || undefined}
      onMouseDown={(event) => {
        onMouseDown?.(event);
        // Blur validation can reflow the form between mousedown and click.
        // Cancelling mousedown keeps the click on this submit button.
        if (type === 'submit' && event.button === 0) event.preventDefault();
      }}
    >
      {pending ? (
        <>
          <Loader2 aria-hidden className="spin h-4 w-4" />
          {pendingLabel ?? 'Saving…'}
        </>
      ) : (
        children
      )}
    </button>
  );
});

export function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-muted" role="status">
      <Loader2 aria-hidden className="spin h-4 w-4" />
      {label}
    </span>
  );
}

function restoreFocus(event: Event, returnFocusTo?: RefObject<HTMLElement | null>) {
  const target = returnFocusTo?.current;
  if (!target) return;
  event.preventDefault();
  target.focus();
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  sheet = false,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  sheet?: boolean;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          className={sheet ? 'dialog-content sheet' : 'dialog-content'}
          onCloseAutoFocus={(event) => restoreFocus(event, returnFocusTo)}
        >
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-[17px] font-semibold leading-6">{title}</Dialog.Title>
            <Dialog.Close className="icon-btn btn btn-ghost" aria-label="Close">
              <X aria-hidden className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {description ? (
            <Dialog.Description className="mt-1 text-[14px] leading-5 text-muted">
              {description}
            </Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          <div className="dialog-body mt-4">{children}</div>
          {footer ? <div className="dialog-footer">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
  danger = false,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  danger?: boolean;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="overlay" />
        <AlertDialog.Content
          className="dialog-content"
          onCloseAutoFocus={(event) => restoreFocus(event, returnFocusTo)}
        >
          <AlertDialog.Title className="text-[17px] font-semibold leading-6">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-[15px] leading-[22px] text-muted">
            {description}
          </AlertDialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel className="btn btn-secondary">Cancel</AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                variant={danger ? 'danger' : 'primary'}
                pending={pending}
                pendingLabel="Working…"
                onClick={(event) => {
                  event.preventDefault();
                  onConfirm();
                }}
              >
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function Menu({
  label,
  trigger,
  children,
  className = 'btn btn-secondary h-11 gap-2 rounded-full pl-1 pr-2',
  triggerRef,
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger ref={triggerRef} className={className} aria-label={label}>
        {trigger}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" align="end" sideOffset={8}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({
  children,
  onSelect,
  danger = false,
}: {
  children: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
}) {
  return (
    <DropdownMenu.Item className={danger ? 'text-danger' : undefined} onSelect={() => onSelect?.()}>
      {children}
    </DropdownMenu.Item>
  );
}

export function Alert({
  tone,
  children,
  id,
}: {
  tone: 'error' | 'warn' | 'success';
  children: ReactNode;
  id?: string;
}) {
  const role = tone === 'error' ? 'alert' : 'status';
  return (
    <div
      id={id}
      tabIndex={id ? -1 : undefined}
      role={role}
      className={`alert-${tone} flex gap-2 text-[14px] leading-5`}
    >
      <span>{children}</span>
    </div>
  );
}
