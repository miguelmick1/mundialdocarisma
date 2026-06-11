import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/auth/session";
import { botDisplayName } from "@/lib/bots/identities";
import { roundHalfUp } from "@/lib/bots/maria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HumanPrediction = {
  participantId: string | null;
  participantName: string;
  home: number;
  away: number;
};

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeStoredPredictions(value: unknown): HumanPrediction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row, index) => {
    if (!row || typeof row !== "object") return [];
    const data = row as Record<string, unknown>;
    const home = finiteNumber(data.home);
    const away = finiteNumber(data.away);
    if (home === null || away === null) return [];
    return [{
      participantId: typeof data.participantId === "string" ? data.participantId : null,
      participantName: typeof data.participantName === "string" && data.participantName.trim()
        ? data.participantName.trim()
        : `Participante ${index + 1}`,
      home,
      away,
    }];
  });
}

function pangareModeCopy(mode: unknown) {
  if (mode === "UNDERDOG") return { label: "Zebra", explanation: "O azarão foi escolhido para vencer a partida." };
  if (mode === "CHAOTIC_DRAW") return { label: "Empate caótico", explanation: "Foi escolhido um empate com muitos gols." };
  if (mode === "GOAL_FEST") return { label: "Festival de gols", explanation: "Foi escolhida uma vitória do favorito em um jogo cheio de gols." };
  return { label: "Modo Pangaré", explanation: "O Pangaré escolheu uma de suas personalidades para montar o placar." };
}

