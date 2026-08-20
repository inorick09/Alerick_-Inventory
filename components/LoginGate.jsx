"use client";

import { useState, useEffect } from "react";
import { Sparkles, LogOut, Lock } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import InventarioApp from "./InventarioApp";

export default function LoginGate() {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesión
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      setError("Correo o contraseña incorrectos.");
    } else {
      setPassword("");
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (session === undefined) {
    return (
      <div style={styles.loadingScreen}>
        <style>{fontImport}</style>
        <Sparkles size={28} color="#C79A3C" />
        <p style={{ marginTop: 12, color: "#8B6B76", fontFamily: "Poppins, sans-serif" }}>Cargando…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={styles.wrap}>
        <style>{fontImport}</style>
        <form style={styles.card} onSubmit={handleLogin}>
          <div style={styles.brandRow}>
            <div style={styles.compact}><Lock size={16} color="#FFF8F5" /></div>
            <div>
              <h1 style={styles.brandTitle}>Alerick Glam</h1>
              <p style={styles.brandSub}>Inicia sesión para continuar</p>
            </div>
          </div>

          <label style={styles.label}>Correo</label>
          <input
            style={styles.input}
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
          />

          <label style={{ ...styles.label, marginTop: 12 }}>Contraseña</label>
          <input
            style={styles.input}
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          {error && <div style={styles.errorBanner}>{error}</div>}

          <button style={styles.primaryBtn} type="submit" disabled={submitting}>
            {submitting ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button style={styles.logoutBtn} onClick={handleLogout} title={session.user?.email}>
        <LogOut size={14} />
        <span>{session.user?.email}</span>
      </button>
      <InventarioApp />
    </div>
  );
}

const fontImport = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Poppins:wght@400;500;600&display=swap');`;

const styles = {
  loadingScreen: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    minHeight: "100vh", background: "#FBF3F1",
  },
  wrap: {
    display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh",
    background: "#FBF3F1", fontFamily: "'Poppins', sans-serif", padding: 20, boxSizing: "border-box",
  },
  card: {
    background: "#FFFFFF", border: "1px solid #EEDEE0", borderRadius: 16, padding: 28,
    width: "100%", maxWidth: 360, boxShadow: "0 4px 16px rgba(59,42,51,0.08)",
    display: "flex", flexDirection: "column",
  },
  brandRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 22 },
  compact: {
    width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#D9678C,#C79A3C)",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  brandTitle: { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, margin: 0, color: "#B84C71" },
  brandSub: { margin: 0, fontSize: 13, color: "#8B6B76" },
  label: { fontSize: 12, color: "#8B6B76", fontWeight: 500, marginBottom: 6 },
  input: {
    border: "1px solid #EEDEE0", borderRadius: 8, padding: "10px 12px", fontSize: 14,
    fontFamily: "'Poppins', sans-serif", background: "#FBF3F1", color: "#3B2A33",
    outline: "none", width: "100%", boxSizing: "border-box", marginBottom: 4,
  },
  errorBanner: {
    marginTop: 12, padding: "10px 12px", background: "#FDECEC", color: "#B4453F",
    borderRadius: 8, fontSize: 13,
  },
  primaryBtn: {
    marginTop: 20, background: "#D9678C", color: "#fff", border: "none", borderRadius: 9,
    padding: "11px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer",
    fontFamily: "'Poppins', sans-serif",
  },
  logoutBtn: {
    position: "fixed", top: 14, right: 20, zIndex: 50,
    display: "flex", alignItems: "center", gap: 6,
    background: "#FFFFFF", border: "1px solid #EEDEE0", color: "#8B6B76",
    borderRadius: 20, padding: "7px 12px", fontSize: 12, cursor: "pointer",
    fontFamily: "'Poppins', sans-serif", boxShadow: "0 1px 4px rgba(59,42,51,0.08)",
  },
};
