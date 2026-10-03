import path from 'node:path';
import esbuild from 'esbuild';

// Compila para o Chromium 79 (navegador das TVs LG webOS 6, de 2021) e recompila ao salvar.
const TARGET = ['chrome79'];

export interface BundleDirs {
  clientDir: string;
  publicDir: string;
}

export async function bundleFrontend({ clientDir, publicDir }: BundleDirs, { watch = true } = {}): Promise<void> {
  const ctx = await esbuild.context({
    entryPoints: {
      app: path.join(clientDir, 'app', 'main.ts'),
      phone: path.join(clientDir, 'phone', 'main.ts'),
      'app-style': path.join(publicDir, 'css', 'app.css'),
      'phone-style': path.join(publicDir, 'css', 'phone.css'),
    },
    outdir: path.join(publicDir, 'build'),
    bundle: true,
    format: 'iife',
    target: TARGET,
    sourcemap: 'linked',
    external: ['/img/*'],
    logLevel: 'warning',
  });
  await ctx.rebuild();
  if (watch) await ctx.watch();
  else await ctx.dispose();
}
