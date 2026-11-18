/**
 * @file src/features/entity-engagement/components/PersonalCollectionsWorkspace.tsx
 * @description Unified User Workspace for Favorites, Followed Entities, Personal Collections, and Watch Rules (Stage 8).
 */

import React, { useState } from 'react';
import {
  EngagementEmptyState,
  FavoriteButton,
  FollowButton,
} from '../../../shared/engagement-ui';
import { useEntityEngagement } from '../hooks/useEntityEngagement';

export interface PersonalCollectionsWorkspaceProps {
  userId: string;
  workspaceId: string;
  permissionVersion?: number;
  onNavigateToEntity?: (canonicalPath: string) => void;
}

export const PersonalCollectionsWorkspace: React.FC<PersonalCollectionsWorkspaceProps> = ({
  userId,
  workspaceId,
  permissionVersion = 1,
  onNavigateToEntity,
}) => {
  const [activeTab, setActiveTab] = useState<'favorites' | 'follows' | 'collections' | 'watch-rules'>('favorites');
  const {
    favorites,
    follows,
    collections,
    watchRules,
    toggleFavorite,
    setFollowStatus,
    createCollection,
  } = useEntityEngagement({ userId, workspaceId, permissionVersion });

  return (
    <div dir="rtl" data-testid="personal-collections-workspace" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
        <div>
          <h2 className="text-base font-bold text-slate-100">مجموعه‌های شخصی، علاقه‌مندی‌ها و رصد تغییرات</h2>
          <p className="text-xs text-slate-400">
            مدیریت یکپارچه موجودیت‌های ذخیره‌شده و قواعد پایش بازار در فضای کاری فعال
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'favorites', label: `علاقه‌مندی‌ها (${favorites.length})` },
              { id: 'follows', label: `دنبال‌شده‌ها (${follows.length})` },
              { id: 'collections', label: `مجموعه‌ها (${collections.length})` },
              { id: 'watch-rules', label: `قواعد رصد (${watchRules.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`engagement-tab-${t.id}`}
              onClick={() => setActiveTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === t.id
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'favorites' && (
        favorites.length === 0 ? (
          <EngagementEmptyState section="favorites" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {favorites.map((fav) => (
              <div
                key={fav.id}
                data-testid={`favorite-card-${fav.entity.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3"
              >
                <div>
                  <button
                    type="button"
                    onClick={() => onNavigateToEntity?.(fav.entity.canonicalPath)}
                    className="text-sm font-bold text-slate-100 hover:text-sky-400"
                  >
                    {fav.entity.title}
                  </button>
                  <div className="text-xs text-slate-400">نوع: {fav.entity.entityType}</div>
                </div>
                <FavoriteButton
                  entity={fav.entity}
                  isFavorited={true}
                  onToggle={toggleFavorite}
                />
              </div>
            ))}
          </div>
        )
      )}

      {activeTab === 'follows' && (
        follows.length === 0 ? (
          <EngagementEmptyState section="follows" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {follows.map((fol) => (
              <div
                key={fol.id}
                data-testid={`follow-card-${fol.entity.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3"
              >
                <div>
                  <div className="text-sm font-bold text-slate-100">{fol.entity.title}</div>
                  <div className="text-xs text-slate-400">وضعیت: {fol.status}</div>
                </div>
                <FollowButton
                  entity={fol.entity}
                  status={fol.status}
                  onChangeStatus={setFollowStatus}
                />
              </div>
            ))}
          </div>
        )
      )}

      {activeTab === 'collections' && (
        collections.length === 0 ? (
          <EngagementEmptyState
            section="collections"
            onActionClick={() => createCollection('گزینه‌های منتخب خرید')}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {collections.map((col) => (
              <div
                key={col.id}
                data-testid={`collection-card-${col.id}`}
                className="rounded-xl border border-slate-800 bg-slate-900/80 p-3"
              >
                <div className="text-sm font-bold text-slate-100">{col.name}</div>
                <div className="text-xs text-slate-400">تعداد اقلام: {col.itemCount}</div>
              </div>
            ))}
          </div>
        )
      )}

      {activeTab === 'watch-rules' && (
        watchRules.length === 0 ? (
          <EngagementEmptyState section="watch-rules" />
        ) : (
          <div className="space-y-2">
            {watchRules.map((rule) => (
              <div
                key={rule.id}
                data-testid={`watch-rule-row-${rule.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-200"
              >
                <span>{rule.entity.title} — شرط: {rule.conditionType}</span>
                <span>{rule.enabled ? 'فعال' : 'غیرفعال'}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};
