import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

interface ConnectedUser {
  socketId: string;
  userId: string;
  userName: string;
  diagramId: string;
}

@Injectable()
export class CollaborationService {
  private connectedUsers = new Map<string, ConnectedUser>();

  constructor(private prisma: PrismaService) {}

  async joinDiagram(
    client: Socket,
    data: { diagramId: string; userId: string; userName: string },
  ) {
    // Verify user has access to the diagram
    const diagram = await this.prisma.diagram.findUnique({
      where: { id: data.diagramId },
      include: {
        workspace: {
          include: {
            collaborators: true,
          },
        },
      },
    });

    if (!diagram) {
      throw new Error('Diagram not found');
    }

    // Check access
    const hasAccess = diagram.workspace.ownerId === data.userId ||
      diagram.workspace.collaborators.some(c => c.userId === data.userId);

    if (!hasAccess) {
      throw new Error('Access denied to this diagram');
    }

    // Join socket room
    client.join(data.diagramId);

    // Store connected user
    this.connectedUsers.set(client.id, {
      socketId: client.id,
      userId: data.userId,
      userName: data.userName,
      diagramId: data.diagramId,
    });

    return true;
  }

  handleDisconnect(socketId: string) {
    const user = this.connectedUsers.get(socketId);
    if (user) {
      this.connectedUsers.delete(socketId);
      // Could emit user_left event here if needed
    }
  }

  getConnectedUsers(diagramId: string): ConnectedUser[] {
    return Array.from(this.connectedUsers.values())
      .filter(user => user.diagramId === diagramId);
  }
}