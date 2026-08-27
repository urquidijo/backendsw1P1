import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

class CreateWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}

class AddCollaboratorDto {
  @IsString()
  @IsNotEmpty()
  email: string;

  @IsEnum(Role)
  @IsOptional()
  role?: Role = Role.VIEWER;
}

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(private workspaceService: WorkspaceService) {}

  @Post()
  async createWorkspace(@Body() createWorkspaceDto: CreateWorkspaceDto, @Request() req) {
    return this.workspaceService.createWorkspace(
      req.user.userId,
      createWorkspaceDto.name,
      createWorkspaceDto.description,
    );
  }

  @Get()
  async getUserWorkspaces(@Request() req) {
    return this.workspaceService.getUserWorkspaces(req.user.userId);
  }

  @Get(':id')
  async getWorkspaceById(@Param('id') id: string, @Request() req) {
    return this.workspaceService.getWorkspaceById(id, req.user.userId);
  }

  @Post(':id/collaborators')
  async addCollaborator(
    @Param('id') id: string,
    @Body() addCollaboratorDto: AddCollaboratorDto,
    @Request() req,
  ) {
    return this.workspaceService.addCollaborator(
      id,
      req.user.userId,
      addCollaboratorDto.email,
      addCollaboratorDto.role,
    );
  }
}