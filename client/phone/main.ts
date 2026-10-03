import '../infrastructure/polyfills';
import type { RemoteResult, RemoteState } from '../../shared/contracts';
import { RecognitionImpl, isPermissionError } from '../infrastructure/speech-recognition';
import { $, esc, html } from '../ui/dom';
import { PhoneRemoteLink } from './remote-link';

// Controle no celular: mostra o que a TV pede, reconhece a fala e envia o texto para a TV.
const code = (new URLSearchParams(location.search).get('c') || '').toUpperCase();
const link = new PhoneRemoteLink(code);

const view = $('#ph-view');
const statusEl = $('#ph-status');
const heard = $('#ph-heard');
const mic = $<HTMLButtonElement>('#ph-mic');
const kbd = $('#ph-kbd');
const typeForm = $<HTMLFormElement>('#ph-type');
const typeInput = $<HTMLInputElement>('#ph-text');

const player = new Audio();
let current: RemoteState = { mode: 'idle' };
let listening = false;
let wakeLock: unknown = null;

const canAnswer = (): boolean => current.mode === 'answer' || current.mode === 'repeat';

function setStatus(kind: '' | 'on' | 'off', text: string): void {
  statusEl.innerHTML = `<span class="dot ${kind ? `dot--${kind}` : ''}"></span> ${esc(text)}`;
}

function play(url: string | null, btn?: HTMLElement): void {
  if (!url) return;
  player.src = url;
  btn?.classList.add('is-playing');
  player.play().catch(() => {});
  player.onended = player.onpause = () => btn?.classList.remove('is-playing');
}

function continueButton(): HTMLElement {
  const b = html('<button type="button" class="btn btn--primary">Continuar ▶</button>');
  b.addEventListener('click', () => link.action('continue'));
  return b;
}

function resultCard(r: RemoteResult | null | undefined): HTMLElement | null {
  if (!r) return null;
  return html(`
    <div class="ph-result ph-result--${r.ok ? 'ok' : 'bad'}">
      <strong>${esc(r.title)}</strong>
      ${r.said ? `<span>Você disse: <span class="jp" lang="ja">${esc(r.said)}</span></span><br>` : ''}
      ${r.message ? `<span>${esc(r.message)}</span>` : ''}
    </div>`);
}

function render(): void {
  const s = current;
  const nodes: (HTMLElement | null)[] = [];
  if (s.mode === 'idle') {
    nodes.push(html(`
      <div class="ph-idle">
        <span class="big">📺</span>
        <p><b>Conectado à TV!</b></p>
        <p>Escolha um local na cidade pela TV (ou aceite um convite).<br>Quando o NPC perguntar algo, as opções aparecem aqui.</p>
      </div>`));
  }
  if (s.mode === 'npc') {
    const card = html(`
      <div class="ph-card">
        <p class="ph-npc">${esc(s.npc || '')}</p>
        <p class="ph-jp" lang="ja">${esc(s.jp)}</p>
        <p class="ph-ro">${esc(s.romaji)}</p>
        <p class="ph-pt">${esc(s.pt)}</p>
        <button type="button" class="btn btn--small btn--ghost">🔊 Repetir na TV</button>
      </div>`);
    $('button', card).addEventListener('click', () => link.action('replay'));
    if (s.canContinue) card.append(continueButton());
    nodes.push(card);
  }
  if (s.mode === 'answer') {
    nodes.push(resultCard(s.result));
    const card = html(`
      <div class="ph-card">
        <p class="ph-lives" aria-label="${s.lives} tentativas">${'❤️'.repeat(s.lives)}${'🖤'.repeat(Math.max(0, 3 - s.lives))}</p>
        <p class="ph-prompt">🎯 ${esc(s.prompt)}</p>
        <div class="ph-options"></div>
        <p class="ph-pt">Toque numa opção para ouvir. Depois aperte <b>🎤 Falar</b>.</p>
      </div>`);
    for (const o of s.options || []) {
      const b = html(`<button type="button" class="ph-option"><b lang="ja">${esc(o.jp)}</b><small>${esc(o.romaji)}</small></button>`);
      b.addEventListener('click', () => play(o.audio, b));
      $('.ph-options', card).append(b);
    }
    nodes.push(card);
  }
  if (s.mode === 'repeat') {
    const card = html(`
      <div class="ph-card">
        <p class="ph-prompt">🔁 Ouça e repita a frase em voz alta.</p>
        <button type="button" class="btn">🔊 Ouvir</button>
      </div>`);
    const btn = $('button', card);
    btn.addEventListener('click', () => play(s.audio, btn));
    nodes.push(card);
  }
  if (s.mode === 'result') {
    nodes.push(resultCard(s.result), s.canContinue ? continueButton() : html('<p class="ph-pt">Avalie a carta na TV.</p>'));
  }
  if (s.mode === 'ending') {
    nodes.push(html(`
      <div class="ph-card">
        <p><b>${esc(s.title)}</b> +${Number(s.xp) || 0} XP</p>
        ${s.cards?.length ? `<div class="ph-chips">${s.cards.map((c) => `<span class="chip" lang="ja">${esc(c)}</span>`).join('')}</div>` : ''}
        <p class="ph-npc">🎌 Dica cultural</p>
        <p>${esc(s.culture)}</p>
      </div>`), continueButton());
  }
  view.replaceChildren(...nodes.filter((n): n is HTMLElement => !!n));
  view.scrollTop = 0;
  mic.disabled = !canAnswer() || listening;
  if (!canAnswer()) heard.textContent = '';
}

