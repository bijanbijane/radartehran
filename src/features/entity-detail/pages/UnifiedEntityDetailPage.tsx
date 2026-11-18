/**
 * @file src/features/entity-detail/pages/UnifiedEntityDetailPage.tsx
 * @description Unified Entity Detail Page supporting Property, Listing, Building, and Neighborhood entities (Stage 7).
 */

import React from 'react';
import type { DetailSectionId, EntityDetailModel, EntityType } from '../../../platform/entity-detail';
import {
  DetailErrorState,
  DetailNotFound,
  DetailPageShell,
  DetailSkeleton,
} from '../../../shared/entity-detail-ui';
import { useEntityDetail } from '../hooks/useEntityDetail';

export interface UnifiedEntityDetailPageProps {
  entity?: EntityDetailModel | null;
  entityType?: EntityType;
  entityId?: string;
  userId?: string;
  workspaceId?: string;
  permissionVersion?: number;
  returnPath?: string;
  onReturnToSearch?: (returnPath: string) => void;
  onFavorite?: (entity: EntityDetailModel) => void;
  onCompare?: (entity: EntityDetailModel) => void;
  onShare?: (entity: EntityDetailModel) => void;
  onEdit?: (entity: EntityDetailModel) => void;
}

export const UnifiedEntityDetailPage: React.FC<UnifiedEntityDetailPageProps> = ({
  entity,
  entityType,
  entityId,
  userId,
  workspaceId,
  permissionVersion,
  returnPath = '/search',
  onReturnToSearch,
  onFavorite,
  onCompare,
  onShare,
  onEdit,
}) => {
  const { viewState, breadcrumbs, selectSection } = useEntityDetail({
    userId,
    workspaceId,
    permissionVersion,
    initialEntity: entity,
  });

  if (viewState.status === 'Loading') {
    return <DetailSkeleton />;
  }

  if (viewState.status === 'NotFound' || (!viewState.entity && viewState.status === 'Initial')) {
    return (
      <DetailNotFound
        entityType={entityType}
        entityId={entityId}
        onReturnToSearch={() => onReturnToSearch?.(returnPath)}
      />
    );
  }

  if (
    viewState.status === 'Restricted' ||
    viewState.status === 'Deleted' ||
    viewState.status === 'Archived' ||
    viewState.status === 'Error'
  ) {
    return (
      <DetailErrorState
        status={viewState.status}
        messageFa={viewState.errorMessageFa}
        onReturnToSearch={() => onReturnToSearch?.(returnPath)}
      />
    );
  }

  if (!viewState.entity) {
    return (
      <DetailNotFound
        entityType={entityType}
        entityId={entityId}
        onReturnToSearch={() => onReturnToSearch?.(returnPath)}
      />
    );
  }

  return (
    <DetailPageShell
      entity={viewState.entity}
      breadcrumbs={breadcrumbs}
      returnPath={returnPath}
      activeSectionId={viewState.activeSectionId as DetailSectionId}
      onSelectSection={selectSection}
      onReturn={(path) => onReturnToSearch?.(path)}
      onFavorite={onFavorite}
      onCompare={onCompare}
      onShare={onShare}
      onEdit={onEdit}
    />
  );
};
