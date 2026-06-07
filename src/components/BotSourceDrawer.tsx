"use client";

import { useState } from "react";

type Source = {
  botName: string; botStrategy: string; strategyVersion: string; sourceStatus: string;
  effectivePrediction: {home:number;away:number};
  publicExplanation: {title:string;summary:string;inputs:Record<string,unknown>;steps:Array<{order:number;label:string;formula?:string;value?:string|number;explanation:string}>;sources:Array<{name:string;referenceDate?:string;datasetVersion?:string;sourceUrl?:string}>};
  verification:{inputHash:string;calculationHash:string};
  override?: {originalPrediction:{home:number;away:number};finalPrediction:{home:number;away:number};administratorDisplayName:string;reason:string;overriddenAt:string};
};

export default function BotSourceDrawer({guessId}:{guessId:string}) {
  const [open,setOpen]=useState(false); const [loading,setLoading]=useState(false); const [source,setSource]=useState<Source|null>(null); const [error,setError]=useState("");
  async function show() {
    setOpen(true); if(source) return; setLoading(true); setError("");
    try { const r=await fetch(`/api/bot-sources/${encodeURIComponent(guessId)}`,{cache:"no-store"}); const d=await r.json(); if(!r.ok) throw new Error(d.error); setSource(d); }
    catch(e){setError(e instanceof Error?e.message:"Falha ao carregar");} finally{setLoading(false);}
  }
  return <>
    <button className="button button-secondary" onClick={show}>ⓘ Como chegou neste palpite?</button>
    {open?<div className="drawer-backdrop" role="dialog" aria-modal="true" onClick={()=>setOpen(false)}><section className="drawer" onClick={e=>e.stopPropagation()}>
      <div className="section-head" style={{marginTop:0}}><div><div className="eyebrow">Memória de cálculo</div><h2>{source?.publicExplanation.title ?? "Fonte do palpite"}</h2></div><button className="button button-secondary" onClick={()=>setOpen(false)}>Fechar</button></div>
      {loading?<p>Carregando…</p>:null}{error?<p className="error">{error}</p>:null}
      {source?<>
        <p>{source.publicExplanation.summary}</p>
        <div className="badge badge-gold">{source.botName} · algoritmo {source.strategyVersion}</div>
        {source.override?<div className="error" style={{marginTop:16}}><strong>Palpite ajustado manualmente</strong><p>Automático: {source.override.originalPrediction.home} × {source.override.originalPrediction.away}<br/>Utilizado: {source.override.finalPrediction.home} × {source.override.finalPrediction.away}<br/>Administrador: {source.override.administratorDisplayName}<br/>Motivo: {source.override.reason}</p></div>:null}
        <h3 style={{marginTop:24}}>Etapas do cálculo</h3>
        {source.publicExplanation.steps.map(step=><div className="step" key={step.order}><strong>{step.order}. {step.label}</strong>{step.formula?<div className="code">{step.formula}</div>:null}<div>{String(step.value ?? "")}</div><p className="muted">{step.explanation}</p></div>)}
        <h3>Dados utilizados</h3><pre className="code">{JSON.stringify(source.publicExplanation.inputs,null,2)}</pre>
        <h3>Fontes</h3>{source.publicExplanation.sources.map((s,i)=><p key={i}><strong>{s.name}</strong>{s.referenceDate?` · ${s.referenceDate}`:""}{s.datasetVersion?` · ${s.datasetVersion}`:""}{s.sourceUrl?<><br/><a style={{color:"var(--green-dark)"}} href={s.sourceUrl} target="_blank" rel="noreferrer">Abrir fonte pública</a></>:null}</p>)}
        <h3>Verificação</h3><div className="code">Input: {source.verification.inputHash}<br/>Cálculo: {source.verification.calculationHash}</div>
      </>:null}
    </section></div>:null}
  </>;
}
