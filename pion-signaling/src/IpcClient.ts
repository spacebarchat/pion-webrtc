import { randomUUID } from 'node:crypto';
import { PionSignalingDelegate } from './PionSignalingDelegate.js';
import net from 'net';
import os from 'os';

export interface IpcMessage {
  id: string;
  type: 'request' | 'response' | 'ping' | 'pong';
  payload: IPCPayload;
  error?: string;
}

export interface IPCPayload {
  type: string; // "join" | ""
  clientId: string;
  sdp?: string;
  trackType?: "audio" | "video";
  publisherId?: string;
  ssrc?: number;
}

interface PendingRequest {
  resolve: (value: IPCPayload) => void;
  reject: (reason?: any) => void;
  timeout: NodeJS.Timeout;
}

export class IpcClient {
  private socketPath: string;
  private socket: net.Socket | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private pendingRequests = new Map<string, PendingRequest>();
  private sfu: PionSignalingDelegate;

  constructor(pipeName: string, sfu: PionSignalingDelegate) {
    
    this.sfu = sfu;

    // cross-platform check
    if (os.platform() === 'win32') {
        this.socketPath = `\\\\.\\pipe\\${pipeName}`;
    } else {
        this.socketPath = `/tmp/${pipeName}.sock`;
    }
  }

  // todo: reconnect logic 
  
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`connecting to IPC at ${this.socketPath}...`);
      this.socket = net.createConnection(this.socketPath);

      this.socket.on('connect', () => {
        console.log('connected to Go SFU server');
        resolve();
      });

      this.socket.on('data', (chunk: Buffer) => this.handleData(chunk));

      this.socket.on('error', (err) => {
        console.error('IPC socket error:', err.message);
        reject(err);
      });

      this.socket.on('close', () => {
        console.log('IPC connection closed');
        this.rejectAllPending(new Error('IPC connection closed'));
      });
    });
  }

  private handleData(chunk: Buffer): void {
        this.buffer = Buffer.concat([this.buffer, chunk]);

        while (this.buffer.length >= 4) {
            const msgLength = this.buffer.readUInt32BE(0);

            if (this.buffer.length >= 4 + msgLength) {
                const payloadBuffer = this.buffer.subarray(4, 4 + msgLength);
                this.buffer = this.buffer.subarray(4 + msgLength);
                this.handleMessage(payloadBuffer);
            } else {
                break;
            }
        }
    }

  private handleMessage(data: Buffer) {
    try {
      const message = JSON.parse(data.toString()) as IpcMessage;

      // check if it's a response to a request we made
      if (message.type === 'response' && message.id) {
        const pending = this.pendingRequests.get(message.id);
        
        if (pending) {
          clearTimeout(pending.timeout);
          
          if (message.error) {
            pending.reject(new Error(message.error));
          } else {
            pending.resolve(message.payload);
          }
          
          this.pendingRequests.delete(message.id);
        }
      } else {
        // handle messages that we didnt request
        console.log('received unprompted message:', message);

        if(message.type === "ping") {
          this.send({ type: "pong", clientId: message.payload.clientId })
          return
        }
        switch(message.payload.type) {
          case "connected": {
            const client = this.sfu.getClientByUniqueId(message.payload.clientId)
            if(client) {
              client.webrtcConnected = true;
              client.emitter.emit("connected")
            }
          }
        }
      }
    } catch (err) {
      console.error('failed to parse ipc message:', err);
    }
  }

  public async request(payload: IPCPayload, timeoutMs = 5000): Promise<IPCPayload> {
    if (!this.socket || this.socket.readyState !== 'open') {
      return Promise.reject(new Error('socket is not connected'));
    }

    return new Promise((resolve, reject) => {
      const id = randomUUID();

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`ipc request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      this.send(payload, id);
    });
  }


  // doesn't require response
  public send(payload: IPCPayload, requestId?: string): void {
    if (!this.socket || this.socket.readyState !== 'open') {
      throw new Error('socket is not connected');
    }
    const id = requestId || randomUUID();

    const message: IpcMessage = { id, type: 'request', payload };
    const payloadBuf = Buffer.from(JSON.stringify(message));
    const headerBuf = Buffer.alloc(4);
    headerBuf.writeUInt32BE(payloadBuf.length, 0);

    this.socket!.write(Buffer.concat([headerBuf, payloadBuf]));
  }

  private rejectAllPending(err: Error): void {
    for (const [id, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timeout);
      req.reject(err);
    }
    this.pendingRequests.clear();
  }

  public close(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.pendingRequests.clear();
      this.socket?.end(() => {
        this.socket = null;
        resolve();
      });
    })
  }
}