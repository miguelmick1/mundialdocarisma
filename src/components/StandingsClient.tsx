"use client";

import { useEffect, useState } from "react";
import CountryFlag from "@/components/CountryFlag";

type StandingRow = {
  group: string;
  rank: number;
  teamId: string;
  teamName: string;
  iso2?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  qualification?: string | null;
};

type Payload = {
  groups: Record<string, StandingRow[]>;
  sourceLabel: string;
  updatedAt: string;
  warning?: string;
};

export default function StandingsClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeGroup, setActiveGroup] = useState("A");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/world-cup/standings", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar classificação");
      setPayload(data);
      const groups = Object.keys(data.groups ?? {});
      if (groups.length && !groups.includes(activeGroup)) setActiveGroup(groups[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar classificação");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  if (loading) return <div className="card">Carregando a classificação da Copa…</div>;
  if (error) return <div className="error">{error}</div>;
  if (!payload) return null;

  const groups = Object.keys(payload.groups);
  const rows = payload.groups[activeGroup] ?? [];

  return <>
    <section className="card standings-source-card">
      <div>
        <div className="eyebrow">Fonte dos dados</div>
        <strong>{payload.sourceLabel}</strong>
        <div className="muted small-text">Atualizado em {new Date(payload.updatedAt).toLocaleString("pt-BR")}</div>
      </div>
      <button className="button button-secondary compact-button" onClick={() => void load()}>Atualizar</button>
    </section>
    {payload.warning ? <p className="warning">{payload.warning}</p> : null}
    <div className="filter-strip group-strip" aria-label="Escolha o grupo">
      {groups.map((group) => <button key={group} className={`filter-chip ${activeGroup === group ? "active" : ""}`} onClick={() => setActiveGroup(group)}>Grupo {group}</button>)}
    </div>
    <section className="standings-card">
      <div className="standings-title"><div><span className="group-letter">{activeGroup}</span><div><div className="eyebrow">Copa do Mundo 2026</div><h3>Grupo {activeGroup}</h3></div></div><span className="badge badge-gold">12 grupos</span></div>
      <div className="table-wrap standings-table-wrap">
        <table className="standings-table">
          <thead><tr><th>#</th><th>Seleção</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>Pts</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.teamId} className={row.rank <= 2 ? "qualified-row" : row.rank === 3 ? "third-row" : ""}>
            <td><strong>{row.rank}</strong></td>
            <td><span className="standings-team"><CountryFlag iso2={row.iso2} name={row.teamName} className="standings-flag-image" /><span><strong>{row.teamName}</strong>{row.qualification ? <small>{row.qualification}</small> : null}</span></span></td>
            <td>{row.played}</td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td><td>{row.goalsFor}</td><td>{row.goalsAgainst}</td><td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td><td className="points-cell">{row.points}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="standings-legend"><span><i className="legend-dot direct"/>Classificação direta</span><span><i className="legend-dot third"/>Disputa entre os melhores terceiros</span></div>
    </section>
  </>;
}
