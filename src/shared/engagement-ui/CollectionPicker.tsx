/**
 * @file src/shared/engagement-ui/CollectionPicker.tsx
 * @description Picker allowing an entity to be added/removed across multiple Personal Collections (Stage 8).
 */

import React, { useState } from 'react';
import type { EngagementEntityRef, PersonalCollection } from '../../platform/entity-engagement';

export interface CollectionPickerProps {
  entity: EngagementEntityRef;
  collections: PersonalCollection[];
  selectedCollectionIds: string[];
  onToggleCollectionMembership: (collectionId: string, entity: EngagementEntityRef) => void;
  onCreateCollection?: (name: string) => void;
}

export const CollectionPicker: React.FC<CollectionPickerProps> = ({
  entity,
  collections,
  selectedCollectionIds,
  onToggleCollectionMembership,
  onCreateCollection,
}) => {
  const [newCollectionName, setNewCollectionName] = useState('');
  const [nameError, setNameError] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCollectionName.trim();
    if (!trimmed) {
      setNameError('لطفاً نام مجموعه را وارد کنید.');
      return;
    }
    setNameError('');
    onCreateCollection?.(trimmed);
    setNewCollectionName('');
  };

  return (
    <div dir="rtl" data-testid="collection-picker" className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 space-y-3">
      <div className="text-xs font-bold text-slate-200">افزودن به مجموعه‌های شخصی</div>

      {collections.length === 0 ? (
        <p className="text-xs text-slate-400">هنوز مجموعه‌ای ساخته نشده است.</p>
      ) : (
        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {collections.map((col) => {
            const isMember = selectedCollectionIds.includes(col.id);
            return (
              <label
                key={col.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-2.5 py-1.5 text-xs text-slate-200 cursor-pointer"
              >
                <span className="truncate">{col.name}</span>
                <input
                  type="checkbox"
                  checked={isMember}
                  onChange={() => onToggleCollectionMembership(col.id, entity)}
                  data-testid={`collection-checkbox-${col.id}`}
                />
              </label>
            );
          })}
        </div>
      )}

      {onCreateCollection && (
        <form onSubmit={handleCreate} className="space-y-1 pt-1 border-t border-slate-800">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              aria-invalid={Boolean(nameError)}
              value={newCollectionName}
              onChange={(e) => {
                setNewCollectionName(e.target.value);
                if (nameError) setNameError('');
              }}
              placeholder="نام مجموعه جدید..."
              aria-label="نام مجموعه جدید"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-100"
            />
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-500 cursor-pointer"
            >
              ایجاد
            </button>
          </div>
          {nameError && <div role="alert" className="text-[11px] font-bold text-rose-400">{nameError}</div>}
        </form>
      )}
    </div>
  );
};
