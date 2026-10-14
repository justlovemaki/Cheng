# Media architecture

LexiHalo media handling is organized by capabilities rather than four duplicated pipelines.

## Canonical source contract

`src/shared/media-contract.js` owns the wire-compatible source model:

```text
kind:       audio | video
transport:  direct | capture | native-page
```

Legacy fields such as `isAudio`, `url`, `captureId`, `ext`, and `resolution` remain during migration. `sourceKey()` and `merge()` provide transport-aware deduplication. `capabilities(page)` describes generic/browser-readable/audio-only pages.

## Site hooks

`src/video/media-site-hooks.js` materializes all 19 catalogue entries. Sites using only shared DOM/OpenGraph/capture/native behavior have `mode: generic`; seven sites currently use `mode: custom`. A custom hook may implement:

- `pickMedia`
- `snapshot`
- `prepare`
- `observedCandidate`
- capability flags such as `openGraph` and `observedFallback`

`src/video/site-adapters.js` is the site-agnostic orchestrator: DOM/iframe/Video.js discovery, hook invocation, capture merge, cache ownership, ordering, and host placement.

## Platform capabilities

`src/shared/platform-capabilities.js` is the single orchestration registry for specialized/direct-audio/browser-capture/native-page/download capabilities. UI and source resolution query it instead of repeating platform/hostname condition chains.

## Message boundary

`src/shared/media-message-schema.js` validates request IDs, URLs, source discriminators, upload identifiers, counters, and transcription segments before Background dispatch. During compatibility migration it maps `browserSource` to canonical `mediaSource` after validation.

## Media tasks

`src/video/media-task-registry.js` owns page-side lifecycle state:

```text
starting → transferring → processing → finished
                     ↘ cancelling → cancelled
```

It associates request ID, purpose, AbortController, upload ID, and state. `caption-scheduler.js` performs transport but no longer owns an ad-hoc controller map.

`src/background/media-task-manager.js` owns the Background transcription/download/transfer groups plus persistent upload and owner records. It binds uploads to tab, frame, document, page identity, and media resource ID, and migrates old `lexihalo_browser_audio_*` session keys to media terminology. Native Host only receives validated page URLs or bounded media bytes.

## Pipelines

Audio/video and generic/specialized pages share orchestration:

```text
identity → adapter/source discovery → direct or capture transport
         → transcribe (audio extraction + WAV + ASR)
         → download (audio/video remux)
```

Specialized platforms stay outside generic capture for both transcription and download unless their capability explicitly opts in. This prevents tiny page sounds, ads, and telemetry audio responses from appearing as downloadable platform audio. Site hooks contribute data; they do not create independent transfer/download implementations. Internally the transport is named browser media (`lexihaloReadBrowserMedia`); the old browser-audio global/message remains only as a wire-compatible alias.

Native download selection is a strategy registry (`audio`, `pornhub-hls`, `muxed-video`, `split-video-audio`) rather than an inline selector chain.

## Extension points

To add a browser-readable site:

1. Add the platform once to `config/media-platforms.json` with `mode`, media kind, hosts, capabilities, and optional browser routing/CDN policy.
2. Register only necessary hooks in `media-site-hooks.js`.
3. Return canonical sources through the shared `add` callback.
4. Add route, hook, negative-current-item, and browser matrix tests.

Do not add site branches to UI, task transport, HLS reader, or Native import code unless the protocol itself differs.
