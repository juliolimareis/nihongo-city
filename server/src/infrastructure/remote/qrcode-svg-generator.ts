import QRCode from 'qrcode';
import type { QrCodeGenerator } from '../../application/ports';

export class QrCodeSvgGenerator implements QrCodeGenerator {
  svg(text: string): Promise<string> {
    return QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#0b0820', light: '#ffffff' } });
  }
}
