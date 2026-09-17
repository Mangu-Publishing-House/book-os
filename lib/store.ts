"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  isLength,
  nextBookId,
  PERSIST_NAME,
  SYNOPSIS_MAX,
  type BookProject,
  type BookStatus,
  type ChapterDraft,
  type LengthTier,
} from "./engine";

type Store = {
  books: Record<string, BookProject>;
  order: string[];
  hydrated: boolean;
  createBook: (input: { synopsis: string; length: LengthTier; workingTitleHint?: string; genreHint?: string }) => BookProject | null;
  updateBook: (id: string, patch: Partial<BookProject>) => void;
  setStatus: (id: string, status: BookStatus, error?: string) => void;
  patchDraft: (id: string, chapterId: string, patch: Partial<ChapterDraft>) => void;
  setDrafts: (id: string, drafts: ChapterDraft[]) => void;
  removeBook: (id: string) => void;
  importBook: (book: BookProject) => { ok: true; id: string } | { ok: false; error: string };
};

function now() {
  return new Date().toISOString();
}

export function recoverInFlight(books: Record<string, BookProject>) {
  const next: Record<string, BookProject> = {};
  for (const [id, raw] of Object.entries(books ?? {})) {
    if (id === "__proto__" || id === "constructor" || !raw || typeof raw !== "object") continue;
    const b = raw;
    const chapters = Array.isArray(b.chapters) ? b.chapters : [];
    const drafts = Array.isArray(b.drafts) ? b.drafts : [];
    const length: LengthTier = isLength(b.length) ? b.length : "short";
    let status = b.status;
    let error = b.error;
    let recoveredDrafts = drafts.map((d) => (d.status === "writing" ? { ...d, status: "pending" as const } : d));
    if (status === "forging") {
      const ready = Boolean(b.identity && chapters.length > 0);
      status = ready ? "genome" : "error";
      error = ready ? undefined : "Forge was interrupted. Retry to continue.";
    } else if (status === "drafting") {
      const allDone = recoveredDrafts.length > 0 && recoveredDrafts.every((d) => d.status === "done");
      status = allDone ? "draft" : "genome";
    }
    next[id] = { ...b, id, length, chapters, drafts: recoveredDrafts, status, error, forgePhase: undefined };
  }
  return next;
}

export const useBookStore = create<Store>()(
  persist(
    (set, get) => ({
      books: {},
      order: [],
      hydrated: false,
      createBook: (input) => {
        if (Object.keys(get().books).length >= 24) return null;
        const id = nextBookId(Object.keys(get().books));
        const book: BookProject = {
          id,
          createdAt: now(),
          updatedAt: now(),
          synopsis: input.synopsis.trim().slice(0, SYNOPSIS_MAX),
          length: input.length,
          workingTitleHint: input.workingTitleHint?.trim() ?? "",
          genreHint: input.genreHint?.trim() ?? "",
          status: "seed",
          identity: null,
          characters: [],
          locations: [],
          architecture: null,
          chapters: [],
          drafts: [],
        };
        set((s) => ({ books: { ...s.books, [id]: book }, order: [id, ...s.order] }));
        return book;
      },
      updateBook: (id, patch) => {
        set((s) => {
          const current = s.books[id];
          if (!current) return s;
          return { books: { ...s.books, [id]: { ...current, ...patch, id, updatedAt: now() } } };
        });
      },
      setStatus: (id, status, error) => {
        get().updateBook(id, { status, error, forgePhase: status === "forging" ? get().books[id]?.forgePhase : undefined });
      },
      setDrafts: (id, drafts) => get().updateBook(id, { drafts }),
      patchDraft: (id, chapterId, patch) => {
        set((s) => {
          const current = s.books[id];
          if (!current) return s;
          return {
            books: {
              ...s.books,
              [id]: {
                ...current,
                updatedAt: now(),
                drafts: current.drafts.map((d) => (d.chapterId === chapterId ? { ...d, ...patch } : d)),
              },
            },
          };
        });
      },
      removeBook: (id) => {
        set((s) => {
          const { [id]: _drop, ...rest } = s.books;
          return { books: rest, order: s.order.filter((x) => x !== id) };
        });
      },
      importBook: (incoming) => {
        if (Object.keys(get().books).length >= 24) return { ok: false, error: "Library is full." };
        const id = nextBookId(Object.keys(get().books));
        const recovered = recoverInFlight({ [id]: { ...incoming, id } })[id];
        if (!recovered) return { ok: false, error: "That archive could not be read." };
        const book = { ...recovered, id, createdAt: now(), updatedAt: now() };
        set((s) => ({ books: { ...s.books, [id]: book }, order: [id, ...s.order] }));
        return { ok: true, id };
      },
    }),
    {
      name: PERSIST_NAME,
      version: 1,
      partialize: (s) => ({ books: s.books, order: s.order }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { books?: Record<string, BookProject>; order?: string[] };
        const books = recoverInFlight(p.books ?? {});
        return { ...current, books, order: Array.isArray(p.order) ? p.order.filter((id) => books[id]) : Object.keys(books) };
      },
      onRehydrateStorage: () => () => {
        useBookStore.setState({ hydrated: true });
      },
    },
  ),
);
