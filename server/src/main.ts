import http from 'node:http';
import https from 'node:https';
import { buildContainer } from './container';
import { bundleFrontend } from './infrastructure/build/frontend-bundler';
import { config } from './infrastructure/config';
import { SelfSignedCertificateStore } from './infrastructure/tls/self-signed-certificate';

const PURGE_INTERVAL_MS = 10 * 60 * 1000;

async function start(): Promise<void> {
  const container = buildContainer(config);
  await bundleFrontend(config, { watch: !config.production });
  await container.reading.ready.catch((err: Error) =>
    console.warn('Dicionário kuromoji indisponível; comparação de voz usará só kana.', err.message));

  setInterval(() => container.purgeSessions.execute(), PURGE_INTERVAL_MS).unref();

  http.createServer(container.app).listen(config.port, () => console.log(`Nihongo City em http://localhost:${config.port}`));
  try {
    const cert = await new SelfSignedCertificateStore(config.certDir, container.network).load();
    https.createServer(cert, container.app).listen(config.httpsPort, () => {
      container.https.setPort(config.httpsPort);
      const ip = container.network.lanAddresses()[0];
      console.log(`HTTPS (celular como microfone) em https://${ip || 'localhost'}:${config.httpsPort}`);
    });
  } catch (err) {
    console.warn('HTTPS indisponível; o celular não conseguirá usar o microfone.', (err as Error).message);
  }
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
