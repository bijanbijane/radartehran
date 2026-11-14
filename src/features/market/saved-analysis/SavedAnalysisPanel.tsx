import React, { useState } from 'react';
import { BookmarkPlus, Copy, Download, Trash2, X } from 'lucide-react';
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
  const [copied, setCopied] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = titleInput.trim();
    if (!trimmed) return;
    onSaveCurrent(trimmed);
    setTitleInput('');
  };

  const handleCopyShare = async () => {
    try {
      await navigator.clipboard?.writeText(shareLinkText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="تحلیل‌های ذخیره‌شده و خروجی بازار"
      data-testid="market-saved-dialog"
      className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700 p-5 space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-[#DCE3DF] dark:border-slate-800 pb-3">
          <strong className="text-sm font-black text-[#182522] dark:text-white">
            ذخیره تحلیل، اشتراک‌گذاری و خروجی مجاز
          </strong>
          <button
            type="button"
            aria-label="بستن پنجره تحلیل‌های ذخیره‌شده"
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg border border-[#DCE3DF] dark:border-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex gap-2">
          <input
            type="text"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            placeholder="نام تحلیل فعلی (مثلاً: مقایسه مسکونی پونک ۶ ماهه)"
            aria-label="نام تحلیل برای ذخیره"
            className="flex-1 min-h-[40px] px-3 rounded-lg border border-[#C5D0CA] dark:border-slate-700 bg-white dark:bg-slate-950 text-[#182522] dark:text-white"
          />
          <button
            type="submit"
            data-testid="market-save-submit-btn"
            className="min-h-[40px] px-3.5 rounded-lg bg-[#176B63] text-white font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <BookmarkPlus className="w-4 h-4" />
            <span>ذخیره</span>
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleCopyShare}
            className="min-h-[34px] px-2.5 rounded-lg border border-[#C5D0CA] dark:border-slate-700 font-bold flex items-center gap-1 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copied ? 'لینک وضعیت کپی شد' : 'کپی لینک وضعیت تحلیلی'}</span>
          </button>
          <button
            type="button"
            onClick={() => onExportFormat('json')}
            className="min-h-[34px] px-2.5 rounded-lg border border-[#C5D0CA] dark:border-slate-700 font-bold flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>خروجی تجمیعی JSON</span>
          </button>
        </div>

        <div className="space-y-2 pt-2 border-t border-[#DCE3DF] dark:border-slate-800">
          <div className="font-bold text-[#182522] dark:text-white">
            نماهای ذخیره‌شده ({savedItems.length})
          </div>
          {savedItems.length === 0 ? (
            <div className="py-4 text-center text-[#586760] dark:text-slate-400">
              هنوز تحلیلی ذخیره نکرده‌اید.
            </div>
          ) : (
            savedItems.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-lg border border-[#DCE3DF] dark:border-slate-800 flex items-center justify-between gap-2"
              >
                <div>
                  <div className="font-bold text-[#182522] dark:text-white">{item.title}</div>
                  <div className="text-[11px] text-[#586760] dark:text-slate-400">
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
                    className="p-1.5 text-[#586760] hover:text-[#A61B1B] cursor-pointer"
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
};
