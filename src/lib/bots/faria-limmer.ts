import type { GeneratedBotGuess } from "@/lib/bots/types";
import { sha256 } from "@/lib/utils/hash";

export interface CountryMetrics {
  countryName: string;
  gdpPerCapitaPpp: number;
  gdpYear: number;
  hdi: number;
  hdiYear: number;
}

export interface DatasetBounds {
  minLogGdp: number;
  maxLogGdp: number;
  minHdi: number;
  maxHdi: number;
}

export interface FariaOptions {
  gdpWeight?: number;
  hdiWeight?: number;
  goalScale?: number;
  maxGoals?: number;
  datasetVersion?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalize(value: number, min: number, max: number): number {
  if (max <= min) throw new Error("Intervalo de normalização inválido");
  return clamp((value - min) / (max - min), 0, 1);
}

export function calculateFariaIndex(metrics: CountryMetrics, bounds: DatasetBounds, options: FariaOptions = {}) {
  const gdpWeight = options.gdpWeight ?? 0.5;
  const hdiWeight = options.hdiWeight ?? 0.5;
  if (Math.abs(gdpWeight + hdiWeight - 1) > 0.000001) {
    throw new Error("Os pesos do Faria Limmer devem somar 1");
  }
  if (metrics.gdpPerCapitaPpp <= 0) throw new Error("PIB per capita PPP inválido");
  if (metrics.hdi <= 0 || metrics.hdi > 1) throw new Error("IDH inválido");

  const normalizedGdp = normalize(Math.log(metrics.gdpPerCapitaPpp), bounds.minLogGdp, bounds.maxLogGdp);
  const normalizedHdi = normalize(metrics.hdi, bounds.minHdi, bounds.maxHdi);
  const index = gdpWeight * normalizedGdp + hdiWeight * normalizedHdi;
  const baseGoals = Math.round(index * (options.goalScale ?? 4));
  return { normalizedGdp, normalizedHdi, index, baseGoals };
}

export function generateFariaLimmerGuess(
  home: CountryMetrics,
  away: CountryMetrics,
  bounds: DatasetBounds,
  options: FariaOptions = {}
): GeneratedBotGuess {
  const maxGoals = options.maxGoals ?? 5;
  const homeCalc = calculateFariaIndex(home, bounds, options);
  const awayCalc = calculateFariaIndex(away, bounds, options);
  let homeGoals = homeCalc.baseGoals;
  let awayGoals = awayCalc.baseGoals;

  if (homeGoals === awayGoals && Math.abs(homeCalc.index - awayCalc.index) > 0.000001) {
    if (homeCalc.index > awayCalc.index) homeGoals = Math.min(maxGoals, homeGoals + 1);
    else awayGoals = Math.min(maxGoals, awayGoals + 1);
  }

  const inputs = { home, away, bounds, options };
  const prediction = { home: homeGoals, away: awayGoals };
  return {
    prediction,
    source: {
      botStrategy: "FARIA_LIMMER",
      strategyVersion: "1.0.0",
      automaticPrediction: prediction,
      effectivePrediction: prediction,
      sourceStatus: "AUTOMATIC",
      publicExplanation: {
        title: "Como o Faria Limmer calculou este palpite",
        summary: "PIB per capita PPP e IDH foram normalizados, combinados em pesos iguais e convertidos em gols.",
        inputs: {
          homeCountry: home,
          awayCountry: away,
          datasetBounds: bounds,
          weights: { gdp: options.gdpWeight ?? 0.5, hdi: options.hdiWeight ?? 0.5 }
        },
        steps: [
          { order: 1, label: `${home.countryName}: PIB normalizado`, formula: "(ln(PIB)-mín)/(máx-mín)", value: homeCalc.normalizedGdp.toFixed(4), explanation: "O logaritmo reduz o efeito de valores extremos." },
          { order: 2, label: `${home.countryName}: IDH normalizado`, formula: "(IDH-mín)/(máx-mín)", value: homeCalc.normalizedHdi.toFixed(4), explanation: "O IDH é comparado entre as seleções classificadas." },
          { order: 3, label: `${home.countryName}: índice composto`, formula: "50% PIB + 50% IDH", value: homeCalc.index.toFixed(4), explanation: "Quanto maior o índice, maior o número de gols." },
          { order: 4, label: `${away.countryName}: índice composto`, formula: "50% PIB + 50% IDH", value: awayCalc.index.toFixed(4), explanation: "Mesma fórmula aplicada à seleção adversária." },
          { order: 5, label: "Conversão em placar", formula: "arredondar(índice × 4)", value: `${homeGoals} x ${awayGoals}`, explanation: "Em empate de gols-base, o maior índice recebe um gol adicional." }
        ],
        sources: [
          { name: "Banco Mundial — PIB per capita PPP", referenceDate: String(home.gdpYear), datasetVersion: options.datasetVersion ?? "2026-v1", sourceUrl: "https://data.worldbank.org/indicator/NY.GDP.PCAP.PP.CD" },
          { name: "PNUD — Índice de Desenvolvimento Humano", referenceDate: String(home.hdiYear), datasetVersion: options.datasetVersion ?? "2026-v1", sourceUrl: "https://hdr.undp.org/data-center/human-development-index" }
        ]
      },
      verification: {
        inputHash: sha256(inputs),
        calculationHash: sha256({ inputs, prediction, version: "1.0.0" })
      }
    }
  };
}
