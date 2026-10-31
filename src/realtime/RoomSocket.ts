import type { ClientMessage, ServerMessage } from "../../shared/protocol";
import type { ConnectionState } from "../state/gameReducer";

interface RoomSocketOptions {
  code: string;
  token: string;
  onMessage: (message: ServerMessage) => void;
  onStatus: (status: ConnectionState) => void;
}

function socketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export class RoomSocket {
  private readonly options: RoomSocketOptions;
  private ws: WebSocket | null = null;
  private stopped = false;
  private attempts = 0;
  private reconnectTimer: number | null = null;

  private readonly handleWake = () => {
    if (this.stopped) return;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.attempts = 0;
    this.clearReconnect();
    this.connect();
  };

  private readonly handleVisibility = () => {
    if (document.visibilityState === "visible") this.handleWake();
  };

  constructor(options: RoomSocketOptions) {
    this.options = options;
    window.addEventListener("online", this.handleWake);
    document.addEventListener("visibilitychange", this.handleVisibility);
  }

  connect(): void {
    if (this.stopped) return;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.clearReconnect();
    this.options.onStatus(this.attempts === 0 ? "connecting" : "reconnecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(socketUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.addEventListener("open", () => {
      if (this.stopped || this.ws !== ws) {
        ws.close();
        return;
      }
      this.attempts = 0;
      this.options.onStatus("open");
      this.send({
        type: "hello",
        code: this.options.code,
        token: this.options.token,
      });
    });

    ws.addEventListener("message", (event) => {
      if (this.ws !== ws) return;
      if (typeof event.data !== "string") return;
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!payload || typeof payload !== "object" || typeof (payload as { type?: unknown }).type !== "string") {
        return;
      }
      const message = payload as ServerMessage;
      if (message.type === "room_deleted") {
        this.stopped = true;
      }
      this.options.onMessage(message);
    });

    ws.addEventListener("close", (event) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped) {
        this.options.onStatus("closed");
        return;
      }
      if (event.code === 4401 || event.code === 4404 || event.code === 4001) {
        this.stopped = true;
        this.options.onStatus("closed");
        return;
      }
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      // The close event owns reconnection.
    });
  }

  send(message: ClientMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.stopped = true;
    this.clearReconnect();
    window.removeEventListener("online", this.handleWake);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    if (this.ws) {
      try {
        this.ws.close(1000, "Leaving room");
      } catch {
        // Already closing.
      }
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== null) return;
    this.options.onStatus("reconnecting");
    const delay = Math.min(8000, 500 * 2 ** this.attempts) + Math.random() * 300;
    this.attempts++;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
