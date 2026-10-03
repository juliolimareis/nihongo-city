import os from 'node:os';
import type { NetworkInfo } from '../../application/ports';

const rank = (ip: string): number =>
  ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3;

export class OsNetworkInfo implements NetworkInfo {
  lanAddresses(): string[] {
    return Object.values(os.networkInterfaces()).flat()
      .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === 'IPv4' && !i.internal)
      .map((i) => i.address)
      .sort((a, b) => rank(a) - rank(b));
  }
}
