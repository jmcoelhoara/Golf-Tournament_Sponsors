"use client";
import { useEffect, useRef, useState } from 'react';
import { eventImageUrl, type PublicImage } from '@/lib/event-media';
export default function SponsorBanner({image,onDismiss}: {image: PublicImage;onDismiss?:()=>void}) {
 const [dismissed, setDismissed] = useState(false);
 const dismiss = () => { setDismissed(true); onDismiss?.(); };
 const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
 const close = useRef<HTMLButtonElement>(null);
 useEffect(() => {
  const previous = document.activeElement as HTMLElement | null;
  if (!dismissed) close.current?.focus();
  return () => {if(timer.current) clearTimeout(timer.current); previous?.focus();};
 }, [dismissed]);
 if(dismissed) return null;
 return <div className="banner-backdrop"><div role="dialog" aria-modal="true" aria-label="Event sponsors" className="banner-dialog" onKeyDown={e=>{if(e.key==='Escape'){dismiss()} if(e.key==='Tab'){e.preventDefault();close.current?.focus()}}}>
  <button ref={close} className="btn secondary" onClick={()=>dismiss()} aria-label="Close sponsor banner">Continue to contest ×</button>
  {/* eslint-disable-next-line @next/next/no-img-element */}
  <img src={eventImageUrl(image) ?? undefined} alt={image.alt_text} onLoad={()=>{if(!timer.current) timer.current=setTimeout(()=>dismiss(),5000)}} onError={()=>dismiss()}/>
 </div></div>;
}
