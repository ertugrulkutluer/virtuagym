"use client";

import { useState } from "react";
import { Modal, ModalButton } from "./modal";

interface ConfirmHandle {
  open: (opts: { title: string; description?: string; confirmLabel?: string }) =>
    Promise<boolean>;
}

/**
 * Lightweight replacement for `window.confirm`. Use via the returned `ref`:
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "Delete X?" })) { ... }
 */
export function useConfirm(): {
  Confirm: React.FC;
  confirm: ConfirmHandle["open"];
} {
  const [state, setState] = useState<{
    open: boolean;
    title: string;
    description?: string;
    confirmLabel: string;
    resolver?: (v: boolean) => void;
  }>({
    open: false,
    title: "",
    confirmLabel: "Confirm",
  });

  const confirm: ConfirmHandle["open"] = (opts) =>
    new Promise<boolean>((resolve) => {
      setState({
        open: true,
        title: opts.title,
        description: opts.description,
        confirmLabel: opts.confirmLabel ?? "Confirm",
        resolver: resolve,
      });
    });

  const answer = (v: boolean) => {
    state.resolver?.(v);
    setState((s) => ({ ...s, open: false, resolver: undefined }));
  };

  const Confirm: React.FC = () => (
    <Modal
      open={state.open}
      title={state.title}
      description={state.description}
      onClose={() => answer(false)}
      footer={
        <>
          <ModalButton onClick={() => answer(false)}>Cancel</ModalButton>
          <ModalButton variant="danger" onClick={() => answer(true)}>
            {state.confirmLabel}
          </ModalButton>
        </>
      }
    />
  );

  return { Confirm, confirm };
}
