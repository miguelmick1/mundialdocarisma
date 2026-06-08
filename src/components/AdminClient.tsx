"use client";

import { FormEvent, useState } from "react";
import BotGuessesManager from "@/components/BotGuessesManager";

async function postJson(url:string, body:unknown) {
  const response = await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data = await response.json();
  if(!response.ok) throw new Error(data.error ?? "Operação não concluída");
  return data;
}

export default function AdminClient() {
  const [email,setEmail]=useState("");
  const [promoteMessage,setPromoteMessage]=useState("");
  const [contestId,setContestId]=useState("desempate-demo");
  const [candidateA,setCandidateA]=useState("Miguel");
  const [candidateB,setCandidateB]=useState("João");
  const [drawResult,setDrawResult]=useState("");
  const [syncMessage,setSyncMessage]=useState("");

  async function promote(e:FormEvent){e.preventDefault();setPromoteMessage("Processando…");try{const d=await postJson("/api/admin/promote",{email});setPromoteMessage(d.message);}catch(err){setPromoteMessage(err instanceof Error?err.message:"Erro");}}
  async function draw(e:FormEvent){e.preventDefault();setDrawResult("Sorteando…");try{const d=await postJson("/api/admin/draw",{contestId,reason:"Empate oficial",candidates:[{participantId:`manual-${candidateA}`,displayName:candidateA},{participantId:`manual-${candidateB}`,displayName:candidateB}]});setDrawResult(`🏆 ${d.winner.displayName} · código ${d.verificationCode}`);}catch(err){setDrawResult(err instanceof Error?err.message:"Erro");}}
  async function syncWorldCup(){setSyncMessage("Consultando a fonte e sincronizando…");try{const d=await postJson("/api/admin/sync-world-cup",{});setSyncMessage(d.message);}catch(err){setSyncMessage(err instanceof Error?err.message:"Erro");}}

  return <div className="admin-grid">
    <BotGuessesManager />
    <section className="card"><div className="eyebrow">Permissões</div><h3>Adicionar segundo administrador</h3><p className="muted">O novo administrador terá exatamente os mesmos poderes. Limite padrão: dois ativos.</p><form onSubmit={promote}><div className="field"><label>E-mail do participante</label><input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div><button className="button button-primary">Conceder acesso</button></form>{promoteMessage?<p className="success">{promoteMessage}</p>:null}</section>
    <section className="card"><div className="eyebrow">Ao vivo</div><h3>Sorteio oficial de desempate</h3><form onSubmit={draw}><div className="field"><label>ID único do confronto</label><input className="input" value={contestId} onChange={e=>setContestId(e.target.value)} required/></div><div className="field"><label>Participante A</label><input className="input" value={candidateA} onChange={e=>setCandidateA(e.target.value)} required/></div><div className="field"><label>Participante B</label><input className="input" value={candidateB} onChange={e=>setCandidateB(e.target.value)} required/></div><button className="button button-primary">Iniciar sorteio</button></form>{drawResult?<p className="success">{drawResult}</p>:null}</section>
    <section className="card"><div className="eyebrow">Copa do Mundo</div><h3>Sincronizar as 104 partidas</h3><p className="muted">Consulta a fonte pública, atualiza o calendário completo e cria as 48 seleções no Firestore sem apagar resultados já cadastrados.</p><button type="button" className="button button-primary" onClick={syncWorldCup}>Sincronizar agora</button><pre className="code">npm run sync:worldcup</pre>{syncMessage?<p className="success">{syncMessage}</p>:null}</section>
  </div>;
}
