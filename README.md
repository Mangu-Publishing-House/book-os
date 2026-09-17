# MANGU Book Engine

Feed a synopsis. Forge a genome, outline, and first-draft manuscript.

M1–M8 slice of Mangu Book OS — concept through first draft. Not the full 18-volume operating system.

## Required env

Set this in Vercel (Production + Preview):

```
XAI_API_KEY=...
```

Without it the studio still loads; forge/write return a clear “AI is not available” error.

## Local

```bash
npm install
XAI_API_KEY=... npm run dev
```

Library state lives in the browser (`mangu-book-engine-v1`). Export JSON to move a book between devices.
