"use client";

import { Fragment, useEffect, useState, type CSSProperties } from "react";
import CountryFlag from "@/components/CountryFlag";
import { competitionGroupLabel } from "@/lib/competition/group-names";
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
  seedLabel?: string;
  positionSeed?: number;
  racePosition?: number;
  totalPoints?: number;
  exactHits?: number;
  soloHits?: number;
  scoredHits?: number;
  exactDetails?: ExactHitDetail[];
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

type ExactHitDetail = {
  matchId: string;
  matchNumber: number;
  matchLabel: string;
  guess: { home: number; away: number } | null;
  result: { home: number; away: number } | null;
  exact: boolean;
  exactPoints: number;
  solo: boolean;
  soloPoints: number;
  totalPoints: number;
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

type KnockoutEntrant = {
  sourceLabel: string;
  participant: ParticipantRow | null;
};

type KnockoutDuel = {
  id: string;
  label: string;
  scoringLabel: string;
  home: KnockoutEntrant;
  away: KnockoutEntrant;
  homePoints: number | null;
  awayPoints: number | null;
  winner: ParticipantRow | null;
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
  knockout: {
    seeds: ParticipantRow[];
    opening: KnockoutDuel[];
    quarterFinals: KnockoutDuel[];
    semiFinals: KnockoutDuel[];
    final: {
      scoringLabel: string;
      finalists: Array<ParticipantRow | null>;
      pointsRaceWildcard: ParticipantRow | null;
    };
    pointsRace: ParticipantRow[];
    note: string;
  };
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
      <span className="participant-display-name-line">
        <strong>{row.displayName}</strong>
        {row.type === "HUMAN" && row.carismaTeam ? <CountryFlag iso2={row.carismaTeam.iso2} name={row.carismaTeam.name} className="participant-carisma-name-flag" /> : null}
      </span>
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

function BracketEntrant({ entrant, deferParticipant = false }: { entrant: KnockoutEntrant; deferParticipant?: boolean }) {
  if (!entrant.participant || deferParticipant) return <div className="bracket-entrant empty"><span>A definir</span><small>{entrant.sourceLabel}</small></div>;
  return <div className="bracket-entrant">
    <ParticipantIdentity row={entrant.participant} />
    <small>{entrant.participant.seedLabel ?? entrant.sourceLabel}</small>
  </div>;
}

function BracketDuel({ duel, deferEntrants = false }: { duel: KnockoutDuel; deferEntrants?: boolean }) {
  const homeWinner = !deferEntrants && duel.winner?.id === duel.home.participant?.id;
  const awayWinner = !deferEntrants && duel.winner?.id === duel.away.participant?.id;
  return <article className="bracket-duel">
    <header><span>{duel.label}</span><strong>{duel.scoringLabel}</strong></header>
    <div className={`bracket-duel-row ${homeWinner ? "winner" : ""}`}>
      <BracketEntrant entrant={duel.home} deferParticipant={deferEntrants} />
      <b>{deferEntrants || duel.homePoints == null ? "-" : duel.homePoints}</b>
    </div>
    <div className={`bracket-duel-row ${awayWinner ? "winner" : ""}`}>
      <BracketEntrant entrant={duel.away} deferParticipant={deferEntrants} />
      <b>{deferEntrants || duel.awayPoints == null ? "-" : duel.awayPoints}</b>
    </div>
  </article>;
}

function hasPhaseScore(duel: KnockoutDuel | undefined) {
  if (!duel || duel.homePoints == null || duel.awayPoints == null) return false;
  return duel.homePoints !== 0 || duel.awayPoints !== 0 || Boolean(duel.winner);
}

function PointsRaceTable({ rows, currentUserId }: { rows: ParticipantRow[]; currentUserId: string }) {
  return <div className="points-race-table-wrap">
    <table className="points-race-table">
      <thead><tr><th>#</th><th>Participante</th><th>Pts corridos</th><th>Exatos</th><th>Sozinhos</th><th>Acertos totais</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} className={row.id === currentUserId ? "current-user" : ""}>
        <td>{row.racePosition ?? "-"}</td>
        <td><ParticipantIdentity row={row} /></td>
        <td><strong>{row.totalPoints ?? 0}</strong></td>
        <td>{row.exactHits ?? 0}</td>
        <td>{row.soloHits ?? 0}</td>
        <td>{row.scoredHits ?? 0}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function scoreText(score: { home: number; away: number } | null) {
  return score ? `${score.home} x ${score.away}` : "-";
}

function ExactHitsTable({ rows, currentUserId }: { rows: ParticipantRow[]; currentUserId: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(currentUserId || null);

  return <section className="exact-hits-panel">
    <div><div className="eyebrow">Acertos exatos</div><h3>Placares exatos e acertos sozinhos por participante</h3></div>
    <div className="exact-hits-table-wrap">
      <table className="exact-hits-table">
        <thead><tr><th>Participante</th><th>Exatos</th><th>Sozinhos</th><th>Detalhes</th></tr></thead>
        <tbody>{rows.map((row) => {
          const expanded = expandedId === row.id;
          const details = row.exactDetails ?? [];
          return <Fragment key={row.id}>
            <tr className={`${row.id === currentUserId ? "current-user" : ""} ${expanded ? "expanded" : ""}`.trim()}>
              <td><ParticipantIdentity row={row} /></td>
              <td>{row.exactHits ?? 0}</td>
              <td>{row.soloHits ?? 0}</td>
              <td><button type="button" className="exact-detail-toggle" onClick={() => setExpandedId(expanded ? null : row.id)} aria-expanded={expanded}>
                {expanded ? "Ocultar" : "Ver acertos"}
              </button></td>
            </tr>
            {expanded ? <tr className="exact-detail-row"><td colSpan={4}>
              {details.length ? <div className="exact-detail-list">
                {details.map((detail) => <article key={`${detail.matchId}:${detail.exact ? "exact" : "solo"}`}>
                  <div><small>Jogo {detail.matchNumber}</small><strong>{detail.matchLabel}</strong></div>
                  <span><small>Palpite</small><b>{scoreText(detail.guess)}</b></span>
                  <span><small>Resultado</small><b>{scoreText(detail.result)}</b></span>
                  <span className={detail.exact ? "positive" : ""}><small>Exato</small><b>{detail.exact ? `${detail.exactPoints} pts` : "-"}</b></span>
                  <span className={detail.solo ? "solo" : ""}><small>Sozinho</small><b>{detail.solo ? `${detail.soloPoints} pts` : "-"}</b></span>
                  <span><small>Total</small><b>{detail.totalPoints} pts</b></span>
                </article>)}
              </div> : <p className="muted exact-detail-empty">Nenhum placar exato ou acerto sozinho apurado ainda.</p>}
            </td></tr> : null}
          </Fragment>;
        })}</tbody>
      </table>
    </div>
  </section>;
}

function KnockoutPanel({ overview }: { overview: Overview }) {
  const leftOpening = overview.knockout.opening.slice(0, 4);
  const rightOpening = overview.knockout.opening.slice(4);
  const leftQuarters = overview.knockout.quarterFinals.slice(0, 2);
  const rightQuarters = overview.knockout.quarterFinals.slice(2);
  const leftSemi = overview.knockout.semiFinals.slice(0, 1);
  const rightSemi = overview.knockout.semiFinals.slice(1);
  const allSemiFinalsScored = overview.knockout.semiFinals.length === 2 && overview.knockout.semiFinals.every(hasPhaseScore);
  const finalParticipants: Array<{ label: string; row: ParticipantRow | null }> = [
    ...[0, 1].map((index) => ({
      label: `Finalista ${index + 1}`,
      row: hasPhaseScore(overview.knockout.semiFinals[index]) ? overview.knockout.final.finalists[index] ?? null : null,
    })),
    {
      label: "Vaga por pontos corridos",
      row: allSemiFinalsScored ? overview.knockout.final.pointsRaceWildcard : null,
    },
  ];

  return <section className="knockout-overview-new">
    <div className="knockout-note">{overview.knockout.note}</div>
    <div className="bracket-scroll">
      <div className="bracket-arena">
        <section className="bracket-column opening"><h3>16-avos + oitavas</h3>{leftOpening.map((duel) => <BracketDuel key={duel.id} duel={duel} />)}</section>
        <section className="bracket-column compact-round"><h3>Quartas</h3>{leftQuarters.map((duel) => <BracketDuel key={duel.id} duel={duel} deferEntrants={!hasPhaseScore(duel)} />)}</section>
        <section className="bracket-column compact-round semi-round"><h3>Semifinal</h3>{leftSemi.map((duel) => <BracketDuel key={duel.id} duel={duel} deferEntrants={!hasPhaseScore(duel)} />)}</section>
        <section className="bracket-center">
          <h3>Final tripla</h3>
          <div className="triple-final-list">{finalParticipants.map((entry) => <article key={entry.label} className={entry.row ? "" : "empty"}>
            <span>{entry.label}</span>
            {entry.row ? <ParticipantIdentity row={entry.row} /> : <strong>A definir</strong>}
            {entry.row?.totalPoints != null ? <small>{entry.row.totalPoints} pts corridos</small> : null}
          </article>)}</div>
          <div className="snickers-trophy">
            <img src="/images/snickers-trophy.png" alt="Taça de chocolate Snickers" />
          </div>
          <p className="muted">A disputa de 3º lugar da Copa não entra na competição.</p>
        </section>
        <section className="bracket-column compact-round semi-round"><h3>Semifinal</h3>{rightSemi.map((duel) => <BracketDuel key={duel.id} duel={duel} deferEntrants={!hasPhaseScore(duel)} />)}</section>
        <section className="bracket-column compact-round"><h3>Quartas</h3>{rightQuarters.map((duel) => <BracketDuel key={duel.id} duel={duel} deferEntrants={!hasPhaseScore(duel)} />)}</section>
        <section className="bracket-column opening"><h3>16-avos + oitavas</h3>{rightOpening.map((duel) => <BracketDuel key={duel.id} duel={duel} />)}</section>
      </div>
    </div>
    <section className="points-race-panel"><div><div className="eyebrow">Pontos corridos</div><h3>Tabela acumulada desde a fase de grupos</h3></div><PointsRaceTable rows={overview.knockout.pointsRace} currentUserId={overview.currentUserId} /></section>
    <ExactHitsTable rows={overview.knockout.pointsRace} currentUserId={overview.currentUserId} />
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

    {!overview.groupDrawCompleted ? <section className="card empty-competition-state"><span>🎱</span><div><h3>Os grupos ainda serão sorteados</h3><p>Assim que o administrador concluir o sorteio oficial, esta página mostrará tabelas, confrontos, bracket e pontos corridos.</p><a className="button button-yellow" href="/sorteios">Acompanhar sorteios</a></div></section> : null}

    {overview.groupDrawCompleted && tab === "GROUPS" ? <>
      <section className={`classification-live-note ${hasProvisionalRound ? "provisional" : ""}`}>
        <span>{hasProvisionalRound ? "●" : "✓"}</span>
        <div><strong>{hasProvisionalRound ? "Classificação provisória atualizada jogo a jogo" : "Classificação atualizada"}</strong><small>{hasProvisionalRound ? "Os pontos e confrontos podem mudar até o encerramento da rodada." : "Cada resultado confirmado já está refletido nas tabelas."}</small></div>
      </section>
      <nav className="group-anchor-nav" aria-label="Atalhos para os grupos">
        {overview.groups.map((group) => <a key={group.id} href={`#grupo-${group.id}`}>{competitionGroupLabel(group.id)}</a>)}
      </nav>
      <div className="participant-groups-list">
        {overview.groups.map((group) => <GroupCard key={group.id} group={group} overview={overview} onFixtureClick={(fixture) => void openFixture(fixture)}/>) }
      </div>
    </> : null}

    {overview.groupDrawCompleted && tab === "KNOCKOUT" ? <KnockoutPanel overview={overview} /> : null}

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
