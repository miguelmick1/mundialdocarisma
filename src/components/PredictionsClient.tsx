"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import CountryFlag from "@/components/CountryFlag";
import {
  carismaRoundIdForMatch,
  type CarismaRoundId,
} from "@/lib/world-cup/rounds";

type Guess = { homeScore: number; awayScore: number; revision: number };
type Match = {
  id: string;
  matchNumber: number;
  phase: string;
  group?: string | null;
  groupRound?: number | null;
  homeTeamId: string;
  homeTeamName: string;
  homeTeamIso2?: string | null;
  awayTeamId: string;
  awayTeamName: string;
  awayTeamIso2?: string | null;
  teamsResolved?: boolean;
  venue?: string | null;
  kickoffAt: string;
  status: string;
  myGuess?: Guess | null;
};

type CarismaTeam = {
  id: string;
  name: string;
  iso2: string | null;
  group?: string | null;
  firstKickoff: string;
  eligible?: boolean;
  unavailableReason?: string | null;
};
type CarismaRound = {
  id: CarismaRoundId;
  label: string;
  startsAt: string | null;
  hasResolvedMatches: boolean;
  allocationPending?: boolean;
  allocatedTeams?: CarismaTeam[];
  selectedTeam: { id: string; name: string; iso2: string | null } | null;
  locked: boolean;
  lockAt: string | null;
  eligibleTeams: CarismaTeam[];
  teams?: CarismaTeam[];
};

type Draft = {
  home: string;
  away: string;
  state: string;
  timer?: ReturnType<typeof setTimeout>;
};
type RoundFilter = "ALL" | CarismaRoundId;

const ROUND_FILTERS: Array<{ value: RoundFilter; label: string }> = [
  { value: "ALL", label: "Todos os 104" },
  { value: "GROUP_1", label: "Rodada 1" },
  { value: "GROUP_2", label: "Rodada 2" },
  { value: "GROUP_3", label: "Rodada 3" },
  { value: "ROUND_OF_32", label: "16-avos" },
  { value: "ROUND_OF_16", label: "Oitavas" },
  { value: "QUARTER_FINAL", label: "Quartas" },
  { value: "SEMI_FINAL", label: "Semifinais" },
  { value: "THIRD_PLACE", label: "3º lugar" },
  { value: "FINAL", label: "Final" },
];

