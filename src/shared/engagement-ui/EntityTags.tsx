/**
 * @file src/shared/engagement-ui/EntityTags.tsx
 * @description Renders and manages user-defined EntityTags on saved entities (Stage 8).
 */

import React, { useState } from 'react';
import type { EntityTag } from '../../platform/entity-engagement';

export interface EntityTagsProps {
  tags: EntityTag[];
  onAddTag?: (tagName: string) => void;
}

export const EntityTags: React.FC<EntityTagsProps> = ({ tags, onAddTag }) => {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onAddTag?.(input.trim());
    setInput('');
  };

  return (
    <div dir="rtl" data-testid="entity-tags" className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span
            key={t.id}
            data-testid={`entity-tag-${t.normalizedName}`}
            className="inline-flex items-center rounded-md border border-sky-500/30 bg-sky-950/40 px-2 py-0.5 text-xs text-sky-200"
          >
            #{t.name}
          </span>
        ))}
      </div>
      {onAddTag && (
        <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="افزودن برچسب شخصی..."
            aria-label="افزودن برچسب شخصی"
            className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-100"
          />
          <button
            type="submit"
            className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700"
          >
            ثبت برچسب
          </button>
        </form>
      )}
    </div>
  );
};
