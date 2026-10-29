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

  constructor(options: RoomSocketOptions) {
    this.options = options;
  }

  connect(): void {
    if (this.stopped) return;
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
      if (this.stopped) return;
      this.attempts = 0;
      this.options.onStatus("open");
      this.send({
        type: "hello",
        code: this.options.code,
        token: this.options.token,
      });
    });

    ws.addEventListener("message", (event) => {
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
    this.ws.send(JSON.stringify(message));
    return true;
  }

  close(): void {
    this.stopped = true;
    this.clearReconnect();
    if (this.ws) {
      this.ws.close(1000, "Leaving room");
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
