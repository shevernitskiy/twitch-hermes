import { afterEach, describe, expect, test } from "bun:test";

import {
  HermesWebSocket,
  HermesWebSocketError,
  type HermesMessageSubscribe,
  type HermesOptions,
} from "../src/hermes.ts";

// ───────────────────────────── test harness ─────────────────────────────

interface Sent {
  id: string;
  type: string;
  authenticate?: { token: string };
  subscribe?: { id: string; type: string; pubsub: { topic: string } };
  unsubscribe?: { id: string };
}

/** Minimal stand-in for a WebSocket. The test plays the server. */
class FakeSocket {
  readyState = 0; // CONNECTING
  sent: Sent[] = [];
  closeCalls = 0;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  readonly url: string;
  readonly headers: Record<string, string>;

  constructor(url: string, headers: Record<string, string>) {
    this.url = url;
    this.headers = headers;
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.closeCalls++;
    this.readyState = 3;
  }

  // server side
  open(): this {
    this.readyState = 1;
    this.onopen?.();
    return this;
  }

  recv(msg: unknown): void {
    this.onmessage?.({
      data: typeof msg === "string" ? msg : JSON.stringify(msg),
    });
  }

  serverClose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }

  subscribes(): NonNullable<Sent["subscribe"]>[] {
    return this.sent.flatMap((m) => (m.subscribe ? [m.subscribe] : []));
  }

  subIdFor(wire: string): string {
    const sub = this.subscribes().find((s) => s.pubsub.topic === wire);
    if (!sub)
      throw new Error(
        `no subscribe for ${wire}; sent: ${JSON.stringify(this.sent)}`,
      );
    return sub.id;
  }
}

const clients: HermesWebSocket[] = [];

function setup(options: HermesOptions = {}) {
  const sockets: FakeSocket[] = [];
  const client = new HermesWebSocket({
    reconnectDelayMs: 20,
    connectTimeoutMs: 500,
    ...options,
    createWebSocket: (url, headers) => {
      const s = new FakeSocket(url, headers);
      sockets.push(s);
      return s as unknown as WebSocket;
    },
  });
  clients.push(client);
  return { client, sockets };
}

afterEach(() => {
  for (const c of clients.splice(0)) c.stop();
});

const noop = () => {};
const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const welcome = (sessionId: string, keepaliveSec = 10) => ({
  type: "welcome",
  id: "w",
  timestamp: "",
  welcome: { keepaliveSec, recoveryUrl: "", sessionId },
});

const keepalive = () => ({ type: "keepalive", id: "k", timestamp: "" });

const pubsub = (subscriptionId: string, payload: unknown) => ({
  type: "notification",
  id: "n",
  timestamp: "",
  notification: {
    subscription: { id: subscriptionId },
    type: "pubsub",
    pubsub: typeof payload === "string" ? payload : JSON.stringify(payload),
  },
});

/** open + welcome */
function handshake(s: FakeSocket, sessionId = "S1", keepaliveSec = 10): void {
  s.open();
  s.recv(welcome(sessionId, keepaliveSec));
}

// ───────────────────────────── API misuse ─────────────────────────────

describe("misuse", () => {
  test("start() without listeners throws", () => {
    const { client } = setup();
    expect(() => client.start()).toThrow();
  });

  test("onUserEvent() without auth throws HermesWebSocketError", () => {
    const { client } = setup();
    let err: unknown;
    try {
      client.onUserEvent("community-points-user-v1", noop);
    } catch (e) {
      err = e;
    }
    expect(err instanceof HermesWebSocketError).toBe(true);
  });
});

// ───────────────────────────── handshake ─────────────────────────────

