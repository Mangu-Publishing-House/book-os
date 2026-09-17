"use client";

import { validateForge, type BookProject, type ChapterDraft } from "./engine";
import { useBookStore } from "./store";

let job: { bookId: string; kind: "forge" | "draft"; token: number } | null = null;
let seq = 0;
const listeners = new Set<() => void>();
function emit() { for (const fn of listeners) fn(); }
export function subscribeJob(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
export function getActiveJob() { return job; }
function acquire(bookId: string, kind: "forge" | "draft") {
  if (job) return null;
  seq += 1;
  job = { bookId, kind, token: seq };
  emit();
  return seq;
}
function release(token: number) {
  if (job?.token === token) { job = null; emit(); }
}

async function callAi(kind: "core" | "outline" | "chapter", data: unknown) {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, data }),
  });
  return (await res.json()) as Record<string, unknown>;
}

export async function runForge(bookId: string) {
  const store = useBookStore.getState();
  const book = store.books[bookId];
  if (!book || book.status === "forging" || book.status === "drafting") return;
  const token = acquire(bookId, "forge");
  if (token == null) return;
  const check = validateForge({ synopsis: book.synopsis, length: book.length });
  if (!check.ok) {
    store.setStatus(bookId, "error", check.error);
    release(token);
    return;
  }
  const resume = Boolean(book.identity && book.architecture && book.chapters.length === 0);
  const epoch = (book.forgeEpoch ?? 0) + 1;
  store.updateBook(bookId, {
    status: "forging",
    error: undefined,
    forgePhase: resume ? "outline" : "core",
    forgeEpoch: epoch,
    outlineFallback: undefined,
    ...(resume ? {} : { identity: null, characters: [], locations: [], architecture: null, chapters: [], drafts: [] }),
  });
  const mine = () => {
    const b = useBookStore.getState().books[bookId];
    return Boolean(b && b.status === "forging" && b.forgeEpoch === epoch);
  };
  try {
    let identity = book.identity;
    let characters = book.characters;
    let locations = book.locations;
    let architecture = book.architecture;
    if (!resume) {
      const core = await callAi("core", {
        synopsis: check.synopsis,
        length: check.length,
        workingTitle: book.workingTitleHint,
        genre: book.genreHint,
      });
      if (!mine()) return;
      if (!core.ok) {
        store.setStatus(bookId, "error", String(core.error ?? "Forge failed."));
        return;
      }
      identity = core.identity as BookProject["identity"];
      characters = core.characters as BookProject["characters"];
      locations = core.locations as BookProject["locations"];
      architecture = core.architecture as BookProject["architecture"];
      store.updateBook(bookId, { identity, characters, locations, architecture, forgePhase: "outline" });
    }
    const outline = await callAi("outline", {
      synopsis: check.synopsis,
      length: check.length,
      identity,
      characters,
      locations,
      architecture,
    });
    if (!mine()) return;
    if (!outline.ok) {
      store.setStatus(bookId, "error", String(outline.error ?? "Outline failed."));
      return;
    }
    const chapters = outline.chapters as BookProject["chapters"];
    store.updateBook(bookId, {
      status: "genome",
      forgePhase: undefined,
      outlineFallback: Boolean(outline.usedFallback) || undefined,
      chapters,
      drafts: chapters.map((ch) => ({
        chapterId: ch.id,
        sequence: ch.sequence,
        title: ch.title,
        text: "",
        wordCount: 0,
        status: "pending" as const,
      })),
    });
  } catch (err) {
    if (!mine()) return;
    store.setStatus(bookId, "error", err instanceof Error ? err.message : "Forge failed.");
  } finally {
    release(token);
  }
}

export function stopForge(bookId: string) {
  const book = useBookStore.getState().books[bookId];
  if (!book || book.status !== "forging") return;
  useBookStore.getState().updateBook(bookId, {
    status: "error",
    error: "Forge cancelled.",
    forgePhase: undefined,
    forgeEpoch: (book.forgeEpoch ?? 0) + 1,
  });
}

