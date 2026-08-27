import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { DiagramService } from './diagram.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsNotEmpty, IsString, IsObject, IsOptional } from 'class-validator';

class CreateDiagramDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  workspaceId: string;
}

class UpdateDiagramDto {
  @IsObject()
  data: any;
}

class AddClassDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsObject()
  @IsOptional()
  position?: { x: number; y: number };

  @IsOptional()
  attributes?: any[];

  @IsOptional()
  methods?: any[];
}

@Controller('diagrams')
@UseGuards(JwtAuthGuard)
export class DiagramController {
  constructor(private diagramService: DiagramService) {}

  @Post()
  async createDiagram(@Body() createDiagramDto: CreateDiagramDto, @Request() req) {
    return this.diagramService.createDiagram(
      createDiagramDto.workspaceId,
      req.user.userId,
      createDiagramDto.name,
    );
  }

  @Get(':id')
  async getDiagramById(@Param('id') id: string, @Request() req) {
    return this.diagramService.getDiagramById(id, req.user.userId);
  }

  @Put(':id')
  async updateDiagram(
    @Param('id') id: string,
    @Body() updateDiagramDto: UpdateDiagramDto,
    @Request() req,
  ) {
    return this.diagramService.updateDiagram(id, req.user.userId, updateDiagramDto.data);
  }

  @Post(':id/classes')
  async addUMLClass(
    @Param('id') id: string,
    @Body() addClassDto: AddClassDto,
    @Request() req,
  ) {
    return this.diagramService.addUMLClass(id, req.user.userId, addClassDto);
  }

  @Delete(':id')
  async deleteDiagram(@Param('id') id: string, @Request() req) {
    return this.diagramService.deleteDiagram(id, req.user.userId);
  }
}