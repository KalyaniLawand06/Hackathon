import { ServerState } from '../types';

type Listener = (state: ServerState, eventType: string) => void;

class WebSocketClient {
  private socket: WebSocket | null = null;
  private listeners: Set<Listener> = new Set();
  private reconnectTimeout: any = null;
  private pingInterval: any = null;
  private isIntentionalClose: boolean = false;
  public isConnected: boolean = false;

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.startHeartbeat();
      };

      this.socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'FULL_STATE' && payload.data) {
            this.notifyListeners(payload.data, payload.data.reason || 'SYNC');
          }
        } catch (e) {
          console.error('[WS] Parse error', e);
        }
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.stopHeartbeat();
        if (!this.isIntentionalClose) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = setTimeout(() => this.connect(), 2000);
        }
      };

      this.socket.onerror = (err) => {
        console.warn('[WS] Socket error', err);
      };
    } catch (e) {
      console.error('[WS] Connection exception', e);
      this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(state: ServerState, eventType: string) {
    for (const listener of this.listeners) {
      try {
        listener(state, eventType);
      } catch (err) {
        console.error('[WS] Error in subscriber callback', err);
      }
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'PING' }));
      }
    }, 15000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  disconnect() {
    this.isIntentionalClose = true;
    this.stopHeartbeat();
    clearTimeout(this.reconnectTimeout);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

export const wsClient = new WebSocketClient();
