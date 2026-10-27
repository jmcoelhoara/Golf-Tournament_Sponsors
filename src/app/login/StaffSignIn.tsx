import Image from "next/image";
import type { CourseBrand } from "@/lib/course-brand";
import LoginForm from "./LoginForm";

export default function StaffSignIn({ brand }: { brand?: CourseBrand }) {
  if (!brand) {
    return (
      <main className="shell signin-plain">
        <section className="card">
          <div className="eyebrow">Tournament contests</div>
          <h1>Staff sign in</h1>
          <LoginForm />
        </section>
      </main>
    );
  }

  return (
    <main className="signin" style={{ "--brand": brand.accent } as React.CSSProperties}>
      <section className="signin-panel">
        <div className="signin-inner">
          <header className="signin-brand">
            <Image className="signin-logo" src={brand.logo.src} width={brand.logo.width}
              height={brand.logo.height} alt={brand.logo.alt} loading="eager" />
            <div>
              <div className="eyebrow">Tournament contests</div>
              <p className="signin-club">{brand.clubName}</p>
            </div>
          </header>

          <h1>Staff sign in</h1>
          <p className="muted">
            Run the contests at {brand.shortName}: events, sponsors, QR codes and live leaderboards.
          </p>
          <LoginForm />
          <p className="small muted signin-foot">
            Golfers don&apos;t need an account. They scan the QR code at the contest hole.
          </p>
        </div>
      </section>

      <aside className="signin-course" aria-label={`${brand.courseName} course map`}>
        <figure className="course-map">
          <Image src={brand.map.src} width={brand.map.width} height={brand.map.height}
            alt={brand.map.alt} sizes="(min-width: 900px) 50vw, 100vw" loading="eager" />
        </figure>
        <div className="course-caption">
          <div>
            <div className="eyebrow">{brand.courseName}</div>
            <p className="course-place">{brand.shortName} · {brand.location}</p>
          </div>
          <dl className="course-facts">
            {brand.facts.map((f) => (
              <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>
            ))}
          </dl>
        </div>
      </aside>
    </main>
  );
}