export async function GET(_request: Request, context: { params: Promise<{ guessId: string }> }) {
  try {
    await requireUser();
    const { guessId } = await context.params;
    const sourceSnap = await adminDb.collection("botGuessSources").doc(guessId).get();
    if (!sourceSnap.exists) return NextResponse.json({ error: "Explicação do palpite não encontrada." }, { status: 404 });

    const source = sourceSnap.data()!;
    const matchSnap = await adminDb.collection("matches").doc(String(source.matchId ?? "")).get();
    if (!matchSnap.exists) return NextResponse.json({ error: "Partida não encontrada." }, { status: 404 });
    const match = matchSnap.data()!;
    const kickoff = match.kickoffAt?.toDate?.() as Date | undefined;
    if (!kickoff || Date.now() < kickoff.getTime()) {
      return NextResponse.json({ error: "A explicação será liberada quando os palpites fecharem." }, { status: 403 });
    }

    const publicBotName = botDisplayName({
      id: typeof source.botId === "string" ? source.botId : undefined,
      strategy: typeof source.botStrategy === "string" ? source.botStrategy : undefined,
      fallback: typeof source.botName === "string" ? source.botName : undefined,
    });
    const rawExplanation = source.publicExplanation && typeof source.publicExplanation === "object"
      ? source.publicExplanation as Record<string, unknown>
      : {};
    const rawInputs = rawExplanation.inputs && typeof rawExplanation.inputs === "object"
      ? rawExplanation.inputs as Record<string, unknown>
      : {};
    const homeTeamName = String(match.homeTeamName ?? match.homeTeamId ?? "Mandante");
    const awayTeamName = String(match.awayTeamName ?? match.awayTeamId ?? "Visitante");

    let publicExplanation: Record<string, unknown> = {
      title: typeof rawExplanation.title === "string"
        ? rawExplanation.title.replace(/OddMestre/g, "Betinho Everyday").replace(/Faria Limmer/g, "Transbot")
        : "Como este palpite foi feito",
      summary: typeof rawExplanation.summary === "string" ? rawExplanation.summary : "Veja a explicação deste palpite.",
      inputs: {},
      steps: Array.isArray(rawExplanation.steps) ? rawExplanation.steps : [],
    };

    const manualOnly = source.sourceStatus === "ADMIN_OVERRIDE" && !source.override?.originalPrediction;

    if (manualOnly) {
      publicExplanation = {
        title: "Palpite informado pelo administrador",
        summary: typeof source.override?.reason === "string" && source.override.reason.trim()
          ? source.override.reason.trim()
          : "O administrador informou este palpite manualmente.",
        inputs: {},
        steps: [],
      };
    } else if (source.botStrategy === "HUMAN_AVERAGE") {
      let humanPredictions = normalizeStoredPredictions(rawInputs.humanPredictions);
      const participantIds = new Set(
        Array.isArray(rawInputs.participantIds)
          ? rawInputs.participantIds.filter((value): value is string => typeof value === "string")
          : humanPredictions.map((row) => row.participantId).filter((value): value is string => Boolean(value)),
      );

      if (!humanPredictions.length) {
        const guessesSnap = await adminDb.collection("guesses").where("matchId", "==", source.matchId).get();
        humanPredictions = guessesSnap.docs.flatMap((doc) => {
          const guess = doc.data();
          const participantId = String(guess.participantId ?? "");
          if (guess.source !== "HUMAN" || Number(guess.slot ?? 1) !== 1) return [];
          if (participantIds.size && !participantIds.has(participantId)) return [];
          const home = finiteNumber(guess.homeScore);
          const away = finiteNumber(guess.awayScore);
          if (home === null || away === null) return [];
          return [{
            participantId,
            participantName: typeof guess.participantName === "string" && guess.participantName.trim()
              ? guess.participantName.trim()
              : "Participante",
            home,
            away,
          }];
        });
      }

      const ids = [...new Set(humanPredictions.map((row) => row.participantId).filter((id): id is string => Boolean(id)))];
      if (ids.length) {
        const userSnaps = await adminDb.getAll(...ids.map((id) => adminDb.collection("users").doc(id)));
        const currentNames = new Map(userSnaps.flatMap((snap) => {
          const displayName = snap.exists && typeof snap.data()?.displayName === "string" ? snap.data()!.displayName.trim() : "";
          return displayName ? [[snap.id, displayName] as const] : [];
        }));
        humanPredictions = humanPredictions.map((row) => ({
          ...row,
          participantName: row.participantId ? currentNames.get(row.participantId) ?? row.participantName : row.participantName,
        }));
      }
      humanPredictions.sort((a, b) => a.participantName.localeCompare(b.participantName, "pt-BR"));

      const homeAverage = humanPredictions.length
        ? humanPredictions.reduce((sum, row) => sum + row.home, 0) / humanPredictions.length
        : finiteNumber(rawInputs.homeAverage) ?? 0;
      const awayAverage = humanPredictions.length
        ? humanPredictions.reduce((sum, row) => sum + row.away, 0) / humanPredictions.length
        : finiteNumber(rawInputs.awayAverage) ?? 0;

      publicExplanation = {
        title: "Como a Maria Vai com as Outras fez este palpite",
        summary: "A Maria reuniu um palpite principal de cada participante humano, calculou a média de gols de cada seleção e arredondou o resultado.",
        inputs: {
          humanPredictions,
          numberOfHumans: humanPredictions.length,
          homeTeamName,
          awayTeamName,
          homeAverage,
          awayAverage,
          roundedPrediction: {
            home: roundHalfUp(homeAverage),
            away: roundHalfUp(awayAverage),
          },
        },
        steps: [],
      };
    } else if (source.botStrategy === "PANGARE") {
      const favoriteSide = rawInputs.favoriteSide === "AWAY" ? "AWAY" : "HOME";
      const favoriteTeamName = favoriteSide === "HOME" ? homeTeamName : awayTeamName;
      const underdogTeamName = favoriteSide === "HOME" ? awayTeamName : homeTeamName;
      const mode = rawInputs.selectedMode;
      const modeCopy = pangareModeCopy(mode);
      const basis = rawInputs.favoriteBasis && typeof rawInputs.favoriteBasis === "object"
        ? rawInputs.favoriteBasis as Record<string, unknown>
        : {};
      const homePot = finiteNumber(basis.homePot);
      const awayPot = finiteNumber(basis.awayPot);
      let favoriteExplanation = `${favoriteTeamName} foi considerado o favorito antes do sorteio do palpite.`;
      if (basis.method === "CARISMA_POT" && homePot !== null && awayPot !== null) {
        favoriteExplanation = `${favoriteTeamName} estava no pote de força superior: ${homeTeamName} no pote ${homePot} e ${awayTeamName} no pote ${awayPot}.`;
      } else if (basis.method === "EXPLICIT_MATCH_CONFIG") {
        favoriteExplanation = `${favoriteTeamName} foi definido como favorito no cadastro da partida.`;
      } else if (basis.method === "DETERMINISTIC_TIEBREAK") {
        favoriteExplanation = homePot !== null && awayPot !== null
          ? `Como ${homeTeamName} e ${awayTeamName} estavam no mesmo pote, um desempate pré-definido escolheu ${favoriteTeamName} como favorito.`
          : `Como não havia diferença suficiente nos potes, um desempate pré-definido escolheu ${favoriteTeamName} como favorito.`;
      }

      publicExplanation = {
        title: "Como o Pangaré fez este palpite",
        summary: "O Pangaré definiu favorito e azarão, sorteou uma de suas três personalidades e depois escolheu um placar compatível com ela.",
        inputs: {
          homeTeamName,
          awayTeamName,
          favoriteTeamName,
          underdogTeamName,
          favoriteExplanation,
          selectedMode: mode,
          selectedModeLabel: typeof rawInputs.selectedModeLabel === "string" ? rawInputs.selectedModeLabel : modeCopy.label,
          selectedModeExplanation: typeof rawInputs.selectedModeExplanation === "string" ? rawInputs.selectedModeExplanation : modeCopy.explanation,
          modeProbabilities: { UNDERDOG: 50, CHAOTIC_DRAW: 30, GOAL_FEST: 20 },
          prediction: source.effectivePrediction,
        },
        steps: [],
      };
    } else {
      publicExplanation = {
        ...publicExplanation,
        inputs: {},
      };
    }

    return NextResponse.json({
      botName: publicBotName,
      botStrategy: source.botStrategy,
      sourceStatus: source.sourceStatus,
      effectivePrediction: source.effectivePrediction,
      publicExplanation,
      match: {
        homeTeamName,
        awayTeamName,
      },
      override: source.override ? {
        originalPrediction: source.override.originalPrediction ?? null,
        finalPrediction: source.override.finalPrediction ?? source.effectivePrediction,
        administratorDisplayName: source.override.administratorDisplayName ?? "Administrador",
        reason: source.override.reason ?? "Palpite informado pelo administrador.",
        overriddenAt: source.override.overriddenAt?.toDate?.().toISOString() ?? null,
      } : undefined,
    });
  } catch (error) {
    if ((error as Error).message === "UNAUTHENTICATED") return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    console.error("bot-source", error);
    return NextResponse.json({ error: "Falha ao carregar a explicação do palpite." }, { status: 500 });
  }
}
