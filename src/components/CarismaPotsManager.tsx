"use client";

import { useEffect, useMemo, useState } from "react";
import CountryFlag from "@/components/CountryFlag";

type Team={id:string;name:string;iso2:string|null;group:string|null;pot:1|2|3|null};

export default function CarismaPotsManager(){
  const [teams,setTeams]=useState<Team[]>([]); const [message,setMessage]=useState(""); const [filter,setFilter]=useState<"ALL"|"1"|"2"|"3"|"PENDING">("ALL");
  async function load(){const r=await fetch("/api/admin/carisma-pots",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error);setTeams(d.teams??[]);}
  useEffect(()=>{load().catch(e=>setMessage(e.message));},[]);
  const counts=useMemo(()=>({1:teams.filter(t=>t.pot===1).length,2:teams.filter(t=>t.pot===2).length,3:teams.filter(t=>t.pot===3).length,pending:teams.filter(t=>t.pot==null).length}),[teams]);
  const visible=teams.filter(t=>filter==="ALL"?true:filter==="PENDING"?t.pot==null:t.pot===Number(filter));
  async function update(teamId:string,pot:1|2|3){setTeams(prev=>prev.map(t=>t.id===teamId?{...t,pot}:t));const r=await fetch("/api/admin/carisma-pots",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({teamId,pot})});const d=await r.json();if(!r.ok){setMessage(d.error??"Erro");await load();}else setMessage("Pote atualizado.");}
  return <section className="card pot-manager"><div className="section-head"><div><div className="eyebrow">Preparação do sorteio</div><h2>Três potes de Times Carisma</h2><p className="muted">O sorteio oficial só deve ser realizado quando cada pote tiver exatamente 16 seleções. A composição de força será definida pelos participantes.</p></div></div><div className="pot-summary"><button className={filter==="ALL"?"active":""} onClick={()=>setFilter("ALL")}>Todas <b>{teams.length}</b></button>{([1,2,3] as const).map(pot=><button key={pot} className={filter===String(pot)?"active":""} onClick={()=>setFilter(String(pot) as "1"|"2"|"3")}>Pote {pot} <b>{counts[pot]}</b></button>)}<button className={filter==="PENDING"?"active warning":"warning"} onClick={()=>setFilter("PENDING")}>Sem pote <b>{counts.pending}</b></button></div><div className="pot-team-list">{visible.map(team=><article key={team.id}><CountryFlag iso2={team.iso2} name={team.name}/><span><strong>{team.name}</strong><small>{team.group?`Grupo ${team.group}`:""}</small></span><select className="input" value={team.pot??""} onChange={e=>update(team.id,Number(e.target.value) as 1|2|3)}><option value="" disabled>Definir</option><option value="1">Pote 1</option><option value="2">Pote 2</option><option value="3">Pote 3</option></select></article>)}</div>{message?<p className="success-inline">{message}</p>:null}</section>;
}
