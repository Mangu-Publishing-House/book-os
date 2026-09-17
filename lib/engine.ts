export type LengthTier = "short" | "novelette" | "novella";
export type BookStatus = "seed" | "forging" | "genome" | "drafting" | "draft" | "error";

export const SYNOPSIS_MIN = 40;
export const SYNOPSIS_MAX = 8000;
export const PERSIST_NAME = "mangu-book-engine-v1";

export const LENGTH_PRESETS: Record<LengthTier, { label: string; blurb: string; chapters: number; wordsPerChapter: number; totalLabel: string }> = {
  short: { label: "Short story", blurb: "A complete work you can finish in one sitting.", chapters: 5, wordsPerChapter: 850, totalLabel: "~4,000 words" },
  novelette: { label: "Novelette", blurb: "Room for a twist, a world, and a real ending.", chapters: 8, wordsPerChapter: 1100, totalLabel: "~9,000 words" },
  novella: { label: "Novella", blurb: "A full arc with subplots — slower, denser draft.", chapters: 10, wordsPerChapter: 1400, totalLabel: "~14,000 words" },
};

export const SAMPLES = [
  {
    title: "The Night Cartographer",
    genre: "Literary fantasy",
    text: "On the last night of the century, a retired cartographer is hired to draw a map of a city that rearranges its streets while people sleep. The pay is a single key that opens any door — including ones that should stay shut. As dawn approaches, she realizes the city is not moving to hide something. It is moving to find her.",
  },
  {
    title: "Harbor of Unsaid Things",
    genre: "Magical realism",
    text: "A girl who can taste other people's secrets takes a job in a harbor café. When a mute sailor orders the same tea every dawn, she realizes his silence is the only thing keeping a drowned town from coming back. The town wants its names spoken. The sailor will not speak. She has to decide whose hunger she will feed.",
  },
  {
    title: "The Last Seed",
    genre: "Quiet sci-fi",
    text: "An archivist at a climate vault discovers that the last seed of an extinct tree is growing — inside the paper of a banned children's book. Each page that germinates erases a memory from whoever last read it. To save the species she must finish the story. To finish the story she must forget why it mattered.",
  },
];

export type Identity = {
  workingTitle: string;
  officialTitle: string;
  subtitle: string;
  genre: string;
  subgenre: string;
  tone: string;
  voice: string;
  pov: string;
  audience: string;
  logline: string;
  hook: string;
  elevatorPitch: string;
  primaryTheme: string;
  narrativeStyle: string;
  endingType: string;
};

export type Character = { id: string; name: string; role: string; coreDesire: string; lieBelieved: string; arc: string; voice: string; secret: string };
export type Location = { id: string; name: string; type: string; description: string };
export type ChapterPlan = {
  id: string; sequence: number; title: string; act: number; purpose: string; synopsis: string;
  pov: string; openingHook: string; endingHook: string; openingEmotion: string; closingEmotion: string;
  conflict: string; wordGoal: number;
};
export type Architecture = { structure: string; acts: { number: number; name: string; purpose: string; turningPoint: string }[]; midpoint: string; climax: string; resolution: string };
export type ChapterDraft = { chapterId: string; sequence: number; title: string; text: string; wordCount: number; status: "pending" | "writing" | "done" | "error"; error?: string };

export type BookProject = {
  id: string;
  createdAt: string;
  updatedAt: string;
  synopsis: string;
  length: LengthTier;
  workingTitleHint: string;
  genreHint: string;
  status: BookStatus;
  forgePhase?: "core" | "outline";
  forgeEpoch?: number;
  draftEpoch?: number;
  error?: string;
  identity: Identity | null;
  characters: Character[];
  locations: Location[];
  architecture: Architecture | null;
  chapters: ChapterPlan[];
  drafts: ChapterDraft[];
  outlineFallback?: boolean;
};

export function isLength(v: unknown): v is LengthTier {
  return v === "short" || v === "novelette" || v === "novella";
}

