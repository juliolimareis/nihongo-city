import type { PairingDto } from '../../../../shared/contracts';
import type { HttpsEndpoint, NetworkInfo, QrCodeGenerator } from '../ports';

/** De onde veio o pedido da TV; usado quando não há HTTPS nem IP de rede local. */
export interface RequestOrigin {
  hostname: string;
  protocol: string;
  localPort: number | undefined;
}

/** Monta o endereço que o celular deve abrir e o QR code correspondente. */
export class PairingInfoBuilder {
  constructor(
    private readonly network: NetworkInfo,
    private readonly https: HttpsEndpoint,
    private readonly qr: QrCodeGenerator,
  ) {}

  async build(code: string, origin: RequestOrigin): Promise<PairingDto> {
    const ips = this.network.lanAddresses();
    const host = this.https.publicHost || ips[0] || origin.hostname;
    const httpsPort = this.https.port();
    const local = httpsPort ? `https://${host}:${httpsPort}` : `${origin.protocol}://${host}:${origin.localPort}`;
    const base = this.https.publicUrl || local;
    const url = `${base}/remote.html?c=${code}`;
    return { code, url, qr: await this.qr.svg(url), alternatives: this.https.publicUrl ? [] : ips.slice(1) };
  }
}
