import fs from 'node:fs';
import path from 'node:path';
import selfsigned from 'selfsigned';
import type { NetworkInfo } from '../../application/ports';

const VALIDITY_DAYS = 3650;

export interface Certificate {
  key: string | Buffer;
  cert: string | Buffer;
}

/**
 * Certificado autoassinado para o celular poder usar o microfone (exige HTTPS).
 * Reaproveita o salvo enquanto os IPs da rede local não mudarem.
 */
export class SelfSignedCertificateStore {
  constructor(private readonly dir: string, private readonly network: NetworkInfo) {}

  async load(): Promise<Certificate> {
    const ips = this.network.lanAddresses();
    const keyFile = path.join(this.dir, 'key.pem');
    const certFile = path.join(this.dir, 'cert.pem');
    const metaFile = path.join(this.dir, 'hosts.json');
    try {
      if ((JSON.parse(fs.readFileSync(metaFile, 'utf8')) as string[]).join() === ips.join()) {
        return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
      }
    } catch { /* gera um novo */ }
    const altNames = [
      { type: 2 as const, value: 'localhost' },
      { type: 7 as const, ip: '127.0.0.1' },
      ...ips.map((ip) => ({ type: 7 as const, ip })),
    ];
    const pems = await selfsigned.generate(
      [{ name: 'commonName', value: 'Nihongo City (local)' }],
      { notAfterDate: new Date(Date.now() + VALIDITY_DAYS * 86400000), keySize: 2048, algorithm: 'sha256', extensions: [{ name: 'subjectAltName', altNames }] },
    );
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(keyFile, pems.private);
    fs.writeFileSync(certFile, pems.cert);
    fs.writeFileSync(metaFile, JSON.stringify(ips));
    return { key: pems.private, cert: pems.cert };
  }
}
