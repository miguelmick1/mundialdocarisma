import Link from "next/link";
import { getCurrentUser, isAdminUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import LogoutButton from "@/components/LogoutButton";

async function getLiveCount() {
  try {
    const snap = await adminDb.collection("matches").where("status", "in", ["LIVE", "HALFTIME", "EXTRA_TIME"]).get();
    return snap.size;
  } catch { return 0; }
}

export default async function NavBar() {
  const user = await getCurrentUser();
  const [admin, liveCount] = user ? await Promise.all([isAdminUser(user), getLiveCount()]) : [false, 0];
  return <header className="topbar">
    <Link className="brand" href={user ? "/classificacao" : "/"}><span className="brand-mark chocolate-mark">🍫</span><span><b>Mundial Snickers</b><small>DO CARISMA 2026</small></span></Link>
    <nav className="navlinks">
      {user ? <>
        <Link href="/classificacao">Classificação</Link>
        <Link href="/palpites">Palpites</Link>
        <Link href="/resultados" className={liveCount ? "nav-live-link" : undefined}>Resultados{liveCount ? <span className="nav-live-badge">● {liveCount}</span> : null}</Link>
        <Link href="/sorteios">Sorteios</Link>
        <Link href="/bots">Bots</Link>
        <Link href="/regulamento">Regulamento</Link>
        <Link href="/perfil">Meu perfil</Link>
        {admin ? <Link className="admin-nav-link" href="/admin">Admin</Link> : null}
        <LogoutButton />
      </> : <><Link href="/regulamento">Regulamento</Link><Link href="/login">Entrar</Link></>}
    </nav>
  </header>;
}
