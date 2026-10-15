import { useEffect, useRef, type ReactNode } from 'react';

/** Accessible modal built on <dialog>: Esc and the close button call onClose. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Clicking the backdrop (the dialog element itself) closes it.
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-body">
        <header className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="icon" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
