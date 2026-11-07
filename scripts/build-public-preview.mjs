import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewRoutePaths } from '../preview/routes.ts';

const project = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(project, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Build only the existing browser UI. No API, Auth adapter, environment file or
// service credentials enter this dependency graph or the static artifact.
const result = await build({
  absWorkingDir: project,
  entryPoints: ['preview/entry.tsx'],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  outdir: path.join(output, 'assets'),
  entryNames: 'horion-[hash]',
  assetNames: 'asset-[hash]',
  sourcemap: false,
  metafile: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: {
    '@': project,
    'next/link': path.join(project, 'preview/next-link.tsx'),
    'next/navigation': path.join(project, 'preview/next-navigation.ts'),
  },
  external: ['/fonts/*', '/images/*'],
  plugins: [
    {
      name: 'horion-preview-existing-styles',
      setup(builder) {
        builder.onLoad({ filter: /[/\\]app[/\\]globals\.css$/ }, async ({ path: filename }) => {
          const source = await readFile(filename, 'utf8');
          const processed = await postcss([tailwindcss({ base: project })]).process(source, {
            from: filename,
            map: false,
          });
          return { contents: processed.css, loader: 'css', resolveDir: path.dirname(filename) };
        });
      },
    },
  ],
});

const inputs = Object.keys(result.metafile.inputs).map((filename) =>
  filename.replaceAll('\\', '/')
);
if (
  inputs.some(
    (filename) =>
      /(?:^|\/)app\/api\/|(?:^|\/)lib\/supabase\//.test(filename) || /(?:^|\/)\.env/.test(filename)
  )
)
  throw new Error('The public preview unexpectedly includes a backend or environment dependency.');

const [script, scriptInfo] =
  Object.entries(result.metafile.outputs).find(([, info]) =>
    info.entryPoint?.replaceAll('\\', '/').endsWith('preview/entry.tsx')
  ) || [];
if (!script || !scriptInfo?.cssBundle)
  throw new Error('The preview build did not produce JavaScript and CSS.');
const assetUrl = (filename) =>
  '/' + path.relative(output, path.resolve(project, filename)).split(path.sep).join('/');
const scriptUrl = assetUrl(script);
const cssUrl = assetUrl(scriptInfo.cssBundle);
await cp(path.join(project, 'public'), output, { recursive: true });
await cp(path.join(project, 'app/icon.svg'), path.join(output, 'icon.svg'));

function html(locale = 'en') {
  const portuguese = locale === 'pt-BR';
  const title = portuguese
    ? 'HORION Watch Club — Prévia pública'
    : 'HORION Watch Club — Public preview';
  const description = portuguese
    ? 'Explore a demonstração pública do Horion. Comunidade fictícia e registros locais neste navegador.'
    : 'Explore the Horion public demonstration. Fictional community and local records in this browser.';
  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${cssUrl}">
  <script type="module" src="${scriptUrl}"></script>
</head>
<body><div id="root"></div><noscript>${portuguese ? 'Esta demonstração interativa requer JavaScript. Os registros são fictícios e permanecem neste navegador.' : 'This interactive demonstration requires JavaScript. Records are fictional and remain in this browser.'}</noscript></body>
</html>
`;
}

await writeFile(path.join(output, 'index.html'), html());
await writeFile(path.join(output, '404.html'), html());
for (const destination of previewRoutePaths()) {
  const directory = path.join(output, destination.slice(1));
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'index.html'),
    html(destination.startsWith('/pt-BR') ? 'pt-BR' : 'en')
  );
}
await writeFile(
  path.join(output, 'preview-build.json'),
  JSON.stringify(
    {
      mode: 'public-demonstration',
      backendConfigured: false,
      signupEnabled: false,
      apiIncluded: false,
      localeRoutes: previewRoutePaths(),
      assets: { script: scriptUrl, stylesheet: cssUrl },
    },
    null,
    2
  ) + '\n'
);
console.log(
  JSON.stringify({
    output: 'dist',
    localeRoutes: previewRoutePaths().length,
    backend: false,
    assets: { script: scriptUrl, stylesheet: cssUrl },
  })
);
