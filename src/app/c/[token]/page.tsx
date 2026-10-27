import { Suspense } from "react";
import type { Metadata } from "next";
import ContestClient from "./ContestClient";

export const metadata: Metadata = {
  title: "Contest",
  robots: { index: false, follow: false },
};

export default function ContestPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<main className="shell"><div className="card muted">Loading…</div></main>}>
      <Contest params={params} />
    </Suspense>
  );
}

async function Contest({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ContestClient key={token} token={token} />;
}
