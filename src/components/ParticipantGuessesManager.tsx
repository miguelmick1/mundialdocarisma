"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Participant = { id: string; displayName: string };
type Match = { id: string; matchNumber: number; homeTeamName: string; awayTeamName: string; status: string };
type StoredGuess = { key: string; homeScore: number; awayScore: number; overrideReason: string | null };
type Payload = { participants: Participant[]; matches: Match[]; guesses: StoredGuess[] };

export default function ParticipantGuessesManager() {
  const [payload, setPayload] = useState<Payload>({ participants: [], matches: [], guesses: [] });
  const [participantId, setParticipantId] = useState("");
  const [matchId, setMatchId] = useState("");
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/participant-guesses", { cache: "no-store" });
    const data = await response.json() as Payload & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Falha ao carregar palpites.");
    setPayload(data);
    setParticipantId((current) => current || data.participants[0]?.id || "");
  }

  useEffect(() => {
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Falha ao carregar."));
  }, []);

  const filteredMatches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return payload.matches;
    return payload.matches.filter((match) =>
      `${match.matchNumber} ${match.homeTeamName} ${match.awayTeamName}`.toLocaleLowerCase("pt-BR").includes(query),
    );
  }, [payload.matches, search]);

  function syncDraft(nextParticipantId: string, nextMatchId: string) {
    const guess = payload.guesses.find((item) => item.key === `${nextMatchId}:${nextParticipantId}`);
    setHomeScore(guess?.homeScore.toString() ?? "");
    setAwayScore(guess?.awayScore.toString() ?? "");
    setReason(guess?.overrideReason ?? "");
    setMessage("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/participant-guesses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, matchId, slot: 1, homeScore: Number(homeScore), awayScore: Number(awayScore), reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao salvar palpite.");
      setMessage(data.scoreRecalculated ? "Palpite salvo, auditado e partida reapurada." : "Palpite salvo e auditado.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  const selectedMatch = payload.matches.find((match) => match.id === matchId);
  const existing = payload.guesses.some((guess) => guess.key === `${matchId}:${participantId}`);

  return <section className="card admin-participant-guesses">
    <div className="admin-bot-manager-head"><div><div className="eyebrow">Intervenção auditada</div><h3>Palpites de participantes</h3><p className="muted">Crie ou corrija palpites humanos, inclusive retroativos. Partidas confirmadas serão reapuradas por completo.</p></div></div>
    <form onSubmit={save}>
      <div className="admin-guess-controls">
        <label>Participante<select className="input" value={participantId} onChange={(event) => { setParticipantId(event.target.value); syncDraft(event.target.value, matchId); }} required>
          {payload.participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.displayName}</option>)}
        </select></label>
        <label>Buscar jogo<input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Número ou seleção" /></label>
        <label>Partida<select className="input" value={matchId} onChange={(event) => { setMatchId(event.target.value); syncDraft(participantId, event.target.value); }} required>
          <option value="">Selecione uma partida</option>
          {filteredMatches.map((match) => <option key={match.id} value={match.id}>#{match.matchNumber} · {match.homeTeamName} × {match.awayTeamName} · {match.status}</option>)}
        </select></label>
      </div>
      {selectedMatch ? <div className="admin-human-guess-editor">
        <div><small>{existing ? "Corrigindo palpite existente" : "Criando palpite"}</small><strong>Jogo {selectedMatch.matchNumber}: {selectedMatch.homeTeamName} × {selectedMatch.awayTeamName}</strong></div>
        <label>Casa<input className="input" inputMode="numeric" value={homeScore} onChange={(event) => setHomeScore(event.target.value.replace(/\D/g, "").slice(0, 2))} required /></label>
        <label>Fora<input className="input" inputMode="numeric" value={awayScore} onChange={(event) => setAwayScore(event.target.value.replace(/\D/g, "").slice(0, 2))} required /></label>
        <label className="admin-human-guess-reason">Justificativa<input className="input" value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={500} required /></label>
        <button className="button button-primary" disabled={saving}>{saving ? "Salvando…" : existing ? "Corrigir palpite" : "Criar palpite"}</button>
      </div> : null}
    </form>
    {message ? <p className="success">{message}</p> : null}
    {error ? <p className="error">{error}</p> : null}
  </section>;
}
