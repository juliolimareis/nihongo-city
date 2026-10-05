import { ConvertReading } from './application/game/convert-reading';
import { FinishEvent } from './application/game/finish-event';
import { GetNextInvite } from './application/game/get-next-invite';
import { ListMusic } from './application/game/list-music';
import { ListScenes } from './application/game/list-scenes';
import { RecordAttempt } from './application/game/record-attempt';
import { ScenarioAssembler } from './application/game/scenario-assembler';
import { ScenarioSelector } from './application/game/scenario-selector';
import { StartEvent } from './application/game/start-event';
import { ListCards } from './application/deck/list-cards';
import { ListDueCards } from './application/deck/list-due-cards';
import { ReviewCard } from './application/deck/review-card';
import { StudyDay } from './application/deck/study-day';
import { GetProfile } from './application/player/get-profile';
import { LoginPlayer } from './application/player/login-player';
import { ProfileAssembler } from './application/player/profile-assembler';
import { ResetProgress } from './application/player/reset-progress';
import { UpdateSettings } from './application/player/update-settings';
import { ConnectPhone, ConnectTv } from './application/remote/connect-stream';
import { CreateRemoteSession } from './application/remote/create-session';
import { GetPairing } from './application/remote/get-pairing';
import { PairingInfoBuilder } from './application/remote/pairing-info';
import { PublishRemoteState, PurgeExpiredSessions, RelayAction, RelaySpeech } from './application/remote/relay';
import { SessionLocator } from './application/remote/session-locator';
import { Sm2Scheduling } from './domain/deck/scheduling';
import { DefaultXpPolicy } from './domain/event/xp-policy';
import type { Config } from './infrastructure/config';
import { type HttpUseCases, createHttpApp } from './infrastructure/http/app';
import { FsMusicCatalog } from './infrastructure/music/fs-music-catalog';
import { openDatabase } from './infrastructure/persistence/sqlite/connection';
import {
  SqliteExpressionRepository, SqliteLocationRepository, SqliteNpcRepository, SqliteScenarioRepository,
  SqliteSceneRepository,
} from './infrastructure/persistence/sqlite/content-repositories';
import { SqliteCardQuery, SqliteCardRepository, SqliteReviewLogRepository } from './infrastructure/persistence/sqlite/deck-repositories';
import { SqliteAttemptRepository, SqliteGameEventRepository } from './infrastructure/persistence/sqlite/event-repositories';
import {
  SqlitePlayerRepository, SqlitePlayerStatsQuery, SqliteSettingsRepository,
} from './infrastructure/persistence/sqlite/player-repositories';
import { SqliteUnitOfWork } from './infrastructure/persistence/sqlite/unit-of-work';
import { KuromojiReadingService } from './infrastructure/reading/kuromoji-reading-service';
import { CryptoPairingCodeGenerator } from './infrastructure/remote/crypto-pairing-code-generator';
import { MutableHttpsEndpoint } from './infrastructure/remote/https-endpoint';
import { InMemoryRemoteSessionRepository } from './infrastructure/remote/in-memory-session-repository';
import { OsNetworkInfo } from './infrastructure/remote/os-network-info';
import { QrCodeSvgGenerator } from './infrastructure/remote/qrcode-svg-generator';
import { mathRandom, systemClock } from './infrastructure/system';

/** Composition root: o único lugar que conhece as implementações concretas. */
export function buildContainer(config: Config) {
  const db = openDatabase(config.dbFile);
  const uow = new SqliteUnitOfWork(db);
  const clock = systemClock;
  const random = mathRandom;

  // Repositórios (adaptadores de saída)
  const expressions = new SqliteExpressionRepository(db);
  const npcs = new SqliteNpcRepository(db);
  const scenes = new SqliteSceneRepository(db);
  const locations = new SqliteLocationRepository(db);
  const scenarios = new SqliteScenarioRepository(db);
  const players = new SqlitePlayerRepository(db);
  const settings = new SqliteSettingsRepository(db);
  const stats = new SqlitePlayerStatsQuery(db);
  const cards = new SqliteCardRepository(db);
  const reviews = new SqliteReviewLogRepository(db);
  const cardQuery = new SqliteCardQuery(db);
  const events = new SqliteGameEventRepository(db);
  const attempts = new SqliteAttemptRepository(db);
  const sessions = new InMemoryRemoteSessionRepository();

  // Serviços técnicos
  const reading = new KuromojiReadingService();
  const network = new OsNetworkInfo();
  const https = new MutableHttpsEndpoint(config.publicHost, config.publicUrl);

  // Serviços de aplicação compartilhados
  const studyDay = new StudyDay(settings, cardQuery, clock);
  const profiles = new ProfileAssembler(settings, stats, studyDay);
  const selector = new ScenarioSelector(events, random);
  const assembler = new ScenarioAssembler(expressions, npcs, random);
  const locator = new SessionLocator(sessions, clock);
  const pairing = new PairingInfoBuilder(network, https, new QrCodeSvgGenerator());

  const useCases: HttpUseCases = {
    player: {
      login: new LoginPlayer(players, settings, profiles, uow),
      getProfile: new GetProfile(players, profiles),
      updateSettings: new UpdateSettings(players, settings, scenes),
      resetProgress: new ResetProgress(players, cards, reviews, events, profiles, uow),
    },
    cards: {
      listCards: new ListCards(players, cardQuery),
      listDueCards: new ListDueCards(players, studyDay),
      reviewCard: new ReviewCard(players, cards, reviews, cardQuery, new Sm2Scheduling(), clock, uow),
    },
    game: {
      listScenes: new ListScenes(scenes),
      listMusic: new ListMusic(new FsMusicCatalog(config.musicDir)),
      startEvent: new StartEvent(players, locations, scenarios, events, selector, assembler),
      nextInvite: new GetNextInvite(players, scenarios, npcs, selector),
      recordAttempt: new RecordAttempt(events, attempts, scenarios, uow),
      finishEvent: new FinishEvent(events, attempts, scenarios, expressions, cards, players, new DefaultXpPolicy(), clock, uow),
      convertReading: new ConvertReading(reading),
    },
    remote: {
      createSession: new CreateRemoteSession(players, sessions, new CryptoPairingCodeGenerator(), pairing, clock),
      getPairing: new GetPairing(locator, pairing),
      connectTv: new ConnectTv(locator),
      connectPhone: new ConnectPhone(locator),
      publishState: new PublishRemoteState(locator),
      relaySpeech: new RelaySpeech(locator),
      relayAction: new RelayAction(locator),
    },
  };

  return {
    app: createHttpApp(config, useCases),
    reading,
    network,
    https,
    purgeSessions: new PurgeExpiredSessions(sessions, clock),
  };
}
