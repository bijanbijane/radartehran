/**
 * @file src/shared/entity-detail-ui/DetailNotFound.tsx
 * @description Renders canonical 404 NotFound state for invalid or missing Entity Detail IDs (Stage 7).
 */

import React from 'react';
import type { EntityType } from '../../platform/entity-detail';

export interface DetailNotFoundProps {
  entityType?: EntityType | null;
  entityId?: string | null;
  onReturnToSearch?: () => void;
}

export const DetailNotFound: React.FC<DetailNotFoundProps> = ({
  entityType,
  entityId,
  onReturnToSearch,
}) => {
  return (
    <div
      dir="rtl"
      data-testid="entity-detail-not-found"
      className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 text-right"
    >
      <h2 className="text-base font-bold text-slate-100">موجودیت مورد نظر یافت نشد</h2>
      <p className="mt-2 text-xs text-slate-400">
        شناسه «{entityId || 'نامشخص'}» ({entityType || 'نامشخص'}) در پایگاه داده رادار تهران ثبت نشده یا جابه‌جا شده است.
      </p>
      {onReturnToSearch && (
        <div className="mt-4">
          <button
            type="button"
            onClick={onReturnToSearch}
            className="rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
          >
            بازگشت به جست‌وجوی رادار
          </button>
        </div>
      )}
    </div>
  );
};