describe("session start", () => {
  test("connects with clientId and headers, then authenticates before subscribing", () => {
    const { client, sockets } = setup({
      auth: { token: "TOKEN", userId: "42" },
      clientId: "my-client",
      headers: { "X-Test": "1" },
    });
    client.onChannelEvent("polls", "100", noop);
    client.onUserEvent("community-points-user-v1", noop);
    client.start();

    const s = sockets[0]!;
    expect(s.url).toBe("wss://hermes.twitch.tv/v1?clientId=my-client");
    expect(s.headers["Origin"]).toBe("https://www.twitch.tv");
    expect(s.headers["X-Test"]).toBe("1");

    handshake(s);
    expect(s.sent.map((m) => m.type)).toEqual([
      "authenticate",
      "subscribe",
      "subscribe",
    ]);
    expect(s.sent[0]?.authenticate?.token).toBe("TOKEN");
    expect(s.subscribes().map((x) => x.pubsub.topic)).toEqual([
      "polls.100",
      "community-points-user-v1.42",
    ]);
    expect(client.connected).toBe(true);
  });

  test("no authenticate message without auth", () => {
    const { client, sockets } = setup();
    client.onChannelEvent("polls", "100", noop);
    client.start();
    handshake(sockets[0]!);
    expect(sockets[0]!.sent.map((m) => m.type)).toEqual(["subscribe"]);
  });

  test("duplicate subscribe is ignored", () => {
    const { client, sockets } = setup();
    client.onChannelEvent("polls", "100", noop);
    client.onChannelEvent("polls", "100", noop);
    client.start();
    handshake(sockets[0]!);
    expect(sockets[0]!.subscribes()).toHaveLength(1);
  });

  test("emits new-session once per session", () => {
    const { client, sockets } = setup();
    const sessions: string[] = [];
    client.on("new-session", (id) => sessions.push(id));
    client.onChannelEvent("polls", "100", noop);
    client.start();
    handshake(sockets[0]!, "S1");
    expect(sessions).toEqual(["S1"]);
  });
});

// ───────────────────────────── dispatch ─────────────────────────────

