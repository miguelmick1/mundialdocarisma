"use client";

import { useEffect, useState, type CSSProperties } from "react";
import CountryFlag from "@/components/CountryFlag";
import { teamColors } from "@/lib/world-cup/team-colors";

const tabs = [
  { id: "GROUPS", label: "Fase de grupos" },
  { id: "KNOCKOUT", label: "Mata-mata" },
] as const;

type CarismaTeam = { id: string; name: string; iso2?: string | null };
type ParticipantRow = {
  id: string;
  displayName: string;
  type: "HUMAN" | "BOT" | "PLACEHOLDER";
  avatarUrl?: string | null;
  carismaTeam?: CarismaTeam | null;
  tablePoints: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  groupId?: string;
  groupPosition?: number;
};

type Fixture = {
  id: string;
  round: number;
  completed: boolean;
  homeRoundPoints: number;
  awayRoundPoints: number;
  home: ParticipantRow | null;
  away: ParticipantRow | null;
};

type Overview = {
  competitionName: string;
  currentUserId: string;
  groupDrawCompleted: boolean;
  completedRounds: number[];
  groups: Array<{
    id: string;
    name: string;
    rows: ParticipantRow[];
    fixtures: Fixture[];
  }>;
  knockout: { byes: ParticipantRow[]; playIn: ParticipantRow[]; note: string };
};

function Avatar({ row }: { row: ParticipantRow }) {
  if (row.avatarUrl) return <img className="participant-avatar" src={row.avatarUrl} alt="" />;
  return <span className={`participant-avatar participant-avatar-fallback ${row.type === "BOT" ? "bot" : ""}`}>{row.type === "BOT" ? "🤖" : String(row.displayName ?? "?").slice(0, 1).toUpperCase()}</span>;
}

function carismaStyle(row: ParticipantRow): CSSProperties | undefined {
  if (row.type !== "HUMAN" || !row.carismaTeam) return undefined;
  const colors = teamColors(row.carismaTeam.id);
  return {
    "--carisma-primary": colors.primary,
    "--carisma-secondary": colors.secondary,
    "--carisma-text": colors.text,
  } as CSSProperties;
}

function ParticipantIdentity({ row }: { row: ParticipantRow }) {
  return <div className="participant-name-cell">
    <Avatar row={row}/>
    <span>
      <strong>{row.displayName}</strong>
      {row.type === "HUMAN" && row.carismaTeam ? <small className="participant-carisma-label">
        <CountryFlag iso2={row.carismaTeam.iso2} name={row.carismaTeam.name} className="participant-carisma-flag" />
        Time Carisma: {row.carismaTeam.name}
      </small> : <small>{row.type === "BOT" ? "Bot" : "Participante"}</small>}
    </span>
  </div>;
}

function GroupCard({ group, overview }: { group: Overview["groups"][number]; overview: Overview }) {
  return <section className="participant-group-card" id={`grupo-${group.id}`}>
    <header><div><div className="eyebrow">Mundial do Carisma</div><h3>{group.name}</h3></div><span>{overview.completedRounds.length}/3 rodadas concluídas</span></header>
    <div className="participant-standings-wrap"><table className="participant-standings"><thead><tr><th>#</th><th>Participante</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>PF</th><th>PA</th><th>SP</th></tr></thead><tbody>
      {group.rows.map((row, index) => <tr
        key={row.id}
        style={carismaStyle(row)}
        className={`${row.id === overview.currentUserId ? "current-user" : ""} ${row.type === "HUMAN" && row.carismaTeam ? "carisma-colored-row" : ""}`.trim()}
      ><td>{index + 1}</td><td><ParticipantIdentity row={row}/></td><td><b>{row.tablePoints}</b></td><td>{row.played}</td><td>{row.wins}</td><td>{row.draws}</td><td>{row.losses}</td><td>{row.pointsFor}</td><td>{row.pointsAgainst}</td><td className={row.pointDifference > 0 ? "positive" : row.pointDifference < 0 ? "negative" : ""}>{row.pointDifference > 0 ? `+${row.pointDifference}` : row.pointDifference}</td></tr>)}
    </tbody></table></div>
    <div className="group-fixtures"><h4>Confrontos</h4>{[1,2,3].map((round) => <div key={round} className="fixture-round"><b>Rodada {round}</b><div>{group.fixtures.filter((fixture) => fixture.round === round).map((fixture) => <article key={fixture.id} className={fixture.completed ? "completed" : ""}><span>{fixture.home?.displayName ?? "A definir"}</span><strong>{fixture.completed ? `${fixture.homeRoundPoints} × ${fixture.awayRoundPoints}` : "×"}</strong><span>{fixture.away?.displayName ?? "A definir"}</span><small>{fixture.completed ? "Encerrado" : "Aguardando resultados da rodada"}</small></article>)}</div></div>)}</div>
  </section>;
}

export default function CompetitionClassificationClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("GROUPS");
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

  if (error) return <div className="error">{error}</div>;
  if (!overview) return <div className="card">Carregando classificação…</div>;

  return <>
    <div className="competition-view-tabs" role="tablist">
      {tabs.map((item) => <button key={item.id} type="button" className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </div>

    {!overview.groupDrawCompleted ? <section className="card empty-competition-state"><span>🎱</span><div><h3>Os grupos ainda serão sorteados</h3><p>Assim que o administrador concluir o sorteio oficial, esta página mostrará tabelas, confrontos e a corrida pelos dois byes.</p><a className="button button-yellow" href="/sorteios">Acompanhar sorteios</a></div></section> : null}

    {overview.groupDrawCompleted && tab === "GROUPS" ? <>
      <nav className="group-anchor-nav" aria-label="Atalhos para os grupos">
        {overview.groups.map((group) => <a key={group.id} href={`#grupo-${group.id}`}>Grupo {group.id}</a>)}
      </nav>
      <div className="participant-groups-list">
        {overview.groups.map((group) => <GroupCard key={group.id} group={group} overview={overview}/>) }
      </div>
    </> : null}

    {overview.groupDrawCompleted && tab === "KNOCKOUT" ? <section className="knockout-overview">
      <div className="bye-panel"><div className="eyebrow">Vantagem da fase de grupos</div><h3>Os dois melhores líderes ganham bye</h3><div className="bye-grid">{overview.knockout.byes.length ? overview.knockout.byes.map((row, index) => <article key={row.id}><span>{index + 1}º bye</span><Avatar row={row}/><strong>{row.displayName}</strong><small>Grupo {row.groupId} · {row.tablePoints} pts · PF {row.pointsFor}</small></article>) : <p>Aguardando a conclusão da fase de grupos.</p>}</div></div>
      <div className="playin-panel"><div className="eyebrow">16-avos de final</div><h3>Participantes do play-in</h3><p>{overview.knockout.note}</p><div className="seed-list">{overview.knockout.playIn.map((row, index) => <div key={row.id}><b>{index + 1}</b><Avatar row={row}/><span>{row.displayName}<small>{row.groupPosition}º do Grupo {row.groupId}</small></span><strong>{row.tablePoints} pts</strong></div>)}</div></div>
    </section> : null}
  </>;
}
