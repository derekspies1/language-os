# Language OS for Even G2

This is the official thin Even Realities G2 client for Language OS. It was migrated from the physically validated Personal HUD / Language Glance experiment and remains a standalone Even Hub application inside the Language OS repository.

It contains no learner memory, recommendation logic, persistence, accounts, database access, external APIs, AI calls, or microphone features. `src/learning-feed.ts` is the typed seam for a future public Language OS feed adapter; `src/local-fixture.ts` supplies the current offline 20-item Korean fallback.

## Validated Language Glance flow

One press advances through:

1. Korean only—pause and attempt retrieval.
2. Korean plus a concise natural meaning.
3. Korean plus a learner breakdown.
4. The next item, reset to Korean only.

Glasses Swipe Up/Down still changes HUD modes and Double Click exits. The R1 experiment adds item-level Up/Down navigation without making the ring mandatory.

## Experimental two-tier input policy

The app remains fully usable in either configuration:

| Controller | Gesture | Language Glance behavior |
|---|---|---|
| R1 ring | Click | Korean → meaning → breakdown → next |
| R1 ring | Swipe Up | Previous item, reset to Korean-only |
| R1 ring | Swipe Down | Next item, reset to Korean-only |
| R1 ring | Double Click | System exit |
| G2 glasses | Click | Same reveal/advance flow |
| G2 glasses | Swipe Up / Down | Previous / next HUD mode |
| G2 glasses | Double Click | System exit |

`src/input-policy.ts` translates SDK events into `reveal`, `previousItem`, `nextItem`, `previousMode`, `nextMode`, or `exit`. The HUD state machine receives only those semantic actions and has no dependency on R1, left-temple, or right-temple sources.

SDK 0.0.12 reports the R1 as `TOUCH_EVENT_FROM_RING` (`2`) in `Sys_ItemEvent.eventSource`. Gesture type is `eventType`. Development builds log each normalized gesture, source, numeric source value, and resolved action to the WebView console. Nothing diagnostic is rendered on the glasses.

This mapping is not final until physical testing confirms reliable source attribution for R1 click, Swipe Up, and Swipe Down. Source-less events retain the glasses fallback policy.

## Install, test, and build

Prerequisites: Node.js 20 LTS or Node.js 22+, npm, and (for hardware) current G2 firmware and the Even Realities phone app.

```bash
cd /Users/derekspies/Projects/language-os/clients/even-g2
npm install
npm test
npm run build
```

The client owns its package manifest, lockfile, TypeScript configuration, Vite configuration, dependencies, tests, build output, simulator commands, and Even Hub manifest. The root Language OS build neither bundles nor type-checks it; the root convenience scripts only delegate into this directory.

## Desktop simulator

Open two terminals:

```bash
cd /Users/derekspies/Projects/language-os/clients/even-g2
npm run dev
```

```bash
cd /Users/derekspies/Projects/language-os/clients/even-g2
npm run simulate
```

Use Down once to enter Language mode, then Click repeatedly to verify Korean → meaning → breakdown → next. Up/Down switch modes; Double Click exits.

For automation and screenshots, replace the second command with:

```bash
npm run simulate:automation
```

The local control server is `http://127.0.0.1:9898`. It supports:

```bash
curl http://127.0.0.1:9898/api/ping
curl -X POST http://127.0.0.1:9898/api/input \
  -H 'content-type: application/json' \
  -d '{"action":"down"}'
curl -X POST http://127.0.0.1:9898/api/input \
  -H 'content-type: application/json' \
  -d '{"action":"click"}'
curl http://127.0.0.1:9898/api/console
curl http://127.0.0.1:9898/api/screenshot/glasses \
  -o simulator-artifacts/language-glance.png
```

The simulator is a layout and logic check, not a substitute for physical validation.

## Physical G2 Prototype Mode

1. Pair the G2 with the current Even Realities phone app and install current firmware.
2. Sign in at [Even Hub](https://hub.evenrealities.com/login) with the same account if Developer Mode is not already enabled.
3. Start Vite:

   ```bash
   cd /Users/derekspies/Projects/language-os/clients/even-g2
   npm run dev
   ```

4. Copy the LAN `Network` URL printed by Vite. In a second terminal, generate its QR code:

   ```bash
   cd /Users/derekspies/Projects/language-os/clients/even-g2
   npx evenhub qr --url "http://<your-lan-ip>:5173"
   ```

5. In the phone app go to **Even Hub → developer icon → Developer Mode → Prototype Mode → Scan QR**.
6. Scan the terminal QR and open Language OS Glance on the glasses.

The phone and computer must share a LAN. If the QR scans but loading fails, check the computer firewall and Wi-Fi client/AP isolation. Vite deliberately binds to the LAN; use a trusted network.

## Package an EHPK

```bash
cd /Users/derekspies/Projects/language-os/clients/even-g2
npm run pack
```

This writes `language-os-even-g2.ehpk`. Before a public submission, decide whether to retain the validated prototype package ID `com.derekspies.personalhud` or register a new permanent Language OS ID, then check availability with:

```bash
npx evenhub pack app.json dist -c
```

## R1 physical validation checklist

- Confirm each Click advances exactly one reveal stage.
- Confirm Swipe Up reliably selects the previous item and resets it to Korean-only.
- Confirm Swipe Down reliably selects the next item and resets it to Korean-only.
- Test wraparound: Swipe Up on item 1 reaches item 20; Swipe Down on item 20 reaches item 1.
- Watch for accidental clicks, double clicks, or repeated swipes.
- In development diagnostics, confirm ring events report `ring` / source value `2` and glasses events report the appropriate glasses source.
- Confirm glasses Click and mode swipes still work with the ring idle or disconnected.
- Compare whether the ring feels preferable to repeatedly touching the glasses during a full deck session.

## Future Language OS adapter concerns

- The feed needs stable opaque item IDs, schema/version negotiation, bounds, and explicit target-language metadata.
- Recommendation and progress writes must remain server-owned. The client should report typed interaction events rather than mutate learner records.
- Define offline/cache semantics and fallback precedence before networking is added. The 20-item fixture must remain usable when the feed is unavailable.
- Treat access tokens as phone/webview client credentials; never bundle a server secret in an EHPK.
- Decide whether revisiting an item should restore its reveal stage or reset to Korean-only. The navigation proposal currently assumes reset for predictable recall.
- Add request cancellation, timeouts, validation, and privacy-safe diagnostics at the adapter boundary.

## Official references

- [Even Hub developer documentation](https://hub.evenrealities.com/docs)
- [Device APIs and input events](https://hub.evenrealities.com/docs/build/device-apis)
- [Desktop simulator](https://hub.evenrealities.com/docs/test/simulator)
- [Local testing](https://hub.evenrealities.com/docs/test/local-testing)
- [Packaging](https://hub.evenrealities.com/docs/ship/packaging)
