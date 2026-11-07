import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { previewRoutePaths } from '../preview/routes.ts';

const project = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(project, 'dist');

// Only the two public Supabase values enter the browser artifact. Inherited
// build variables take precedence over a checkout-local, ignored env file.
const environmentFile = path.join(project, '.env.local');
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);
const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let supabaseUrl;
try {
  supabaseUrl = new URL(publicUrl || '');
  if (
    supabaseUrl.protocol !== 'https:' ||
    supabaseUrl.username ||
    supabaseUrl.password ||
    supabaseUrl.search ||
    supabaseUrl.hash ||
    supabaseUrl.pathname !== '/'
  )
    throw new Error('Invalid public Supabase URL.');
} catch {
  throw new Error('The live build requires a valid HTTPS NEXT_PUBLIC_SUPABASE_URL.');
}
function isPublishableKey(value) {
  if (typeof value !== 'string') return false;
  if (/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(value)) return true;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    return (
      JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8')).role === 'anon'
    );
  } catch {
    return false;
  }
}
if (!isPublishableKey(publicKey))
  throw new Error(
    'The live build requires a publishable or legacy anon Supabase key. Secret and service-role keys are forbidden.'
  );
const signupEnabled = process.env.HORION_ALLOW_SHARED_SIGNUP === 'true';
const supabaseOrigin = supabaseUrl.origin;
const websocketOrigin = supabaseOrigin.replace(/^https:/, 'wss:');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// This is the live browser UI and its public-key Supabase client. Server routes,
// environment files and the retired demonstration dataset are never bundled.
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
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(supabaseOrigin),
    'process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(publicKey),
    __HORION_SIGNUP_ENABLED__: JSON.stringify(signupEnabled),
  },
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
      /(?:^|\/)app\/(?:api|auth)\/|(?:^|\/)lib\/demo-data\.[^/]+$|(?:^|\/)server-only\//.test(
        filename
      ) ||
      /(?:^|\/)\.env/.test(filename) ||
      (/(?:^|\/)lib\/supabase\//.test(filename) &&
        !/(?:^|\/)lib\/supabase\/(?:client|config|upload-validation)\.ts$/.test(filename))
  )
)
  throw new Error(
    'The live browser build contains a forbidden server, environment or demonstration dependency.'
  );

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
await cp(path.join(project, 'public/fonts'), path.join(output, 'fonts'), { recursive: true });
await cp(path.join(project, 'app/icon.svg'), path.join(output, 'icon.svg'));

function html(locale = 'en') {
  const portuguese = locale === 'pt-BR';
  const title = portuguese
    ? 'HORION Watch Club — Uma paixão em comum'
    : 'HORION Watch Club — A shared passion';
  const description = portuguese
    ? 'Uma comunidade para descobrir, conversar e registrar a história dos seus relógios.'
    : 'A community to discover, discuss and preserve the stories behind your watches.';
  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${supabaseOrigin}; font-src 'self'; connect-src 'self' ${supabaseOrigin} ${websocketOrigin}; object-src 'none'; base-uri 'none'; form-action 'none'">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${cssUrl}">
  <script type="module" src="${scriptUrl}"></script>
</head>
<body><div id="root"></div><noscript>${portuguese ? 'Ative o JavaScript para acessar a comunidade Horion.' : 'Enable JavaScript to access the Horion community.'}</noscript></body>
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
      mode: 'live-supabase',
      backendConfigured: true,
      signupEnabled,
      databaseSchema: 'horion',
      supabaseOrigin,
      productStorage: 'supabase',
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
    backend: true,
    signupEnabled,
    assets: { script: scriptUrl, stylesheet: cssUrl },
  })
);
