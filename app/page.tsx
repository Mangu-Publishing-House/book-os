"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LENGTH_PRESETS, SAMPLES, SYNOPSIS_MAX, SYNOPSIS_MIN, type LengthTier } from "@/lib/engine";
import { runForge } from "@/lib/pipeline";
import { useBookStore } from "@/lib/store";

export default function Home() {
  const router = useRouter();
  const books = useBookStore((s) => s.books);
  const order = useBookStore((s) => s.order);
  const hydrated = useBookStore((s) => s.hydrated);
  const createBook = useBookStore((s) => s.createBook);
  const removeBook = useBookStore((s) => s.removeBook);
  const importBook = useBookStore((s) => s.importBook);

  const [synopsis, setSynopsis] = useState("");
  const [length, setLength] = useState<LengthTier>("short");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const lock = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!useBookStore.getState().hydrated) useBookStore.setState({ hydrated: true });
    }, 800);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!confirmId) return;
    const t = window.setTimeout(() => setConfirmId(null), 4000);
    return () => window.clearTimeout(t);
  }, [confirmId]);

  const ready = synopsis.trim().length >= SYNOPSIS_MIN && synopsis.trim().length <= SYNOPSIS_MAX && !busy;

  function onForge() {
    if (!ready || lock.current) return;
    lock.current = true;
    setBusy(true);
    const book = createBook({ synopsis, length, workingTitleHint: title, genreHint: genre });
    if (!book) {
      lock.current = false;
      setBusy(false);
      return;
    }
    router.push(`/book/${book.id}`);
    void runForge(book.id).finally(() => {
      lock.current = false;
      setBusy(false);
    });
  }

  return (
    <main style={{ position: "relative", minHeight: "100dvh" }}>
      <div className="hero-glow" />
      <div className="wrap" style={{ position: "relative" }}>
        <header className="row" style={{ justifyContent: "space-between" }}>
          <div className="wordmark">MANGU · Book Engine</div>
          <span className="faint" style={{ fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase" }}>Vol. 0 · Forge</span>
        </header>

        <section style={{ marginTop: "3rem" }}>
          <p className="eyebrow">Book operating system</p>
          <h1 className="display" style={{ fontSize: "clamp(2.4rem, 6vw, 3.7rem)", lineHeight: 1.05, margin: "0.6rem 0 0" }}>
            Feed a synopsis.<br />Forge a manuscript.
          </h1>
          <p className="muted" style={{ maxWidth: 520, marginTop: 16, fontSize: "1.05rem" }}>
            A working slice of Mangu Book OS — concept through first draft. Structured genome first, prose second.
          </p>
        </section>

        <section className="panel" style={{ marginTop: 36 }}>
          <div style={{ background: "var(--ink)", borderRadius: 16, padding: 16 }}>
            <label htmlFor="synopsis" className="eyebrow">Synopsis</label>
            <textarea
              id="synopsis"
              className="field"
              value={synopsis}
              maxLength={SYNOPSIS_MAX}
              onChange={(e) => setSynopsis(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onForge(); }}
              placeholder="A retired cartographer is hired to map a city that rearranges itself after midnight…"
              style={{ marginTop: 8 }}
            />
            <div className="row faint" style={{ justifyContent: "space-between", fontSize: 12, marginTop: 8 }}>
              <span>{synopsis.trim().length} characters · 40+ to forge</span>
              {synopsis.trim().length > 0 && synopsis.trim().length < SYNOPSIS_MIN ? <span>A little more detail, please</span> : null}
            </div>
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            {SAMPLES.map((s) => (
              <button key={s.title} type="button" className="chip" onClick={() => { setSynopsis(s.text); setTitle(s.title); setGenre(s.genre); }}>
                Try: {s.title}
              </button>
            ))}
          </div>

          <div className="grid-3" style={{ marginTop: 16 }} role="radiogroup" aria-label="Length">
            {(Object.keys(LENGTH_PRESETS) as LengthTier[]).map((key) => {
              const preset = LENGTH_PRESETS[key];
              return (
                <button key={key} type="button" className="tile" aria-pressed={length === key} onClick={() => setLength(key)}>
                  <div className="display" style={{ fontSize: "1.2rem", color: "var(--fg)" }}>{preset.label}</div>
                  <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{preset.totalLabel}</div>
                  <div style={{ fontSize: 12, marginTop: 8 }}>{preset.blurb}</div>
                </button>
              );
            })}
          </div>

          <div className="grid-2" style={{ marginTop: 16 }}>
            <div>
              <label className="eyebrow faint" htmlFor="title">Working title <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
              <input id="title" className="field" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Leave blank to invent one" style={{ marginTop: 6 }} />
            </div>
            <div>
              <label className="eyebrow faint" htmlFor="genre">Genre hint <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
              <input id="genre" className="field" value={genre} maxLength={80} onChange={(e) => setGenre(e.target.value)} placeholder="Literary fantasy, quiet sci-fi…" style={{ marginTop: 6 }} />
            </div>
          </div>

          <div className="row" style={{ marginTop: 18, justifyContent: "space-between" }}>
            <p className="faint" style={{ fontSize: 12, maxWidth: 360 }}>
              The engine forges identity, characters, architecture, and a chaptered outline — then writes the draft, one chapter at a time.
            </p>
            <button type="button" className="btn" disabled={!ready} onClick={onForge}>
              {busy ? "Forging" : "Forge genome →"}
            </button>
          </div>
        </section>

        <section style={{ marginTop: 48 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h2 className="display" style={{ margin: 0, fontSize: "1.6rem" }}>Library</h2>
            <div className="row">
              <input ref={fileRef} type="file" accept="application/json" hidden onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  const raw = JSON.parse(await file.text());
                  const book = raw.book ?? raw;
                  const result = importBook(book);
                  if (!result.ok) alert(result.error);
                } catch {
                  alert("That file is not a Book Engine archive.");
                }
              }} />
              <button type="button" className="btn secondary" onClick={() => fileRef.current?.click()}>Import archive</button>
              <span className="faint" style={{ fontSize: 12 }}>Stored on this device</span>
            </div>
          </div>
          {!hydrated ? <div className="shimmer" style={{ height: 128 }} /> : order.length === 0 ? (
            <div className="panel" style={{ textAlign: "center", padding: "2.5rem 1.5rem" }}>
              <p className="display" style={{ fontSize: "1.6rem", margin: 0 }}>No manuscripts yet</p>
              <p className="muted" style={{ marginTop: 8 }}>Feed a synopsis above. The genome library lives on this device.</p>
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
              {order.map((id) => {
                const book = books[id];
                if (!book) return null;
                const name = book.identity?.officialTitle || book.workingTitleHint || "Untitled genome";
                return (
                  <li key={id} style={{ position: "relative" }}>
                    <a href={`/book/${id}`} className="panel" style={{ display: "block", textDecoration: "none", paddingRight: 56 }}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <p className="display" style={{ margin: 0, fontSize: "1.35rem" }}>{name}</p>
                        <span className="faint" style={{ fontSize: 11, textTransform: "uppercase" }}>{book.status}</span>
                      </div>
                      <p className="muted" style={{ margin: "8px 0 0", fontSize: 14 }}>{book.synopsis.slice(0, 180)}</p>
                    </a>
                    <button
                      type="button"
                      className={confirmId === id ? "btn danger" : "btn secondary"}
                      style={{ position: "absolute", right: 12, bottom: 12, height: 44, width: confirmId === id ? "auto" : 44, padding: confirmId === id ? "0 12px" : 0 }}
                      onClick={() => {
                        if (confirmId === id) { removeBook(id); setConfirmId(null); }
                        else setConfirmId(id);
                      }}
                    >
                      {confirmId === id ? "Delete?" : "×"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
