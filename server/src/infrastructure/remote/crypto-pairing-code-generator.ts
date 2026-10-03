import crypto from 'node:crypto';
import type { PairingCodeGenerator } from '../../domain/remote/repositories';

// Sem 0/O, 1/I: fácil de ler e digitar.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;

export class CryptoPairingCodeGenerator implements PairingCodeGenerator {
  generate(isTaken: (code: string) => boolean): string {
    let code: string;
    do {
      code = Array.from(crypto.randomBytes(CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    } while (isTaken(code));
    return code;
  }
}
