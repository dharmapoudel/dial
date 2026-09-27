# Dial

Your co-pilot DJ for the Car Thing. Spin the knob through **Drives** — living
conversation threads with a DJ that rebuilds the queue as you talk. Fully
offline: generative audio engine, generated sleeve art, no accounts.

- App id (permanent): `b361b7d9-13d8-41f8-b19e-c21662e62d66`
- Device viewport: 800×480 landscape-native (firmware handles portrait rotation)
- Input: knob rotate → wheel events, knob press → Enter, buttons → keys 1–4

## Build

```bash
cd ~/workspace/dial
bun install
bun run build      # app + settings page + dial-<version>.zip
```

`bun run build:app` builds only the app (zip step will refuse without settings.html —
always ship the full build).

## Sideload

Install `dial-0.1.0.zip` from the companion app. Sideload-only until the store
publish is approved.

## Prototype

The desktop simulator bench this was ported from lives at `~/workspace/carthing-dj`.