export function validateForge(input: { synopsis?: unknown; length?: unknown }) {
  const synopsis = typeof input.synopsis === "string" ? input.synopsis.trim() : "";
  if (synopsis.length < SYNOPSIS_MIN) return { ok: false as const, error: "Synopsis is too short." };
  if (synopsis.length > SYNOPSIS_MAX) return { ok: false as const, error: "Synopsis is too long." };
  if (!isLength(input.length)) return { ok: false as const, error: "Choose a length." };
  return { ok: true as const, synopsis, length: input.length };
}

function asString(value: unknown, fallback = "", max = 400) {
  if (typeof value !== "string") return fallback;
  const s = value.trim();
  return s.length > max ? s.slice(0, max) : s;
}

export function sanitizeJson(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitizeJson);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    out[k] = sanitizeJson(v);
  }
  return out;
}

export function extractJson(text: string, required: string[] = []) {
  const unfenced = text.replace(/```json/gi, "```").replace(/```/g, "\n");
  const start = unfenced.indexOf("{");
  if (start < 0) throw new Error("No JSON object in model output.");
  const slice = unfenced.slice(start);
  const attempts = [slice, slice.replace(/,\s*([}\]])/g, "$1")];
  for (const candidate of attempts) {
    try {
      const parsed = sanitizeJson(JSON.parse(candidate));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && required.every((k) => k in (parsed as object))) {
        return parsed as Record<string, unknown>;
      }
    } catch { /* next */ }
  }
  throw new Error("Invalid JSON");
}

function pad(prefix: string, i: number) {
  return `${prefix}-${String(i + 1).padStart(6, "0")}`;
}

export function parseCore(raw: unknown, synopsis: string) {
  const root = (raw ?? {}) as Record<string, unknown>;
  const ident = (root.identity ?? root) as Record<string, unknown>;
  const working = asString(ident.workingTitle, asString(ident.officialTitle, "Untitled"));
  const identity: Identity = {
    workingTitle: working,
    officialTitle: asString(ident.officialTitle, working),
    subtitle: asString(ident.subtitle),
    genre: asString(ident.genre, "Literary fiction"),
    subgenre: asString(ident.subgenre),
    tone: asString(ident.tone),
    voice: asString(ident.voice),
    pov: asString(ident.pov, "Third person limited"),
    audience: asString(ident.audience, "Adult"),
    logline: asString(ident.logline) || synopsis.slice(0, 220),
    hook: asString(ident.hook),
    elevatorPitch: asString(ident.elevatorPitch),
    primaryTheme: asString(ident.primaryTheme),
    narrativeStyle: asString(ident.narrativeStyle),
    endingType: asString(ident.endingType),
  };
  const charsRaw = Array.isArray(root.characters) ? root.characters : [];
  if (charsRaw.length === 0) throw new Error("Genome was missing a cast.");
  const characters = charsRaw.slice(0, 6).map((item, i) => {
    const c = (item ?? {}) as Record<string, unknown>;
    return {
      id: pad("CHAR", i),
      name: asString(c.name, `Character ${i + 1}`),
      role: asString(c.role, i === 0 ? "Protagonist" : "Supporting"),
      coreDesire: asString(c.coreDesire),
      lieBelieved: asString(c.lieBelieved),
      arc: asString(c.arc),
      voice: asString(c.voice),
      secret: asString(c.secret),
    };
  });
  const locations = (Array.isArray(root.locations) ? root.locations : []).slice(0, 6).map((item, i) => {
    const loc = (item ?? {}) as Record<string, unknown>;
    return { id: pad("LOC", i), name: asString(loc.name, `Location ${i + 1}`), type: asString(loc.type, "Place"), description: asString(loc.description) };
  });
  const arch = (root.architecture ?? {}) as Record<string, unknown>;
  const actsRaw = Array.isArray(arch.acts) ? arch.acts : [];
  const architecture: Architecture = {
    structure: asString(arch.structure, "Three-act"),
    acts: [0, 1, 2].map((i) => {
      const a = (actsRaw[i] ?? {}) as Record<string, unknown>;
      return { number: i + 1, name: asString(a.name, ["Setup", "Confrontation", "Resolution"][i]), purpose: asString(a.purpose), turningPoint: asString(a.turningPoint) };
    }),
    midpoint: asString(arch.midpoint),
    climax: asString(arch.climax),
    resolution: asString(arch.resolution),
  };
  return { identity, characters, locations, architecture };
}

