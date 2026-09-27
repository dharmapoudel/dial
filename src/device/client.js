/**
 * device/client.js — BridgethingClient wrapper for Dial.
 *
 * initClient({ onVoiceIntent, onConnect, onDisconnect }) -> {
 *   pushToTalk(), volumeUp(), volumeDown(), getConfig(key), connected(), dispose()
 * }
 *
 * Degrades gracefully: when the daemon is unreachable (desktop browser
 * dev, Node, no WebSocket global) the wrapper still constructs, the app
 * boots normally, and every action becomes a safe no-op. Nothing here
 * ever throws and nothing blocks boot — the underlying client reconnects
 * on its own and onConnect fires when the daemon appears.
 */

import { BridgethingClient } from '@bridgething/client';

/** Swallow a promise's rejection — daemon calls must never surface. */
function fire(p) {
  try {
    Promise.resolve(p).catch(() => {});
  } catch {
    /* noop */
  }
}

export function initClient(handlers = {}) {
  const { onVoiceIntent, onConnect, onDisconnect } = handlers;

  let client = null;
  try {
    client = new BridgethingClient({ autoConnect: true, reconnect: true });
  } catch {
    // No WebSocket global (Node) or constructor failure: stay degraded.
    client = null;
  }

  if (client) {
    try {
      client.on((event) => {
        try {
          if (event.type === 'open') {
            if (onConnect) onConnect();
          } else if (event.type === 'close') {
            if (onDisconnect) onDisconnect(event.code, event.reason);
          }
        } catch {
          /* handler errors must not break the client */
        }
      });
      client.voice.onIntent((msg) => {
        try {
          if (onVoiceIntent) {
            onVoiceIntent(msg && msg.transcript ? String(msg.transcript) : '');
          }
        } catch {
          /* noop */
        }
      });
    } catch {
      /* subscription failure must not break boot */
    }
  } else if (onDisconnect) {
    try {
      onDisconnect();
    } catch {
      /* noop */
    }
  }

  /** True only when the daemon socket is open. */
  function connected() {
    try {
      return !!client && client.connectionState === 'open';
    } catch {
      return false;
    }
  }

  /** Start a push-to-talk voice capture. No-op when offline. */
  function pushToTalk() {
    if (!connected()) return Promise.resolve(false);
    try {
      fire(client.voice.pushToTalk());
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }

  /** Ask the daemon to raise the device volume. No-op when offline. */
  function volumeUp() {
    if (!connected()) return;
    try {
      fire(client.audio.volumeUp());
    } catch {
      /* noop */
    }
  }

  /** Ask the daemon to lower the device volume. No-op when offline. */
  function volumeDown() {
    if (!connected()) return;
    try {
      fire(client.audio.volumeDown());
    } catch {
      /* noop */
    }
  }

  /**
   * Read one of this webapp's manifest config keys (e.g. 'dj_voice',
   * 'haptics'). Resolves to the string value, or null when unset /
   * unreachable / timed out. Never rejects.
   */
  async function getConfig(key) {
    if (!connected()) return null;
    try {
      const res = await client.config.get({ key: String(key) }, { timeoutMs: 2500 });
      if (res && res.ok && res.response) {
        return res.response.value != null ? String(res.response.value) : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Stop the client and release the socket. */
  function dispose() {
    try {
      if (client) client.close();
    } catch {
      /* noop */
    }
    client = null;
  }

  return { pushToTalk, volumeUp, volumeDown, getConfig, connected, dispose };
}
