# 03 — Identity, Profile, Role & Permission Separation

## 4-Layer Separation
1. **Identity (`identityResolver.ts`)**: `uid`, `email`, `phoneNumber`, verification flags, and raw claims.
2. **Profile (`profileResolver.ts`)**: Display name, avatar, preferred city, and completion status.
3. **Role (`roleResolver.ts`)**: `guest`, `buyer`, `seller`, `agency_agent`, `agency_admin`, `service_provider`, `operator_support`, `admin`.
4. **Permissions (`permissionResolver.ts`)**: Explicit `PermissionKey[]` resolved per workspace (`Role !== automatic full Permission`; revoked permissions are subtracted even if role is present).
