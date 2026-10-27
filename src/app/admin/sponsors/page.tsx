import { Suspense } from 'react';
import { requireStaff } from '@/lib/staff';
import { logoUrl } from '@/lib/logo';
import AdminNav from '../AdminNav';
import type { Sponsor } from './SponsorEditor';

export default function SponsorsPage() {
  return <Suspense fallback={<main className="shell"><p>Loading…</p></main>}><SponsorsContent/></Suspense>;
}

async function SponsorsContent() {
  const {client,user}=await requireStaff(true);
  const {data:orgs,error}=await client.from('organizations')
    .select('id,name,sponsors(id,organization_id,name,logo_path,website_url)')
    .order('name').returns<{id:string;name:string;sponsors:Sponsor[]}[]>();
  if(error)throw new Error(`Unable to load legacy sponsors: ${error.message}`);
  return <main className="shell wide">
    <AdminNav email={user.email??''} current="sponsors" isPlatformAdmin/>
    <h1>Legacy sponsors (read only)</h1>
    <p>Existing golfer pages retain these logos. Use event-local sponsor banners in Event settings for new uploads and reuse. Legacy files are not replaced or deleted here.</p>
    {orgs?.map(org=><section key={org.id} className="card"><h2>{org.name}</h2>
      {org.sponsors.map(sponsor=><div key={sponsor.id} className="sponsor-card"><h3>{sponsor.name}</h3>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {sponsor.logo_path && <img className="media-preview" src={logoUrl(sponsor.logo_path)??undefined} alt={`${sponsor.name} logo`}/>}
      </div>)}
    </section>)}
  </main>;
}
