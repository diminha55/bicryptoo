import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import WebSocketManager from "@/utils/ws";

interface WebSocketOptions {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onMessage?: (message: any) => void;
}

interface MessageHandler {
  handler: (message: any) => void;
  filter: (message: any) => boolean;
}

interface Subscription {
  type: string;
  payload?: any;
}

interface WebSocketConnection {
  isConnected: boolean;
  wsManager: WebSocketManager | null;
  subscriptions: Subscription[];
  isTypeSubscribed: (type: string, payload?: any) => boolean;
}

interface WebSocketState {
  orderConnection: WebSocketConnection;
  tickersConnection: WebSocketConnection;
  ecoTickersConnection: WebSocketConnection;
  tradesConnection: WebSocketConnection;
  ordersConnection: WebSocketConnection;
  messageHandlers: { [key: string]: MessageHandler[] };
  send: (connectionKey: string, message: any) => void;
  addMessageHandler: (
    connectionKey: string,
    handler: (message: any) => void,
    filter?: (message: any) => boolean
  ) => void;
  hasMessageHandler: (
    connectionKey: string,
    handler: (message: any) => void
  ) => boolean;
  removeMessageHandler: (
    connectionKey: string,
    handler: (message: any) => void
  ) => void;
  createConnection: (
    connectionKey: string,
    path: string,
    options?: WebSocketOptions
  ) => Promise<void>;
  removeConnection: (connectionKey: string) => void;
  subscribe: (connectionKey: string, type: string, payload?: any) => void;
  unsubscribe: (connectionKey: string, type: string, payload?: any) => void;
}

const createWebSocketConnection = (): WebSocketConnection => ({
  isConnected: false,
  wsManager: null,
  subscriptions: [],
  isTypeSubscribed: function (
    this: WebSocketConnection,
    type: string,
    payload?: any
  ) {
    return this.subscriptions.some(
      (sub) => sub.type === type && sub.payload === payload
    );
  },
});

const useWebSocketStore = create<WebSocketState>()(
  immer((set, get) => ({
    orderConnection: createWebSocketConnection(),
    tickersConnection: createWebSocketConnection(),
    ecoTickersConnection: createWebSocketConnection(),
    tradesConnection: createWebSocketConnection(),
    ordersConnection: createWebSocketConnection(),
    messageHandlers: {},

    createConnection: async (
      connectionKey: string,
      path: string,
      options?: WebSocketOptions
    ): Promise<void> => {
      const connection = get()[connectionKey] as WebSocketConnection;

      if (!path) {
        return Promise.reject("Path is invalid.");
      }

      if (connection && connection.isConnected) {
        console.log(`Reusing existing connection for ${connectionKey}`);
        return Promise.resolve();
      }

      const wsManager = new WebSocketManager(path);

      set((state) => {
        state[connectionKey] = {
          isConnected: false,
          wsManager,
          subscriptions: [],
          isTypeSubscribed: createWebSocketConnection().isTypeSubscribed,
        };
      });

      wsManager.on("open", () => {
        console.log("WebSocket Connected to", path);
        set((state) => {
          state[connectionKey].isConnected = true;
        });
        options?.onOpen?.();
      });

      wsManager.on("close", () => {
        console.log("WebSocket Disconnected from", path);
        set((state) => {
          state[connectionKey].isConnected = false;
        });
        options?.onClose?.();
      });

      wsManager.on("error", (error) => {
        console.error("WebSocket error on", path, ":", error);
        options?.onError?.(error);
      });

      wsManager.on("message", (message) => {
        const handlers = get().messageHandlers[connectionKey] || [];
        handlers.forEach(({ handler, filter }) => {
          if (filter(message)) {
            handler(message);
          }
        });
      });

      wsManager.connect();
    },

    send: (connectionKey: string, message: any) => {
      const connection = get()[connectionKey] as WebSocketConnection;

      if (connection && connection.isConnected && connection.wsManager) {
        connection.wsManager.send(message);
      }
    },

    addMessageHandler: (
      connectionKey: string,
      handler: (message: any) => void,
      filter: (message: any) => boolean = () => true
    ) => {
      set((state) => {
        const handlers = state.messageHandlers[connectionKey] || [];
        handlers.push({ handler, filter });
        state.messageHandlers[connectionKey] = handlers;
      });
    },

    removeMessageHandler: (
      connectionKey: string,
      handler: (message: any) => void
    ) => {
      set((state) => {
        const handlers = state.messageHandlers[connectionKey] || [];
        state.messageHandlers[connectionKey] = handlers.filter(
          (item) => item.handler !== handler
        );
      });
    },

    hasMessageHandler: (
      connectionKey: string,
      handler: (message: any) => void
    ) => {
      const handlers = get().messageHandlers[connectionKey] || [];
      return handlers.some((item) => item.handler === handler);
    },

    removeConnection: (connectionKey: string) => {
      const connection = get()[connectionKey] as WebSocketConnection;

      if (connection && connection.isConnected && connection.wsManager) {
        connection.wsManager.disconnect();
        set((state) => {
          state[connectionKey].isConnected = false;
          state[connectionKey].wsManager = null;
        });
      }
    },

    subscribe: (connectionKey: string, type: string, payload?: any) => {
      set((state) => {
        const connection = state[connectionKey] as WebSocketConnection;

        if (!connection.isTypeSubscribed(type, payload)) {
          connection.subscriptions.push({ type, payload });
          connection.wsManager?.send({
            action: "SUBSCRIBE",
            payload: { type, ...payload },
          });
        }
      });
    },

    unsubscribe: (connectionKey: string, type: string, payload?: any) => {
      set((state) => {
        const connection = state[connectionKey] as WebSocketConnection;

        connection.subscriptions = connection.subscriptions.filter(
          (sub) => sub.type !== type || sub.payload !== payload
        );
        connection.wsManager?.send({
          action: "UNSUBSCRIBE",
          payload: { type, ...payload },
        });
      });
    },
  }))
);

export default useWebSocketStore;