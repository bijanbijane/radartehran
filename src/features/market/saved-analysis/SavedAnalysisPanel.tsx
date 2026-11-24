import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookmarkPlus, Copy, Download, Trash2, X } from 'lucide-react';
import { useDialogFocus } from '../../../components/useDialogFocus';
import type { SavedMarketAnalysis } from '../types/market.types';

export interface SavedAnalysisPanelProps {
  savedItems: SavedMarketAnalysis[];
  shareLinkText: string;
  onSaveCurrent: (title: string) => void;
  onLoadItem: (item: SavedMarketAnalysis) => void;
  onDeleteItem: (id: string) => void;
  onExportFormat: (format: 'csv' | 'json') => void;
  onClose: () => void;
}

export const SavedAnalysisPanel: React.FC<SavedAnalysisPanelProps> = ({
  savedItems,
  shareLinkText,
  onSaveCurrent,
  onLoadItem,
  onDeleteItem,
  onExportFormat,
  onClose,
}) => {
  const [titleInput, setTitleInput] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogRef = useDialogFocus(true, onClose);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = titleInput.trim();
    if (!trimmed) {
      setTitleError('لطفاً یک عنوان برای ذخیره تحلیل وارد کنید.');
      return;
    }
    setTitleError(null);
    onSaveCurrent(trimmed);
    setTitleInput('');
  };

  const handleCopyShare = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        setCopied(false);
        return;
      }
      await navigator.clipboard.writeText(shareLinkText);
      setCopied(true);
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 1800);
    } catch {
      setCopied(false);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="تحلیل‌های ذخیره‌شده و خروجی بازار"
      data-testid="market-saved-dialog"
      onClick={onClose}
      className="fixed inset-0 z-[9500] bg-slate-950/60 flex items-center justify-center p-4"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-700 p-5 space-y-4 text-xs"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] dark:border-slate-800 pb-3">
          <strong className="text-sm font-bold text-[var(--color-text-primary)] dark:text-white">
            ذخیره تحلیل، اشتراک‌گذاری و خروجی مجاز
          </strong>
          <button
            type="button"
            aria-label="بستن پنجره تحلیل‌های ذخیره‌شده"
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg border border-[var(--color-border-subtle)] dark:border-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-1.5">
          <div className="flex gap-2">
            <input
              type="text"
              value={titleInput}
              onChange={(e) => {
                setTitleInput(e.target.value);
                if (titleError) setTitleError(null);
              }}
              placeholder="نام تحلیل فعلی (مثلاً: مقایسه مسکونی پونک ۶ ماهه)"
              aria-label="نام تحلیل برای ذخیره"
              aria-invalid={Boolean(titleError)}
              className="flex-1 min-h-[40px] px-3 rounded-lg border border-[var(--color-border-strong)] dark:border-slate-700 bg-white dark:bg-slate-950 text-[var(--color-text-primary)] dark:text-white"
            />
            <button
              type="submit"
              data-testid="market-save-submit-btn"
              className="min-h-[40px] px-3.5 rounded-lg bg-[var(--color-brand-600)] text-white font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <BookmarkPlus className="w-4 h-4" />
              <span>ذخیره</span>
            </button>
          </div>
          {titleError && (
            <div role="alert" className="text-xs font-bold text-rose-700 dark:text-rose-300">
              {titleError}
            </div>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleCopyShare}
            className="min-h-[34px] px-2.5 rounded-lg border border-[var(--color-border-strong)] dark:border-slate-700 font-bold flex items-center gap-1 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copied ? 'لینک وضعیت کپی شد' : 'کپی لینک وضعیت تحلیلی'}</span>
          </button>
          <button
            type="button"
            onClick={() => onExportFormat('json')}
            className="min-h-[34px] px-2.5 rounded-lg border border-[var(--color-border-strong)] dark:border-slate-700 font-bold flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>خروجی تجمیعی JSON</span>
          </button>
        </div>

        <div className="space-y-2 pt-2 border-t border-[var(--color-border-subtle)] dark:border-slate-800">
          <div className="font-bold text-[var(--color-text-primary)] dark:text-white">
            نماهای ذخیره‌شده ({savedItems.length})
          </div>
          {savedItems.length === 0 ? (
            <div className="py-4 text-center text-[var(--color-text-muted)] dark:text-slate-400">
              هنوز تحلیلی ذخیره نکرده‌اید.
            </div>
          ) : (
            savedItems.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-lg border border-[var(--color-border-subtle)] dark:border-slate-800 flex items-center justify-between gap-2"
              >
                <div>
                  <div className="font-bold text-[var(--color-text-primary)] dark:text-white">{item.title}</div>
                  <div className="text-xs text-[var(--color-text-muted)] dark:text-slate-400">
                    محله {item.neighborhoodName} · {item.filters.marketType} · {item.filters.period}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onLoadItem(item);
                      onClose();
                    }}
                    className="px-2.5 py-1 rounded bg-[#EAF3F0] dark:bg-emerald-950/60 text-[#103B38] dark:text-emerald-200 font-bold cursor-pointer"
                  >
                    بازیابی
                  </button>
                  <button
                    type="button"
                    aria-label={`حذف ${item.title}`}
                    onClick={() => onDeleteItem(item.id)}
                    className="p-1.5 text-[var(--color-text-muted)] hover:text-[#A61B1B] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
