import { EventEmitter } from "node:events";

import type {
  AdsEvent,
  BroadcastSettingsUpdateEvent,
  CelebrationEvent,
  ChannelSubGiftsEvent,
  CommunityPointsChannelEvent,
  CommunityPointsUserEvent,
  ContentClassificationLabelsEvent,
  CreatorGoalsEvent,
  GuestStarChannelEvent,
  HermesMessage,
  HermesMessageAuthenticateResponse,
  HermesMessageKeepalive,
  HermesMessageNotification,
  HermesMessagePubsub,
  HermesMessageReconnect,
  HermesMessageSubscribeResponse,
  HermesMessageUnsubscribeResponse,
  HermesMessageWelcome,
  HypeTrainEvent,
  LeaderboardEvent,
  OnSiteNotificationEvent,
  PinChatUpdatesEvent,
  PollEvent,
  PredictionEvent,
  PrivateCalloutEvent,
  RaidGoV2Event,
  RaidUpdateV2Event,
  ShoutoutEvent,
  StreamChatRoomEvent,
  UserDropEvent,
  VideoPlaybackByIdEvent,
  ViewerMilestonesEvent,
} from "./types.ts";

export type * from "./types.ts";

// ───────────────────────────── topics ─────────────────────────────
// Type-level only: topic validity is enforced by the compiler at subscribe time,
// and the subscription table is the single runtime source of truth.

/**
 * 🔓 Channel topics. Subscribed as `<topic>.<channelId>`, no token required.
 *
 * `leaderboard-events-v1` is the exception: its key is a subtopic
 * (`clips-<channelId>`, `sub-gifts-sent-<channelId>-<unit>`), not a bare channel id.
 */
export interface ChannelTopics {
  /** Mid-roll ad breaks. Also emits `ads-schedule-update`. */
  ads: AdsEvent;
  /** Stream title, game and live status. */
  "broadcast-settings-update": BroadcastSettingsUpdateEvent;
  /** Alert-set celebrations. Also emits `celebrations_message`. */
  "celebration-events-v1": CelebrationEvent;
  /** Drops campaign activity of a channel. Payload is not modelled. */
  "channel-drop-events": unknown;
  /** Community gift subscriptions. Also emits `gift-event`. */
  "channel-sub-gifts-v1": ChannelSubGiftsEvent;
  /** Channel Points as seen by viewers. */
  "community-points-channel-v1": CommunityPointsChannelEvent;
  /** Content classification labels. */
  "content-classification-labels-v1": ContentClassificationLabelsEvent;
  /** Creator goals. Also emits `goal_created`, `goal_achieved`, `goal_finished`. */
  "creator-goals-events-v1": CreatorGoalsEvent;
  "guest-star-channel-v1": GuestStarChannelEvent;
  /** Hype Train lifecycle. */
  "hype-train-events-v2": HypeTrainEvent;
  /** Clips, gift subs and bits leaderboards. Key is a subtopic, e.g. `clips-<channelId>`. */
  "leaderboard-events-v1": LeaderboardEvent;
  /** Pinned chat messages. */
  "pinned-chat-updates-v1": PinChatUpdatesEvent;
  /** Polls of the channel. */
  polls: PollEvent;
  /** Channel predictions. */
  "predictions-channel-v1": PredictionEvent;
  /** Raids into and out of the channel. */
  raid: RaidUpdateV2Event | RaidGoV2Event;
  /** Shoutouts created in the channel. */
  shoutout: ShoutoutEvent;
  /** Chat room modes and rich embeds. */
  "stream-chat-room-v1": StreamChatRoomEvent;
  /** Viewer count, stream state and commercial breaks. */
  "video-playback-by-id": VideoPlaybackByIdEvent;
}

/**
 * 🔑 User topics. Require `auth`; subscribed as `<topic>.<userId>`.
 *
 * The userId is taken from `options.auth.userId`, so one client serves one user.
 */
