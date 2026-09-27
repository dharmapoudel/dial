# Changelog

## 0.1.1
- Phone audio probe: the Car Thing has no speaker, so Dial now renders its
  generative tracks to MP3 at build time (OfflineAudioContext, bit-identical
  to the realtime engine) and plays them on the phone via client.player.play.
  The phone fetches `audio/<id>.mp3` over HTTP from the daemon's file server;
  the app discovers a phone-reachable URL via WebRTC ICE (.local preferred).
  6 Midnight Drive tracks rendered (t01–t06); local engine keeps running for
  visuals. Probe build — if the phone plays, the remaining 18 ship in 0.2.0.
- Engine refactor: buildVoice/schedulePulse parameterized for reuse by the
  offline renderer; new renderTrack() export.

## 0.1.0
- First on-device build. Drives crate (5 seeded Drives), DJ conversation threads,
  generative gapless audio engine, generated sleeve art, liquid-chrome stage,
  driving-mode HUD, knob + 4-button + touch input, device voice push-to-talk
  wired to the DJ intent parser, haptic confirmations.