function countdown(target: Date, now: number) {
  const diff = Math.max(0, target.getTime() - now);
  const days = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${days ? `${days}d ` : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function phaseLabel(match: Match) {
  if (match.phase === "GROUP_STAGE")
    return `Grupo ${match.group} · Rodada ${match.groupRound}`;
  const labels: Record<string, string> = {
    ROUND_OF_32: "16-avos de final",
    ROUND_OF_16: "Oitavas de final",
    QUARTER_FINAL: "Quartas de final",
    SEMI_FINAL: "Semifinal",
    THIRD_PLACE: "Disputa de 3º lugar",
    FINAL: "Grande final",
  };
  return labels[match.phase] ?? match.phase;
}

function roundSection(match: Match) {
  if (match.phase === "GROUP_STAGE") {
    return {
      key: `GROUP_${match.groupRound ?? 0}`,
      eyebrow: "Fase de grupos",
      label: `Rodada ${match.groupRound ?? "–"}`,
    };
  }
  const labels: Record<string, string> = {
    ROUND_OF_32: "16-avos de final",
    ROUND_OF_16: "Oitavas de final",
    QUARTER_FINAL: "Quartas de final",
    SEMI_FINAL: "Semifinais",
    THIRD_PLACE: "Disputa de 3º lugar",
    FINAL: "Final",
  };
  return {
    key: match.phase,
    eyebrow: "Mata-mata",
    label: labels[match.phase] ?? match.phase,
  };
}

export default function PredictionsClient() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [carismaRounds, setCarismaRounds] = useState<CarismaRound[]>([]);
  const [carismaRoundId, setCarismaRoundId] =
    useState<CarismaRoundId>("GROUP_1");
  const [carismaMessage, setCarismaMessage] = useState("");
  const [carismaSaving, setCarismaSaving] = useState(false);
  const [carismaPickerOpen, setCarismaPickerOpen] = useState(false);
  const [pendingCarismaTeamId, setPendingCarismaTeamId] = useState<
    string | null
  >(null);
  const [carismaSearch, setCarismaSearch] = useState("");
  const [carismaGroupFilter, setCarismaGroupFilter] = useState("ALL");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [serverOffset, setServerOffset] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [roundFilter, setRoundFilter] = useState<RoundFilter>("ALL");
  const [groupFilter, setGroupFilter] = useState("ALL");
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  async function loadCarisma() {
    const response = await fetch("/api/carisma", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error ?? "Falha ao carregar Time Carisma");
    setCarismaRounds(data.rounds ?? []);
    const preferred =
      (data.rounds as CarismaRound[]).find(
        (round) => round.id === carismaRoundId,
      ) ??
      (data.rounds as CarismaRound[]).find(
        (round) => round.hasResolvedMatches,
      ) ??
      (data.rounds as CarismaRound[])[0];
    if (preferred) setCarismaRoundId(preferred.id);
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/matches", { cache: "no-store" }).then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Falha ao carregar partidas");
        setServerOffset(new Date(data.serverTime).getTime() - Date.now());
        setMatches(data.matches);
        const initial: Record<string, Draft> = {};
        for (const match of data.matches as Match[]) {
          initial[match.id] = {
            home: match.myGuess?.homeScore?.toString() ?? "",
            away: match.myGuess?.awayScore?.toString() ?? "",
            state: match.myGuess ? "Salvo ✓" : "Ainda sem palpite",
          };
        }
        setDrafts(initial);
      }),
      loadCarisma(),
    ])
      .catch((error) =>
        setLoadError(
          error instanceof Error ? error.message : "Falha ao carregar a página",
        ),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (roundFilter !== "ALL") setCarismaRoundId(roundFilter);
  }, [roundFilter]);

  useEffect(() => {
    setCarismaPickerOpen(false);
    setCarismaSearch("");
    setCarismaGroupFilter("ALL");
    const round = carismaRounds.find((item) => item.id === carismaRoundId);
    setPendingCarismaTeamId(round?.selectedTeam?.id ?? null);
  }, [carismaRoundId, carismaRounds]);

  async function persist(matchId: string) {
    const draft = draftsRef.current[matchId];
    if (!draft || draft.home === "" || draft.away === "") return;
    setDrafts((previous) => ({
      ...previous,
      [matchId]: { ...previous[matchId]!, state: "Salvando…" },
    }));
    try {
      const response = await fetch("/api/guesses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          slot: 1,
          homeScore: Number(draft.home),
          awayScore: Number(draft.away),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao salvar");
      setDrafts((previous) => ({
        ...previous,
        [matchId]: {
          ...previous[matchId]!,
          state: `Salvo às ${new Date(data.savedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} ✓`,
        },
      }));
    } catch (error) {
      setDrafts((previous) => ({
        ...previous,
        [matchId]: {
          ...previous[matchId]!,
          state: error instanceof Error ? error.message : "Falha ao salvar",
        },
      }));
    }
  }

  function change(matchId: string, side: "home" | "away", value: string) {
    const sanitized = value.replace(/\D/g, "").slice(0, 2);
    setDrafts((previous) => {
      const old = previous[matchId] ?? { home: "", away: "", state: "" };
      if (old.timer) clearTimeout(old.timer);
      const next: Draft = {
        ...old,
        [side]: sanitized,
        state: "Alterado — aguardando salvamento",
      };
      next.timer = setTimeout(() => persist(matchId), 650);
      return { ...previous, [matchId]: next };
    });
  }

  async function chooseCarisma(teamId: string) {
    setCarismaSaving(true);
    setCarismaMessage("Salvando escolha…");
    try {
      const response = await fetch("/api/carisma", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId: carismaRoundId, teamId }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Falha ao escolher Time Carisma");
      await loadCarisma();
      setCarismaPickerOpen(false);
      setCarismaMessage(
        carismaRoundId.startsWith("GROUP_")
          ? "Time Carisma salvo para as três rodadas da fase de grupos. Você poderá trocar até o primeiro jogo dele começar."
          : "Time Carisma salvo. Você poderá trocar até ele entrar em campo.",
      );
    } catch (error) {
      setCarismaMessage(
        error instanceof Error
          ? error.message
          : "Falha ao escolher Time Carisma",
      );
    } finally {
      setCarismaSaving(false);
    }
  }

  const completed = useMemo(
    () =>
      matches.filter(
        (match) =>
          drafts[match.id]?.home !== "" && drafts[match.id]?.away !== "",
      ).length,
    [matches, drafts],
  );

  const groups = useMemo(
    () =>
      Array.from(
        new Set(
          matches
            .map((match) => match.group)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    [matches],
  );

  const filteredMatches = useMemo(
    () =>
      matches.filter((match) => {
        if (groupFilter !== "ALL" && match.group !== groupFilter) return false;
        if (roundFilter === "ALL") return true;
        if (roundFilter.startsWith("GROUP_")) {
          return (
            match.phase === "GROUP_STAGE" &&
            match.groupRound === Number(roundFilter.slice(-1))
          );
        }
        return match.phase === roundFilter;
      }),
    [matches, groupFilter, roundFilter],
  );

  const roundSectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    filteredMatches.forEach((match) => {
      const key = roundSection(match).key;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [filteredMatches]);

  const activeCarismaRound =
    carismaRounds.find((round) => round.id === carismaRoundId) ??
    carismaRounds[0];
  const selectedCarismaByRound = useMemo(
    () =>
      new Map(
        carismaRounds
          .filter((round) => round.selectedTeam)
          .map((round) => [round.id, round.selectedTeam!.id]),
      ),
    [carismaRounds],
  );

  const activeCarismaTeams =
    activeCarismaRound?.teams ?? activeCarismaRound?.eligibleTeams ?? [];
  const carismaGroups = useMemo(
    () =>
      Array.from(
        new Set(
          activeCarismaTeams
            .map((team) => team.group)
            .filter((group): group is string => Boolean(group)),
        ),
      ).sort(),
    [activeCarismaTeams],
  );
  const filteredCarismaTeams = useMemo(() => {
    const query = carismaSearch.trim().toLocaleLowerCase("pt-BR");
    return activeCarismaTeams.filter((team) => {
      if (carismaGroupFilter !== "ALL" && team.group !== carismaGroupFilter)
        return false;
      if (!query) return true;
      return (
        team.name.toLocaleLowerCase("pt-BR").includes(query) ||
        team.id.toLocaleLowerCase("pt-BR").includes(query)
      );
    });
  }, [activeCarismaTeams, carismaGroupFilter, carismaSearch]);
  const pendingCarismaTeam =
    activeCarismaTeams.find((team) => team.id === pendingCarismaTeamId) ?? null;

  function openCarismaPicker() {
    if (
      !activeCarismaRound ||
      activeCarismaRound.locked ||
      !activeCarismaRound.hasResolvedMatches
    )
      return;
    setPendingCarismaTeamId(activeCarismaRound.selectedTeam?.id ?? null);
    setCarismaSearch("");
    setCarismaGroupFilter("ALL");
    setCarismaPickerOpen(true);
  }

  if (loading) return <div className="card">Carregando as 104 partidas…</div>;
  if (loadError) return <div className="error">{loadError}</div>;
  if (!matches.length)
    return (
      <div className="card">
        <h3>Calendário ainda não sincronizado</h3>
        <p className="muted">
          Entre na área de Administração e clique em “Sincronizar 104 partidas”,
          ou execute <code>npm run sync:worldcup</code>.
        </p>
      </div>
    );

  return (
    <>
      <section className="card prediction-summary">
        <div>
          <strong>
            {completed} de {matches.length} palpites preenchidos
          </strong>
          <div className="muted">
            Autosave ativado · bloqueio pelo relógio do servidor
          </div>
        </div>
        <div className="tournament-stat">
          <strong>{filteredMatches.length}</strong>
          <span>jogos no filtro</span>
        </div>
        <div className="progress">
          <div
            style={{
              width: `${matches.length ? (completed / matches.length) * 100 : 0}%`,
            }}
          />
        </div>
      </section>

      {activeCarismaRound ? (
        <section className="card carisma-compact-panel">
          <div className="carisma-compact-main">
            <div className="carisma-compact-title">
              <div className="eyebrow">✨ Time Carisma</div>
              <strong>{activeCarismaRound.label}</strong>
              <span>
                A pontuação básica dobra. Na fase de grupos, a mesma seleção vale nas três rodadas.
              </span>
            </div>

            <label className="carisma-compact-round">
              Rodada
              <select
                className="input"
                value={carismaRoundId}
                onChange={(event) =>
                  setCarismaRoundId(event.target.value as CarismaRoundId)
                }
              >
                {carismaRounds.map((round) => (
                  <option key={round.id} value={round.id}>
                    {round.label}
                  </option>
                ))}
              </select>
            </label>

            <div
              className={`carisma-compact-selection ${activeCarismaRound.locked ? "locked" : ""}`}
            >
              {activeCarismaRound.selectedTeam ? (
                <>
                  <CountryFlag
                    iso2={activeCarismaRound.selectedTeam.iso2}
                    name={activeCarismaRound.selectedTeam.name}
                    className="carisma-compact-flag"
                  />
                  <div>
                    <small>
                      {activeCarismaRound.locked
                        ? "Escolha bloqueada"
                        : "Seleção escolhida"}
                    </small>
                    <strong>{activeCarismaRound.selectedTeam.name}</strong>
                    <span>
                      {activeCarismaRound.lockAt
                        ? `${activeCarismaRound.locked ? "Bloqueada desde" : "Pode trocar até"} ${new Date(activeCarismaRound.lockAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                        : "Aguardando horário do jogo"}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <span className="carisma-empty-icon">☆</span>
                  <div>
                    <small>Nenhuma seleção escolhida</small>
                    <strong>Defina seu Time Carisma</strong>
                    <span>
                      Na fase de grupos, a escolha será repetida automaticamente nas três rodadas.
                    </span>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              className="button button-yellow carisma-compact-action"
              onClick={openCarismaPicker}
              disabled={
                activeCarismaRound.locked ||
                !activeCarismaRound.hasResolvedMatches ||
                activeCarismaRound.eligibleTeams.length === 0
              }
            >
              {activeCarismaRound.locked
                ? "🔒 Bloqueado"
                : activeCarismaRound.selectedTeam
                  ? "Trocar seleção"
                  : "Escolher seleção"}
            </button>
          </div>

          {activeCarismaRound.allocationPending ? (
            <div className="carisma-compact-notice">
              Suas três opções de Time Carisma ainda não foram sorteadas. Acompanhe a revelação na aba Sorteios.
            </div>
          ) : !activeCarismaRound.hasResolvedMatches ? (
            <div className="carisma-compact-notice">
              As seleções desta rodada ainda não foram definidas. A escolha será liberada quando os confrontos forem resolvidos.
            </div>
          ) : null}
          {carismaMessage ? (
            <p
              className={
                carismaMessage.includes("Falha") ||
                carismaMessage.includes("não")
                  ? "error-inline"
                  : "success-inline"
              }
            >
              {carismaMessage}
            </p>
          ) : null}
        </section>
      ) : null}

      {carismaPickerOpen && activeCarismaRound ? (
        <div
          className="carisma-picker-backdrop"
          role="presentation"
          onMouseDown={() => setCarismaPickerOpen(false)}
        >
          <section
            className="carisma-picker-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="carisma-picker-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="carisma-picker-head">
              <div>
                <div className="eyebrow">✨ Time Carisma</div>
                <h3 id="carisma-picker-title">Escolha sua seleção</h3>
                <p>{activeCarismaRound.label} · ordenado pelo próximo jogo</p>
              </div>
              <button
                type="button"
                className="carisma-picker-close"
                aria-label="Fechar"
                onClick={() => setCarismaPickerOpen(false)}
              >
                ×
              </button>
            </header>

            <div className="carisma-picker-tools">
              <label className="carisma-search-label">
                Buscar seleção
                <input
                  className="input"
                  type="search"
                  value={carismaSearch}
                  onChange={(event) => setCarismaSearch(event.target.value)}
                  placeholder="Digite o nome do país"
                  autoFocus
                />
              </label>
              {carismaGroups.length ? (
                <div className="carisma-group-strip">
                  <button
                    type="button"
                    className={carismaGroupFilter === "ALL" ? "active" : ""}
                    onClick={() => setCarismaGroupFilter("ALL")}
                  >
                    Todas
                  </button>
                  {carismaGroups.map((group) => (
                    <button
                      type="button"
                      key={group}
                      className={carismaGroupFilter === group ? "active" : ""}
                      onClick={() => setCarismaGroupFilter(group)}
                    >
                      Grupo {group}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="carisma-picker-list">
              {filteredCarismaTeams.map((team) => {
                const selected = pendingCarismaTeamId === team.id;
                const eligible = team.eligible !== false;
                return (
                  <button
                    key={team.id}
                    type="button"
                    className={`carisma-picker-row ${selected ? "selected" : ""} ${eligible ? "" : "unavailable"}`}
                    disabled={!eligible || carismaSaving}
                    onClick={() => setPendingCarismaTeamId(team.id)}
                  >
                    <CountryFlag
                      iso2={team.iso2}
                      name={team.name}
                      className="carisma-picker-flag"
                    />
                    <span className="carisma-picker-country">
                      <strong>{team.name}</strong>
                      <small>
                        {team.group ? `Grupo ${team.group} · ` : ""}Joga em {new Date(team.firstKickoff).toLocaleString("pt-BR", {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </span>
                    <span className="carisma-picker-status">
                      {eligible
                        ? selected
                          ? "✓ Selecionado"
                          : "Escolher"
                        : `🔒 ${team.unavailableReason ?? "Indisponível"}`}
                    </span>
                  </button>
                );
              })}
              {!filteredCarismaTeams.length ? (
                <div className="carisma-picker-empty">
                  Nenhuma seleção encontrada neste filtro.
                </div>
              ) : null}
            </div>

            <footer className="carisma-picker-footer">
              <button
                type="button"
                className="button"
                onClick={() => setCarismaPickerOpen(false)}
                disabled={carismaSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button-yellow"
                disabled={
                  !pendingCarismaTeam ||
                  pendingCarismaTeam.eligible === false ||
                  carismaSaving
                }
                onClick={() =>
                  pendingCarismaTeam && chooseCarisma(pendingCarismaTeam.id)
                }
              >
                {carismaSaving
                  ? "Salvando…"
                  : pendingCarismaTeam
                    ? `Confirmar ${pendingCarismaTeam.name}`
                    : "Escolha uma seleção"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      <section className="filter-panel">
        <div>
          <div className="filter-label">Por rodada ou fase</div>
          <div className="filter-strip">
            {ROUND_FILTERS.map((filter) => (
              <button
                key={filter.value}
                className={`filter-chip ${roundFilter === filter.value ? "active" : ""}`}
                onClick={() => setRoundFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="filter-label">Por grupo</div>
          <div className="filter-strip">
            <button
              className={`filter-chip ${groupFilter === "ALL" ? "active" : ""}`}
              onClick={() => setGroupFilter("ALL")}
            >
              Todos
            </button>
            {groups.map((group) => (
              <button
                key={group}
                className={`filter-chip ${groupFilter === group ? "active" : ""}`}
                onClick={() => setGroupFilter(group)}
              >
                Grupo {group}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="match-list compact-match-grid">
        {filteredMatches.map((match, index) => {
          const kickoff = new Date(match.kickoffAt);
          const now = clock + serverOffset;
          const unresolved = match.teamsResolved === false;
          const locked =
            now >= kickoff.getTime() ||
            match.status !== "SCHEDULED" ||
            unresolved;
          const draft = drafts[match.id] ?? { home: "", away: "", state: "" };
          const isBrazilMatch =
            match.homeTeamId === "BRA" || match.awayTeamId === "BRA";
          const matchCarismaRoundId = carismaRoundIdForMatch(
            match.phase,
            match.groupRound,
          );
          const selectedCarisma = matchCarismaRoundId
            ? selectedCarismaByRound.get(matchCarismaRoundId)
            : undefined;
          const homeIsCarisma = selectedCarisma === match.homeTeamId;
          const awayIsCarisma = selectedCarisma === match.awayTeamId;
          const statusLabel = unresolved
            ? "Aguardando seleções"
            : locked
              ? "Bloqueado"
              : countdown(kickoff, now);

          const section = roundSection(match);
          const previousSection = index > 0 ? roundSection(filteredMatches[index - 1]!).key : null;
          const startsSection = previousSection !== section.key;

          return (
            <Fragment key={match.id}>
              {startsSection ? (
                <div className="round-separator" aria-label={`${section.eyebrow}: ${section.label}`}>
                  <span>{section.eyebrow}</span>
                  <strong>{section.label}</strong>
                  <small>{roundSectionCounts.get(section.key) ?? 0} jogos</small>
                </div>
              ) : null}
              <article
                className={`match-card compact-match-card ${isBrazilMatch ? "brazil-match" : ""} ${homeIsCarisma || awayIsCarisma ? "carisma-match" : ""}`}
              >
              <div className="compact-match-head">
                <div>
                  <strong>Jogo {match.matchNumber}</strong>
                  <span>{phaseLabel(match)}</span>
                </div>
                <time>
                  {kickoff.toLocaleString("pt-BR", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <div className="compact-match-body">
                <div className="compact-team compact-team-home">
                  <CountryFlag
                    iso2={match.homeTeamIso2}
                    name={match.homeTeamName}
                  />
                  <span title={match.homeTeamName}>
                    {match.homeTeamName}
                    {homeIsCarisma ? (
                      <em className="carisma-match-tag">✨</em>
                    ) : null}
                  </span>
                </div>
                <div className="score-inputs compact-score-inputs">
                  <input
                    aria-label={`Gols de ${match.homeTeamName}`}
                    inputMode="numeric"
                    className="score-input compact-score-input"
                    disabled={locked}
                    value={draft.home}
                    onChange={(event) =>
                      change(match.id, "home", event.target.value)
                    }
                  />
                  <strong>×</strong>
                  <input
                    aria-label={`Gols de ${match.awayTeamName}`}
                    inputMode="numeric"
                    className="score-input compact-score-input"
                    disabled={locked}
                    value={draft.away}
                    onChange={(event) =>
                      change(match.id, "away", event.target.value)
                    }
                  />
                </div>
                <div className="compact-team compact-team-away">
                  <span title={match.awayTeamName}>
                    {awayIsCarisma ? (
                      <em className="carisma-match-tag">✨</em>
                    ) : null}
                    {match.awayTeamName}
                  </span>
                  <CountryFlag
                    iso2={match.awayTeamIso2}
                    name={match.awayTeamName}
                  />
                </div>
              </div>
              <div className="compact-match-footer">
                <span
                  className={`badge ${locked ? "badge-locked" : "badge-open"}`}
                >
                  {statusLabel}
                </span>
                <span className="compact-save-state">
                  {unresolved
                    ? "Libera após definição das seleções"
                    : draft.state}
                </span>
                {homeIsCarisma || awayIsCarisma ? (
                  <span className="carisma-footer-note">✨ Time Carisma</span>
                ) : null}
                {match.venue ? (
                  <span className="compact-venue" title={match.venue}>
                    📍 {match.venue}
                  </span>
                ) : null}
              </div>
              </article>
            </Fragment>
          );
        })}
      </div>
    </>
  );
}
