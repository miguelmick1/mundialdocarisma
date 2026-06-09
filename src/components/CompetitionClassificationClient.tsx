"use client";

import { useEffect, useMemo, useState } from "react";

const tabs = [
  { id: "GROUPS", label: "Fase de grupos" },
  { id: "KNOCKOUT", label: "Mata-mata" },
] as const;

type Overview = {
  competitionName: string;
  currentUserId: string;
  groupDrawCompleted: boolean;
  completedRounds: number[];
  groups: Array<{
    id: string;
    name: string;
    rows: Array<any>;
    fixtures: Array<any>;
  }>;
  knockout: { byes: Array<any>; playIn: Array<any>; note: string };
};

function Avatar({ row }: { row: any }) {
  if (row.avatarUrl) return <img className="participant-avatar" src={row.avatarUrl} alt="" />;
  return <span className={`participant-avatar participant-avatar-fallback ${row.type === "BOT" ? "bot" : ""}`}>{row.type === "BOT" ? "🤖" : String(row.displayName ?? "?").slice(0, 1).toUpperCase()}</span>;
}

export default function CompetitionClassificationClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("GROUPS");
  const [selectedGroup, setSelectedGroup] = useState("A");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/competition/overview", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Falha ao carregar");
        setOverview(data);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Falha ao carregar"));
  }, []);

  const group = useMemo(() => overview?.groups.find((item) => item.id === selectedGroup) ?? overview?.groups[0], [overview, selectedGroup]);

  if (error) return <div className="error">{error}</div>;
  if (!overview) return <div className="card">Carregando classificação…</div>;

  return <>
    <div className="competition-view-tabs" role="tablist">
      {tabs.map((item) => <button key={item.id} type="button" className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </div>

    {!overview.groupDrawCompleted ? <section className="card empty-competition-state"><span>🎱</span><div><h3>Os grupos ainda serão sorteados</h3><p>Assim que o administrador concluir o sorteio oficial, esta página mostrará tabelas, confrontos e a corrida pelos dois byes.</p><a className="button button-yellow" href="/sorteios">Acompanhar sorteios</a></div></section> : null}

    {overview.groupDrawCompleted && tab === "GROUPS" ? <>
      <div className="group-switcher">{overview.groups.map((item) => <button key={item.id} type="button" className={selectedGroup === item.id ? "active" : ""} onClick={() => setSelectedGroup(item.id)}>Grupo {item.id}</button>)}</div>
      {group ? <section className="participant-group-card">
        <header><div><div className="eyebrow">Mundial do Carisma</div><h3>{group.name}</h3></div><span>{overview.completedRounds.length}/3 rodadas concluídas</span></header>
        <div className="participant-standings-wrap"><table className="participant-standings"><thead><tr><th>#</th><th>Participante</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>PF</th><th>PA</th><th>SP</th></tr></thead><tbody>
          {group.rows.map((row: any, index: number) => <tr key={row.id} className={row.id === overview.currentUserId ? "current-user" : ""}><td>{index + 1}</td><td><div className="participant-name-cell"><Avatar row={row}/><span><strong>{row.displayName}</strong><small>{row.type === "BOT" ? "Bot" : "Participante"}</small></span></div></td><td><b>{row.tablePoints}</b></td><td>{row.played}</td><td>{row.wins}</td><td>{row.draws}</td><td>{row.losses}</td><td>{row.pointsFor}</td><td>{row.pointsAgainst}</td><td className={row.pointDifference > 0 ? "positive" : row.pointDifference < 0 ? "negative" : ""}>{row.pointDifference > 0 ? `+${row.pointDifference}` : row.pointDifference}</td></tr>)}
        </tbody></table></div>
        <div className="group-fixtures"><h4>Confrontos</h4>{[1,2,3].map((round) => <div key={round} className="fixture-round"><b>Rodada {round}</b><div>{group.fixtures.filter((fixture: any) => fixture.round === round).map((fixture: any) => <article key={fixture.id} className={fixture.completed ? "completed" : ""}><span>{fixture.home?.displayName ?? "A definir"}</span><strong>{fixture.completed ? `${fixture.homeRoundPoints} × ${fixture.awayRoundPoints}` : "×"}</strong><span>{fixture.away?.displayName ?? "A definir"}</span><small>{fixture.completed ? "Encerrado" : "Aguardando resultados da rodada"}</small></article>)}</div></div>)}</div>
      </section> : null}
    </> : null}

    {overview.groupDrawCompleted && tab === "KNOCKOUT" ? <section className="knockout-overview">
      <div className="bye-panel"><div className="eyebrow">Vantagem da fase de grupos</div><h3>Os dois melhores líderes ganham bye</h3><div className="bye-grid">{overview.knockout.byes.length ? overview.knockout.byes.map((row: any, index: number) => <article key={row.id}><span>{index + 1}º bye</span><Avatar row={row}/><strong>{row.displayName}</strong><small>Grupo {row.groupId} · {row.tablePoints} pts · PF {row.pointsFor}</small></article>) : <p>Aguardando a conclusão da fase de grupos.</p>}</div></div>
      <div className="playin-panel"><div className="eyebrow">16-avos de final</div><h3>Participantes do play-in</h3><p>{overview.knockout.note}</p><div className="seed-list">{overview.knockout.playIn.map((row: any, index: number) => <div key={row.id}><b>{index + 1}</b><Avatar row={row}/><span>{row.displayName}<small>{row.groupPosition}º do Grupo {row.groupId}</small></span><strong>{row.tablePoints} pts</strong></div>)}</div></div>
    </section> : null}
  </>;
}
