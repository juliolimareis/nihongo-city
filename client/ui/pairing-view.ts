import type { PairingDto } from '../../shared/contracts';
import type { RemoteMicrophone } from '../application/ports';
import { $, esc, html } from './dom';
import type { Modal } from './modal';

/** Janela com o QR code para parear o celular como microfone. */
export class PairingView {
  private renderStatus: (() => void) | null = null;

  constructor(private readonly remote: RemoteMicrophone, private readonly modal: Modal) {}

  /** Atualiza o "aguardando / conectado" se a janela estiver aberta. */
  refreshStatus(): void {
    this.renderStatus?.();
  }

  async open(): Promise<void> {
    const { remote } = this;
    const content = html(`
      <div class="pairing">
        <div class="pairing__qr" aria-label="QR code">Gerando…</div>
        <div class="pairing__info">
          <p class="pairing__status"></p>
          <ol>
            <li>Conecte o celular no <b>mesmo Wi-Fi</b> da TV.</li>
            <li>Aponte a câmera para o QR code (ou digite o endereço abaixo).</li>
            <li>Se aparecer <b>"Sua conexão não é particular"</b>, toque em <b>Avançado → Continuar</b>.
              É o certificado local do jogo; só precisa fazer uma vez.</li>
            <li>Toque em 🎤 no celular e fale em japonês. A resposta aparece aqui na TV.</li>
          </ol>
          <p class="pairing__url"></p>
          <p class="pairing__alt"></p>
          <button type="button" class="btn btn--small btn--ghost" data-new>Gerar novo código</button>
        </div>
      </div>`);
    const status = (): void => {
      $('.pairing__status', content).innerHTML = remote.connected
        ? '<span class="dot dot--on"></span> Celular conectado! Pode fechar esta janela.'
        : '<span class="dot"></span> Aguardando o celular…';
    };
    const render = (pairing: PairingDto): void => {
      $('.pairing__qr', content).innerHTML = pairing.qr; // SVG gerado pelo nosso servidor
      $('.pairing__url', content).innerHTML =
        `Endereço: <code>${esc(pairing.url)}</code><br>Código: <b class="pairing__code">${esc(pairing.code)}</b>`;
      $('.pairing__alt', content).textContent = pairing.alternatives?.length
        ? `Se não abrir, troque o IP por: ${pairing.alternatives.join(', ')}`
        : '';
      status();
    };
    $('[data-new]', content).addEventListener('click', async () => {
      render(await remote.renewSession());
    });
    this.modal.open('📱 Celular como microfone', content, { onClose: () => { this.renderStatus = null; } });
    this.renderStatus = status;
    render(await remote.pairing());
  }
}