async function send(transcripts: string[]): Promise<void> {
  heard.innerHTML = `Enviando: <span class="jp" lang="ja">${esc(transcripts[0] || '…')}</span>`;
  try {
    const data = await link.speech(transcripts, current.listenId ?? null);
    heard.innerHTML = data.delivered
      ? `Você disse: <span class="jp" lang="ja">${esc(transcripts[0] || '(nada)')}</span> → veja na TV`
      : 'A TV não está conectada. Abra o jogo na TV.';
  } catch {
    heard.textContent = 'Falha ao enviar. Verifique o Wi-Fi.';
  }
}

function toggleKeyboard(force?: boolean): void {
  typeForm.hidden = force === undefined ? !typeForm.hidden : !force;
  if (!typeForm.hidden) typeInput.focus();
}

function listen(): void {
  if (!RecognitionImpl) { toggleKeyboard(true); return; }
  const rec = new RecognitionImpl();
  rec.lang = 'ja-JP';
  rec.interimResults = true;
  rec.maxAlternatives = 5;
  let finals: string[] = [];
  listening = true;
  mic.disabled = true;
  mic.classList.add('is-listening');
  mic.textContent = '🎙️ Ouvindo…';
  heard.textContent = 'Fale agora, em japonês.';
  rec.onresult = (e) => {
    finals = [];
    let interim = '';
    for (const res of Array.from(e.results)) {
      if (res.isFinal) for (const alt of Array.from(res)) finals.push(alt.transcript.trim());
      else interim += res[0].transcript;
    }
    if (interim) heard.innerHTML = `… <span class="jp" lang="ja">${esc(interim)}</span>`;
  };
  rec.onerror = (e) => {
    if (isPermissionError(e.error)) {
      heard.textContent = 'Microfone bloqueado. Libere nas permissões do navegador ou use ⌨️.';
    }
  };
  rec.onend = () => {
    listening = false;
    mic.classList.remove('is-listening');
    mic.textContent = '🎤 Falar';
    mic.disabled = !canAnswer();
    if (finals.length) void send(finals);
    else if (!(heard.textContent || '').startsWith('Microfone')) heard.textContent = 'Não ouvi nada. Toque em 🎤 e fale de novo.';
  };
  navigator.vibrate?.(30);
  rec.start();
}

function connect(): void {
  link.connect((msg) => {
    if (msg.type === 'hello') setStatus('on', `Conectado · ${msg.player}`);
    if (msg.type === 'state') {
      const wasAnswering = canAnswer();
      current = msg.state || { mode: 'idle' };
      if (canAnswer() && !wasAnswering) navigator.vibrate?.([40, 60, 40]);
      render();
    }
  }, (status) => {
    if (status === 'open') setStatus('on', 'Conectado');
    else if (status === 'expired') {
      setStatus('off', 'Código expirado');
      view.replaceChildren(html('<p class="ph-warn">Este código não vale mais. Na TV, abra 📱 e escaneie o QR code de novo.</p>'));
    } else {
      setStatus('', 'Reconectando…');
    }
  });
}

async function keepAwake(): Promise<void> {
  const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<unknown> } };
  try { wakeLock = wakeLock || (await nav.wakeLock?.request('screen')); } catch { /* opcional */ }
}

mic.addEventListener('click', () => { void keepAwake(); listen(); });
kbd.addEventListener('click', () => toggleKeyboard());
typeForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = typeInput.value.trim();
  if (!text || !canAnswer()) return;
  void send([text]);
  typeInput.value = '';
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) wakeLock = null; });

if (!code) {
  setStatus('off', 'Sem código');
  view.replaceChildren(html('<p class="ph-warn">Abra esta página pelo QR code mostrado na TV (botão 📱).</p>'));
} else {
  if (!window.isSecureContext) {
    view.before(html('<p class="ph-warn">Esta página precisa ser aberta em <b>https://</b> para usar o microfone. Use o endereço do QR code.</p>'));
  }
  if (!RecognitionImpl) {
    heard.textContent = 'Este navegador não reconhece voz (use o Chrome). Você pode digitar em japonês com ⌨️.';
    toggleKeyboard(true);
  }
  render();
  connect();
}
