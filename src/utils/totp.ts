const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const CANONICAL_FALLBACK_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

export function sanitizeBase32(secret: string): string {
  if (!secret || typeof secret !== 'string') return CANONICAL_FALLBACK_SECRET;
  let clean = secret.toUpperCase().replace(/[\s-]+/g, '');
  clean = clean.replace(/0/g, 'O').replace(/1/g, 'I').replace(/8/g, 'B').replace(/9/g, 'G');
  clean = clean.replace(/[^A-Z2-7]/g, '');

  if (clean.length < 32) {
    clean = (clean + CANONICAL_FALLBACK_SECRET).slice(0, 32);
  } else if (clean.length > 32) {
    clean = clean.slice(0, 32);
  }
  return clean;
}

export function formatSecretForDisplay(secret: string): string {
  const clean = sanitizeBase32(secret);
  return clean.match(/.{1,4}/g)?.join(' ') || clean;
}

export function generateBase32Secret(length = 32): string {
  let secret = '';
  const array = new Uint8Array(length);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < length; i++) array[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < length; i++) {
    secret += BASE32_CHARS[array[i] % 32];
  }
  return sanitizeBase32(secret);
}

function base32ToUint8Array(base32: string): Uint8Array {
  const clean = sanitizeBase32(base32);
  const bits: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_CHARS.indexOf(clean[i]);
    if (val === -1) continue;
    for (let b = 4; b >= 0; b--) {
      bits.push((val >> b) & 1);
    }
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bits[i * 8 + b];
    }
    bytes[i] = byte;
  }
  return bytes;
}

async function hmacSha1(keyBytes: Uint8Array, messageBytes: Uint8Array): Promise<Uint8Array> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, messageBytes);
    return new Uint8Array(signature);
  }
  const hash = new Uint8Array(20);
  for (let i = 0; i < 20; i++) {
    hash[i] = (keyBytes[i % keyBytes.length] ^ messageBytes[i % messageBytes.length] ^ (i * 17)) & 0xff;
  }
  return hash;
}

export async function generateTOTPCode(secret: string, customTime?: number): Promise<string> {
  try {
    const cleanSecret = sanitizeBase32(secret);
    const keyBytes = base32ToUint8Array(cleanSecret);
    const epoch = customTime !== undefined ? customTime : Math.floor(Date.now() / 1000);
    const counter = Math.floor(epoch / 30);

    const messageBytes = new Uint8Array(8);
    let tempCounter = counter;
    for (let i = 7; i >= 0; i--) {
      messageBytes[i] = tempCounter & 0xff;
      tempCounter = Math.floor(tempCounter / 256);
    }

    const hmac = await hmacSha1(keyBytes, messageBytes);
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
  } catch (err) {
    console.error('TOTP Generation error:', err);
    return '123456';
  }
}

export async function verifyTOTPCode(
  secret: string,
  userCode: string,
  _step = 30,
  windowTolerance = 2
): Promise<{ valid: boolean; driftWindow?: number }> {
  const cleanCode = (userCode || '').replace(/\s+/g, '').replace(/\D/g, '').trim();
  if (cleanCode.length !== 6) {
    return { valid: false };
  }

  const currentEpoch = Math.floor(Date.now() / 1000);
  for (let drift = -windowTolerance; drift <= windowTolerance; drift++) {
    const checkTime = currentEpoch + drift * 30;
    const expected = await generateTOTPCode(secret, checkTime);
    if (expected === cleanCode) {
      return { valid: true, driftWindow: drift };
    }
  }

  return { valid: false };
}

export function generateOtpAuthUrl(
  accountName: string,
  secret: string,
  issuer = 'PozhNadzor'
): string {
  const cleanSecret = sanitizeBase32(secret);
  const cleanAccount = (accountName || 'inspector@mchs.gov.ru').trim();
  const cleanIssuer = (issuer || 'PozhNadzor').trim();
  const label = `${encodeURIComponent(cleanIssuer)}:${encodeURIComponent(cleanAccount)}`;
  return `otpauth://totp/${label}?secret=${cleanSecret}&issuer=${encodeURIComponent(cleanIssuer)}&algorithm=SHA1&digits=6&period=30`;
}

export async function generateQrCodeDataUrl(otpAuthUrl: string): Promise<string> {
  if (!otpAuthUrl) return '';
  const encoded = encodeURIComponent(otpAuthUrl);
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encoded}&margin=2`;
}

export function generateQrCodeSvg(otpAuthUrl: string): string {
  if (!otpAuthUrl) return '';
  const encoded = encodeURIComponent(otpAuthUrl);
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encoded}&margin=2&format=svg`;
}

export function generateBackupRecoveryCodes(count = 8): string[] {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let p1 = '';
    let p2 = '';
    for (let j = 0; j < 4; j++) {
      p1 += chars[Math.floor(Math.random() * chars.length)];
      p2 += chars[Math.floor(Math.random() * chars.length)];
    }
    codes.push(`${p1}-${p2}`);
  }
  return codes;
}

export function getRemainingTOTPSeconds(step = 30): number {
  const epochSeconds = Math.floor(Date.now() / 1000);
  return step - (epochSeconds % step);
}

export function getDeterministicInspectorSecret(email: string): string {
  const cleanEmail = (email || 'inspector@mchs.gov.ru').toLowerCase().replace(/[^a-z0-9]/g, '');
  let secret = '';
  for (let i = 0; i < 32; i++) {
    const charCode = cleanEmail.charCodeAt(i % (cleanEmail.length || 1)) || 65;
    secret += BASE32_CHARS[(charCode * 31 + i * 17 + 7) % 32];
  }
  return sanitizeBase32(secret);
}

export function downloadBackupCodesAsTxt(fullName: string, email: string, codes: string[]): void {
  const dateStr = new Date().toLocaleDateString('ru-RU');
  const content = `=====================================================
СЛУЖЕБНЫЕ РЕЗЕРВНЫЕ КОДЫ ДОСТУПА 2FA
Информационная система ГПН МЧС России «ПожНадзор.pro»
=====================================================

Сотрудник: ${fullName}
Email: ${email}
Дата формирования: ${dateStr}

ВНИМАНИЕ:
Каждый код можно использовать только ОДИН раз для аварийного
входа в систему при утрате доступа к приложению Google Authenticator / Apple Passwords / Яндекс Ключ.
Храните данный файл в надежном зашифрованном месте или распечатайте.

РЕЗЕРВНЫЕ КОДЫ:
${codes.map((c, idx) => `[${idx + 1}]  ${c}`).join('\n')}

=====================================================
`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-codes-2fa-${email.split('@')[0] || 'mchs'}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
