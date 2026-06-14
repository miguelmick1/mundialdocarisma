"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  inMemoryPersistence,
  OAuthProvider,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type UserCredential
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";

async function createServerSession(credential: UserCredential) {
  const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
  const { csrfToken } = await csrfResponse.json();
  const idToken = await credential.user.getIdToken(true);
  try {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, csrfToken })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Falha ao criar sessão");
  } finally {
    await signOut(firebaseAuth);
  }
}

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function finish(credential: UserCredential) {
    await createServerSession(credential);
    router.push("/classificacao");
    router.refresh();
  }

  async function social(provider: GoogleAuthProvider | OAuthProvider) {
    setLoading(true); setError(""); setMessage("");
    try {
      await setPersistence(firebaseAuth, inMemoryPersistence);
      await finish(await signInWithPopup(firebaseAuth, provider));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally { setLoading(false); }
  }


  async function resetPassword() {
    setError(""); setMessage("");
    if (!email) { setError("Informe seu e-mail primeiro."); return; }
    setLoading(true);
    try {
      await sendPasswordResetEmail(firebaseAuth, email);
      setMessage("Enviamos as instruções de recuperação para seu e-mail.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a recuperação.");
    } finally { setLoading(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setMessage("");
    try {
      await setPersistence(firebaseAuth, inMemoryPersistence);
      await finish(await signInWithEmailAndPassword(firebaseAuth, email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na autenticação");
    } finally { setLoading(false); }
  }

  return <div className="form-card">
    <div className="eyebrow">Acesso seguro</div>
    <h2>Entre no Mundial do Carisma</h2>
    <p className="muted">As inscrições estão encerradas. O acesso permanece disponível para participantes já cadastrados.</p>
    <button disabled={loading} className="button button-secondary" style={{width:"100%"}} onClick={() => social(new GoogleAuthProvider())}>Continuar com Google</button>
    {process.env.NEXT_PUBLIC_ENABLE_APPLE_AUTH === "true" ? <button disabled={loading} className="button button-secondary" style={{width:"100%", marginTop:10}} onClick={() => social(new OAuthProvider("apple.com"))}>Continuar com Apple</button> : null}
    <div className="divider">ou</div>
    <form onSubmit={submit}>
      <div className="field"><label>E-mail</label><input className="input" type="email" autoComplete="email" value={email} onChange={(e)=>setEmail(e.target.value)} required /></div>
      <div className="field"><label>Senha</label><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e)=>setPassword(e.target.value)} required /></div>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="success">{message}</p> : null}
      <button disabled={loading} className="button button-primary" style={{width:"100%"}} type="submit">{loading ? "Aguarde…" : "Entrar"}</button>
      <button type="button" className="button" style={{width:"100%", background:"transparent", marginTop:6}} onClick={resetPassword}>Esqueci minha senha</button>
    </form>
  </div>;
}
