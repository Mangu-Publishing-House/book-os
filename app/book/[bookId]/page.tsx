"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import { LENGTH_PRESETS, manuscriptMarkdown, stripChapterHeading } from "@/lib/engine";
import { getActiveJob, runForge, stopDrafting, stopForge, subscribeJob, writeFirstDraft } from "@/lib/pipeline";
import { useBookStore } from "@/lib/store";

type Tab = "genome" | "architecture" | "outline" | "manuscript";

export default function BookPage() {
  const params = useParams<{ bookId: string }>();
  const bookId = params.bookId;
  const book = useBookStore((s) => s.books[bookId]);
  const hydrated = useBookStore((s) => s.hydrated);
  const [tab, setTab] = useState<Tab>("genome");
  const job = useSyncExternalStore(subscribeJob, getActiveJob, () => null);

  const tabs = useMemo(() => (
    [
      { id: "genome" as const, label: "Genome" },
      { id: "architecture" as const, label: "Architecture" },
      { id: "outline" as const, label: "Outline" },
      { id: "manuscript" as const, label: "Manuscript" },
    ]
  ), []);

  if (!hydrated) {
    return <main className="wrap"><div className="shimmer" style={{ height: 96 }} /></main>;
  }
  if (!book) {
    return (
      <main className="wrap" style={{ textAlign: "center", paddingTop: 80 }}>
        <p className="wordmark">MANGU · Book Engine</p>
        <h1 className="display" style={{ fontSize: "2rem" }}>This book is not on this device</h1>
        <p className="muted">The genome library is local. Start a new one from the studio.</p>
        <a className="btn" href="/" style={{ marginTop: 16, textDecoration: "none" }}>Back to studio</a>
      </main>
    );
  }

  const title = book.identity?.officialTitle || book.workingTitleHint || "Untitled genome";
  const ready = Boolean(book.identity && book.chapters.length > 0);
  const complete = book.drafts.length > 0 && book.drafts.every((d) => d.status === "done");
  const writing = book.drafts.find((d) => d.status === "writing");
  const done = book.drafts.filter((d) => d.status === "done").slice().sort((a, b) => a.sequence - b.sequence);
  const busyStopping = Boolean(job && job.bookId === book.id && (book.status === "error" || book.status === "genome"));

  return (
    <main>
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: "color-mix(in oklab, var(--ink) 90%, transparent)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(236,232,223,0.08)" }}>
        <div className="wrap" style={{ paddingBottom: 12, paddingTop: 12 }}>
          <div className="row">
            <a href="/" aria-label="Back to studio" className="btn secondary" style={{ width: 44, padding: 0, textDecoration: "none" }}>←</a>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="display" style={{ margin: 0, fontSize: "1.25rem" }}>{title}</p>
              <p className="faint" style={{ margin: 0, fontSize: 12 }}>{book.id} · {LENGTH_PRESETS[book.length].label}{book.identity?.genre ? ` · ${book.identity.genre}` : ""}</p>
            </div>
            {book.status === "forging" ? (
              <button type="button" className="btn secondary" onClick={() => stopForge(book.id)}>Cancel</button>
            ) : book.status === "drafting" ? (
              <button type="button" className="btn secondary" onClick={() => stopDrafting(book.id)}>Stop</button>
            ) : !ready ? (
              <button type="button" className="btn" disabled={Boolean(job)} onClick={() => void runForge(book.id)}>{job ? "Stopping…" : "Forge"}</button>
            ) : complete ? (
              <span className="ok" style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}>Draft complete</span>
            ) : (
              <button type="button" className="btn" disabled={Boolean(job) && busyStopping} onClick={() => { setTab("manuscript"); void writeFirstDraft(book.id); }}>
                {book.drafts.some((d) => d.status === "done") ? "Continue" : "Write draft"}
              </button>
            )}
          </div>
        </div>
      </header>

      {book.status === "forging" ? (
        <div className="banner ink" aria-live="polite">
          <div className="wrap" style={{ paddingTop: 8, paddingBottom: 8 }}>
            <p className="eyebrow" style={{ margin: 0 }}>Forging genome</p>
            <p className="display" style={{ margin: "4px 0 0", fontSize: "1.3rem" }}>
              {book.forgePhase === "outline" ? "Planning the chaptered outline…" : "Building identity, cast, and world…"}
            </p>
          </div>
        </div>
      ) : null}
      {book.status === "drafting" ? (
        <div className="banner ink" aria-live="polite">
          <div className="wrap" style={{ paddingTop: 8, paddingBottom: 8 }}>
            {writing ? `Writing ${writing.title}…` : "Composing first draft…"}
          </div>
        </div>
      ) : null}
      {book.outlineFallback && book.status !== "forging" ? (
        <div className="banner note">Chapter plan used a structural fallback. Review Outline before you write.</div>
      ) : null}
      {book.status === "error" && book.error ? (
        <div className="banner warn" role="alert">
          <div className="wrap row" style={{ justifyContent: "space-between" }}>
            <span>{book.error}</span>
            <button type="button" className="btn secondary" disabled={Boolean(job)} onClick={() => {
              if (!ready) void runForge(book.id);
              else { setTab("manuscript"); void writeFirstDraft(book.id); }
            }}>{job ? "Stopping…" : "Retry"}</button>
          </div>
        </div>
      ) : null}

      <div className="wrap">
        <div className="tabs" role="tablist" aria-label="Book views" style={{ marginBottom: 24 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "genome" && (
          book.identity ? (
            <div>
              <section className="panel">
                <p className="eyebrow">Identity</p>
                <h2 className="display" style={{ fontSize: "2rem", margin: "6px 0 0" }}>{book.identity.officialTitle}</h2>
                <p className="display" style={{ color: "var(--brass)", fontStyle: "italic", fontSize: "1.25rem" }}>{book.identity.logline}</p>
                <p className="muted">{book.identity.genre} · {book.identity.pov} · {book.identity.tone}</p>
              </section>
              <div className="grid-2" style={{ marginTop: 16 }}>
                {book.characters.map((c) => (
                  <article key={c.id} className="panel">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <h3 className="display" style={{ margin: 0, fontSize: "1.4rem" }}>{c.name}</h3>
                      <span className="eyebrow">{c.role}</span>
                    </div>
                    <p className="muted">{c.arc || c.coreDesire}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : <Empty title="Genome not forged" body="Identity, psychology, and world appear here after forging." />
        )}

        {tab === "architecture" && (
          book.architecture ? (
            <div>
              {book.architecture.acts.map((act) => (
                <article key={act.number} className="panel" style={{ marginBottom: 12 }}>
                  <p className="eyebrow">Act {String(act.number).padStart(2, "0")}</p>
                  <h3 className="display" style={{ margin: "4px 0 0", fontSize: "1.5rem" }}>{act.name}</h3>
                  <p className="muted">{act.purpose}</p>
                  {act.turningPoint ? <p><span style={{ color: "var(--brass)" }}>Turn. </span>{act.turningPoint}</p> : null}
                </article>
              ))}
              <div className="grid-3">
                {[["Midpoint", book.architecture.midpoint], ["Climax", book.architecture.climax], ["Resolution", book.architecture.resolution]].map(([label, value]) => (
                  value ? <article key={label} className="panel"><p className="eyebrow">{label}</p><p>{value}</p></article> : null
                ))}
              </div>
            </div>
          ) : <Empty title="No architecture yet" body="Acts, midpoint, and climax arrive with the genome." />
        )}

        {tab === "outline" && (
          book.chapters.length === 0 ? <Empty title="No outline yet" body="Chapter plans arrive with the genome." /> : (
            <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {book.chapters.map((ch) => (
                <li key={ch.id} className="panel">
                  <div className="row">
                    <span className="display" style={{ color: "var(--brass)", fontSize: "1.4rem" }}>{String(ch.sequence).padStart(2, "0")}</span>
                    <div>
                      <div className="display" style={{ fontSize: "1.25rem" }}>{ch.title}</div>
                      <div className="faint" style={{ fontSize: 12 }}>Act {ch.act} · {ch.pov}</div>
                      <p className="muted" style={{ marginBottom: 0 }}>{ch.purpose || ch.synopsis}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )
        )}

        {tab === "manuscript" && (
          done.length === 0 && !writing ? <Empty title="The pages are blank" body="Once the genome is ready, write the first draft." /> : (
            <div>
              {done.length > 0 ? (
                <div className="row" style={{ justifyContent: "flex-end", marginBottom: 12 }}>
                  <button type="button" className="btn secondary" onClick={() => {
                    const blob = new Blob([manuscriptMarkdown(book)], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "manuscript"}.md`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 1500);
                  }}>Markdown</button>
                  <button type="button" className="btn secondary" onClick={() => {
                    const blob = new Blob([JSON.stringify({ schema: "mangu-book-engine-v1", exportedAt: new Date().toISOString(), book }, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "book"}.json`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 1500);
                  }}>JSON</button>
                </div>
              ) : null}
              <article className="paper">
                <header style={{ textAlign: "center" }}>
                  <p className="eyebrow" style={{ color: "var(--brass-ink)" }}>{book.identity?.genre ?? "Manuscript"}</p>
                  <h2 className="display" style={{ fontSize: "2.4rem", margin: "8px 0 0" }}>{title}</h2>
                </header>
                <div style={{ maxWidth: 640, margin: "2.5rem auto 0" }}>
                  {done.map((d) => {
                    const body = stripChapterHeading(d.title, d.text);
                    return (
                      <section key={d.chapterId} style={{ marginBottom: 48 }}>
                        <h3 className="display" style={{ textAlign: "center" }}>{d.title}</h3>
                        <div className="manuscript">
                          {body.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
                        </div>
                      </section>
                    );
                  })}
                  {writing ? <p className="display" style={{ textAlign: "center", color: "var(--brass-ink)" }}>Writing {writing.title}…</p> : null}
                </div>
              </article>
            </div>
          )
        )}
      </div>
    </main>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
      <p className="display" style={{ fontSize: "1.6rem", margin: 0 }}>{title}</p>
      <p className="muted">{body}</p>
    </div>
  );
}
