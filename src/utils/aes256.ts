// ==============================================================================
// УТИЛИТА ШИФРОВАНИЯ РЕЗЕРВНЫХ КОПИЙ AES-256-GCM (ГОСТ Р 57580.1 / Web Crypto API)
// ==============================================================================

export interface Aes256EncryptedPayload {
  system: string;
  version: string;
  encrypted: true;
  algorithm: 'AES-256-GCM';
  kdf: 'PBKDF2-HMAC-SHA256';
  iterations: number;
  salt: string; // hex
  iv: string;   // hex
  ciphertext: string; // base64
  created_at?: string;
}

// Конвертеры буферов
function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToArrayBuffer(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Вычисление 256-битного криптографического ключа из пароля через PBKDF2-HMAC-SHA256.
 */
async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
  iterations = 100000
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const rawKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256'
    },
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Проверка, является ли переданный объект или строка зашифрованным бэкапом AES-256.
 */
export function isEncryptedBackupData(input: unknown): boolean {
  if (!input) return false;
  if (typeof input === 'object' && input !== null) {
    const obj = input as any;
    return Boolean(
      obj.encrypted === true &&
      typeof obj.algorithm === 'string' &&
      obj.algorithm.includes('AES-256') &&
      obj.ciphertext
    );
  }
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return isEncryptedBackupData(parsed);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Зашифровать строку (JSON) алгоритмом AES-256-GCM.
 */
export async function encryptBackupAes256(
  plaintextJson: string,
  passphrase: string
): Promise<Aes256EncryptedPayload> {
  if (!passphrase || passphrase.trim().length === 0) {
    throw new Error('Пароль для шифрования AES-256 не может быть пустым');
  }

  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const key = await deriveAesKey(passphrase.trim(), salt, 100000);

  const enc = new TextEncoder();
  const encodedPlaintext = enc.encode(plaintextJson);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    encodedPlaintext
  );

  return {
    system: 'АС ПожНадзор (ГОСТ Р 57580.1)',
    version: '1.0.0',
    encrypted: true,
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-HMAC-SHA256',
    iterations: 100000,
    salt: arrayBufferToHex(salt),
    iv: arrayBufferToHex(iv),
    ciphertext: arrayBufferToBase64(encryptedBuffer),
    created_at: new Date().toISOString()
  };
}

/**
 * Расшифровать зашифрованный бэкап AES-256-GCM.
 * При неверном пароле или повреждении данных выбрасывает ошибку.
 */
export async function decryptBackupAes256(
  payloadOrJson: string | Aes256EncryptedPayload,
  passphrase: string
): Promise<string> {
  if (!passphrase || passphrase.trim().length === 0) {
    throw new Error('Введите пароль для расшифрования бэкапа');
  }

  let payload: Aes256EncryptedPayload;
  if (typeof payloadOrJson === 'string') {
    try {
      payload = JSON.parse(payloadOrJson);
    } catch {
      throw new Error('Некорректный синтаксис зашифрованного файла');
    }
  } else {
    payload = payloadOrJson;
  }

  if (!payload.encrypted || !payload.ciphertext || !payload.salt || !payload.iv) {
    throw new Error('Файл не содержит необходимых метаданных шифрования AES-256');
  }

  const salt = hexToArrayBuffer(payload.salt);
  const iv = hexToArrayBuffer(payload.iv);
  const ciphertextBytes = base64ToArrayBuffer(payload.ciphertext);

  const key = await deriveAesKey(passphrase.trim(), salt, payload.iterations || 100000);

  try {
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      ciphertextBytes
    );

    const dec = new TextDecoder('utf-8');
    return dec.decode(decryptedBuffer);
  } catch (err) {
    throw new Error('Неверный пароль расшифрования AES-256 или файл резервной копии поврежден');
  }
}
