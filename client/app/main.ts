import '../infrastructure/polyfills';
import type { ProfileDto } from '../../shared/contracts';
import { SettingsService } from '../application/settings-service';
import { SpeechMatcher } from '../application/speech-matcher';
import { Store } from '../application/store';
import { HttpError, httpGameApi as api } from '../infrastructure/http-api';
import { localPlayerStore as playerIds } from '../infrastructure/local-player-store';
import { localTvPrefs as tvPrefs } from '../infrastructure/local-tv-prefs';
import { SseRemoteMicrophone } from '../infrastructure/sse-remote-microphone';
import { WebAudioPlayer } from '../infrastructure/web-audio-player';
import { WebSpeechRecognizer } from '../infrastructure/web-speech-recognizer';
import { CityView } from '../ui/city-view';
import { DeckView } from '../ui/deck-view';
import { DialogueView } from '../ui/dialogue-view';
import { $ } from '../ui/dom';
import { renderHud } from '../ui/hud';
import { Invites } from '../ui/invites';
import { Modal } from '../ui/modal';
import { PairingView } from '../ui/pairing-view';
import { SettingsView } from '../ui/settings-view';
import { StudyView } from '../ui/study-view';
import { TvStudyView } from '../ui/tv-study-view';

// ===== Composition root da TV: instancia os adaptadores e injeta nas views. =====

const store = new Store();
const audio = new WebAudioPlayer(() => store.state.settings);
const voice = new WebSpeechRecognizer(audio);
const remote = new SseRemoteMicrophone(() => store.player.id);
const matcher = new SpeechMatcher(api);
const settings = new SettingsService(store, api, audio);
const modal = new Modal(store);

const study = new StudyView({ store, api, audio, voice, remote, matcher, modal });
const deck = new DeckView({ store, api, audio, modal, openStudy: () => { void study.open(); } });
const tvStudy = new TvStudyView({
  store, api, audio, modal, prefs: tvPrefs,
  onBackgroundChange: (playing) => {
    // Ilumina o botão da TV enquanto o áudio/vídeo toca em segundo plano.
    document.getElementById('btn-tv')?.classList.toggle('is-on', playing);
  },
});
const settingsView = new SettingsView({ store, settings, api, modal });
const city = new CityView({ store, settings, audio, modal });
const dialogue = new DialogueView({ store, api, audio, voice, remote, matcher });
const invites = new Invites({
  store, api, audio,
  startEvent: (scenarioId) => { void dialogue.start({ scenarioId, source: 'invite' }); },
});
const pairing = new PairingView(remote, modal);

remote.onConnectionChange((connected) => {
  $('#btn-remote').classList.toggle('is-on', connected);
  if (connected) audio.sfx('notify');
  store.emit('remote');
});
remote.onAction((action) => dialogue.handleRemoteAction(action));

// ===== Fluxo de entrada =====

async function refreshProfile(): Promise<void> {
  const data = await api.getPlayer(store.player.id);
  Object.assign(store.state, { player: data.player, stats: data.stats });
  renderHud(store);
}

async function loadPlayer(): Promise<ProfileDto | null> {
  const id = playerIds.get();
  if (!id) return null;
  try {
    return await api.getPlayer(id);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) playerIds.clear();
    return null;
  }
}

async function enterGame(): Promise<void> {
  audio.unlock();
  $('#start-msg').textContent = 'Carregando Shibuya…';
  const [scenes, music] = await Promise.all([api.scenes(), api.music()]);
  store.state.scenes = scenes;
  audio.applySettings();

  $('#game').hidden = false;
  await city.init({ onSelect: (loc) => { void dialogue.start({ locationId: loc.id }); } });
  $('#start').hidden = true;
  renderHud(store);
  audio.startMusic(music);

  dialogue.init();
  invites.init();
  $('#btn-remote').addEventListener('click', () => { void pairing.open(); });
  remote.resume();
  $('#btn-settings').addEventListener('click', () => settingsView.open());
  $('#btn-deck').addEventListener('click', () => { void deck.open(); });
  $('#btn-study').addEventListener('click', () => { void study.open(); });
  $('#btn-tv').addEventListener('click', () => { void tvStudy.open(); });

  if (new URLSearchParams(location.search).has('edit')) {
    const { initHotspotEditor } = await import('../ui/hotspot-editor');
    initHotspotEditor();
  }
}

function useProfile(data: ProfileDto): void {
  Object.assign(store.state, { player: data.player, settings: data.settings, stats: data.stats });
  playerIds.set(data.player.id);
}

function showFatal(err: Error): void {
  console.error(err);
  $('#start').hidden = false;
  $('#start-msg').textContent = `Erro: ${err.message}. Verifique se o servidor está rodando.`;
}

async function boot(): Promise<void> {
  modal.init();
  store.onChange((what) => {
    if (what === 'profile') renderHud(store);
    if (what === 'refresh-profile') refreshProfile().catch(() => {});
    if (what === 'settings') invites.reschedule();
    if (what === 'remote') pairing.refreshStatus();
  });

  const existing = await loadPlayer();
  const form = $<HTMLFormElement>('#start-form');
  const startBtn = $<HTMLButtonElement>('#start-btn');
  const switchBtn = $<HTMLButtonElement>('#switch-player');
  const nameInput = $<HTMLInputElement>('#player-name');
  const submit = $<HTMLButtonElement>('button[type="submit"]', form);

  const showForm = (): void => {
    form.hidden = false;
    startBtn.hidden = true;
    switchBtn.hidden = true;
    $('#start-msg').textContent = '';
    nameInput.focus();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    submit.disabled = true;
    $('#start-msg').textContent = 'Procurando seu progresso…';
    try {
      // O nome é a chave: um nome já usado volta com XP, nível e baralho.
      const data = await api.login(name);
      useProfile(data);
      if (data.returning) $('#start-msg').textContent = `おかえりなさい、${data.player.name}！`;
      await enterGame();
    } catch (err) {
      showFatal(err as Error);
      submit.disabled = false;
    }
  });

  if (existing) {
    useProfile(existing);
    $('#start-msg').textContent = `おかえりなさい、${existing.player.name}！`;
    startBtn.hidden = false;
    switchBtn.hidden = false;
    startBtn.focus();
    startBtn.addEventListener('click', () => {
      startBtn.disabled = true;
      enterGame().catch(showFatal);
    }, { once: true });
    switchBtn.addEventListener('click', () => {
      playerIds.clear();
      showForm();
    });
  } else {
    showForm();
  }
}

boot().catch(showFatal);