describe("dispatch", () => {
  test("channel topic: parsed payload + channelId", () => {
    const { client, sockets } = setup();
    const got: [number, string][] = [];
    client.onChannelEvent("video-playback-by-id", "100", (e, channelId) =>
      // @ts-expect-error
      got.push([e.viewers, channelId]),
    );
    client.start();
    const s = sockets[0]!;
    handshake(s);

    s.recv(
      pubsub(s.subIdFor("video-playback-by-id.100"), {
        type: "viewcount",
        viewers: 7,
      }),
    );
    expect(got).toEqual([[7, "100"]]);
  });

  test("user topic: parsed payload + userId", () => {
    const { client, sockets } = setup({ auth: { token: "T", userId: "42" } });
    const got: [string, string][] = [];
    client.onUserEvent("community-points-user-v1", (e) =>
      got.push([e.type, "42"]),
    );
    client.start();
    const s = sockets[0]!;
    handshake(s);

    s.recv(
      pubsub(s.subIdFor("community-points-user-v1.42"), {
        type: "points-earned",
      }),
    );
    expect(got).toEqual([["points-earned", "42"]]);
  });

  test("raw notification event always fires", () => {
    const { client, sockets } = setup();
    let raw = 0;
    client.on("notification", () => raw++);
    client.onChannelEvent("polls", "100", noop);
    client.start();
    const s = sockets[0]!;
    handshake(s);
    s.recv(pubsub(s.subIdFor("polls.100"), { type: "POLL_CREATE" }));
    expect(raw).toBe(1);
  });

  test("two listeners share one wire subscription and both get the event", () => {
    const { client, sockets } = setup();
    const got: string[] = [];
    client.onChannelEvent("polls", "100", () => got.push("a"));
    client.onChannelEvent("polls", "100", () => got.push("b"));
    client.start();
    const s = sockets[0]!;
    handshake(s);
    expect(s.subscribes()).toHaveLength(1);

    s.recv(pubsub(s.subIdFor("polls.100"), { type: "POLL_CREATE" }));
    expect(got).toEqual(["a", "b"]);
  });

  test("same topic on different channels are independent subscriptions", () => {
    const { client, sockets } = setup();
    const got: string[] = [];
    client.onChannelEvent("polls", "1", (_e, id) => got.push(id));
    client.onChannelEvent("polls", "2", (_e, id) => got.push(id));
    client.start();
    const s = sockets[0]!;
    handshake(s);
    expect(s.subscribes()).toHaveLength(2);

    s.recv(pubsub(s.subIdFor("polls.2"), { type: "POLL_CREATE" }));
    expect(got).toEqual(["2"]);
  });

  test("unknown subscription id is ignored", () => {
    const { client, sockets } = setup();
    let calls = 0;
    client.onChannelEvent("polls", "100", () => calls++);
    client.start();
    handshake(sockets[0]!);
    sockets[0]!.recv(pubsub("nope", { type: "POLL_CREATE" }));
    expect(calls).toBe(0);
  });

  test("subscribe-response carries topic and target", () => {
    const { client, sockets } = setup();
    const got: [string, string][] = [];
    client.on("subscribe-response", (_m, topic, target) =>
      got.push([topic, target]),
    );
    client.onChannelEvent("polls", "100", noop);
    client.start();
    const s = sockets[0]!;
    handshake(s);
    s.recv({
      type: "subscribeResponse",
      id: "r",
      timestamp: "",
      subscribeResponse: {
        subscription: { id: s.subIdFor("polls.100") },
        result: "ok",
        topic: "polls.100",
      },
    });
    expect(got).toEqual([["polls", "100"]]);
  });

  test("unsubscribe-response is emitted", () => {
    const { client, sockets } = setup();
    const results: string[] = [];
    client.on("unsubscribe-response", (message) =>
      results.push(message.unsubscribeResponse.result),
    );
    client.onChannelEvent("polls", "100", noop);
    client.start();
    const s = sockets[0]!;
    handshake(s);
    s.recv({
      type: "unsubscribeResponse",
      id: "r",
      timestamp: "",
      parentId: "u",
      unsubscribeResponse: {
        subscription: { id: s.subIdFor("polls.100") },
        result: "ok",
      },
    });
    expect(results).toEqual(["ok"]);
  });

  test("malformed JSON becomes a non-fatal error event, client keeps working", () => {
    const { client, sockets } = setup();
    const errors: HermesWebSocketError[] = [];
    let polls = 0;
    client.on("error", (e) => errors.push(e));
    client.onChannelEvent("polls", "100", () => polls++);
    client.start();
    const s = sockets[0]!;
    handshake(s);

    s.recv("{ not json");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.fatal).toBe(false);

    s.recv(pubsub(s.subIdFor("polls.100"), { type: "POLL_CREATE" }));
    expect(polls).toBe(1);
  });

  test("a throwing listener is reported, does not starve the next listener or the next message", () => {
    const { client, sockets } = setup();
    const errors: HermesWebSocketError[] = [];
    let bad = 0;
    let good = 0;
    client.on("error", (e) => errors.push(e));
    client.onChannelEvent("polls", "100", () => {
      bad++;
      throw new Error("boom");
    });
    client.onChannelEvent("polls", "100", () => good++);
    client.start();
    const s = sockets[0]!;
    handshake(s);
    const id = s.subIdFor("polls.100");

    s.recv(pubsub(id, { type: "POLL_CREATE" }));
    s.recv(pubsub(id, { type: "POLL_UPDATE" }));
    expect(bad).toBe(2);
    expect(good).toBe(2);
    expect(errors).toHaveLength(2);
    expect((errors[0]?.cause as Error).message).toBe("boom");
  });

  test("onUserEvent without auth does not leave a half-created subscription behind", () => {
    const { client } = setup();
    try {
      client.onUserEvent("community-points-user-v1", noop);
    } catch {
      /* expected */
    }
    expect(() => client.start()).toThrow();
  });
});