export interface UserTopics {
  /** Channel Points, goals and rewards of the user. */
  "community-points-user-v1": CommunityPointsUserEvent;
  /** Onsite notification tray and unread counters. */
  "onsite-notifications": OnSiteNotificationEvent;
  /** Predictions the user took part in. Payload is not modelled yet. */
  "predictions-user-v1": unknown;
  /** Private callouts for the user (`<userId>` or `<userId>.<channelId>`). */
  "private-callout": PrivateCalloutEvent;
  /** Drops campaigns of the user. */
  "user-drop-events": UserDropEvent;
  /** Watch streaks and viewer milestones. */
  "viewer-milestones": ViewerMilestonesEvent;
}

// ───────────────────────────── messages ─────────────────────────────

type OutboundType = "authenticate" | "subscribe" | "unsubscribe";

// ───────────────────────────── events ─────────────────────────────

/**
 * Lifecycle / diagnostics events (node:events map format: event name -> tuple of listener arguments).
 * Topic events are NOT here: use onChannelEvent/onceChannelEvent/onUserEvent/onceUserEvent.
 */
export type HermesEvents = {
  "new-session": [sessionId: string];
  welcome: [message: HermesMessageWelcome];
  reconnect: [message: HermesMessageReconnect];
  keepalive: [message: HermesMessageKeepalive];
  close: [event: CloseEvent];
  notification: [message: HermesMessageNotification];
  "authenticate-response": [message: HermesMessageAuthenticateResponse];
  "subscribe-response": [
    message: HermesMessageSubscribeResponse,
    topic: string,
    targetId: string,
  ];
  "unsubscribe-response": [message: HermesMessageUnsubscribeResponse];
  /** Emitted only if somebody listens (otherwise logged), so a network blip never crashes the process. */
  error: [error: HermesWebSocketError];
};

/** Listener for a channel topic. The key (usually a channel id) lets one function serve many targets. */
export type ChannelHandler<K extends keyof ChannelTopics> = (
  event: ChannelTopics[K],
  channelId: string,
) => void;

/** Listener for a user topic. */
export type UserHandler<K extends keyof UserTopics> = (
  event: UserTopics[K],
) => void;

/** Removes the listener; the wire subscription goes away with the last listener. Idempotent. */
export type Unsubscribe = () => void;

// ───────────────────────────── options / errors ─────────────────────────────

/** Construction options for {@link HermesWebSocket}. */
export interface HermesOptions {
  /** Required for user topics. `userId` is the owner of `token`. */
  auth?: { token: string; userId: string };
  /** Defaults to the twitch web client id. */
  clientId?: string;
  /** Merged over the defaults (Origin + User-Agent). Passed to `createWebSocket`. */
  headers?: Record<string, string>;
  /**
   * Custom socket factory, e.g. to go through a proxy or to inject a fake in tests.
   * (A WebSocket handshake is not a `fetch()` call, so the transport hook is the socket itself.)
   * Bun:  `(url, headers) => new WebSocket(url, { headers, proxy: "http://user:pass@host:port" })`
   * undici: `(url, headers) => new WebSocket(url, { headers, dispatcher: new ProxyAgent(proxyUrl) })`
   * The returned socket must implement the standard WebSocket interface (onmessage/onerror/onclose, send, close, readyState).
   */
  createWebSocket?: (url: string, headers: Record<string, string>) => WebSocket;
  /** Consecutive failed reconnects before giving up. `Infinity` is allowed. Default 5. */
  maxRetries?: number;
  /** Base of the exponential backoff. First retry is immediate. Default 5000. */
  reconnectDelayMs?: number;
  /** Backoff ceiling. Default 30000. */
  maxReconnectDelayMs?: number;
  /** Max time from connect to `welcome`. Default 10000. */
  connectTimeoutMs?: number;
  /** Silence threshold. Default: 2 × `keepaliveSec` announced by the server in `welcome`. */
  keepaliveTimeoutMs?: number;
  log?: (...args: unknown[]) => void;
}

/**
 * Error raised by the client.
 *
 * `fatal: true` means the client gave up and closed; `false` means it is reported for diagnostics
 * and the client keeps running or reconnects.
 */
export class HermesWebSocketError extends Error {
  /** `true` = the client gave up and is closed. */
  readonly fatal: boolean;

  constructor(message: string, fatal = false, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "HermesWebSocketError";
    this.fatal = fatal;
  }

