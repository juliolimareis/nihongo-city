import type { PhoneMessage, TvMessage } from '../../../../shared/contracts';
import type { RemoteClient } from '../../domain/remote/remote-session';
import type { SessionLocator } from './session-locator';

/**
 * Abre o canal só depois de validar o código (para um código inválido ainda dar 404).
 * Recebe a função que deve ser chamada quando o canal fechar.
 */
export type OpenChannel<M> = (onClose: () => void) => RemoteClient<M>;

/** A TV passa a ouvir falas e o status do celular. */
export class ConnectTv {
  constructor(private readonly locator: SessionLocator) {}

  execute(code: unknown, open: OpenChannel<TvMessage>): void {
    const session = this.locator.require(code);
    const client: RemoteClient<TvMessage> = open(() => session.detachTv(client));
    session.attachTv(client);
  }
}

/** O celular passa a ouvir o estado da TV. */
export class ConnectPhone {
  constructor(private readonly locator: SessionLocator) {}

  execute(code: unknown, open: OpenChannel<PhoneMessage>): void {
    const session = this.locator.require(code);
    const client: RemoteClient<PhoneMessage> = open(() => session.detachPhone(client));
    session.attachPhone(client);
  }
}