// ───────────────────────────── once / dispose ─────────────────────────────

describe("once and unsubscribe", () => {
  test("onceChannelEvent fires once and drops the wire subscription", () => {
    const { client, sockets } = setup();
    let calls = 0;
    client.onChannelEvent("shoutout", "100", noop); // keeps the connection non-empty
    client.onceChannelEvent("polls", "100", () => calls++);
    client.start();
    const s = sockets[0]!;
    handshake(s);
    const id = s.subIdFor("polls.100");

    s.recv(pubsub(id, { type: "POLL_CREATE" }));
    s.recv(pubsub(id, { type: "POLL_UPDATE" }));
    expect(calls).toBe(1);
    expect(s.sent.at(-1)?.unsubscribe?.id).toBe(id);
  });

  test("onceUserEvent fires once", () => {
    const { client, sockets } = setup({ auth: { token: "T", userId: "42" } });
    let calls = 0;
    client.onChannelEvent("polls", "100", noop);
    client.onceUserEvent("community-points-user-v1", () => calls++);
    client.start();
    const s = sockets[0]!;
    handshake(s);
    const id = s.subIdFor("community-points-user-v1.42");
    s.recv(pubsub(id, { type: "points-earned" }));
    s.recv(pubsub(id, { type: "points-earned" }));
    expect(calls).toBe(1);
  });

  test("once + regular listener on the same subscription: wire stays until the last is gone", () => {
    const { client, sockets } = setup();
    let once = 0;
    let always = 0;
    client.onceChannelEvent("polls", "100", () => once++);
    const off = client.onChannelEvent("polls", "100", () => always++);
    client.start();
    const s = sockets[0]!;
    handshake(s);
    const id = s.subIdFor("polls.100");

    s.recv(pubsub(id, { type: "POLL_CREATE" }));
    s.recv(pubsub(id, { type: "POLL_UPDATE" }));
    expect([once, always]).toEqual([1, 2]);
    expect(s.sent.some((m) => m.type === "unsubscribe")).toBe(false);

    off();
    expect(s.sent.at(-1)?.unsubscribe?.id).toBe(id);
  });

  test("disposer removes only its own listener; wire unsubscribe after the last one", () => {
    const { client, sockets } = setup();
    const got: string[] = [];
    const offA = client.onChannelEvent("polls", "100", () => got.push("a"));
    const offB = client.onChannelEvent("polls", "100", () => got.push("b"));
    client.onChannelEvent("shoutout", "100", noop);
    client.start();
    const s = sockets[0]!;
    handshake(s);
    const id = s.subIdFor("polls.100");

    offA();
    expect(s.sent.some((m) => m.type === "unsubscribe")).toBe(false);
    s.recv(pubsub(id, { type: "POLL_CREATE" }));
    expect(got).toEqual(["b"]);

    offB();
    expect(s.sent.at(-1)?.unsubscribe?.id).toBe(id);
    s.recv(pubsub(id, { type: "POLL_CREATE" })); // late notification is ignored
    expect(got).toEqual(["b"]);
  });

  test("disposer is idempotent and a stale disposer cannot kill a re-created subscription", () => {
    const { client, sockets } = setup();
    let calls = 0;
    client.onChannelEvent("shoutout", "100", noop);
    const off = client.onChannelEvent("polls", "100", noop);
    client.start();
    const s = sockets[0]!;
    handshake(s);

    off();
    off(); // second call: no second unsubscribe
    expect(s.sent.filter((m) => m.type === "unsubscribe")).toHaveLength(1);

    client.onChannelEvent("polls", "100", () => calls++); // same wire topic, new subscription
    off(); // stale
    const sub = s
      .subscribes()
      .filter((x) => x.pubsub.topic === "polls.100")
      .at(-1);
    expect(sub !== undefined).toBe(true);
    s.recv(pubsub(sub!.id, { type: "POLL_CREATE" }));
    expect(calls).toBe(1);
  });

  test("a listener may dispose itself during dispatch without skipping the others", () => {
    const { client, sockets } = setup();
    const got: string[] = [];
    const off = client.onChannelEvent("polls", "100", () => {
      got.push("a");
      off();
    });
    client.onChannelEvent("polls", "100", () => got.push("b"));
    client.start();
    const s = sockets[0]!;
    handshake(s);
    const id = s.subIdFor("polls.100");

    s.recv(pubsub(id, { type: "POLL_CREATE" }));
    s.recv(pubsub(id, { type: "POLL_UPDATE" }));
    expect(got).toEqual(["a", "b", "b"]);
  });
});

