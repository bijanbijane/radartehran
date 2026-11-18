/**
 * @file src/features/access-control/pages/AccessControlManagementPage.tsx
 * @description Page shell for Workspace & System Access Control Management (Stage 25).
 */

import React from 'react';
import { RouteAccessGuard, useAccessController } from '../../../platform/authorization';
import { PermissionManagementPanel } from '../components/PermissionManagementPanel';

export const AccessControlManagementPage: React.FC = () => {
  const { context } = useAccessController();
  return (
    <RouteAccessGuard routePathOrId="/workspace/permissions">
      <main dir="rtl" className="mx-auto max-w-6xl px-4 py-6">
        <PermissionManagementPanel context={context} />
      </main>
    </RouteAccessGuard>
  );
};

export default AccessControlManagementPage;
