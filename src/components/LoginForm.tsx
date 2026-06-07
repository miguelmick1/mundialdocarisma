"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
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
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, csrfToken })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Falha ao criar sessão");
  await signOut(firebaseAuth);
}

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function finish(credential: UserCredential) {
    await createServerSession(credential);
    router.push("/dashboard");
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
      if (mode === "register") {
        if (password.length < 10) throw new Error("Use uma senha com ao menos 10 caracteres.");
        const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        await finish(credential);
      } else {
        await finish(await signInWithEmailAndPassword(firebaseAuth, email, password));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na autenticação");
    } finally { setLoading(false); }
  }

  return <div className="form-card">
    <div className="eyebrow">Acesso seguro</div>
    <h2>{mode === "login" ? "Entre no Super Bolão" : "Crie sua conta"}</h2>
    <button disabled={loading} className="button button-secondary" style={{width:"100%"}} onClick={() => social(new GoogleAuthProvider())}>Continuar com Google</button>
    {process.env.NEXT_PUBLIC_ENABLE_APPLE_AUTH === "true" ? <button disabled={loading} className="button button-secondary" style={{width:"100%", marginTop:10}} onClick={() => social(new OAuthProvider("apple.com"))}>Continuar com Apple</button> : null}
    <div className="divider">ou</div>
    <form onSubmit={submit}>
      <div className="field"><label>E-mail</label><input className="input" type="email" autoComplete="email" value={email} onChange={(e)=>setEmail(e.target.value)} required /></div>
      <div className="field"><label>Senha</label><input className="input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e)=>setPassword(e.target.value)} required /></div>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="success">{message}</p> : null}
      <button disabled={loading} className="button button-primary" style={{width:"100%"}} type="submit">{loading ? "Aguarde…" : mode === "login" ? "Entrar" : "Cadastrar"}</button>
      {mode === "login" ? <button type="button" className="button" style={{width:"100%", background:"transparent", marginTop:6}} onClick={resetPassword}>Esqueci minha senha</button> : null}
    </form>
    <button className="button" style={{width:"100%", background:"transparent", marginTop:8}} onClick={()=>setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Ainda não tenho conta" : "Já tenho conta"}</button>
  </div>;
}
