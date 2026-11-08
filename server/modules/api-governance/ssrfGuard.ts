/**
 * @file server/modules/api-governance/ssrfGuard.ts
 * @description Robust Server-Side Request Forgery (SSRF) and DNS Rebinding defenses
 * for outbound developer webhook destinations (Employee 73 Section 11).
 */

import net from 'net';

export interface WebhookUrlValidationResult {
  readonly valid: boolean;
  readonly normalizedUrl?: string;
  readonly rejectionReason?: string;
}

const PRIVATE_SUBNETS_V4: { prefix: number[]; mask: number }[] = [
  // 127.0.0.0/8 (Loopback)
  { prefix: [127, 0, 0, 0], mask: 8 },
  // 10.0.0.0/8 (RFC 1918 Private)
  { prefix: [10, 0, 0, 0], mask: 8 },
  // 172.16.0.0/12 (RFC 1918 Private)
  { prefix: [172, 16, 0, 0], mask: 12 },
  // 192.168.0.0/16 (RFC 1918 Private)
  { prefix: [192, 168, 0, 0], mask: 16 },
  // 169.254.0.0/16 (Link Local / Cloud Metadata)
  { prefix: [169, 254, 0, 0], mask: 16 },
  // 0.0.0.0/8 (Broadcast/Current Network)
  { prefix: [0, 0, 0, 0], mask: 8 },
];

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IPv4 treated as unsafe
  }

  const ipInt = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];

  for (const subnet of PRIVATE_SUBNETS_V4) {
    const subInt =
      (subnet.prefix[0] << 24) |
      (subnet.prefix[1] << 16) |
      (subnet.prefix[2] << 8) |
      subnet.prefix[3];
    const maskInt = ~((1 << (32 - subnet.mask)) - 1);
    if ((ipInt & maskInt) === (subInt & maskInt)) {
      return true;
    }
  }
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
  if (normalized.startsWith('fe80:') || normalized.startsWith('fc00:') || normalized.startsWith('fd00:')) {
    return true;
  }
  return false;
}

const FORBIDDEN_HOST_PATTERNS = [
  /localhost/i,
  /\.local$/i,
  /\.internal$/i,
  /\.corp$/i,
  /\.lan$/i,
  /\.home$/i,
  /metadata\.google\.internal/i,
  /metadata/i,
  /169\.254\.169\.254/,
];

export function validateWebhookDestinationUrl(
  rawUrl: string,
  options: { allowHttpInDevelopment?: boolean; environment?: string } = {}
): WebhookUrlValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, rejectionReason: 'URL مقصد وب‌هوک الزامی است.' };
  }

  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, rejectionReason: 'فرمت آدرس URL نامعتبر است.' };
  }

  // Protocol validation
  const isDev = options.environment === 'development' || options.allowHttpInDevelopment;
  if (parsed.protocol === 'http:') {
    if (!isDev) {
      return { valid: false, rejectionReason: 'در محیط پروداکشن و استیجینگ تنها پروتکل امن HTTPS مجاز است.' };
    }
  } else if (parsed.protocol !== 'https:') {
    return { valid: false, rejectionReason: `پروتکل ${parsed.protocol} مجاز نیست. فقط HTTP/HTTPS پشتیبانی می‌شود.` };
  }

  // Reject embedded credentials
  if (parsed.username || parsed.password) {
    return { valid: false, rejectionReason: 'قرار دادن نام‌کاربری یا رمز عبور در آدرس وب‌هوک ممنوع است.' };
  }

  // Port checks
  const port = parsed.port ? parseInt(parsed.port, 10) : parsed.protocol === 'https:' ? 443 : 80;
  const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);
  if (!ALLOWED_PORTS.has(port)) {
    return { valid: false, rejectionReason: `پورت ${port} مجاز نیست. فقط پورت‌های 80، 443، 8080 و 8443 مجاز هستند.` };
  }

  // Hostname checks
  const hostname = parsed.hostname;
  for (const pattern of FORBIDDEN_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      return { valid: false, rejectionReason: 'آدرس‌های سرورهای محلی، اینترانت یا متادیتا مجاز نیستند.' };
    }
  }

  // IP address checks
  if (net.isIPv4(hostname)) {
    if (isPrivateIpv4(hostname)) {
      return { valid: false, rejectionReason: 'ارسال وب‌هوک به آدرس‌های IP خصوصی یا محلی (RFC 1918) ممنوع است.' };
    }
  } else if (net.isIPv6(hostname)) {
    if (isPrivateIpv6(hostname)) {
      return { valid: false, rejectionReason: 'ارسال وب‌هوک به آدرس‌های IPv6 خصوصی یا Loopback ممنوع است.' };
    }
  }

  return {
    valid: true,
    normalizedUrl: parsed.origin + parsed.pathname + (parsed.search || ''),
  };
}
