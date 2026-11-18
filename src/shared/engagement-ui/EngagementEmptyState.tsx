/**
 * @file src/shared/engagement-ui/EngagementEmptyState.tsx
 * @description Empty state for Favorites, Followed Entities, Personal Collections, and Watch Rules (Stage 8).
 */

import React from 'react';

export interface EngagementEmptyStateProps {
  section: 'favorites' | 'follows' | 'collections' | 'watch-rules';
  onActionClick?: () => void;
}

const SECTION_COPY_FA: Record<
  EngagementEmptyStateProps['section'],
  { title: string; subtitle: string; cta: string }
> = {
  favorites: {
    title: 'هنوز موردی در علاقه‌مندی‌ها ذخیره نشده است',
    subtitle: 'املاک، آگهی‌ها، ساختمان‌ها یا محله‌های منتخب خود را نشان کنید تا همیشه در دسترس باشند.',
    cta: 'جست‌وجو در رادار تهران',
  },
  follows: {
    title: 'هیچ موجودیتی در فهرست رصد فعال نیست',
    subtitle: 'با دنبال‌کردن یک ملک یا محله، تغییرات مهم قیمت و وضعیت آن برای شما پایش می‌شود.',
    cta: 'انتخاب موجودیت برای رصد',
  },
  collections: {
    title: 'هنوز مجموعه شخصی نساخته‌اید',
    subtitle: 'برای دسته‌بندی گزینه‌های خرید، اجاره یا سرمایه‌گذاری یک مجموعه جدید بسازید.',
    cta: 'ایجاد اولین مجموعه شخصی',
  },
  'watch-rules': {
    title: 'قاعده رصدی تعریف نشده است',
    subtitle: 'برای دریافت هشدار کاهش قیمت یا ثبت آگهی جدید در ساختمان و محله، قاعده رصد ثبت کنید.',
    cta: 'تعریف قاعده رصد جدید',
  },
};

export const EngagementEmptyState: React.FC<EngagementEmptyStateProps> = ({
  section,
  onActionClick,
}) => {
  const copy = SECTION_COPY_FA[section];

  return (
    <div
      dir="rtl"
      data-testid={`engagement-empty-${section}`}
      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center space-y-2"
    >
      <h3 className="text-sm font-bold text-slate-100">{copy.title}</h3>
      <p className="text-xs text-slate-400">{copy.subtitle}</p>
      {onActionClick && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onActionClick}
            className="rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 cursor-pointer"
          >
            {copy.cta}
          </button>
        </div>
      )}
    </div>
  );
};