  static fromEvent(event: Event): HermesWebSocketError {
    const e = event as Partial<ErrorEvent>;
    return new HermesWebSocketError(
      e.message ? `WebSocket error: ${e.message}` : "WebSocket error",
      false,
      e.error,
    );
  }
}

// ───────────────────────────── internals ─────────────────────────────

type Status =
  "idle" | "connecting" | "running" | "soft-reconnect" | "backoff" | "closed";

interface Subscription {
  /** Wire id. Regenerated for every new session. */
  id: string;
  /** Event name, e.g. "polls". */
  topic: string;
  /** Channel id, user id or subtopic — the key appended to `topic`. */
  target: string;
  /** `${topic}.${target}`, precomputed once. */
  wire: string;
  /** Subscribe message already sent in the current session. */
  live: boolean;
  /** Copy-on-write: never mutated in place, so dispatch can iterate a snapshot without copying. */
  handlers: readonly Entry[];
}

type Handler = (event: unknown, target: string) => void;

interface Entry {
  fn: Handler;
  once: boolean;
}

const DEFAULT_HEADERS: Record<string, string> = {
  Origin: "https://www.twitch.tv",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
};

// Node/Deno/Bun accept `{ headers }` as the second argument; the DOM typings do not know about it.
type WebSocketCtor = new (
  url: string,
  init: { headers: Record<string, string> },
) => WebSocket;

function defaultCreateWebSocket(
  url: string,
  headers: Record<string, string>,
): WebSocket {
  return new (WebSocket as unknown as WebSocketCtor)(url, { headers });
}

// Local copies: a custom socket need not carry the static constants of the global class.
const CONNECTING = 0;
const OPEN = 1;

const ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function genId(len = 21): string {
  let id = "";
  for (const b of crypto.getRandomValues(new Uint8Array(len)))
    id += ID_ALPHABET.charAt(b & 63); // 256 % 64 === 0, no modulo bias
  return id;
}

// ───────────────────────────── client ─────────────────────────────

/**
 * Typed Twitch Hermes (PubSub over WebSocket) client.
 *
 * Register listeners first with {@link onChannelEvent} / {@link onUserEvent}, then call {@link start}.
 * A subscription lives exactly while at least one listener is attached to it and is restored
 * automatically in every new session.
 *
 * Lifecycle events are emitted through the standard EventEmitter API; topic events go to the
 * listener passed to `onChannelEvent` / `onUserEvent`.
 */
export class HermesWebSocket extends EventEmitter<HermesEvents> {
  private readonly wsUrl: string;
  private readonly headers: Record<string, string>;
  private readonly auth?: { token: string; userId: string };
  private readonly maxRetries: number;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly connectTimeoutMs: number;
  private readonly keepaliveTimeoutMs?: number;
  private readonly createWebSocket: (
    url: string,
    headers: Record<string, string>,
  ) => WebSocket;
  private readonly log: (...args: unknown[]) => void;

  private status: Status = "idle";
  private ws?: WebSocket;
  private oldWs?: WebSocket; // alive only during a soft reconnect

  private connectTimer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private watchdogTimer?: ReturnType<typeof setInterval>;

  private sessionId?: string;
  private lastActivity = 0;
  private retries = 0;

  private readonly subsByWire = new Map<string, Subscription>();
  private readonly subsById = new Map<string, Subscription>();

  constructor(options: HermesOptions = {}) {
    super();
    this.wsUrl = `wss://hermes.twitch.tv/v1?clientId=${options.clientId ?? "kimne78kx3ncx6brgo4mv6wki5h1ko"}`;
    this.headers = { ...DEFAULT_HEADERS, ...options.headers };
    this.auth = options.auth;
    this.createWebSocket = options.createWebSocket ?? defaultCreateWebSocket;
    this.maxRetries = options.maxRetries ?? 5;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 5_000;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30_000;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 10_000;
    this.keepaliveTimeoutMs = options.keepaliveTimeoutMs;
    const log = options.log;
    this.log = log ? (...args) => log("Hermes", ...args) : () => {};
  }

  // ───────── public API ─────────

  get connected(): boolean {
    return this.status === "running" || this.status === "soft-reconnect";
  }

