import { Controller, Post, Get, Param, UseGuards, Request, Res } from '@nestjs/common';
import { Response } from 'express';
import { CodeGenerationService } from './code-generation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import * as fs from 'fs';
import * as path from 'path';

@Controller('code-generation')
@UseGuards(JwtAuthGuard)
export class CodeGenerationController {
  constructor(private codeGenerationService: CodeGenerationService) {}

  @Post('spring-boot/:diagramId')
  async generateSpringBoot(
    @Param('diagramId') diagramId: string,
    @Request() req,
    @Res() res: Response,
  ) {
    try {
      const result = await this.codeGenerationService.generateSpringBootProject(
        diagramId,
        req.user.userId,
      );

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  @Get('download/:generatedCodeId')
  async downloadProject(
    @Param('generatedCodeId') generatedCodeId: string,
    @Request() req,
    @Res() res: Response,
  ) {
    try {
      const zipPath = await this.codeGenerationService.downloadProject(generatedCodeId);

      if (!fs.existsSync(zipPath)) {
        return res.status(404).json({
          success: false,
          error: 'Generated project file not found',
        });
      }

      const fileName = path.basename(zipPath);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      const fileStream = fs.createReadStream(zipPath);
      fileStream.pipe(res);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  @Post('flutter/:diagramId')
  async generateFlutter(
    @Param('diagramId') diagramId: string,
    @Request() req,
    @Res() res: Response,
  ) {
    try {
      const result = await this.codeGenerationService.generateFlutterProject(
        diagramId,
        req.user.userId,
      );

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  @Get('projects')
  async getGeneratedProjects(@Request() req, @Res() res: Response) {
    try {
      const projects = await this.codeGenerationService.getGeneratedProjects(req.user.userId);
      res.json({
        success: true,
        projects,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}