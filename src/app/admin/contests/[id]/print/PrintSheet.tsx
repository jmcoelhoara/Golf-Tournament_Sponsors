"use client";
import { useState } from 'react';
import { eventImageUrl, type PublicImage } from '@/lib/event-media';
export default function PrintSheet({eventName,contestName,holeNumber,tees,yardage,qr,publicUrl,logo}: {eventName:string;contestName:string;holeNumber:number|null;tees?:string|null;yardage?:number|null;qr:string;publicUrl:string;logo:PublicImage|null}) {
 const [qrReady,setQrReady]=useState(false),[logoReady,setLogoReady]=useState(!logo),[qrError,setQrError]=useState(false),[logoError,setLogoError]=useState(false);
 return <main className="shell print-shell"><div className="no-print"><a href="/admin">← Event settings</a><p>Wait for all images to load before printing.</p><button className="btn" disabled={!qrReady || !logoReady || qrError} onClick={()=>window.print()}>Print contest sheet</button>
 {qrError && <p role="alert" className="result error">QR image failed to load; reload this page before printing.</p>}
 {logoError && <p role="alert">Event logo failed to load. <button className="link" onClick={()=>setLogoReady(true)}>Print without logo</button> or reload to try again.</p>}</div>
 <article className="print-sheet">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 {logo && <img className="event-logo" src={eventImageUrl(logo)??undefined} alt={logo.alt_text} onLoad={()=>setLogoReady(true)} onError={()=>setLogoError(true)}/>}
 <h1>{eventName}</h1><h2>{contestName}</h2><p className="print-hole">{holeNumber?`Hole ${holeNumber}`:'Hole not assigned'}</p>
 <p>{[tees?`${tees} tees`:null,yardage?`${yardage} yards`:null].filter(Boolean).join(' · ')}</p>
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={qr} className="print-qr" alt="Contest QR code" onLoad={()=>setQrReady(true)} onError={()=>setQrError(true)}/>
 <p>Scan to play</p><a href={publicUrl} className="break" aria-label="Open player page">{publicUrl}</a>
 </article></main>;
}
