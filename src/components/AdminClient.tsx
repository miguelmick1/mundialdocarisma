"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Operação não concluída");
  return data;
}

export default function AdminClient() {
  const [email, setEmail] = useState("");
  const [promoteMessage, setPromoteMessage] = useState("");
  const [contestId, setContestId] = useState("desempate-demo");
  const [candidateA, setCandidateA] = useState("Miguel");
  const [candidateB, setCandidateB] = useState("João");
  const [drawResult, setDrawResult] = useState("");
  const [syncMessage, setSyncMessage] = useState("");

  async function promote(event: FormEvent) {
    event.preventDefault();
    setPromoteMessage("Processando…");
    try {
      const data = await postJson("/api/admin/promote", { email });
      setPromoteMessage(data.message);
    } catch (error) {
      setPromoteMessage(error instanceof Error ? error.message : "Erro");
    }
  }

  async function draw(event: FormEvent) {
    event.preventDefault();
    setDrawResult("Sorteando…");
    try {
      const data = await postJson("/api/admin/draw", {
        contestId,
        reason: "Empate oficial",
        candidates: [
          { participantId: `manual-${candidateA}`, displayName: candidateA },
          { participantId: `manual-${candidateB}`, displayName: candidateB }
        ]
      });
      setDrawResult(`🏆 ${data.winner.displayName} · código ${data.verificationCode}`);
    } catch (error) {
      setDrawResult(error instanceof Error ? error.message : "Erro");
    }
  }

  async function syncWorldCup() {
    setSyncMessage("Consultando a fonte e sincronizando…");
    try {
      const data = await postJson("/api/admin/sync-world-cup", {});
      setSyncMessage(data.message);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Erro");
    }
  }

  return <>
    <section className="admin-launch-grid">
      <Link className="admin-launch-card admin-launch-primary" href="/admin/resultados">
        <span className="admin-launch-icon">⚽</span>
        <div><small>Operação de jogo</small><h3>Jogos e resultados</h3><p>Atualize o placar ao vivo, salve o resultado provisório, confirme a pontuação oficial ou anule uma partida.</p><b>Abrir central de resultados →</b></div>
      </Link>
      <Link className="admin-launch-card" href="/admin/bots">
        <span className="admin-launch-icon">🤖</span>
        <div><small>Controle dos participantes automáticos</small><h3>Palpites dos bots</h3><p>Escolha um bot, filtre os 104 jogos e faça intervenções manuais com auditoria.</p><b>Abrir palpites dos bots →</b></div>
      </Link>
    </section>

    <div className="admin-grid admin-secondary-grid">
      <section className="card">
        <div className="eyebrow">Permissões</div><h3>Adicionar segundo administrador</h3>
        <p className="muted">O novo administrador terá exatamente os mesmos poderes. Limite padrão: dois ativos.</p>
        <form onSubmit={promote}><div className="field"><label>E-mail do participante</label><input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><button className="button button-primary">Conceder acesso</button></form>
        {promoteMessage ? <p className="success">{promoteMessage}</p> : null}
      </section>

      <section className="card">
        <div className="eyebrow">Desempate</div><h3>Sorteio oficial</h3>
        <form onSubmit={draw}>
          <div className="field"><label>ID único do confronto</label><input className="input" value={contestId} onChange={(event) => setContestId(event.target.value)} required /></div>
          <div className="admin-inline-fields"><div className="field"><label>Participante A</label><input className="input" value={candidateA} onChange={(event) => setCandidateA(event.target.value)} required /></div><div className="field"><label>Participante B</label><input className="input" value={candidateB} onChange={(event) => setCandidateB(event.target.value)} required /></div></div>
          <button className="button button-primary">Iniciar sorteio</button>
        </form>
        {drawResult ? <p className="success">{drawResult}</p> : null}
      </section>

      <section className="card">
        <div className="eyebrow">Copa do Mundo</div><h3>Sincronizar as 104 partidas</h3>
        <p className="muted">Atualiza calendário, seleções, rodadas do Time Carisma e metadados, sem apagar resultados já cadastrados.</p>
        <button type="button" className="button button-primary" onClick={syncWorldCup}>Sincronizar agora</button>
        <pre className="code">npm run sync:worldcup</pre>
        {syncMessage ? <p className="success">{syncMessage}</p> : null}
      </section>
    </div>
  </>;
}
