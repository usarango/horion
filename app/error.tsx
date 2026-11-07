'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="not-found">
      <span className="eyebrow">HORION</span>
      <h1>Let’s try that again.</h1>
      <p>We couldn’t load this view. / Não foi possível carregar esta página.</p>
      <button className="button" onClick={reset}>
        Try again / Tentar novamente
      </button>
    </main>
  );
}
