import type { SocketManager } from "./ws/socket-manager";

let socketManager: SocketManager | null = null;

export function setSocketManager(manager: SocketManager): void {
  socketManager = manager;
}

export function getSocketManager(): SocketManager {
  if (!socketManager) {
    throw new Error("SocketManager has not been initialized");
  }
  return socketManager;
}
