# Email GIF Capture

Capture and optimize landing-page mockup animations into email-safe GIFs.

## Outputs

Each run writes the 3 GIFs to both locations:

- `email-templates/assets/`
- `duet-landing/public/email/`

Hosted URLs after landing deploy:

- `https://duetmail.com/email/autodraft-demo.gif`
- `https://duetmail.com/email/inbox-categories-demo.gif`
- `https://duetmail.com/email/agent-chat-demo.gif`

## Run

From `duet-landing/`:

```bash
pnpm run email:gifs
```

Or with an already running dev server on a custom port:

```bash
BASE_URL=http://127.0.0.1:4322 pnpm run email:gifs
```

## Notes

- Requires local tools: `ffmpeg`, `gifsicle`.
- Requires Playwright Chromium (`npx playwright install chromium`).
- Intermediate frames are written under `tmp/gif-capture/` (repo root) and intentionally not cleaned automatically.
