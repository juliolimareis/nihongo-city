import { bundleFrontend } from '../infrastructure/build/frontend-bundler';
import { config } from '../infrastructure/config';

// npm run build:client: só o esbuild do frontend, sem subir o servidor.
bundleFrontend(config, { watch: false })
  .then(() => console.log('Build OK → public/build/'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