export function parseChapters(raw: unknown, length: LengthTier, pov: string) {
  const root = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(root.chapters) ? root.chapters : Array.isArray(raw) ? raw : [];
  if (list.length === 0) throw new Error("Outline was empty.");
  const preset = LENGTH_PRESETS[length];
  return list.slice(0, preset.chapters).map((item, i) => {
    const ch = (item ?? {}) as Record<string, unknown>;
    const actGuess = i < Math.ceil(preset.chapters * 0.25) ? 1 : i < Math.ceil(preset.chapters * 0.75) ? 2 : 3;
    return {
      id: pad("CH", i),
      sequence: i + 1,
      title: asString(ch.title, `Chapter ${i + 1}`),
      act: [1, 2, 3].includes(Number(ch.act)) ? Number(ch.act) : actGuess,
      purpose: asString(ch.purpose),
      synopsis: asString(ch.synopsis),
      pov: asString(ch.pov, pov),
      openingHook: asString(ch.openingHook),
      endingHook: asString(ch.endingHook),
      openingEmotion: asString(ch.openingEmotion),
      closingEmotion: asString(ch.closingEmotion),
      conflict: asString(ch.conflict),
      wordGoal: preset.wordsPerChapter,
    } satisfies ChapterPlan;
  });
}

export function fallbackChapters(core: ReturnType<typeof parseCore>, length: LengthTier): ChapterPlan[] {
  const n = LENGTH_PRESETS[length].chapters;
  const lead = core.characters[0]?.name ?? "the protagonist";
  return Array.from({ length: n }, (_, i) => ({
    id: pad("CH", i),
    sequence: i + 1,
    title: i === 0 ? "The Job" : i === n - 1 ? "What Remains" : `Chapter ${i + 1}`,
    act: i < Math.ceil(n * 0.25) ? 1 : i < Math.ceil(n * 0.75) ? 2 : 3,
    purpose: core.architecture.acts[(i < Math.ceil(n * 0.25) ? 0 : i < Math.ceil(n * 0.75) ? 1 : 2)].purpose,
    synopsis: `${lead} moves the story forward.`,
    pov: core.identity.pov,
    openingHook: core.identity.hook || `${lead} enters the next room of the problem.`,
    endingHook: "A smaller door closes; a larger one opens.",
    openingEmotion: "forward pressure",
    closingEmotion: "unresolved heat",
    conflict: core.characters[0]?.coreDesire || "The want meets a closed door",
    wordGoal: LENGTH_PRESETS[length].wordsPerChapter,
  }));
}

export function stripChapterHeading(title: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const lines = trimmed.split("\n");
  const first = (lines[0] ?? "").replace(/^#+\s*/, "").trim();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (norm(first) === norm(title) || /^chapter\s+\d+$/i.test(first)) return lines.slice(1).join("\n").trim();
  return trimmed;
}

export function manuscriptMarkdown(book: BookProject) {
  const title = book.identity?.officialTitle || book.workingTitleHint || "Untitled";
  const parts = [`# ${title}`, book.identity?.logline ? `\n> ${book.identity.logline}\n` : ""];
  for (const d of book.drafts.filter((x) => x.status === "done").slice().sort((a, b) => a.sequence - b.sequence)) {
    const body = stripChapterHeading(d.title, d.text);
    if (!body) continue;
    parts.push(`## ${d.title}`, "", body, "");
  }
  return parts.join("\n");
}

export function nextBookId(existing: string[]) {
  let max = 0;
  for (const id of existing) {
    const m = id.match(/^BOOK-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `BOOK-${String(max + 1).padStart(6, "0")}`;
}