  /**
   * Listen to a 🔓 channel topic. `channelId` is appended to the topic as its key.
   *
   * The first listener for a (topic, channelId) pair creates the wire subscription,
   * the last one removed drops it. Safe to call before or after `start()`.
   *
   * `leaderboard-events-v1` takes a subtopic instead of a channel id,
   * e.g. `onChannelEvent("leaderboard-events-v1", "clips-123", handler)`.
   */
  onChannelEvent<K extends keyof ChannelTopics>(
    topic: K,
    channelId: string,
    handler: ChannelHandler<K>,
  ): Unsubscribe {
    return this.addHandler(
      topic,
      channelId,
      handler as unknown as Handler,
      false,
    );
  }

  /** Like `onChannelEvent`, but the listener is removed after its first event. */
  onceChannelEvent<K extends keyof ChannelTopics>(
    topic: K,
    channelId: string,
    handler: ChannelHandler<K>,
  ): Unsubscribe {
    return this.addHandler(
      topic,
      channelId,
      handler as unknown as Handler,
      true,
    );
  }

  /**
   * Listen to a 🔑 user topic of `options.auth.userId`.
   * Throws {@link HermesWebSocketError} when `auth` is missing.
   */
  onUserEvent<K extends keyof UserTopics>(
    topic: K,
    handler: UserHandler<K>,
  ): Unsubscribe {
    return this.addHandler(
      topic,
      this.requireAuth().userId,
      handler as unknown as Handler,
      false,
    );
  }

  /** Like `onUserEvent`, but the listener is removed after its first event. */
  onceUserEvent<K extends keyof UserTopics>(
    topic: K,
    handler: UserHandler<K>,
  ): Unsubscribe {
    return this.addHandler(
      topic,
      this.requireAuth().userId,
      handler as unknown as Handler,
      true,
    );
  }

  /** Opens the connection. Needs at least one listener (the server drops unused connections). */
  start(): this {
    if (this.status !== "idle" && this.status !== "closed") return this;
    if (this.subsByWire.size === 0) {
      throw new HermesWebSocketError(
        "Nothing to listen to. Call onChannelEvent()/onUserEvent() before start().",
      );
    }
    this.retries = 0;
    this.open(this.wsUrl, false);
    return this;
  }

  /**
   * Closes synchronously and prevents reconnects. Listeners are kept, so `start()` may be called again.
   */
  stop(): void {
    if (this.status === "closed") return;
    this.shutdown();
  }

  // ───────── subscriptions ─────────

  private requireAuth(): { token: string; userId: string } {
    if (!this.auth)
      throw new HermesWebSocketError(
        "User topics require `auth` in the constructor options.",
      );
    return this.auth;
  }

  private addHandler(
    topic: string,
    target: string,
    fn: Handler,
    once: boolean,
  ): Unsubscribe {
    const wire = `${topic}.${target}`;
    let sub = this.subsByWire.get(wire);
    const created = sub === undefined;
    if (sub === undefined) {
      sub = { id: genId(), topic, target, wire, live: false, handlers: [] };
      this.subsByWire.set(wire, sub);
      this.subsById.set(sub.id, sub);
    }
    const entry: Entry = { fn, once };
    sub.handlers = [...sub.handlers, entry];

    // otherwise it is picked up by the next `welcome`
    if (created && this.status === "running") this.sendSubscribe(sub);

    const owner = sub;
    return () => this.removeEntry(owner, entry);
  }

  private removeEntry(sub: Subscription, entry: Entry): void {
    const i = sub.handlers.indexOf(entry);
    if (i === -1) return; // already removed
    const next = sub.handlers.slice();
    next.splice(i, 1);
    sub.handlers = next;
    if (next.length > 0) return;

    // last listener gone -> drop the wire subscription (unless a newer sub already took its place)
    if (this.subsByWire.get(sub.wire) === sub) {
      this.subsByWire.delete(sub.wire);
      this.subsById.delete(sub.id);
    }
    if (sub.live && this.status === "running")
      this.send("unsubscribe", { id: sub.id });
  }

  /** New session = server forgot everything: fresh ids, nothing is live. */
  private resetSubscriptions(): void {
    this.subsById.clear();
    for (const sub of this.subsByWire.values()) {
      sub.id = genId();
      sub.live = false;
      this.subsById.set(sub.id, sub);
    }
  }

