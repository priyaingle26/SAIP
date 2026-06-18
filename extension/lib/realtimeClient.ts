// Realtime transcription WebSocket client.
// Opens a connection to the SAIP backend /transcribe-stream proxy (never directly to OpenAI).
// Bearer token is passed as a query param because the browser WebSocket API
// does not support custom headers.

import { SAIP_ENDPOINTS } from './constants';
import type { StreamingEvent } from './schemas';

export type CaptionHandler = (event: StreamingEvent) => void;

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private onCaption: CaptionHandler;
  private onClose: (() => void) | null = null;

  constructor(onCaption: CaptionHandler, onClose?: () => void) {
    this.onCaption = onCaption;
    this.onClose = onClose ?? null;
  }

  /** Open a backend-proxied transcription session using the provided auth token. */
  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = SAIP_ENDPOINTS.transcribeStream(token);
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => resolve();

      this.ws.onmessage = (ev) => {
        try {
          const event: StreamingEvent = JSON.parse(ev.data as string);
          this.onCaption(event);
        } catch {
          // ignore unparseable frames
        }
      };

      this.ws.onerror = (ev) => {
        reject(new Error('WebSocket error'));
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.onClose?.();
      };
    });
  }

  /** Send a 24 kHz mono PCM16 frame as binary to the backend proxy. */
  sendPcmFrame(frame: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(frame);
    }
  }

  /** Signal end-of-audio so the backend commits the buffer to OpenAI. */
  stop(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'stop' }));
    }
  }

  /** Hard-close the connection (fallback path). */
  close(): void {
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