export async function writeFirstDraft(bookId: string) {
  const store = useBookStore.getState();
  const book = store.books[bookId];
  if (!book || book.status === "drafting") return;
  if (!book.identity || book.chapters.length === 0) {
    store.setStatus(bookId, "error", "Forge the genome before drafting.");
    return;
  }
  const token = acquire(bookId, "draft");
  if (token == null) return;
  const byId = new Map(book.drafts.map((d) => [d.chapterId, d]));
  const drafts: ChapterDraft[] = book.chapters.map((ch) => byId.get(ch.id) ?? {
    chapterId: ch.id, sequence: ch.sequence, title: ch.title, text: "", wordCount: 0, status: "pending",
  });
  store.setDrafts(bookId, drafts);
  const start = drafts.findIndex((d) => d.status !== "done");
  if (start < 0) {
    store.setStatus(bookId, "draft");
    release(token);
    return;
  }
  const epoch = (book.draftEpoch ?? 0) + 1;
  store.updateBook(bookId, { status: "drafting", error: undefined, draftEpoch: epoch });
  const mine = () => {
    const b = useBookStore.getState().books[bookId];
    return Boolean(b && b.status === "drafting" && b.draftEpoch === epoch);
  };
  try {
    for (let i = start; i < book.chapters.length; i++) {
      const latest = useBookStore.getState().books[bookId];
      if (!latest || !mine()) return;
      const chapter = latest.chapters[i];
      const identity = latest.identity;
      if (!chapter || !identity) {
        store.setStatus(bookId, "error", "Chapter plan is missing. Re-forge the outline.");
        return;
      }
      store.patchDraft(bookId, chapter.id, { status: "writing", error: undefined });
      const previous = latest.drafts.filter((d) => d.status === "done" && d.sequence < chapter.sequence).sort((a, b) => b.sequence - a.sequence)[0];
      const result = await callAi("chapter", {
        title: identity.officialTitle,
        genre: identity.genre,
        tone: identity.tone,
        voice: identity.voice,
        pov: chapter.pov || identity.pov,
        logline: identity.logline,
        primaryTheme: identity.primaryTheme,
        narrativeStyle: identity.narrativeStyle,
        chapter,
        previousEnding: previous?.text ?? "",
        wordGoal: chapter.wordGoal,
      });
      const after = useBookStore.getState().books[bookId];
      if (!after) return;
      if (after.draftEpoch !== epoch) {
        if (result.ok && after.drafts.find((d) => d.chapterId === chapter.id)?.status !== "done") {
          store.patchDraft(bookId, chapter.id, { status: "done", text: String(result.text), wordCount: Number(result.wordCount) || 0 });
        }
        return;
      }
      if (!result.ok) {
        store.patchDraft(bookId, chapter.id, { status: "error", error: String(result.error) });
        store.setStatus(bookId, "error", String(result.error));
        return;
      }
      store.patchDraft(bookId, chapter.id, { status: "done", text: String(result.text), wordCount: Number(result.wordCount) || 0, error: undefined });
      const done = useBookStore.getState().books[bookId];
      if (done && done.drafts.length === done.chapters.length && done.drafts.every((d) => d.status === "done")) {
        store.setStatus(bookId, "draft");
        return;
      }
    }
    const finished = useBookStore.getState().books[bookId];
    if (finished?.status === "drafting") store.setStatus(bookId, "genome");
  } finally {
    release(token);
  }
}

export function stopDrafting(bookId: string) {
  const book = useBookStore.getState().books[bookId];
  if (!book) return;
  const drafts = book.drafts.map((d) => (d.status === "writing" ? { ...d, status: "pending" as const } : d));
  const complete = drafts.length > 0 && drafts.every((d) => d.status === "done");
  useBookStore.getState().updateBook(bookId, {
    status: complete ? "draft" : "genome",
    drafts,
    draftEpoch: (book.draftEpoch ?? 0) + 1,
    error: undefined,
  });
}