// ───────────────────────────── live subscriptions ─────────────────────────────

describe("listeners added while running", () => {
  test("a listener added after start() is subscribed immediately", () => {
    const { client, sockets } = setup();
    client.onChannelEvent("polls", "100", noop);
    client.start();
    const s = sockets[0]!;
    handshake(s);
    client.onChannelEvent("shoutout", "100", noop);
    expect(s.subscribes().at(-1)?.pubsub.topic).toBe("shoutout.100");
  });

  test("a listener added before welcome is subscribed on welcome, not earlier", () => {
    const { client, sockets } = setup();
    client.onChannelEvent("polls", "100", noop);
    client.start();
    const s = sockets[0]!;
    s.open();
    client.onChannelEvent("shoutout", "100", noop);
    expect(s.sent).toHaveLength(0);
    s.recv(welcome("S1"));
    expect(s.subscribes().map((x) => x.pubsub.topic)).toEqual([
      "polls.100",
      "shoutout.100",
    ]);
  });
});

// ───────────────────────────── soft reconnect ─────────────────────────────

describe("soft reconnect", () => {
  test("opens a second socket, keeps the old one until welcome, then closes it", () => {
    const { client, sockets } = setup();
    let calls = 0;
    client.onChannelEvent("polls", "100", () => calls++);
    client.start();
    const s1 = sockets[0]!;
    handshake(s1);

    s1.recv({
      type: "reconnect",
      id: "r",
      timestamp: "",
      reconnect: { url: "wss://new" },
    });
    expect(sockets).toHaveLength(2);
    expect(sockets[1]!.url).toBe("wss://new");
    expect(s1.closeCalls).toBe(0);
    expect(client.connected).toBe(true);

    // old socket still delivers while the new one is coming up
    s1.recv(pubsub(s1.subIdFor("polls.100"), { type: "POLL_CREATE" }));
    expect(calls).toBe(1);

    handshake(sockets[1]!);
    expect(s1.closeCalls).toBe(1);
    expect(s1.onmessage).toBe(null);
  });

  test("session continues: no resubscribe, no new-session", () => {
    const { client, sockets } = setup();
    let sessions = 0;
    client.on("new-session", () => sessions++);
    client.onChannelEvent("polls", "100", noop);
    client.start();
    handshake(sockets[0]!);
    sockets[0]!.recv({
      type: "reconnect",
      id: "r",
      timestamp: "",
      reconnect: { url: "wss://new" },
    });
    handshake(sockets[1]!);

    expect(sessions).toBe(1);
    expect(sockets[1]!.sent).toHaveLength(0);
  });

  test("a subscription added mid-reconnect is sent on the new socket only", () => {
    const { client, sockets } = setup();
    client.onChannelEvent("polls", "100", noop);
    client.start();
    handshake(sockets[0]!);
    sockets[0]!.recv({
      type: "reconnect",
      id: "r",
      timestamp: "",
      reconnect: { url: "wss://new" },
    });

    client.onChannelEvent("shoutout", "100", noop);
    expect(sockets[0]!.subscribes()).toHaveLength(1);

    handshake(sockets[1]!);
    expect(sockets[1]!.subscribes().map((x) => x.pubsub.topic)).toEqual([
      "shoutout.100",
    ]);
  });

  test("the old socket closing by itself does not trigger a hard reconnect", async () => {
    const { client, sockets } = setup();
    client.onChannelEvent("polls", "100", noop);
    client.start();
    handshake(sockets[0]!);
    sockets[0]!.recv({
      type: "reconnect",
      id: "r",
      timestamp: "",
      reconnect: { url: "wss://new" },
    });

    sockets[0]!.serverClose(1000);
    handshake(sockets[1]!);
    await wait(60);
    expect(sockets).toHaveLength(2);
    expect(client.connected).toBe(true);
  });

  test("a repeated reconnect request while soft-reconnecting is ignored", () => {
    const { client, sockets } = setup();
    client.onChannelEvent("polls", "100", noop);
    client.start();
    handshake(sockets[0]!);
    const r = {
      type: "reconnect",
      id: "r",
      timestamp: "",
      reconnect: { url: "wss://new" },
    };
    sockets[0]!.recv(r);
    sockets[0]!.recv(r);
    expect(sockets).toHaveLength(2);
  });

  test("new socket dying falls back to a hard reconnect and cleans up both", async () => {
    const { client, sockets } = setup();
    client.onChannelEvent("polls", "100", noop);
    client.start();
    handshake(sockets[0]!);
    sockets[0]!.recv({
      type: "reconnect",
      id: "r",
      timestamp: "",
      reconnect: { url: "wss://new" },
    });

    sockets[1]!.serverClose(1006);
    expect(sockets[0]!.closeCalls).toBe(1);
    await wait(15); // first retry is immediate
    expect(sockets).toHaveLength(3);
    expect(sockets[2]!.url).toBe(
      "wss://hermes.twitch.tv/v1?clientId=kimne78kx3ncx6brgo4mv6wki5h1ko",
    );
  });
});