  private sendSubscribe(sub: Subscription): void {
    // TODO: rate limit / batching if the number of topics gets large
    sub.live = true;
    this.send("subscribe", {
      id: sub.id,
      type: "pubsub",
      pubsub: { topic: sub.wire },
    });
  }

  private send(type: OutboundType, payload: unknown): void {
    const ws = this.ws;
    if (ws === undefined || ws.readyState !== OPEN) return;
    ws.send(
      JSON.stringify({
        id: genId(),
        type,
        timestamp: new Date().toISOString(),
        [type]: payload,
      }),
    );
  }

  // ───────── connection lifecycle ─────────

  private open(url: string, soft: boolean): void {
    this.status = soft ? "soft-reconnect" : "connecting";
    this.log(`${soft ? "Soft reconnect" : "Connecting"} to ${url}`);

    const ws = this.createWebSocket(url, this.headers);
    if (soft) this.oldWs = this.ws;
    this.ws = ws;

    // Covers the whole way to `welcome`, not just the TCP/TLS/upgrade part.
    clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => {
      this.connectTimer = undefined;
      this.log(`No welcome within ${this.connectTimeoutMs}ms`);
      this.scheduleReconnect();
    }, this.connectTimeoutMs);

    ws.onmessage = (ev) => this.onData(ev.data);
    ws.onerror = (ev) => this.fail(HermesWebSocketError.fromEvent(ev));
    ws.onclose = (ev) => {
      if (ws === this.oldWs) {
        // The server closed the previous socket on its own while the new one is coming up.
        this.oldWs = undefined;
        this.log("Old socket closed by server");
        return;
      }
      this.onClose(ev);
    };
  }

  private onClose(ev: CloseEvent): void {
    // 4003/4004: "connection unused" - reconnecting would not help.
    const terminal =
      (ev.code === 4003 || ev.code === 4004) &&
      this.status !== "soft-reconnect";
    if (terminal) {
      this.log(
        `Connection closed (${ev.code}): connection unused. Not reconnecting.`,
      );
      this.shutdown();
    } else {
      this.scheduleReconnect();
    }
    this.emit("close", ev);
  }

  /** Tear everything down and retry with backoff. Idempotent while waiting. */
  private scheduleReconnect(): void {
    if (this.status === "closed" || this.status === "backoff") return;
    this.teardown();

    if (this.retries >= this.maxRetries) {
      this.status = "closed";
      this.fail(
        new HermesWebSocketError(
          "Max reconnect retries reached. Giving up.",
          true,
        ),
      );
      return;
    }

    const attempt = this.retries++;
    let delay = 0; // first retry is immediate
    if (attempt > 0) {
      delay = Math.min(
        this.reconnectDelayMs * 2 ** (attempt - 1),
        this.maxReconnectDelayMs,
      );
      delay *= 0.8 + Math.random() * 0.4; // jitter ±20%
    }

    this.status = "backoff";
    this.log(`Reconnect in ${Math.round(delay)}ms (attempt ${attempt + 1})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.open(this.wsUrl, false);
    }, delay);
  }

  private shutdown(): void {
    this.teardown();
    this.status = "closed";
  }

  private teardown(): void {
    clearTimeout(this.connectTimer);
    clearTimeout(this.reconnectTimer);
    clearInterval(this.watchdogTimer);
    this.connectTimer = this.reconnectTimer = this.watchdogTimer = undefined;
    this.detach(this.ws);
    this.detach(this.oldWs);
    this.ws = this.oldWs = undefined;
  }

  private detach(ws: WebSocket | undefined): void {
    if (ws === undefined) return;
    ws.onmessage = ws.onerror = ws.onclose = ws.onopen = null;
    if (ws.readyState === CONNECTING || ws.readyState === OPEN) {
      try {
        ws.close(1000);
      } catch {
        /* already going away */
      }
    }
  }

  /** Stale-connection detector: one interval per session, nothing is allocated per message. */
  private armWatchdog(keepaliveSec: number): void {
    clearInterval(this.watchdogTimer);
    const staleAfter =
      this.keepaliveTimeoutMs ?? (keepaliveSec > 0 ? keepaliveSec : 30) * 2_000;
    const period = Math.max(50, Math.ceil(staleAfter / 4));
    this.lastActivity = Date.now();
    this.watchdogTimer = setInterval(() => {
      const silence = Date.now() - this.lastActivity;
      if (silence > staleAfter) {
        this.log(
          `Connection stale. Silent for ${Math.round(silence / 1000)}s.`,
        );
        this.scheduleReconnect();
      }
    }, period);
  }

  // ───────── inbound ─────────

  private onData(data: unknown): void {
    if (typeof data !== "string") return;
    this.lastActivity = Date.now(); // any traffic proves the link is alive

    try {
      const msg = JSON.parse(data) as HermesMessage;
      switch (
        msg.type // hot types first
      ) {
        case "notification":
          this.onNotification(msg);
          break;
        case "keepalive":
          this.emit("keepalive", msg);
          break;
        case "welcome":
          this.onWelcome(msg);
          break;
        case "subscribeResponse": {
          const sub = this.subsById.get(msg.subscribeResponse.subscription.id);
          this.emit(
            "subscribe-response",
            msg,
            sub?.topic ?? "",
            sub?.target ?? "",
          );
          break;
        }
        case "unsubscribeResponse":
          this.emit("unsubscribe-response", msg);
          break;
        case "authenticateResponse":
          this.emit("authenticate-response", msg);
          break;
        case "reconnect":
          this.onReconnect(msg);
          break;
        default:
          this.log("Unknown message type:", msg);
      }
    } catch (e) {
      // malformed JSON or a throwing listener must not kill the socket handler
      this.fail(
        new HermesWebSocketError("Failed to handle incoming message", false, e),
      );
    }
  }

  private onNotification(msg: HermesMessageNotification): void {
    this.emit("notification", msg);
    if (msg.notification.type !== "pubsub") return;

    // A subscription exists only while it has listeners, so a hit always means work to do.
    const sub = this.subsById.get(msg.notification.subscription.id);
    if (sub === undefined) return;

    const payload: unknown = JSON.parse(
      (msg as HermesMessagePubsub).notification.pubsub,
    );
    const handlers = sub.handlers; // snapshot: add/remove replace the array
    for (const h of handlers) {
      if (h.once) this.removeEntry(sub, h);
      try {
        h.fn(payload, sub.target);
      } catch (e) {
        // one broken listener must not starve the others
        this.fail(
          new HermesWebSocketError(`Listener for ${sub.wire} threw`, false, e),
        );
      }
    }
  }

  private onWelcome(msg: HermesMessageWelcome): void {
    const soft = this.status === "soft-reconnect";

    clearTimeout(this.connectTimer);
    this.connectTimer = undefined;
    if (soft) {
      this.log("Soft reconnect successful. Closing old connection.");
      this.detach(this.oldWs);
      this.oldWs = undefined;
    }

    this.retries = 0;
    this.status = "running";
    this.armWatchdog(msg.welcome.keepaliveSec);

    const newSession = !soft;
    if (soft && msg.welcome.sessionId !== this.sessionId) {
      this.log(
        `sessionId changed during soft reconnect: ${this.sessionId} -> ${msg.welcome.sessionId}`,
      );
    }
    this.sessionId = msg.welcome.sessionId;

    if (newSession) {
      this.resetSubscriptions();
      if (this.auth) this.send("authenticate", { token: this.auth.token });
    }
    // New session: everything is not live. Soft reconnect: only what was added meanwhile.
    for (const sub of this.subsByWire.values()) {
      if (!sub.live) this.sendSubscribe(sub);
    }

    // Emit last: a throwing listener must not leave the session half set up.
    this.emit("welcome", msg);
    if (newSession) this.emit("new-session", msg.welcome.sessionId);
  }

  private onReconnect(msg: HermesMessageReconnect): void {
    if (this.status === "running") this.open(msg.reconnect.url, true);
    else this.log(`Ignoring reconnect request in state ${this.status}`);
    this.emit("reconnect", msg);
  }

  // ───────── errors ─────────

  private fail(error: HermesWebSocketError): void {
    if (this.listenerCount("error") > 0) this.emit("error", error);
    else this.log(error.message, error.cause ?? "");
  }
}
