import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ClientMessage, ServerMessage } from "../../shared/protocol";
import { gameReducer, initialGameState, type GameAction } from "../state/gameReducer";
import { RoomSocket } from "./RoomSocket";

interface UseRoomSocketInput {
  code: string;
  token: string;
}

export function useRoomSocket({ code, token }: UseRoomSocketInput) {
  const [state, dispatch] = useReducer(gameReducer, initialGameState);
  const socketRef = useRef<RoomSocket | null>(null);

  useEffect(() => {
    const socket = new RoomSocket({
      code,
      token,
      onStatus: (connection) => dispatch({ type: "connection", connection }),
      onMessage: (message) => {
        const action = messageToAction(message);
        if (action) dispatch(action);
      },
    });
    socketRef.current = socket;
    dispatch({ type: "connection", connection: "connecting" });
    socket.connect();
    return () => {
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [code, token]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      dispatch({ type: "prune_cursors", now: Date.now() });
    }, 2000);
    return () => window.clearInterval(interval);
  }, []);

  const version = state.room?.version;

  const send = useCallback((message: ClientMessage) => {
    return socketRef.current?.send(message) ?? false;
  }, []);

  const grab = useCallback(
    (pieceId: string) => {
      if (version === undefined) return;
      send({ type: "grab_piece", pieceId, version });
    },
    [send, version],
  );

  const release = useCallback(
    (pieceId: string) => {
      if (version === undefined) return;
      send({ type: "release_piece", pieceId, version });
    },
    [send, version],
  );

  const drag = useCallback(
    (pieceId: string, x: number, y: number) => {
      if (version === undefined) return;
      send({ type: "drag_piece", pieceId, version, x, y });
    },
    [send, version],
  );

  const dragOff = useCallback(
    (pieceId: string) => {
      if (version === undefined) return;
      send({ type: "drag_off", pieceId, version });
    },
    [send, version],
  );

  const place = useCallback(
    (pieceId: string, x: number, y: number) => {
      if (version === undefined) return;
      send({ type: "place_piece", pieceId, version, x, y });
    },
    [send, version],
  );

  const cursor = useCallback(
    (x: number, y: number) => {
      send({ type: "cursor", x, y });
    },
    [send],
  );

  const dismissNotice = useCallback((seq: number) => {
    dispatch({ type: "dismiss_notice", seq });
  }, []);

  return {
    state,
    actions: { grab, release, drag, dragOff, place, cursor, dismissNotice },
  };
}

function messageToAction(message: ServerMessage): GameAction | null {
  switch (message.type) {
    case "snapshot":
      return {
        type: "snapshot",
        room: message.room,
        you: message.you,
        players: message.players,
        placedPieces: message.placedPieces,
        locks: message.locks,
        drags: message.drags,
      };
    case "players":
      return { type: "players", players: message.players };
    case "cursor":
      return {
        type: "cursor",
        playerId: message.playerId,
        x: message.x,
        y: message.y,
        now: Date.now(),
      };
    case "piece_grabbed":
      return { type: "grab", pieceId: message.pieceId, playerId: message.playerId };
    case "piece_released":
      return {
        type: "release",
        pieceId: message.pieceId,
        playerId: message.playerId,
        reason: message.reason,
      };
    case "piece_drag":
      return {
        type: "drag",
        pieceId: message.pieceId,
        playerId: message.playerId,
        x: message.x,
        y: message.y,
      };
    case "piece_drag_off":
      return { type: "drag_off", pieceId: message.pieceId };
    case "piece_placed":
      return {
        type: "placed",
        pieceId: message.pieceId,
        placedCount: message.placedCount,
        version: message.version,
        complete: message.complete,
      };
    case "puzzle_started":
      return { type: "puzzle_started", room: message.room, players: message.players };
    case "room_deleted":
      return { type: "deleted" };
    case "error":
      return { type: "error", message: message.message, pieceId: message.pieceId };
    default:
      return null;
  }
}
