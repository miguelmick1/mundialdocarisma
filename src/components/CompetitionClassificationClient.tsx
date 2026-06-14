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
  started: boolean;
  completed: boolean;
  homeRoundPoints: number;
  awayRoundPoints: number;
  home: ParticipantRow | null;
  away: ParticipantRow | null;
};

type RoundProgress = {
  round: number;
  settled: number;
  total: number;
  completed: boolean;
};

type Overview = {
  competitionName: string;
  currentUserId: string;
  groupDrawCompleted: boolean;
  startedRounds: number[];
  completedRounds: number[];
  roundProgress: RoundProgress[];
  serverTime: string;
  groups: Array<{
    id: string;
    name: string;
    rows: ParticipantRow[];
    fixtures: Fixture[];
  }>;
  knockout: { byes: ParticipantRow[]; playIn: ParticipantRow[]; note: string };
};

type FixtureDetails = {
  fixtureId: string;
  round: number;
  home: { id: string; displayName: string };
  away: { id: string; displayName: string };
  games: Array<{
    matchId: string;
    matchNumber: number;
    homeTeamName: string;
    awayTeamName: string;
    status: string;
    result: { home: number; away: number } | null;
    participants: Array<{
      participantId: string;
      displayName: string;
      guesses: Array<{ slot: number; homeScore: number; awayScore: number }>;
      points: number | null;
    }>;
  }>;
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

function GroupCard({ group, overview, onFixtureClick }: { group: Overview["groups"][number]; overview: Overview; onFixtureClick: (fixture: Fixture) => void }) {
  const currentRound = overview.roundProgress.find((progress) => progress.settled > 0 && !progress.completed);
  const headerText = currentRound
    ? `Rodada ${currentRound.round}: ${currentRound.settled}/${currentRound.total} jogos`
    : `${overview.completedRounds.length}/3 rodadas concluídas`;

  return <section className="participant-group-card" id={`grupo-${group.id}`}>
    <header><div><div className="eyebrow">Mundial do Carisma</div><h3>{group.name}</h3></div><span className={currentRound ? "round-in-progress" : ""}>{headerText}</span></header>
    <div className="participant-standings-wrap"><table className="participant-standings"><thead><tr><th>#</th><th>Participante</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>PF</th><th>PA</th><th>SP</th></tr></thead><tbody>
      {group.rows.map((row, index) => <tr
        key={row.id}
        style={carismaStyle(row)}
        className={`${row.id === overview.currentUserId ? "current-user" : ""} ${row.type === "HUMAN" && row.carismaTeam ? "carisma-colored-row" : ""}`.trim()}
      ><td>{index + 1}</td><td><ParticipantIdentity row={row}/></td><td><b>{row.tablePoints}</b></td><td>{row.played}</td><td>{row.wins}</td><td>{row.draws}</td><td>{row.losses}</td><td>{row.pointsFor}</td><td>{row.pointsAgainst}</td><td className={row.pointDifference > 0 ? "positive" : row.pointDifference < 0 ? "negative" : ""}>{row.pointDifference > 0 ? `+${row.pointDifference}` : row.pointDifference}</td></tr>)}
    </tbody></table></div>
    <div className="group-fixtures"><h4>Confrontos</h4>{[1,2,3].map((round) => {
      const progress = overview.roundProgress.find((item) => item.round === round);
      return <div key={round} className="fixture-round"><b>Rodada {round}</b><div>{group.fixtures.filter((fixture) => fixture.round === round).map((fixture) => <button type="button" key={fixture.id} disabled={!fixture.started} onClick={() => onFixtureClick(fixture)} className={`fixture-detail-trigger ${fixture.completed ? "completed" : fixture.started ? "provisional" : ""}`}><span>{fixture.home?.displayName ?? "A definir"}</span><strong>{fixture.started ? `${fixture.homeRoundPoints} × ${fixture.awayRoundPoints}` : "×"}</strong><span>{fixture.away?.displayName ?? "A definir"}</span><small>{fixture.completed ? "Encerrado · ver jogos" : fixture.started ? `Parcial · ${progress?.settled ?? 0}/${progress?.total ?? 0} jogos apurados · ver jogos` : "Aguardando resultados da rodada"}</small></button>)}</div></div>;
    })}</div>
  </section>;
}

export default function CompetitionClassificationClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("GROUPS");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [fixtureDetails, setFixtureDetails] = useState<FixtureDetails | null>(null);
  const [fixtureLoading, setFixtureLoading] = useState(false);

  async function load(silent = false) {
    if (!silent) setRefreshing(true);
    try {
      const response = await fetch("/api/competition/overview", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar");
      setOverview(data);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao carregar");
    } finally {
      if (!silent) setRefreshing(false);
    }
  }

  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => { void load(true); }, 20000);
    return () => window.clearInterval(timer);
  }, []);

  async function openFixture(fixture: Fixture) {
    if (!fixture.started) return;
    setFixtureLoading(true);
    try {
      const response = await fetch(`/api/competition/fixture-details?fixtureId=${encodeURIComponent(fixture.id)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar confronto");
      setFixtureDetails(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao carregar confronto");
    } finally {
      setFixtureLoading(false);
    }
  }

  if (error && !overview) return <div className="error">{error}</div>;
  if (!overview) return <div className="card">Carregando classificação…</div>;

  const hasProvisionalRound = overview.roundProgress.some((progress) => progress.settled > 0 && !progress.completed);

  return <>
    <div className="competition-toolbar">
      <div className="competition-view-tabs" role="tablist">
        {tabs.map((item) => <button key={item.id} type="button" className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>
      <button type="button" className="button button-secondary compact-button" onClick={() => void load()} disabled={refreshing}>{refreshing ? "Atualizando…" : "Atualizar classificação"}</button>
    </div>

    {error ? <div className="error">{error}</div> : null}

    {!overview.groupDrawCompleted ? <section className="card empty-competition-state"><span>🎱</span><div><h3>Os grupos ainda serão sorteados</h3><p>Assim que o administrador concluir o sorteio oficial, esta página mostrará tabelas, confrontos e a corrida pelos dois byes.</p><a className="button button-yellow" href="/sorteios">Acompanhar sorteios</a></div></section> : null}

    {overview.groupDrawCompleted && tab === "GROUPS" ? <>
      <section className={`classification-live-note ${hasProvisionalRound ? "provisional" : ""}`}>
        <span>{hasProvisionalRound ? "●" : "✓"}</span>
        <div><strong>{hasProvisionalRound ? "Classificação provisória atualizada jogo a jogo" : "Classificação atualizada"}</strong><small>{hasProvisionalRound ? "Os pontos e confrontos podem mudar até o encerramento da rodada." : "Cada resultado confirmado já está refletido nas tabelas."}</small></div>
      </section>
      <nav className="group-anchor-nav" aria-label="Atalhos para os grupos">
        {overview.groups.map((group) => <a key={group.id} href={`#grupo-${group.id}`}>Grupo {group.id}</a>)}
      </nav>
      <div className="participant-groups-list">
        {overview.groups.map((group) => <GroupCard key={group.id} group={group} overview={overview} onFixtureClick={(fixture) => void openFixture(fixture)}/>) }
      </div>
    </> : null}

    {overview.groupDrawCompleted && tab === "KNOCKOUT" ? <section className="knockout-overview">
      <div className="bye-panel"><div className="eyebrow">Vantagem da fase de grupos</div><h3>Os dois melhores líderes ganham bye</h3><div className="bye-grid">{overview.knockout.byes.length ? overview.knockout.byes.map((row, index) => <article key={row.id}><span>{index + 1}º bye</span><Avatar row={row}/><strong>{row.displayName}</strong><small>Grupo {row.groupId} · {row.tablePoints} pts · PF {row.pointsFor}</small></article>) : <p>Aguardando a conclusão da fase de grupos.</p>}</div></div>
      <div className="playin-panel"><div className="eyebrow">16-avos de final</div><h3>Participantes do play-in</h3><p>{overview.knockout.note}</p><div className="seed-list">{overview.knockout.playIn.map((row, index) => <div key={row.id}><b>{index + 1}</b><Avatar row={row}/><span>{row.displayName}<small>{row.groupPosition}º do Grupo {row.groupId}</small></span><strong>{row.tablePoints} pts</strong></div>)}</div></div>
    </section> : null}

    {fixtureLoading ? <div className="fixture-detail-loading">Carregando jogos do confronto…</div> : null}
    {fixtureDetails ? <div className="fixture-detail-backdrop" role="presentation" onMouseDown={() => setFixtureDetails(null)}>
      <section className="fixture-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="fixture-detail-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><div className="eyebrow">Rodada {fixtureDetails.round}</div><h3 id="fixture-detail-title">{fixtureDetails.home.displayName} × {fixtureDetails.away.displayName}</h3><p>Resultado de cada partida que compõe o confronto.</p></div><button type="button" aria-label="Fechar" onClick={() => setFixtureDetails(null)}>×</button></header>
        <div className="fixture-detail-games">{fixtureDetails.games.map((game) => <article key={game.matchId}>
          <div className="fixture-detail-game-result"><small>Jogo {game.matchNumber} · {game.status}</small><strong>{game.homeTeamName} <b>{game.result ? `${game.result.home} × ${game.result.away}` : "×"}</b> {game.awayTeamName}</strong></div>
          <div className="fixture-detail-comparison">{game.participants.map((participant) => <div key={participant.participantId}><span>{participant.displayName}</span><strong>{participant.guesses.length ? participant.guesses.map((guess) => `${guess.homeScore} × ${guess.awayScore}`).join(" / ") : "Sem palpite"}</strong><b>{participant.points == null ? "Aguardando" : `${participant.points} pts`}</b></div>)}</div>
        </article>)}</div>
      </section>
    </div> : null}
  </>;
}
