import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { CollaborationService } from './collaboration.service';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/collaboration',
})
export class CollaborationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private collaborationService: CollaborationService) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    this.collaborationService.handleDisconnect(client.id);
  }

  @SubscribeMessage('join_diagram')
  async handleJoinDiagram(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { diagramId: string; userId: string; userName: string },
  ) {
    try {
      await this.collaborationService.joinDiagram(client, data);

      // Notify others in the room about new user
      client.to(data.diagramId).emit('user_joined', {
        userId: data.userId,
        userName: data.userName,
        socketId: client.id,
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('leave_diagram')
  async handleLeaveDiagram(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { diagramId: string; userId: string },
  ) {
    client.leave(data.diagramId);

    // Notify others about user leaving
    client.to(data.diagramId).emit('user_left', {
      userId: data.userId,
      socketId: client.id,
    });

    return { success: true };
  }

  @SubscribeMessage('diagram_change')
  async handleDiagramChange(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { diagramId: string; changes: any; userId: string },
  ) {
    // Broadcast changes to all other clients in the room
    client.to(data.diagramId).emit('diagram_change', {
      changes: data.changes,
      userId: data.userId,
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  }

  @SubscribeMessage('cursor_position')
  async handleCursorPosition(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { diagramId: string; position: { x: number; y: number }; userId: string },
  ) {
    // Broadcast cursor position to others
    client.to(data.diagramId).emit('cursor_position', {
      position: data.position,
      userId: data.userId,
      socketId: client.id,
    });
  }

  @SubscribeMessage('element_selected')
  async handleElementSelected(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { diagramId: string; elementId: string; userId: string },
  ) {
    // Broadcast element selection to others
    client.to(data.diagramId).emit('element_selected', {
      elementId: data.elementId,
      userId: data.userId,
      socketId: client.id,
    });
  }
}