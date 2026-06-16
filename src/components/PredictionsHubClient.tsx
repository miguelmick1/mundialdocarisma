"use client";

import { useState } from "react";
import PredictionsClient from "@/components/PredictionsClient";
import PublicGuessesClient from "@/components/PublicGuessesClient";
import RoundSummaryClient from "@/components/RoundSummaryClient";

type Tab = "MINE" | "PUBLIC" | "ROUND_SUMMARY";

export default function PredictionsHubClient() {
  const [tab, setTab] = useState<Tab>("MINE");
  return <>
    <div className="predictions-hub-tabs" role="tablist" aria-label="Módulos de palpites">
      <button type="button" className={tab === "MINE" ? "active" : ""} onClick={() => setTab("MINE")}><span>✍️</span><strong>Meus palpites</strong><small>Preencher e editar antes do jogo</small></button>
      <button type="button" className={tab === "PUBLIC" ? "active" : ""} onClick={() => setTab("PUBLIC")}><span>👀</span><strong>Palpites de todos</strong><small>Comparar após o início de cada partida</small></button>
      <button type="button" className={tab === "ROUND_SUMMARY" ? "active" : ""} onClick={() => setTab("ROUND_SUMMARY")}><span>🧾</span><strong>Resumo da rodada</strong><small>Ver vários jogos ao mesmo tempo</small></button>
    </div>
    {tab === "MINE" ? <PredictionsClient /> : tab === "PUBLIC" ? <PublicGuessesClient /> : <RoundSummaryClient />}
  </>;
}
