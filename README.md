# 📡 twitch-hermes

[![npm](https://img.shields.io/npm/v/@shevernitskiy/twitch-hermes?logo=npm&style=flat&labelColor=000)](https://www.npmjs.com/package/@shevernitskiy/twitch-hermes)
[![JSR](https://jsr.io/badges/@shevernitskiy/twitch-hermes)](https://jsr.io/@shevernitskiy/twitch-hermes)
![bun](https://img.shields.io/badge/bun-1.4.5-black?style=flat&logo=bun&logoColor=white)
![dependencies](https://img.shields.io/badge/dependencies-0-green?style=flat&labelColor=000)
![types](https://img.shields.io/badge/types-TypeScript-blue?style=flat&labelColor=000)
[![license](https://img.shields.io/github/license/shevernitskiy/twitch-hermes?style=flat&labelColor=000)](https://github.com/shevernitskiy/twitch-hermes/blob/main/LICENSE)

A thin, fully-typed TypeScript client for **Twitch Hermes** — the WebSocket transport behind Twitch PubSub.

Zero runtime dependencies and no Node-specific APIs — works in browsers, Web Workers, Bun, Deno and Node 22+. The JSR
package ships TypeScript source, so Bun, Deno and bundlers consume it as-is; the npm package ships compiled ESM with
type declarations.

- Typed topic map — unknown topics are rejected by the compiler and each handler gets the payload type of its topic;
- Typed PubSub payloads for every event modelled in [`src/types.ts`](./src/types.ts);
- 🔓 Public channel topics without a token and 🔑 user topics with OAuth;
- Automatic soft reconnect on the server's `reconnect` message and hard reconnect with backoff;
- Keepalive watchdog that detects a silently dead socket;
- Pluggable socket factory — proxies, tests and custom transports.

> [!NOTE]
> This is an unofficial client. The Hermes protocol is reverse-engineered from the Twitch Web client and may change
> without notice. If a topic or payload is missing or mistyped, please open an issue or send a PR.

---

## 📊 Progress

### Library

- [x] Typed channel & user topic maps
- [x] Typed PubSub payloads
- [x] OAuth for user topics
- [x] Keepalive watchdog
- [x] Soft reconnect (`reconnect` message)
- [x] Hard reconnect with exponential backoff
- [x] Custom socket factory (proxy, fake sockets in tests)
- [x] Browser & edge-runtime compatible (zero `node:*` dependencies)
- [x] Tests on a fake WebSocket
- [ ] Subscribe rate limiting / batching
- [ ] Twitch Extension JWT topics
- [ ] Payload types for every known topic

### Topics

- [x] Channel Points (channel + user)
- [x] Predictions (channel)
- [x] Polls, raids, shoutouts, pinned chat
- [x] Hype Train, creator goals, celebrations
- [x] Video playback, ads, stream settings
- [x] Onsite notifications, drops, milestones
- [x] Leaderboards, gift subs, content labels
- [ ] Whispers, AutoMod, unban requests (topics known, payloads not modelled)

---

## 📦 Installation

### npm

```bash
npm install @shevernitskiy/twitch-hermes
```

### JSR (Bun / Deno / any JSR-compatible runtime)

```bash
bunx jsr add @shevernitskiy/twitch-hermes
deno add jsr:@shevernitskiy/twitch-hermes
```

```ts
import { HermesWebSocket } from "@shevernitskiy/twitch-hermes";
```

> [!NOTE]
> The JSR package is published as TypeScript source, without a build step: Bun, Deno and TypeScript bundlers import
> it directly. The npm package is compiled to ESM with `.d.ts` declarations and works in plain Node 22+ and browsers.

---

## 🚀 Quick start

```ts
import { HermesWebSocket } from "@shevernitskiy/twitch-hermes";

const hermes = new HermesWebSocket();

hermes.onChannelEvent("video-playback-by-id", "600513126", (event, channelId) => {
  if (event.type === "viewcount") {
    console.log(channelId, event.viewers);
  }
});

hermes.onChannelEvent("polls", "600513126", (event) => {
  if (event.type === "POLL_CREATE") {
    console.log("new poll:", event.data.poll.title);
  }
});

hermes.onError((error) => console.error(error));
hermes.onEvent("new-session", (sessionId) => console.log("session:", sessionId));

hermes.start();
```

`event` is narrowed to the payload of the chosen topic, so the editor and the compiler know its shape.

### User topics (OAuth)

User topics require a token and the id of the user who owns it. The token is sent once per session, right after
`welcome` and before any subscribe:

```ts
const hermes = new HermesWebSocket({
  auth: { token: process.env.TWITCH_TOKEN!, userId: "42" },
});

hermes.onUserEvent("community-points-user-v1", (event) => {
  if (event.type === "points-earned") {
    console.log("balance:", event.data.balance.balance);
  }
});

hermes.start();
```

### Stopping

```ts
const off = hermes.onChannelEvent("polls", "600513126", handler);

off(); // removes the listener; the last listener drops the wire subscription
hermes.stop(); // closes the socket and prevents reconnects
```

---

## 🧠 How it works

Hermes is a WebSocket that multiplexes PubSub topics:

1. The socket opens, the server sends `welcome` with `sessionId` and `keepaliveSec`.
2. With `auth`, the client sends `authenticate` before anything else.
3. Every `onChannelEvent()` / `onUserEvent()` listener becomes a `subscribe` for `<topic>.<key>`. Duplicate listeners
   share one wire subscription.
4. `notification` messages carry the subscription id and a JSON string in `notification.pubsub`. The client parses it
   and calls every listener of that subscription with `(payload, key)`.
5. `keepalive` messages (and any other traffic) prove the link is alive; silence longer than the threshold triggers a
   reconnect.
6. On `reconnect` the client opens the new socket while the old one keeps delivering events, then closes the old one
   after the new session says `welcome`. Nothing is resubscribed — the session continues.
7. On a hard reconnect (network drop, stalled socket, timeout) the client starts a new session: fresh subscription ids
   and a full resubscribe after `welcome`.

The client tracks listeners, not individual messages. A subscription exists exactly while at least one listener is
attached to it, and it is recreated automatically in every new session.

---

## ⚙️ API

```ts
const hermes = new HermesWebSocket({
  auth: { token: "oauth:...", userId: "42" },
  log: (...args) => console.log(...args),
});
```

### Constructor options

| Option                | Type                                | Default                         | Description                                                                                 |
| --------------------- | ----------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| `auth`                | `{ token: string; userId: string }` | —                               | OAuth token and its owner. Required for 🔑 user topics.                                     |
| `clientId`            | `string`                            | Twitch Web client id            | Sent as the `clientId` query parameter.                                                     |
| `headers`             | `Record<string, string>`            | `Origin` + browser `User-Agent` | Merged over the default handshake headers (ignored by standard browser / Deno `WebSocket`). |
| `createWebSocket`     | `(url, headers) => WebSocket`       | global `WebSocket`              | Custom socket factory for proxies, Undici dispatchers, Bun options or a fake in tests.      |
| `maxRetries`          | `number`                            | `5`                             | Consecutive failed reconnects before giving up. `Infinity` is allowed.                      |
| `reconnectDelayMs`    | `number`                            | `5000`                          | Base of the exponential backoff. The first retry is immediate.                              |
| `maxReconnectDelayMs` | `number`                            | `30000`                         | Backoff ceiling.                                                                            |
| `connectTimeoutMs`    | `number`                            | `10000`                         | Max time from opening the socket to `welcome`.                                              |
| `keepaliveTimeoutMs`  | `number`                            | `2 × keepaliveSec`              | Silence threshold; longer silence means a dead connection.                                  |
| `log`                 | `(...args: unknown[]) => void`      | —                               | Diagnostic logger. Errors are logged here when nobody listens via `onError`/`onceError`.    |

### Methods

| Method                                        | Returns       | Description                                                                                             |
| --------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| `onChannelEvent(topic, channelId, handler)`   | `Unsubscribe` | Listen to a 🔓 channel topic. `channelId` is appended to the topic; for leaderboards pass the subtopic. |
| `onceChannelEvent(topic, channelId, handler)` | `Unsubscribe` | Same, but removed after the first event.                                                                |
| `onUserEvent(topic, handler)`                 | `Unsubscribe` | Listen to a 🔑 topic of `auth.userId`. Throws `HermesWebSocketError` without `auth`.                    |
| `onceUserEvent(topic, handler)`               | `Unsubscribe` | Same, but removed after the first event.                                                                |
| `onEvent(event, handler)`                     | `Unsubscribe` | Listen to a lifecycle or diagnostics event.                                                             |
| `onceEvent(event, handler)`                   | `Unsubscribe` | Same, but removed after the first event.                                                                |
| `onError(handler)`                            | `Unsubscribe` | Listen to client errors. Without a listener, errors are logged via `log`.                               |
| `onceError(handler)`                          | `Unsubscribe` | Same, but removed after the first error.                                                                |
| `start()`                                     | `this`        | Opens the connection. Needs at least one listener, otherwise throws `HermesWebSocketError`.             |
| `stop()`                                      | `void`        | Closes the socket, cancels reconnects, keeps listeners for a later `start()`.                           |
| `connected`                                   | `boolean`     | `true` while the socket is running or soft-reconnecting.                                                |

Every subscription method returns an idempotent `Unsubscribe` function: repeated calls do nothing, and for topic
subscriptions a stale disposer cannot remove a newer subscription for the same topic.

### Client events

Lifecycle and diagnostics events, subscribed via `onEvent(event, handler)` / `onceEvent(event, handler)`:

| Event                   | Arguments                           | When                                                                    |
| ----------------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| `new-session`           | `sessionId`                         | A new Hermes session started (initial connect or hard reconnect).       |
| `welcome`               | `HermesMessageWelcome`              | Any `welcome`, including a soft reconnect.                              |
| `reconnect`             | `HermesMessageReconnect`            | The server asked the client to move to another socket.                  |
| `keepalive`             | `HermesMessageKeepalive`            | The server sent a keepalive.                                            |
| `close`                 | `CloseEvent`                        | A socket closed, before the reconnect decision (not emitted on `stop`). |
| `notification`          | `HermesMessageNotification`         | Any raw notification, typed or not.                                     |
| `authenticate-response` | `HermesMessageAuthenticateResponse` | The server answered `authenticate`.                                     |
| `subscribe-response`    | `(message, topic, targetId)`        | The server answered `subscribe`; topic and target are resolved for you. |
| `unsubscribe-response`  | `HermesMessageUnsubscribeResponse`  | The server answered `unsubscribe`.                                      |

> [!NOTE]
> Client errors are handled separately via `onError(handler)` / `onceError(handler)`. If no error listener is
> registered, errors are passed to `log`, so a network blip never crashes the process. Exceptions thrown by any
> listener (including `onEvent` and `onError`) are isolated and never starve other listeners or break dispatch.

---

## 🗺️ Topics

Auth legend: 🔓 `NONE` — no token; 🔑 `OAUTH` — user OAuth token; 🧩 `EXTENSION_JWT` — extension JWT.

A topic is `<prefix>.<key>`. `onChannelEvent("polls", "600513126")` subscribes to `polls.600513126`;
`onUserEvent("community-points-user-v1", handler)` subscribes to `community-points-user-v1.<auth.userId>`.

### Topic map

✅ means the payload is typed. An empty cell means the event reaches the handler as `unknown` (the event names are
still listed where they are known).

| Topic                              | Key               | Auth | Payload                                 | Emits                                                                                            |
| ---------------------------------- | ----------------- | ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ads`                              | channel id        | 🔓   | ✅ `AdsEvent`                           | `midroll_request`, `ads-schedule-update`                                                         |
| `automod-queue`                    | user id + channel | 🔑   |                                         | not modelled                                                                                     |
| `broadcast-settings-update`        | channel id        | 🔓   | ✅ `BroadcastSettingsUpdateEvent`       | `broadcast_settings_update`                                                                      |
| `celebration-events-v1`            | channel id        | 🔓   | ✅ `CelebrationEvent`                   | `alert_sets_celebration`, `celebrations_message`                                                 |
| `channel-bits-events-v1`           | user id           | 🔑   |                                         | not modelled                                                                                     |
| `channel-bits-events-v2`           | user id           | 🔑   |                                         | not modelled                                                                                     |
| `channel-drop-events`              | channel id        | 🔓   |                                         | not modelled                                                                                     |
| `channel-ext-v1`                   | extension id      | 🧩   |                                         | not modelled, not supported by the client                                                        |
| `channel-sub-gifts-v1`             | channel id        | 🔓   | ✅ `ChannelSubGiftsEvent`               | `mystery-gift-purchase`, `gift-event`                                                            |
| `channel-subscribe-events-v1`      | user id           | 🔑   |                                         | not modelled                                                                                     |
| `chat_moderator_actions`           | user id + channel | 🔑   |                                         | not modelled                                                                                     |
| `community-points-channel-v1`      | channel id        | 🔓   | ✅ `CommunityPointsChannelEvent`        | `community-goal-contribution`, `custom-reward-updated`, `reward-redeemed` + 12 more              |
| `community-points-user-v1`         | user id           | 🔑   | ✅ `CommunityPointsUserEvent`           | `points-earned`, `claim-available`, `claim-claimed` + 18 more                                    |
| `content-classification-labels-v1` | channel id        | 🔓   | ✅ `ContentClassificationLabelsEvent`   | `channel-ccls-updated`                                                                           |
| `creator-goals-events-v1`          | channel id        | 🔓   | ✅ `CreatorGoalsEvent`                  | `goal_updated` + `goal_created`, `goal_achieved`, `goal_finished`                                |
| `follows`                          | user id           | 🔑   |                                         | not modelled                                                                                     |
| `guest-star-channel-v1`            | channel id        | 🔓   | ✅ `GuestStarChannelEvent`              | `favorite-channel-update`                                                                        |
| `hype-train-events-v1`             | channel id        | 🔓   |                                         | not modelled, legacy — prefer `-v2`                                                              |
| `hype-train-events-v2`             | channel id        | 🔓   | ✅ `HypeTrainEvent`                     | `hype-train-approaching`, `hype-train-start`, `hype-train-level-up`, `hype-train-end` + 4 more   |
| `leaderboard-events-v1`            | subtopic          | 🔓   | ✅ `LeaderboardEvent`                   | `clips-leaderboard-update`, `sub-gifts-sent`, `bits-usage-by-channel-v1`                         |
| `onsite-notifications`             | user id           | 🔑   | ✅ `OnSiteNotificationEvent`            | `create-notification`, `update-summary` + `delete-notification`, `read-notifications`, …         |
| `pinned-chat-updates-v1`           | channel id        | 🔓   | ✅ `PinChatUpdatesEvent`                | `pin-message`, `unpin-message`, `update-message`                                                 |
| `polls`                            | channel id        | 🔓   | ✅ `PollEvent`                          | `POLL_CREATE`, `POLL_UPDATE`, `POLL_COMPLETE`, `POLL_ARCHIVE`, `POLL_TERMINATE`, `POLL_MODERATE` |
| `predictions-channel-v1`           | channel id        | 🔓   | ✅ `PredictionEvent`                    | `event-created`, `event-updated`                                                                 |
| `predictions-user-v1`              | user id           | 🔑   |                                         | `prediction-made`, `prediction-updated`, `prediction-result`                                     |
| `private-callout`                  | user id           | 🔑   | ✅ `PrivateCalloutEvent`                | `send-private-callout`                                                                           |
| `raid`                             | channel id        | 🔓   | ✅ `RaidUpdateV2Event \| RaidGoV2Event` | `raid_update_v2`, `raid_go_v2` + `raid_update`, `raid_cancel`, `raid_cancel_v2`                  |
| `shoutout`                         | channel id        | 🔓   | ✅ `ShoutoutEvent`                      | `create`                                                                                         |
| `stream-chat-room-v1`              | channel id        | 🔓   | ✅ `StreamChatRoomEvent`                | `chat_rich_embed`, `updated_room` + `updated_channel_chat_property`                              |
| `subs-events-v1`                   | channel id        | 🔑   |                                         | not modelled                                                                                     |
| `user-drop-events`                 | user id           | 🔑   | ✅ `UserDropEvent`                      | `drop-progress` + `drop-claim`, `drop-event`, `chest-roll-granted`                               |
| `video-playback-by-id`             | channel id        | 🔓   | ✅ `VideoPlaybackByIdEvent`             | `viewcount`, `commercial` + `stream-up`, `stream-down`                                           |
| `viewer-milestones`                | user id           | 🔑   | ✅ `ViewerMilestonesEvent`              | `watch-streak`, `viewer-milestones-update`, `streak-recovered`                                   |
| `whispers`                         | user id           | 🔑   |                                         | not modelled                                                                                     |

> [!TIP]
> `leaderboard-events-v1` is the only channel-style topic whose key is not a bare id. Pass the subtopic:
> `onChannelEvent("leaderboard-events-v1", "clips-600513126", handler)`, `"sub-gifts-sent-600513126-MONTH"` or
> `"bits-usage-by-channel-v1-600513126-WEEK"`.

> [!IMPORTANT]
> `onUserEvent()` always builds `<topic>.<auth.userId>`, so one client serves one authenticated user. Composite
> `<userId>.<channelId>` keys (`chat_moderator_actions`, `automod-queue`, `private-callout`, `viewer-milestones`) are
> known to Twitch but not exposed by this client yet.

Topics without ✅ are known by prefix but have no payload type yet. The full catalog — `KnownDeviceTopics`,
`KnownUserTopics`, `KnownChannelTopics`, `KnownExtensionTopics`, `KnownTopic` — is exported from
[`src/types.ts`](./src/types.ts). To subscribe to a new prefix, add it to `ChannelTopics` / `UserTopics` in
[`src/hermes.ts`](./src/hermes.ts) with its payload type; the runtime needs no changes.

> [!NOTE]
> `channel-ext-v1` is a 🧩 Extension JWT topic, and the client does not support it: the handshake authenticates a
> user OAuth token only.

---

## 🧩 Types

The root entry re-exports every public type, so a single import is enough:

```ts
import type {
  ErrorHandler,
  EventHandler,
  HermesEvents,
  HermesMessage,
  KnownPubSubEvent,
  KnownPubSubEventType,
  PollEvent,
  RaidGoV2Event,
  RaidUpdateV2Event,
  Unsubscribe,
} from "@shevernitskiy/twitch-hermes";
```

- `ChannelTopics` / `UserTopics` — maps of subscribable topics to payloads;
- `HermesEvents` / `EventHandler` / `ErrorHandler` / `Unsubscribe` — lifecycle event map, listener signatures and disposer type;
- `KnownPubSubEvent` — union of every modelled PubSub payload;
- `KnownPubSubEventType` — union of every known inner `type` discriminator;
- `KnownRewindUpdateType` — rewind statuses of `rewind-updates-v1`;
- `HermesTopicAuth` — `"NONE" | "OAUTH" | "EXTENSION_JWT"`;
- `KnownDeviceTopics` / `KnownUserTopics` / `KnownChannelTopics` / `KnownExtensionTopics` / `KnownTopic` — the full
  topic prefix catalog;
- `HermesMessage` / `HermesClientMessage` — envelopes received from and sent to the server.

Narrowing works on the inner `type`, because every modelled payload is a discriminated union:

```ts
function onPoll(event: PollEvent) {
  if (event.type === "POLL_COMPLETE") {
    console.log(event.data.poll.status); // "COMPLETED"
  }
}
```

---

## 🛡️ Errors & resilience

All client errors are `HermesWebSocketError` with a `fatal` flag and an optional `cause`:

| Situation                                | `fatal` | Behaviour                                                                                         |
| ---------------------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| Socket `error`                           | `false` | Reported; the close handler decides whether to reconnect.                                         |
| Malformed JSON / a listener threw        | `false` | Reported; the client keeps working and other listeners still run.                                 |
| `maxRetries` exhausted                   | `true`  | The client is closed and stops reconnecting.                                                      |
| Server closes with `4003` / `4004`       | —       | "Connection unused" — reconnecting would not help; the client stops (not reported as an `error`). |
| No `welcome` within `connectTimeoutMs`   | `false` | The socket is dropped and a retry is scheduled.                                                   |
| Silence longer than `keepaliveTimeoutMs` | `false` | The socket is considered dead and a retry is scheduled.                                           |

```ts
import { HermesWebSocketError } from "@shevernitskiy/twitch-hermes";

hermes.onError((error: HermesWebSocketError) => {
  console.error(error.message, { fatal: error.fatal, cause: error.cause });
});
```

Reconnect policy: the first retry is immediate, later ones back off as `reconnectDelayMs * 2^(attempt - 1)` with
±20% jitter and a `maxReconnectDelayMs` ceiling. A successful `welcome` resets the counter.

---

## ✅ Tests

```bash
bun test
bun run typecheck
bun run format
```

Tests run on a fake `WebSocket`; no connection to Twitch is made. They cover the handshake, dispatch,
`onEvent`/`onceEvent` and `onError`/`onceError`, topic `once`-listeners, listener error isolation, browser `WebSocket`
fallback, soft and hard reconnects, both watchdogs, backoff, giving up, and compile-time topic/payload checks.

---

## ⚠️ Known limitations

- **Only topics in `ChannelTopics` / `UserTopics` are subscribable.** The full prefix catalog lives in `src/types.ts`,
  but a topic without a payload type has to be added to the map manually. `channel-drop-events` and
  `predictions-user-v1` are already there with an `unknown` payload.
- **A topic may emit more event types than modelled.** The tables list every known inner `type`; only the payloads
  described in `src/types.ts` are typed. An unmodelled event still reaches the handler, but TypeScript types it as one
  of the modelled variants.
- **Composite user keys are not supported by `onUserEvent()`.** `private-callout` and `viewer-milestones` can also be
  scoped to a channel as `<userId>.<channelId>`; the client subscribes the user-wide form.
- **`leaderboard-events-v1` takes a subtopic, not a channel id.** Pass `clips-<channelId>`, `sub-gifts-sent-<channelId>-<unit>`
  or `bits-usage-by-channel-v1-<channelId>-<unit>` as the key.
- **Extension JWT topics are not supported.** The socket authenticates a user only.
- **Browser `WebSocket` cannot override handshake headers.** In browsers and Deno, `options.headers` (including the
  default `Origin` and `User-Agent`) are ignored and `defaultCreateWebSocket` automatically falls back to
  `new WebSocket(url)`.
- **Some payload fields are deliberately `unknown`.** Twitch sends opaque GraphQL fragments (`sharedProgress`,
  `treasureTrainDetails`, multipliers and similar) whose shape is not stable.
- **No subscribe rate limiting.** Many topics at once are sent one by one; batching is a TODO in the client.
- **Deprecated typo aliases** `OnSiteNotifictaionEvent` and `CreateNotifictaionEvent` are kept for compatibility. Use
  `OnSiteNotificationEvent` and `CreateNotificationEvent`.

---

## 🔗 Links

- [GitHub repository](https://github.com/shevernitskiy/twitch-hermes)
- [npm package](https://www.npmjs.com/package/@shevernitskiy/twitch-hermes)
- [JSR package](https://jsr.io/@shevernitskiy/twitch-hermes)
- [Type definitions](./src/types.ts)
- [Client source](./src/hermes.ts)

---

## 📄 License

MIT — see the [LICENSE](./LICENSE) file.
