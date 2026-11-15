/**
 * Stage 22 Engine — RT-FE-ENTITY-ENGAGEMENT-022
 * Pure TypeScript evaluators for Concept Separation, EntityReference & Idempotency,
 * Persian Tag Normalization, Watch Rule & Change Noise Filtering, Note Conflict/Sharing & Telemetry PII.
 */
import {
  RT_FE_ENGAGEMENT_022_SPEC_ID,
  RT_FE_STAGE23_BRIDGE_SPEC_ID,
  RT_ENG_CONCEPTS_10,
  RT_ENG_LAYERS_9,
  RT_ENG_FOLLOW_SCOPES_6,
  RT_ENG_WATCH_RULE_TYPES_8,
  RT_ENG_DELIVERABLES_35,
} from './rtFeEngagement022Specs';

export {
  RT_FE_ENGAGEMENT_022_SPEC_ID,
  RT_FE_STAGE23_BRIDGE_SPEC_ID,
  RT_ENG_CONCEPTS_10,
  RT_ENG_LAYERS_9,
  RT_ENG_FOLLOW_SCOPES_6,
  RT_ENG_WATCH_RULE_TYPES_8,
  RT_ENG_DELIVERABLES_35,
};

export function evaluateConceptSeparationPolicy(params: {
  action: 'remove_favorite' | 'delete_collection' | 'cancel_follow';
}): {
  preservesFollows: boolean;
  preservesCollections: boolean;
  preservesNotes: boolean;
  preservesUnderlyingEntity: boolean;
  preservesEntityHistory: boolean;
  summaryFa: string;
} {
  if (params.action === 'remove_favorite') {
    return {
      preservesFollows: true,
      preservesCollections: true,
      preservesNotes: true,
      preservesUnderlyingEntity: true,
      preservesEntityHistory: true,
      summaryFa: 'حذف Favorite فقط دسترسی سریع را برمی‌دارد و Follow، Collection، یادداشت و موجودیت اصلی دست‌نخورده می‌مانند (§۲۲.۳.۲).',
    };
  }
  if (params.action === 'delete_collection') {
    return {
      preservesFollows: true,
      preservesCollections: false,
      preservesNotes: true,
      preservesUnderlyingEntity: true,
      preservesEntityHistory: true,
      summaryFa: 'حذف Collection فقط فهرست شخصی را پاک می‌کند؛ موجودیت‌های اصلی، Favorite و Follow کاربر حفظ می‌شوند (§۲۲.۸.۵).',
    };
  }
  return {
    preservesFollows: false,
    preservesCollections: true,
    preservesNotes: true,
    preservesUnderlyingEntity: true,
    preservesEntityHistory: true,
    summaryFa: 'لغو Follow فقط پایش کاربر را متوقف می‌کند و تاریخچه معتبر موجودیت هرگز از بین نمی‌رود (§۲۲.۳.۲).',
  };
}

export function evaluateEntityReferenceAndFavorite(params: {
  entityType: string;
  entityId: string;
  existingFavoriteKeySet: string[];
  clientSentOwnerUserId?: string;
  embedsFullEntitySnapshot?: boolean;
}): {
  valid: boolean;
  idempotentDuplicateDetected: boolean;
  sessionDerivedOwnerOnly: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (!params.entityType.trim() || !params.entityId.trim()) {
    issues.push('هر EntityReference باید دارای نوع و شناسه پایدار معتبر باشد.');
  }
  if (params.clientSentOwnerUserId) {
    issues.push('مالکیت رکورد نباید از شناسه ارسالی کلاینت پذیرفته شود؛ Backend باید userId را از نشست معتبر استخراج کند (§۲۲.۶.۲).');
  }
  if (params.embedsFullEntitySnapshot) {
    issues.push('ذخیره Snapshot کامل موجودیت به‌عنوان منبع حقیقت در Collection یا Favorite ممنوع است (§۲۲.۵.۳).');
  }
  const key = `${params.entityType}:${params.entityId}`;
  const idempotentDuplicateDetected = params.existingFavoriteKeySet.includes(key);

  return {
    valid: issues.length === 0,
    idempotentDuplicateDetected,
    sessionDerivedOwnerOnly: !params.clientSentOwnerUserId,
    issues,
  };
}

