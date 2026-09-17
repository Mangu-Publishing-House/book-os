import { NextResponse } from "next/server";
import {
  extractJson,
  fallbackChapters,
  LENGTH_PRESETS,
  parseChapters,
  parseCore,
  validateForge,
  type LengthTier,
} from "@/lib/engine";

export const maxDuration = 120;

type Kind = "core" | "outline" | "chapter";

async function chat(opts: { system: string; user: string; maxTokens: number; temperature: number; json?: boolean }) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false as const, error: "AI is not available in this environment." };

  const body: Record<string, unknown> = {
    model: "grok-4.5",
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    reasoning_effort: "low",
  };
  if (opts.json) body.response_format = { type: "json_object" };

  let res: Response;
  try {
    res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error.";
    return {
      ok: false as const,
      error: /timeout|aborted/i.test(message) ? "The model took too long. Try forging again." : message,
    };
  }
  if (!res.ok) {
    const status = res.status;
    if (status === 429) return { ok: false as const, error: "The studio is busy. Wait a moment and retry." };
    if (status === 401 || status === 403) return { ok: false as const, error: "AI is not available in this environment." };
    return { ok: false as const, error: "The writing service had a problem. Retry this step." };
  }
  const payload = (await res.json()) as { choices?: { finish_reason?: string; message?: { content?: unknown } }[] };
  const choice = payload.choices?.[0];
  const content = choice?.message?.content;
  const text = typeof content === "string" ? content : "";
  if (!text.trim()) return { ok: false as const, error: "The model returned an empty response." };
  return { ok: true as const, text, finishReason: choice?.finish_reason ?? "stop" };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { kind?: Kind; data?: Record<string, unknown> } | null;
  if (!body?.kind) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  if (body.kind === "core") {
    const check = validateForge(body.data ?? {});
    if (!check.ok) return NextResponse.json(check, { status: 400 });
    const preset = LENGTH_PRESETS[check.length];
    const result = await chat({
      json: true,
      temperature: 0.65,
      maxTokens: 2200,
      system: `You are the Story Architect of the Mangu Book Operating System.
Return ONLY a JSON object. First character is {. No markdown.
Every string is a short phrase, 12 words max.
Hard caps: 3-4 characters, 3 locations, 2 themes, exactly 3 acts.
Keys: identity, characters, locations, themes, architecture.`,
      user: `SYNOPSIS:\n${check.synopsis}\n\nLENGTH: ${preset.label}. Invent a strong original title.`,
    });
    if (!result.ok) return NextResponse.json(result);
    try {
      const core = parseCore(extractJson(result.text, ["identity"]), check.synopsis);
      if (core.identity.officialTitle === "Untitled") {
        return NextResponse.json({ ok: false, error: "Genome was incomplete. Try forging again." });
      }
      return NextResponse.json({ ok: true, ...core });
    } catch {
      return NextResponse.json({ ok: false, error: "Could not parse the genome core. Try forging again." });
    }
  }

  if (body.kind === "outline") {
    const data = body.data ?? {};
    const length = data.length as LengthTier;
    const synopsis = String(data.synopsis ?? "");
    const identity = data.identity as { officialTitle?: string; logline?: string; pov?: string; primaryTheme?: string } | undefined;
    const architecture = data.architecture as { structure?: string; midpoint?: string; climax?: string; resolution?: string; acts?: { number: number; name: string; turningPoint: string }[] } | undefined;
    const characters = Array.isArray(data.characters) ? data.characters as { name: string; role: string }[] : [];
    const locations = Array.isArray(data.locations) ? data.locations as { name: string }[] : [];
    if (!identity?.officialTitle || !architecture) {
      return NextResponse.json({ ok: false, error: "Forge the genome before outlining." }, { status: 400 });
    }
    const preset = LENGTH_PRESETS[length] ?? LENGTH_PRESETS.short;
    const result = await chat({
      json: true,
      temperature: 0.6,
      maxTokens: preset.chapters <= 5 ? 1800 : preset.chapters <= 8 ? 2400 : 3000,
      system: `You are the Chapter Planner of the Mangu Book Operating System.
Return ONLY a JSON object with key chapters. Exactly ${preset.chapters} chapters. Each string ≤ 12 words. No scenes.`,
      user: `Write exactly ${preset.chapters} chapters (~${preset.wordsPerChapter} words each).
TITLE: ${identity.officialTitle}
LOGLINE: ${identity.logline ?? ""}
POV: ${identity.pov ?? ""}
MIDPOINT: ${architecture.midpoint ?? ""}
CLIMAX: ${architecture.climax ?? ""}
CAST: ${characters.map((c) => `${c.name} (${c.role})`).join("; ")}
PLACES: ${locations.map((l) => l.name).join("; ")}
SYNOPSIS:\n${synopsis}`,
    });
    const core = parseCore(
      { identity, characters, locations, architecture },
      synopsis,
    );
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error, usedFallback: true });
    }
    try {
      const parsed = parseChapters(extractJson(result.text, ["chapters"]), length, identity.pov || "Third person limited");
      const usedFallback = parsed.length < preset.chapters;
      const extras = usedFallback ? fallbackChapters(core, length).slice(parsed.length) : [];
      return NextResponse.json({ ok: true, chapters: [...parsed, ...extras].slice(0, preset.chapters), usedFallback });
    } catch {
      return NextResponse.json({ ok: false, error: "Could not parse the outline. Try forging again.", usedFallback: true });
    }
  }

  if (body.kind === "chapter") {
    const data = body.data ?? {};
    const chapter = data.chapter as { sequence?: number; title?: string; act?: number; purpose?: string; synopsis?: string; conflict?: string; openingHook?: string; endingHook?: string; openingEmotion?: string; closingEmotion?: string } | undefined;
    const wordGoal = Math.min(4000, Math.max(200, Number(data.wordGoal) || 850));
    if (!chapter?.title) return NextResponse.json({ ok: false, error: "Missing chapter plan." }, { status: 400 });
    const result = await chat({
      temperature: 0.85,
      maxTokens: Math.min(8000, Math.max(1600, Math.ceil(wordGoal * 1.8) + 400)),
      system: `You are a literary novelist drafting one chapter for the Mangu Book Operating System.
Write finished prose, not an outline. No meta commentary. Aim for approximately ${wordGoal} words.
Output ONLY the chapter prose. Optional: chapter title on the first line.`,
      user: `BOOK: ${data.title}
GENRE: ${data.genre} · TONE: ${data.tone} · VOICE: ${data.voice}
POV: ${data.pov} · STYLE: ${data.narrativeStyle}
LOGLINE: ${data.logline}
THEME: ${data.primaryTheme}
CHAPTER ${chapter.sequence}: ${chapter.title}
Purpose: ${chapter.purpose}
Synopsis: ${chapter.synopsis}
Conflict: ${chapter.conflict}
Open on: ${chapter.openingHook} (${chapter.openingEmotion})
End on: ${chapter.endingHook} (${chapter.closingEmotion})
${data.previousEnding ? `END OF PREVIOUS CHAPTER:\n${String(data.previousEnding).slice(-900)}` : "No previous chapter."}`,
    });
    if (!result.ok) return NextResponse.json(result);
    const text = result.text.trim();
    const words = text.split(/\s+/).filter(Boolean).length;
    if (result.finishReason === "length" && words < wordGoal * 0.35) {
      return NextResponse.json({ ok: false, error: "Chapter was cut short. Retry this chapter." });
    }
    return NextResponse.json({ ok: true, text, wordCount: words });
  }

  return NextResponse.json({ ok: false, error: "Unknown kind." }, { status: 400 });
}
