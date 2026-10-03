import type { PairingDto } from '../../../../shared/contracts';
import type { PairingInfoBuilder, RequestOrigin } from './pairing-info';
import type { SessionLocator } from './session-locator';

export class GetPairing {
  constructor(private readonly locator: SessionLocator, private readonly pairing: PairingInfoBuilder) {}

  execute(code: unknown, origin: RequestOrigin): Promise<PairingDto> {
    return this.pairing.build(this.locator.require(code).code, origin);
  }
}
