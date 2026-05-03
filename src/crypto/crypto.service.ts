import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const hex = this.config.getOrThrow<string>('ENCRYPTION_KEY');
    const raw = Buffer.from(hex, 'hex');
    if (raw.length !== KEY_LEN) {
      throw new Error(
        `ENCRYPTION_KEY должен быть ${KEY_LEN * 2} hex-символов (${KEY_LEN} байт)`,
      );
    }
    this.key = raw;
  }

  encryptUtf8(plain: string): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64url');
  }

  decryptUtf8(payload: string): string {
    const buf = Buffer.from(payload, 'base64url');
    if (buf.length < IV_LEN + TAG_LEN + 1) {
      throw new Error('Некорректный формат ciphertext');
    }
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const data = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data).toString('utf8') + decipher.final('utf8');
  }
}
