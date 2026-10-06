import type { Store } from '../application/store';
import { $ } from './dom';

export interface ModalOptions {
  narrow?: boolean;
  onClose?: () => void;
  /** Chamado em todo fechamento (inclusive troca de conteúdo), antes de o conteúdo sair da página. */
  onDetach?: () => void;
}

/** Janela modal única da TV (baralho, estudo, configurações, locais, pareamento). */
export class Modal {
  private onModalClose: (() => void) | null = null;
  private onModalDetach: (() => void) | null = null;
  private lastFocus: Element | null = null;

  constructor(private readonly store: Store) {}

  private get el(): HTMLElement { return $('#modal'); }

  init(): void {
    $('#modal-close').addEventListener('click', () => this.close());
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.hidden) { e.stopPropagation(); this.close(); }
    });
  }

  open(title: string, content: HTMLElement, { narrow = false, onClose, onDetach }: ModalOptions = {}): void {
    this.close(true);
    this.lastFocus = document.activeElement;
    $('#modal-title').textContent = title;
    const body = $('#modal-body');
    body.replaceChildren(content);
    this.el.classList.toggle('modal--narrow', narrow);
    this.el.hidden = false;
    this.store.state.modalOpen = true;
    this.onModalClose = onClose || null;
    this.onModalDetach = onDetach || null;
    requestAnimationFrame(() => (body.querySelector<HTMLElement>('[autofocus]') || $('#modal-close')).focus());
  }

  /** silent = troca de conteúdo: não chama onClose nem devolve o foco. */
  close(silent = false): void {
    if (this.el.hidden) return;
    this.el.hidden = true;
    const detach = this.onModalDetach;
    this.onModalDetach = null;
    detach?.();
    $('#modal-body').replaceChildren();
    this.store.state.modalOpen = false;
    const cb = this.onModalClose;
    this.onModalClose = null;
    if (!silent) {
      cb?.();
      (this.lastFocus as HTMLElement | null)?.focus?.();
    }
  }
}