// ───────────────────────────── hard reconnect ─────────────────────────────

describe("hard reconnect", () => {
  test("first retry is immediate, new session resubscribes everything with fresh ids", async () => {
    const { client, sockets } = setup({ auth: { token: "T", userId: "42" } });
    const sessions: string[] = [];
    client.on("new-session", (id) => sessions.push(id));
    client.onChannelEvent("polls", "100", noop);
    client.onUserEvent("community-points-user-v1", noop);
    client.start();
    handshake(sockets[0]!, "S1");
    const oldId = sockets[0]!.subIdFor("polls.100");

    sockets[0]!.serverClose(1006);
    await wait(15);
    expect(sockets).toHaveLength(2);

    handshake(sockets[1]!, "S2");
    expect(sockets[1]!.sent.map((m) => m.type)).toEqual([
      "authenticate",
      "subscribe",
      "subscribe",
    ]);
    expect(sockets[1]!.subIdFor("polls.100") === oldId).toBe(false);
    expect(sessions).toEqual(["S1", "S2"]);
  });

  test("notifications for the previous session's ids are ignored", async () => {
    const { client, sockets } = setup();
    let calls = 0;
    client.onChannelEvent("polls", "100", () => calls++);
    client.start();
    handshake(sockets[0]!, "S1");
    const oldId = sockets[0]!.subIdFor("polls.100");
    sockets[0]!.serverClose(1006);
    await wait(15);
    handshake(sockets[1]!, "S2");

    sockets[1]!.recv(pubsub(oldId, { type: "POLL_CREATE" }));
    expect(calls).toBe(0);
    sockets[1]!.recv(
      pubsub(sockets[1]!.subIdFor("polls.100"), { type: "POLL_CREATE" }),
    );
    expect(calls).toBe(1);
  });

  test("later retries back off", async () => {
    const { client, sockets } = setup({
      reconnectDelayMs: 40,
      maxReconnectDelayMs: 40,
    });
    client.onChannelEvent("polls", "100", noop);
    client.start();
    handshake(sockets[0]!);

    sockets[0]!.serverClose(1006);
    await wait(10);
    expect(sockets).toHaveLength(2); // immediate

    sockets[1]!.serverClose(1006); // never got a welcome, so the retry counter is not reset
    await wait(10);
    expect(sockets).toHaveLength(2); // still waiting (>= 32ms with jitter)
    await wait(80);
    expect(sockets).toHaveLength(3);
  });

  test("a welcome resets the retry counter", async () => {
    const { client, sockets } = setup({
      reconnectDelayMs: 200,
      maxReconnectDelayMs: 200,
    });
    client.onChannelEvent("polls", "100", noop);
    client.start();
    handshake(sockets[0]!);

    sockets[0]!.serverClose(1006);
    await wait(10);
    handshake(sockets[1]!);
    sockets[1]!.serverClose(1006);
    await wait(10);
    expect(sockets).toHaveLength(3); // immediate again, not 200ms
  });

  test("close event is emitted with the close code", () => {
    const { client, sockets } = setup();
    const codes: number[] = [];
    client.on("close", (ev) => codes.push(ev.code));
    client.onChannelEvent("polls", "100", noop);
    client.start();
    handshake(sockets[0]!);
    sockets[0]!.serverClose(1011);
    expect(codes).toEqual([1011]);
  });

  test("4003 (connection unused) stops the client without reconnecting", async () => {
    const { client, sockets } = setup();
    client.onChannelEvent("polls", "100", noop);
    client.start();
    handshake(sockets[0]!);
    sockets[0]!.serverClose(4003);
    await wait(60);
    expect(sockets).toHaveLength(1);
    expect(client.connected).toBe(false);
  });
});

