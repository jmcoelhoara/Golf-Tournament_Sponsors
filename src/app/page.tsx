import Link from "next/link";

export default function Home() {
  return (
    <main className="home">
      <section className="card home-card">
        <svg className="home-flag" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M16 42V6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <path d="M17.5 7.5 36 14l-18.5 6.5z" fill="#b8893f" />
          <ellipse cx="18" cy="42" rx="12" ry="3" fill="currentColor" opacity=".15" />
        </svg>
        <div className="eyebrow">Tournament contests</div>
        <h1>Golf contest scoring</h1>
        <p className="muted">
          Golfers: scan the QR code at the contest hole to enter. Staff can sign in below.
        </p>
        <ol className="home-steps">
          <li><b>1</b>Scan the QR code on the sign at the hole</li>
          <li><b>2</b>Find your name and enter your result</li>
          <li><b>3</b>Watch the leader update live</li>
        </ol>
        <Link href="/login" className="btn">Staff sign in</Link>
      </section>
    </main>
  );
}
