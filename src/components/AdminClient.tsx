"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Operação não concluída");
  return data;
}

export default function AdminClient() {
  const [email, setEmail] = useState("");
  const [promoteMessage, setPromoteMessage] = useState("");
  const [syncMessage, setSyncMessage] = useState("");

  async function promote(event: FormEvent) {
    event.preventDefault(); setPromoteMessage("Processando…");
    try { const data = await postJson("/api/admin/promote", { email }); setPromoteMessage(data.message); }
    catch (error) { setPromoteMessage(error instanceof Error ? error.message : "Erro"); }
  }
  async function syncWorldCup() {
    setSyncMessage("Consultando a fonte e sincronizando…");
    try { const data = await postJson("/api/admin/sync-world-cup", {}); setSyncMessage(data.message); }
    catch (error) { setSyncMessage(error instanceof Error ? error.message : "Erro"); }
  }

  return <>
    <section className="admin-launch-grid admin-launch-grid-three">
      <Link className="admin-launch-card admin-launch-primary" href="/admin/resultados"><span className="admin-launch-icon">⚽</span><div><small>Operação de jogo</small><h3>Jogos e resultados</h3><p>Atualize o placar ao vivo, confirme a pontuação oficial ou anule uma partida.</p><b>Abrir central de resultados →</b></div></Link>
      <Link className="admin-launch-card" href="/admin/bots"><span className="admin-launch-icon">🤖</span><div><small>Controle dos bots</small><h3>Palpites dos bots</h3><p>Defina o Time Carisma dos quatro bots, acompanhe Maria e Pangaré e crie ou corrija palpites manualmente quando necessário.</p><b>Abrir palpites dos bots →</b></div></Link>
      <Link className="admin-launch-card" href="/admin/palpites"><span className="admin-launch-icon">✍</span><div><small>Intervenção auditada</small><h3>Palpites de participantes</h3><p>Crie ou corrija palpites humanos retroativos e reapure partidas já confirmadas.</p><b>Abrir palpites administrativos →</b></div></Link>
      <Link className="admin-launch-card admin-launch-draw" href="/admin/sorteios"><span className="admin-launch-icon">🎱</span><div><small>Transmissão em tempo real</small><h3>Sorteios oficiais</h3><p>Conduza o sorteio dos grupos e dos três Times Carisma bolinha por bolinha.</p><b>Abrir central de sorteios →</b></div></Link>
      <Link className="admin-launch-card" href="/admin/participantes"><span className="admin-launch-icon">📸</span><div><small>Elenco do Mundial</small><h3>Participantes e fotos</h3><p>Edite nomes, complete avatares e confira grupos e Times Carisma.</p><b>Abrir participantes →</b></div></Link>
      <Link className="admin-launch-card" href="/admin/boletim-da-rodada"><span className="admin-launch-icon">🗞</span><div><small>Comunicação oficial</small><h3>Boletim da rodada</h3><p>Receba sugestões automáticas, ajuste os destaques da rodada e envie o boletim para todos.</p><b>Abrir boletim da rodada →</b></div></Link>
    </section>

    <div className="admin-grid admin-secondary-grid">
      <section className="card"><div className="eyebrow">Permissões</div><h3>Adicionar segundo administrador</h3><p className="muted">O novo administrador terá exatamente os mesmos poderes. Limite padrão: dois ativos.</p><form onSubmit={promote}><div className="field"><label>E-mail do participante</label><input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><button className="button button-primary">Conceder acesso</button></form>{promoteMessage ? <p className="success">{promoteMessage}</p> : null}</section>
      <section className="card"><div className="eyebrow">Copa do Mundo</div><h3>Sincronizar as 104 partidas</h3><p className="muted">Use apenas quando houver alteração de calendário ou campos estruturais das partidas.</p><button type="button" className="button button-primary" onClick={syncWorldCup}>Sincronizar agora</button><pre className="code">npm run sync:worldcup</pre>{syncMessage ? <p className="success">{syncMessage}</p> : null}</section>
    </div>
  </>;
}