// ───────────────────────────── watchdogs ─────────────────────────────

describe("watchdogs", () => {
  test("silence longer than the threshold triggers a reconnect and closes the dead socket", async () => {
    const { client, sockets } = setup({ keepaliveTimeoutMs: 120 });
    client.onChannelEvent("polls", "100", noop);
    client.start();
    handshake(sockets[0]!);
    await wait(350);
    expect(sockets.length).toBeGreaterThan(1);
    expect(sockets[0]!.closeCalls).toBe(1);
  });

  test("any traffic keeps the connection alive", async () => {
    const { client, sockets } = setup({ keepaliveTimeoutMs: 150 });
    client.onChannelEvent("polls", "100", noop);
    client.start();
    handshake(sockets[0]!);
    for (let i = 0; i < 6; i++) {
      await wait(50);
      sockets[0]!.recv(keepalive());
    }
    expect(sockets).toHaveLength(1);
  });

  test("default threshold is derived from keepaliveSec of the welcome", async () => {
    const { client, sockets } = setup(); // 2 x 0.1s = 200ms
    client.onChannelEvent("polls", "100", noop);
    client.start();
    handshake(sockets[0]!, "S1", 0.1);
    await wait(500);
    expect(sockets.length).toBeGreaterThan(1);
  });

  test("no welcome within connectTimeoutMs triggers a reconnect", async () => {
    const { client, sockets } = setup({ connectTimeoutMs: 60 });
    client.onChannelEvent("polls", "100", noop);
    client.start();
    sockets[0]!.open(); // upgrade done, but the server never says welcome
    await wait(200);
    expect(sockets.length).toBeGreaterThan(1);
    expect(sockets[0]!.closeCalls).toBe(1);
  });
});

// ───────────────────────────── giving up / lifecycle ─────────────────────────────

