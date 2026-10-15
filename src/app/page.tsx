import Link from "next/link";

export default function Home() {
  return (
    <main className="shell">
      <section className="card">
        <div className="eyebrow">Tournament contests</div>
        <h1>Golf contest scoring</h1>
        <p className="muted">
          Golfers: scan the QR code at the contest hole to enter. Staff can sign in below.
        </p>
        <Link href="/login" className="btn">Staff sign in</Link>
      </section>
    </main>
  );
}
