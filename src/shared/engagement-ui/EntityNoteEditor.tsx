/**
 * @file src/shared/engagement-ui/EntityNoteEditor.tsx
 * @description Personal note editor with character limit counter (2000 chars) and visibility badge (Stage 8).
 */

import React, { useState } from 'react';
import {
  MAX_NOTE_LENGTH,
  type EngagementVisibilityScope,
  type EntityPersonalNote,
} from '../../platform/entity-engagement';

export interface EntityNoteEditorProps {
  note?: EntityPersonalNote | null;
  onSaveNote: (content: string, visibility: EngagementVisibilityScope) => void;
  onDeleteNote?: () => void;
}

export const EntityNoteEditor: React.FC<EntityNoteEditorProps> = ({
  note,
  onSaveNote,
  onDeleteNote,
}) => {
  const [content, setContent] = useState(note?.content || '');
  const [visibility, setVisibility] = useState<EngagementVisibilityScope>(note?.visibility || 'private');

  return (
    <div dir="rtl" data-testid="entity-note-editor" className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 space-y-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-slate-200">یادداشت شخصی روی موجودیت</span>
        <span className="text-slate-400">
          {content.length} / {MAX_NOTE_LENGTH}
        </span>
      </div>

      <textarea
        rows={3}
        maxLength={MAX_NOTE_LENGTH}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="نکات بازدید، شرایط مالک یا تحلیل شخصی خود را بنویسید..."
        aria-label="متن یادداشت شخصی"
        className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs text-slate-100"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          aria-label="سطح محرمانگی یادداشت"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as EngagementVisibilityScope)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
        >
          <option value="private">خصوصی (فقط خودم)</option>
          <option value="workspace">فضای کاری مشترک</option>
        </select>

        <div className="flex items-center gap-1.5">
          {note && onDeleteNote && (
            <button
              type="button"
              onClick={onDeleteNote}
              className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-2.5 py-1 text-xs text-rose-300"
            >
              حذف یادداشت
            </button>
          )}
          <button
            type="button"
            data-testid="save-entity-note-btn"
            onClick={() => onSaveNote(content, visibility)}
            className="rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500"
          >
            ذخیره یادداشت
          </button>
        </div>
      </div>
    </div>
  );
};
