import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityType } from '@prisma/client';

@Injectable()
export class DiagramService {
  constructor(private prisma: PrismaService) {}

  async createDiagram(workspaceId: string, userId: string, name: string) {
    // Verify user has access to workspace
    await this.verifyWorkspaceAccess(workspaceId, userId);

    return this.prisma.diagram.create({
      data: {
        name,
        workspaceId,
        data: {
          classes: [],
          relations: [],
          metadata: {
            createdBy: userId,
            createdAt: new Date().toISOString(),
          },
        },
      },
    });
  }

  async getDiagramById(diagramId: string, userId: string) {
    const diagram = await this.prisma.diagram.findUnique({
      where: { id: diagramId },
      include: {
        workspace: {
          include: {
            collaborators: true,
          },
        },
        classes: {
          include: {
            attributes: true,
            methods: true,
          },
        },
        relations: true,
      },
    });

    if (!diagram) {
      throw new NotFoundException('Diagram not found');
    }

    // Check access
    const hasAccess = diagram.workspace.ownerId === userId ||
      diagram.workspace.collaborators.some(c => c.userId === userId);

    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this diagram');
    }

    // Log relations with intermediate tables when loading
    if (diagram.data && typeof diagram.data === 'object') {
      const data = diagram.data as any;
      if (data.relations && Array.isArray(data.relations)) {
        const relationsWithIntermediate = data.relations.filter((r: any) => r.intermediateTable);
        if (relationsWithIntermediate.length > 0) {
          console.log('🔍 Cargando diagrama con tablas intermedias:');
          relationsWithIntermediate.forEach((r: any) => {
            console.log(`   - ${r.id}: ${r.sourceClassId} <-> ${r.targetClassId}`);
            console.log(`     Tabla intermedia:`, r.intermediateTable);
          });
        }
      }
    }

    return diagram;
  }

  async updateDiagram(diagramId: string, userId: string, data: any) {
    try {
      console.log('📝 Actualizando diagrama:', {
        diagramId,
        userId,
        dataKeys: Object.keys(data || {}),
        classesCount: data?.classes?.length,
        relationsCount: data?.relations?.length
      });

      // Log relations with intermediate tables
      if (data?.relations && data.relations.length > 0) {
        const relationsWithIntermediate = data.relations.filter((r: any) => r.intermediateTable);
        if (relationsWithIntermediate.length > 0) {
          console.log('🔍 Relaciones con tablas intermedias a guardar:');
          relationsWithIntermediate.forEach((r: any) => {
            console.log(`   - ${r.id}: ${r.sourceClassId} <-> ${r.targetClassId}`);
            console.log(`     Tabla intermedia:`, r.intermediateTable);
          });
        }
      }

      // Verify access
      await this.getDiagramById(diagramId, userId);

      const updatedDiagram = await this.prisma.diagram.update({
        where: { id: diagramId },
        data: {
          data,
          version: { increment: 1 },
        },
      });

      console.log('✅ Diagrama actualizado en BD exitosamente');

      // Log activity
      await this.prisma.diagramActivity.create({
        data: {
          action: ActivityType.UPDATE_CLASS,
          changes: data,
          userId,
          diagramId,
        },
      });

      return updatedDiagram;
    } catch (error) {
      console.error('❌ Error actualizando diagrama:', error);
      throw error;
    }
  }

  async addUMLClass(diagramId: string, userId: string, classData: any) {
    // Verify access
    await this.getDiagramById(diagramId, userId);

    const umlClass = await this.prisma.uMLClass.create({
      data: {
        name: classData.name,
        position: classData.position || { x: 0, y: 0 },
        diagramId,
      },
    });

    // Add attributes if provided
    if (classData.attributes && classData.attributes.length > 0) {
      await this.prisma.uMLAttribute.createMany({
        data: classData.attributes.map((attr: any) => ({
          ...attr,
          classId: umlClass.id,
        })),
      });
    }

    // Add methods if provided
    if (classData.methods && classData.methods.length > 0) {
      await this.prisma.uMLMethod.createMany({
        data: classData.methods.map((method: any) => ({
          ...method,
          classId: umlClass.id,
        })),
      });
    }

    // Log activity
    await this.prisma.diagramActivity.create({
      data: {
        action: ActivityType.CREATE_CLASS,
        changes: classData,
        userId,
        diagramId,
      },
    });

    return this.prisma.uMLClass.findUnique({
      where: { id: umlClass.id },
      include: {
        attributes: true,
        methods: true,
      },
    });
  }

  async deleteDiagram(diagramId: string, userId: string) {
    // Verify access first
    const diagram = await this.getDiagramById(diagramId, userId);

    // Verify user is the owner or has editor role
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: diagram.workspaceId },
      include: {
        collaborators: {
          where: { userId },
        },
      },
    });

    const isOwner = workspace.ownerId === userId;
    const isEditor = workspace.collaborators.some(c => c.userId === userId && c.role === 'EDITOR');

    if (!isOwner && !isEditor) {
      throw new ForbiddenException('Only workspace owner or editors can delete diagrams');
    }

    // Delete diagram (cascade will delete related data)
    await this.prisma.diagram.delete({
      where: { id: diagramId },
    });

    return { message: 'Diagram deleted successfully' };
  }

  private async verifyWorkspaceAccess(workspaceId: string, userId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        collaborators: true,
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const hasAccess = workspace.ownerId === userId ||
      workspace.collaborators.some(c => c.userId === userId);

    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this workspace');
    }

    return workspace;
  }
}