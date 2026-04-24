import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { EnvService } from "../../config/env.service";

interface HandshakePayload {
  sub: string;
  email: string;
  role: string;
}

/**
 * Single gateway at the root path — authenticates the Socket.IO handshake
 * against the same JWT we use on HTTP, then puts the connection into a
 * per-user room so services can push targeted events via `emitToUser`.
 */
@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly env: EnvService,
  ) {}

  async handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      client.emit("error", { code: "unauthorized", message: "missing token" });
      client.disconnect(true);
      return;
    }

    let payload: HandshakePayload;
    try {
      payload = await this.jwt.verifyAsync<HandshakePayload>(token, {
        secret: this.env.get("JWT_SECRET"),
      });
    } catch {
      client.emit("error", { code: "unauthorized", message: "invalid token" });
      client.disconnect(true);
      return;
    }

    const userId = payload.sub;
    client.data.userId = userId;
    client.data.role = payload.role;
    void client.join(`user:${userId}`);
    client.emit("ready", { userId });
    this.logger.log(`socket connected user=${userId} sid=${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (userId) {
      this.logger.log(`socket disconnected user=${userId} sid=${client.id}`);
    }
  }

  /** Publish an event to every socket belonging to `userId`. */
  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth?.token;
    if (typeof auth === "string" && auth.length > 0) return auth;

    const header = client.handshake.headers.authorization;
    if (typeof header === "string" && header.startsWith("Bearer ")) {
      return header.slice("Bearer ".length);
    }

    const q = client.handshake.query?.token;
    if (typeof q === "string" && q.length > 0) return q;
    return null;
  }
}
