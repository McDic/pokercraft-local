/**
 * Lightweight in-page confirmation modal (replaces native window.confirm)
 */

import { useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface ConfirmModalProps {
  open: boolean
  /** Already-translated text; the caller owns the wording. */
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const messageId = useId()
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  // Dismiss on Escape while open.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  // Move focus into the dialog on open (Cancel is the safer default action).
  useEffect(() => {
    if (open) cancelButtonRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="modal-title" id={titleId}>{title ?? t('modal.defaultTitle')}</h2>
        <p className="modal-message" id={messageId}>{message}</p>
        <div className="modal-actions">
          <button
            ref={cancelButtonRef}
            className="modal-button modal-button-secondary"
            onClick={onCancel}
          >
            {cancelLabel ?? t('modal.cancel')}
          </button>
          <button className="modal-button modal-button-primary" onClick={onConfirm}>
            {confirmLabel ?? t('modal.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
