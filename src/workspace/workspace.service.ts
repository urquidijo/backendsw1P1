import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class WorkspaceService {
  constructor(private prisma: PrismaService) {}

  async createWorkspace(userId: string, name: string, description?: string) {
    return this.prisma.workspace.create({
      data: {
        name,
        description,
        ownerId: userId,
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        _count: {
          select: {
            collaborators: true,
            diagrams: true,
          },
        },
      },
    });
  }

  async getUserWorkspaces(userId: string) {
    const ownedWorkspaces = await this.prisma.workspace.findMany({
      where: { ownerId: userId },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        _count: {
          select: {
            collaborators: true,
            diagrams: true,
          },
        },
      },
    });

    const collaboratedWorkspaces = await this.prisma.workspace.findMany({
      where: {
        collaborators: {
          some: { userId },
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        collaborators: {
          where: { userId },
          select: { role: true },
        },
        _count: {
          select: {
            collaborators: true,
            diagrams: true,
          },
        },
      },
    });

    return {
      owned: ownedWorkspaces,
      collaborated: collaboratedWorkspaces,
    };
  }

  async getWorkspaceById(workspaceId: string, userId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        collaborators: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
        diagrams: {
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            name: true,
            version: true,
            data: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Check if user has access
    const hasAccess = workspace.ownerId === userId ||
      workspace.collaborators.some(c => c.userId === userId);

    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this workspace');
    }

    return workspace;
  }

  async addCollaborator(workspaceId: string, ownerId: string, email: string, role: Role = Role.VIEWER) {
    // Verify ownership
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId, ownerId },
    });

    if (!workspace) {
      throw new ForbiddenException('Only workspace owner can add collaborators');
    }

    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if already a collaborator
    const existingCollaborator = await this.prisma.workspaceCollaborator.findUnique({
      where: {
        userId_workspaceId: {
          userId: user.id,
          workspaceId,
        },
      },
    });

    if (existingCollaborator) {
      throw new ForbiddenException('User is already a collaborator');
    }

    return this.prisma.workspaceCollaborator.create({
      data: {
        userId: user.id,
        workspaceId,
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });
  }
}