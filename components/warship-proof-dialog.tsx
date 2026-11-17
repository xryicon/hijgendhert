'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ExternalLink, RefreshCw, ShieldCheck, X } from 'lucide-react';
import MetricImage from './metric-image';
import { metricLabel } from '@/lib/osrs-metrics';
import { seaCoordinate, type Team } from '@/lib/warships';

export type ProofSelection = { claimId: string } | { team: Team; cell: number };
type Evidence = { claimId:string;rsn:string;team:string;boss:string;item:string;status:string;reviewer:string|null;reviewedAt:string|null;droppedAt:string;reason:string;sourceUrl:string;imageAvailable:boolean;shot:{cell:number;team:Team;result:string;at:string}|null };
const date = (s:string) => new Date(s).toLocaleString('nl-NL',{dateStyle:'medium',timeStyle:'short'});
export default function WarshipProofDialog({gameId,selection,onClose}:{gameId:string;selection:ProofSelection;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [proof,setProof]=useState<Evidence|null>(null),[error,setError]=useState(''),[imageError,setImageError]=useState(false),[refresh,setRefresh]=useState(0);
  const query=JSON.stringify(selection);
  useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close();},[]);
  useEffect(()=>{const controller=new AbortController();setProof(null);setError('');setImageError(false);
    const params=new URLSearchParams({gameId,...Object.fromEntries(Object.entries(JSON.parse(query)).map(([k,v])=>[k,String(v)]))});
    void fetch('/api/warships/evidence?'+params,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])}).then(async r=>{const data=await r.json() as {proof:Evidence;error?:string};if(!r.ok)throw Error(data.error||'Bewijs kon niet worden geladen.');if(!controller.signal.aborted)setProof(data.proof);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Probeer opnieuw.');});
    return()=>controller.abort();
  },[gameId,query,refresh]);
  return createPortal(<dialog ref={dialog} className="sea-proof-dialog" aria-labelledby="sea-proof-title" onCancel={onClose} onClick={e=>{if(e.target===dialog.current)onClose();}}><div className="sea-proof-content"><header><div><small>HIJGEND HERT · CONTROLEER HET BEWIJS</small><h2 id="sea-proof-title">{proof?.shot ? `Schot op ${seaCoordinate(proof.shot.cell)}` : 'Het dropbewijs'}</h2></div><button type="button" onClick={onClose} aria-label="Bewijs sluiten"><X size={22}/></button></header>
    {error ? <div className="sea-proof-empty" role="alert"><Camera size={30}/><p>{error}</p><button onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={15}/> Opnieuw proberen</button></div> : !proof ? <p className="sea-proof-empty" role="status">Het bewijs wordt opgehaald…</p> : <>
      <div className="sea-proof-subject"><MetricImage metric={proof.boss} size={48}/><div><small>{metricLabel(proof.boss)}</small><h3>{proof.item}</h3><p>{proof.rsn} · {proof.team}</p></div><span className={`sea-proof-status ${proof.status}`}><ShieldCheck size={16}/>{proof.status==='approved'?'Goedgekeurd':proof.status==='rejected'?'Afgewezen':'Wacht op een admin'}</span></div>
      <div className="sea-proof-image">{proof.imageAvailable && !imageError ? <img key={refresh} src={`/api/warships/proof?gameId=${encodeURIComponent(gameId)}&claimId=${encodeURIComponent(proof.claimId)}`} alt={`Ingediend dropbewijs voor ${proof.item} van ${proof.rsn}`} onError={()=>setImageError(true)}/> : <div><Camera size={32}/><p>{imageError?'Discord kan het screenshot niet laden. Het bronbericht kan verwijderd zijn of tijdelijk niet bereikbaar.':'Dit bewijs is als link ingediend. Open het bronbericht om het te controleren.'}</p>{imageError&&<button onClick={()=>setRefresh(n=>n+1)}>Opnieuw laden</button>}</div>}</div>
      <dl className="sea-proof-meta"><div><dt>Drop / screenshotbericht</dt><dd>{date(proof.droppedAt)}</dd></div>{proof.reviewedAt&&<div><dt>Beoordeeld door {proof.reviewer}</dt><dd>{date(proof.reviewedAt)}</dd></div>}{proof.shot&&<div><dt>Afgevuurd · {proof.shot.result==='miss'?'mis':proof.shot.result==='sunk'?'gezonken':'raak'}</dt><dd>{date(proof.shot.at)}</dd></div>}</dl>
      {proof.reason&&<p className="sea-proof-reason">{proof.reason}</p>}<footer><span>Dit bewijs hoort bij de munitie waarmee het schot is afgevuurd.</span><a href={proof.sourceUrl} target="_blank" rel="noopener noreferrer">Oorspronkelijk bericht <ExternalLink size={15}/></a></footer>
    </>}
  </div></dialog>,document.body);
}
