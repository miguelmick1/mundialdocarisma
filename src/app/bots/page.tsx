import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import BotSourceDrawer from "@/components/BotSourceDrawer";
import { getCurrentUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { botDisplayName } from "@/lib/bots/identities";
import { processAutomaticBotGuessesSafely } from "@/lib/bots/automation";

export const dynamic = "force-dynamic";

export default async function BotsPage() {
  if (!(await getCurrentUser())) redirect("/login");
  await processAutomaticBotGuessesSafely();
  const snap = await adminDb.collection("guesses").where("source", "in", ["BOT_AUTOMATIC","ADMIN_OVERRIDE"]).limit(24).get();
  const guesses = snap.docs.map((doc) => { const data = doc.data(); return { id: doc.id, ...data, participantName: botDisplayName({ id: String(data.participantId ?? ""), fallback: String(data.participantName ?? "Bot") }) }; });
  return <div className="shell"><NavBar /><main className="container">
    <div className="section-head"><div><div className="eyebrow">Transparência</div><h2>Bots e fontes dos palpites</h2><p className="muted">A memória só é aberta depois do início da partida.</p></div></div>
    {guesses.length===0?<div className="card">Ainda não há palpites liberados. Maria e Pangaré serão gerados após o início das partidas; Betinho Everyday e Transbot serão preenchidos manualmente pelo administrador.</div>:<div className="grid">{guesses.map((guess:any)=><article className="card" key={guess.id}><div className="badge badge-gold">{guess.participantName}</div><h3 style={{fontSize:30,margin:"18px 0"}}>{guess.homeScore} × {guess.awayScore}</h3><p className="muted">Jogo: {guess.matchId}</p><BotSourceDrawer guessId={guess.id}/></article>)}</div>}
  </main></div>;
}