export function normalizePersianTagText(raw: string): string {
  return raw
    .replace(/\u200C/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim()
    .replace(/\s+/g, ' ');
}

export function evaluateTagUniqueness(params: {
  title: string;
  existingNormalizedTags: string[];
}): { valid: boolean; normalizedTitle: string; duplicate: boolean; reasonFa: string } {
  const normalizedTitle = normalizePersianTagText(params.title);
  if (!normalizedTitle) {
    return { valid: false, normalizedTitle: '', duplicate: false, reasonFa: 'عنوان برچسب نمی‌تواند خالی باشد.' };
  }
  const duplicate = params.existingNormalizedTags.includes(normalizedTitle);
  return {
    valid: !duplicate,
    normalizedTitle,
    duplicate,
    reasonFa: duplicate
      ? `برچسب تکراری تشخیص داده شد (پس از نرمال‌سازی فارسی ی/ک و نیم‌فاصله با «${normalizedTitle}» یکسان است).`
      : `برچسب یکتا و معتبر است: «${normalizedTitle}»`,
  };
}

export function evaluateWatchRuleAndNoiseFilter(params: {
  field: string;
  operator: string;
  threshold?: number;
  unit?: string;
  isVagueNaturalPhrase?: boolean;
  previousRawText: string;
  currentRawText: string;
  previousCanonicalValue: number;
  currentCanonicalValue: number;
  tolerance?: number;
}): {
  ruleAccepted: boolean;
  materialChangeDetected: boolean;
  noiseSuppressed: boolean;
  reasonFa: string;
} {
  if (params.isVagueNaturalPhrase || !params.field.trim() || !params.operator.trim() || params.threshold === undefined || !params.unit?.trim()) {
    return {
      ruleAccepted: false,
      materialChangeDetected: false,
      noiseSuppressed: false,
      reasonFa: 'قاعده مبهم یا ناقص رد شد: فیلد معتبر، عملگر، آستانه و واحد اندازه‌گیری باید صریح مشخص شوند (§۲۲.۱۲.۴).',
    };
  }

  const normalizedPrevText = normalizePersianTagText(params.previousRawText);
  const normalizedCurrText = normalizePersianTagText(params.currentRawText);
  const diff = Math.abs(params.currentCanonicalValue - params.previousCanonicalValue);
  const tol = params.tolerance ?? 0;

  if (normalizedPrevText === normalizedCurrText || diff <= tol) {
    return {
      ruleAccepted: true,
      materialChangeDetected: false,
      noiseSuppressed: true,
      reasonFa: 'تغییر ظاهری/تفاوت ارقام یا نویز زیر آستانه سرکوب شد و ChangeEvent جعلی تولید نشد (§۲۲.۱۳.۳).',
    };
  }

  return {
    ruleAccepted: true,
    materialChangeDetected: true,
    noiseSuppressed: false,
    reasonFa: 'تغییر معنادار با منبع معتبر تشخیص داده شد و ChangeEvent به ارزیابی Watch Rule ارسال می‌شود.',
  };
}

export function evaluateNoteConflictAndShareAccess(params: {
  clientNoteVersion: number;
  serverNoteVersion: number;
  shareTokenExpired: boolean;
  shareTokenRevoked: boolean;
  clientClaimedRole?: 'viewer' | 'editor';
  grantedRole: 'viewer' | 'editor';
}): {
  noteSaveAllowed: boolean;
  requiresConflictResolution: boolean;
  shareAccessAllowed: boolean;
  resolvedRole: 'viewer' | 'editor';
  issues: string[];
} {
  const issues: string[] = [];
  const requiresConflictResolution = params.clientNoteVersion < params.serverNoteVersion;
  if (requiresConflictResolution) {
    issues.push('تعارض نسخه یادداشت (§۲۲.۱۱.۴): نسخه جدیدتر روی سرور ثبت شده و بازنویسی خاموش مجاز نیست.');
  }
  const shareAccessAllowed = !params.shareTokenExpired && !params.shareTokenRevoked;
  if (!shareAccessAllowed) {
    issues.push('توکن اشتراک‌گذاری منقضی یا لغو شده است و دسترسی بلافاصله مسدود می‌شود (§۲۲.۹.۴).');
  }
  if (params.clientClaimedRole === 'editor' && params.grantedRole === 'viewer') {
    issues.push('تلاش ارتقای غیرمجاز نقش به Editor رد شد؛ نقش مجاز از Backend اعمال می‌شود (§۲۲.۲۷.۱).');
  }
  return {
    noteSaveAllowed: !requiresConflictResolution,
    requiresConflictResolution,
    shareAccessAllowed,
    resolvedRole: params.grantedRole,
    issues,
  };
}

export function evaluateNotificationPipelineAndTelemetry(params: {
  incomingEventId: string;
  seenEventIds: string[];
  incomingPriority: 'low' | 'normal' | 'high' | 'critical';
  targetBatchHasNormalAlerts: boolean;
  quietHoursActive: boolean;
  telemetryPayload: Record<string, unknown>;
}): {
  shouldEmitNotification: boolean;
  canMergeIntoNormalBatch: boolean;
  deliveryAction: 'immediate' | 'defer_after_quiet_hours' | 'deduplicated_skip';
  sanitizedTelemetry: Record<string, unknown>;
  strippedPiiKeys: string[];
} {
  const deduplicated = params.seenEventIds.includes(params.incomingEventId);
  const canMergeIntoNormalBatch = !(params.incomingPriority === 'critical' && params.targetBatchHasNormalAlerts);
  let deliveryAction: 'immediate' | 'defer_after_quiet_hours' | 'deduplicated_skip' = 'immediate';
  if (deduplicated) deliveryAction = 'deduplicated_skip';
  else if (params.quietHoursActive && params.incomingPriority !== 'critical') {
    deliveryAction = 'defer_after_quiet_hours';
  }

  const blocked = new Set([
    'noteContent', 'collectionPrivateContent', 'shareToken',
    'ownerIdentity', 'residentName', 'exactUserLocation', 'psychologicalProfile',
  ]);
  const sanitizedTelemetry: Record<string, unknown> = {};
  const strippedPiiKeys: string[] = [];
  for (const [k, v] of Object.entries(params.telemetryPayload)) {
    if (blocked.has(k)) strippedPiiKeys.push(k);
    else sanitizedTelemetry[k] = v;
  }

  return {
    shouldEmitNotification: !deduplicated,
    canMergeIntoNormalBatch,
    deliveryAction,
    sanitizedTelemetry,
    strippedPiiKeys,
  };
}
