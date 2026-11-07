import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="not-found">
      <span className="eyebrow">HORION · 404</span>
      <h1>A moment out of time.</h1>
      <p>This page could not be found. / Esta página não foi encontrada.</p>
      <Link className="button" href="/en">
        Return to the club / Voltar ao clube
      </Link>
    </main>
  );
}