describe("giving up", () => {
  test("fatal error event after maxRetries", async () => {
    const { client, sockets } = setup({
      maxRetries: 2,
      reconnectDelayMs: 10,
      connectTimeoutMs: 30,
    });
    const errors: HermesWebSocketError[] = [];
    client.on("error", (e) => errors.push(e));
    client.onChannelEvent("polls", "100", noop);
    client.start();
    await wait(400);

    expect(sockets).toHaveLength(3); // initial + 2 retries
    expect(errors.at(-1)?.fatal).toBe(true);
    expect(client.connected).toBe(false);
  });

  test("without an error listener nothing throws, it is logged instead", async () => {
    const logs: unknown[][] = [];
    const { client } = setup({
      maxRetries: 1,
      reconnectDelayMs: 10,
      connectTimeoutMs: 30,
      log: (...args) => logs.push(args),
    });
    client.onChannelEvent("polls", "100", noop);
    client.start();
    await wait(250);
    expect(
      logs.some((l) => String(l[1]).includes("Max reconnect retries")),
    ).toBe(true);
  });

  test("close() stops everything and a later start() works again", async () => {
    const { client, sockets } = setup();
    client.onChannelEvent("polls", "100", noop);
    client.start();
    handshake(sockets[0]!);

    client.stop();
    expect(sockets[0]!.closeCalls).toBe(1);
    expect(client.connected).toBe(false);
    await wait(60);
    expect(sockets).toHaveLength(1);

    client.start();
    expect(sockets).toHaveLength(2);
    handshake(sockets[1]!, "S2");
    expect(sockets[1]!.subscribes()).toHaveLength(1);
  });

  test("close() while backing off cancels the pending retry", async () => {
    const { client, sockets } = setup({ reconnectDelayMs: 50 });
    client.onChannelEvent("polls", "100", noop);
    client.start();
    handshake(sockets[0]!);
    sockets[0]!.serverClose(1006);
    await wait(10);
    sockets[1]!.serverClose(1006); // now in backoff
    client.stop();
    await wait(150);
    expect(sockets).toHaveLength(2);
  });
});

// ───────────────────────────── compile-time checks ─────────────────────────────
// Never executed; `tsc` verifies the @ts-expect-error lines.

export function typeChecks(): void {
  const c = new HermesWebSocket();
  const extensionSubscribe = {
    type: "subscribe",
    id: "outer",
    timestamp: "",
    subscribe: {
      id: "inner",
      type: "extension",
      extension: {
        topic: "channel-ext-v1.extension-broadcast",
        token: "token",
      },
    },
  } satisfies HermesMessageSubscribe;
  void extensionSubscribe;
  // @ts-expect-error user topic is not a channel topic
  c.onChannelEvent("community-points-user-v1", "1", noop);
  // @ts-expect-error channel topic is not a user topic
  c.onUserEvent("polls", noop);
  // @ts-expect-error unknown topic
  c.onChannelEvent("nope", "1", noop);
  // @ts-expect-error user listeners get no target id, event is typed per topic
  c.onUserEvent("community-points-user-v1", (e: { nope: 1 }) => void e);

  const off: () => void = c.onChannelEvent(
    "video-playback-by-id",
    "1",
    (e, channelId) => {
      // @ts-expect-error
      const viewers: number = e.viewers;
      const id: string = channelId;
      void viewers;
      void id;
    },
  );
  off();
  c.onceUserEvent("community-points-user-v1", (e) => void e.type);
  c.onChannelEvent("raid", "1", (e) => {
    const type: "raid_update_v2" | "raid_go_v2" = e.type;
    void type;
  });
  c.onChannelEvent("leaderboard-events-v1", "clips-1", (e) => void e);
  c.onChannelEvent("guest-star-channel-v1", "1", (e) => {
    if (e.type === "favorite-channel-update") {
      const channelId: string = e.data.channel_id;
      void channelId;
    }
  });
  c.onChannelEvent("video-playback-by-id", "2", (e) => {
    if (e.type === "stream-up") {
      const delay: number = e.play_delay;
      void delay;
    }
  });
  c.onUserEvent("viewer-milestones", (e) => void e.data);
  c.on("error", (e) => void e.fatal);
}
