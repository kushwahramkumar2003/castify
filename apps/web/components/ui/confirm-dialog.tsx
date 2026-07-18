"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmOptions = {
  title: string;
  description?: string;
  /** Primary button label */
  confirmLabel?: string;
  /** Cancel button label */
  cancelLabel?: string;
  /** Destructive styling for the confirm action */
  variant?: "default" | "destructive";
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

type ConfirmState = ConfirmOptions & {
  open: boolean;
};

const ConfirmContext = createContext<ConfirmFn | null>(null);

const DEFAULTS: ConfirmOptions = {
  title: "Are you sure?",
  description: undefined,
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  variant: "default",
};

/**
 * Promise-based confirmation dialog (shadcn AlertDialog).
 * Drop-in replacement for `window.confirm()`.
 *
 * @example
 * const confirm = useConfirm();
 * if (!(await confirm({ title: "End stream?", variant: "destructive" }))) return;
 */
export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState>({
    ...DEFAULTS,
    open: false,
  });
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    setState((s) => ({ ...s, open: false }));
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(value);
  }, []);

  const confirm = useCallback<ConfirmFn>((options) => {
    // Resolve any prior pending confirm as cancel
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({
        title: options.title,
        description: options.description,
        confirmLabel: options.confirmLabel ?? DEFAULTS.confirmLabel,
        cancelLabel: options.cancelLabel ?? DEFAULTS.cancelLabel,
        variant: options.variant ?? DEFAULTS.variant,
        open: true,
      });
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <AlertDialog
        open={state.open}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state.title}</AlertDialogTitle>
            {state.description ? (
              <AlertDialogDescription>{state.description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              type="button"
              onClick={() => settle(false)}
              className="btn-secondary-flat"
            >
              {state.cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant={state.variant === "destructive" ? "destructive" : "default"}
              className={
                state.variant === "destructive"
                  ? undefined
                  : "btn-primary-flat"
              }
              onClick={() => settle(true)}
            >
              {state.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmDialogProvider");
  }
  return ctx;
}
