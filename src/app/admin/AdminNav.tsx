import Link from "next/link";
import { signOut } from "./actions";

export default function AdminNav({ email, current }: { email: string; current: "events" | "sponsors" }) {
  return (
    <div className="topbar">
      <nav className="admin-nav">
        <Link href="/admin" className={current === "events" ? "active" : ""}>Events</Link>
        <Link href="/admin/sponsors" className={current === "sponsors" ? "active" : ""}>Sponsors</Link>
      </nav>
      <div className="topbar-right">
        <span className="small muted">{email}</span>
        <form action={signOut}><button className="link">Sign out</button></form>
      </div>
    </div>
  );
}
