import type {
  CreatedRoomResponse,
  JoinRoomResponse,
  RoomPreview,
  RoomDto,
} from "../../shared/protocol";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: BodyInit;
    token?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (typeof options.body === "string") headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      body: options.body,
      headers,
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiRequestError(0, "network_error", "We could not reach the room. Check your connection.");
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = payload as { error?: { code?: string; message?: string } } | null;
    throw new ApiRequestError(
      response.status,
      body?.error?.code ?? "request_failed",
      body?.error?.message ?? "That did not work. Please try again.",
    );
  }

  return payload as T;
}

export function getRoomPreview(code: string, signal?: AbortSignal): Promise<{ room: RoomPreview }> {
  return request(`/api/rooms/${encodeURIComponent(code)}/preview`, { signal });
}

export function createRoom(form: FormData): Promise<CreatedRoomResponse> {
  return request("/api/rooms", { method: "POST", body: form });
}

export function joinRoom(
  code: string,
  input: { name?: string; token?: string },
): Promise<JoinRoomResponse> {
  return request(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function startPuzzle(code: string, token: string, form: FormData): Promise<{ room: RoomDto }> {
  return request(`/api/rooms/${encodeURIComponent(code)}/puzzle`, {
    method: "POST",
    body: form,
    token,
  });
}

export function deleteRoom(code: string, token: string): Promise<void> {
  return request(`/api/rooms/${encodeURIComponent(code)}`, {
    method: "DELETE",
    token,
  });
}
