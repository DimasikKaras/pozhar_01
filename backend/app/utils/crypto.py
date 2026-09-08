import os
import json
import base64
import hashlib
from typing import Tuple, Dict, Any, Optional

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    HAVE_CRYPTOGRAPHY = True
except ImportError:
    HAVE_CRYPTOGRAPHY = False


def derive_key(passphrase: str, salt: bytes, iterations: int = 100000) -> bytes:
    """Вычисление 256-битного криптографического ключа из пароля через PBKDF2-HMAC-SHA256."""
    if HAVE_CRYPTOGRAPHY:
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=iterations,
        )
        return kdf.derive(passphrase.encode("utf-8"))
    else:
        # Fallback с использованием стандартной библиотеки hashlib
        return hashlib.pbkdf2_hmac("sha256", passphrase.encode("utf-8"), salt, iterations, dklen=32)


def encrypt_data_aes256(data_bytes: bytes, passphrase: str) -> Dict[str, Any]:
    """
    Шифрование данных алгоритмом AES-256-GCM по ГОСТ Р 57580.1 / ISO 18033-3.
    Возвращает структуру с зашифрованными данными, солью и вектором инициализации.
    """
    if not passphrase:
        raise ValueError("Пароль для шифрования AES-256 не может быть пустым")

    salt = os.urandom(16)
    iv = os.urandom(12)  # 96-bit IV для AES-GCM
    key = derive_key(passphrase, salt, iterations=100000)

    if HAVE_CRYPTOGRAPHY:
        aesgcm = AESGCM(key)
        # AESGCM.encrypt возвращает ciphertext + tag (16 байт аутентификационного тега)
        encrypted_raw = aesgcm.encrypt(iv, data_bytes, None)
    else:
        # Fallback через OpenSSL subprocess, если cryptography вдруг недоступна
        import subprocess
        proc = subprocess.run(
            ["openssl", "enc", "-aes-256-cbc", "-pbkdf2", "-iter", "100000", "-k", passphrase],
            input=data_bytes,
            capture_output=True
        )
        if proc.returncode != 0:
            raise RuntimeError(f"Ошибка openssl: {proc.stderr.decode('utf-8', errors='ignore')}")
        encrypted_raw = proc.stdout

    return {
        "system": "АС ПожНадзор (ГОСТ Р 57580.1)",
        "version": "1.0.0",
        "encrypted": True,
        "algorithm": "AES-256-GCM" if HAVE_CRYPTOGRAPHY else "AES-256-CBC",
        "kdf": "PBKDF2-HMAC-SHA256",
        "iterations": 100000,
        "salt": salt.hex(),
        "iv": iv.hex(),
        "ciphertext": base64.b64encode(encrypted_raw).decode("ascii")
    }


def decrypt_data_aes256(encrypted_dict: Dict[str, Any], passphrase: str) -> bytes:
    """
    Расшифрование данных AES-256-GCM.
    При неверном пароле или повреждении данных выбрасывает ValueError.
    """
    if not passphrase:
        raise ValueError("Требуется пароль для расшифрования AES-256")

    if not isinstance(encrypted_dict, dict) or not encrypted_dict.get("encrypted"):
        raise ValueError("Некорректный формат зашифрованного пакета")

    salt_hex = encrypted_dict.get("salt")
    iv_hex = encrypted_dict.get("iv")
    b64_cipher = encrypted_dict.get("ciphertext")

    if not (salt_hex and iv_hex and b64_cipher):
        raise ValueError("Зашифрованный файл поврежден или отсутствуют метаданные AES-256")

    salt = bytes.fromhex(salt_hex)
    iv = bytes.fromhex(iv_hex)
    ciphertext_raw = base64.b64decode(b64_cipher)

    key = derive_key(passphrase, salt, iterations=int(encrypted_dict.get("iterations", 100000)))

    if HAVE_CRYPTOGRAPHY:
        try:
            aesgcm = AESGCM(key)
            decrypted = aesgcm.decrypt(iv, ciphertext_raw, None)
            return decrypted
        except Exception:
            raise ValueError("Неверный пароль расшифрования AES-256 или целостность файла нарушена")
    else:
        import subprocess
        proc = subprocess.run(
            ["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "100000", "-k", passphrase],
            input=ciphertext_raw,
            capture_output=True
        )
        if proc.returncode != 0:
            raise ValueError("Неверный пароль расшифрования AES-256")
        return proc.stdout


def is_aes256_encrypted(data_obj: Any) -> bool:
    """Проверка, является ли переданный объект зашифрованным бэкапом AES-256."""
    if isinstance(data_obj, dict):
        return bool(data_obj.get("encrypted") is True and data_obj.get("algorithm", "").startswith("AES-256"))
    if isinstance(data_obj, (bytes, str)):
        try:
            text = data_obj if isinstance(data_obj, str) else data_obj.decode("utf-8", errors="ignore")
            parsed = json.loads(text)
            return is_aes256_encrypted(parsed)
        except Exception:
            return False
    return False
