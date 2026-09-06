import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { XmiExportService } from './xmi-export.service';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

class ImportXmiDto {
  @IsString()
  @IsNotEmpty()
  workspaceId: string;

  @IsString()
  @IsOptional()
  diagramName?: string;
}

@Controller('diagrams')
@UseGuards(JwtAuthGuard)
export class XmiExportController {
  constructor(private readonly xmiExportService: XmiExportService) {}

  /**
   * GET /api/diagrams/:id/export/xmi
   * Exports a class diagram to XMI 2.1 format (Enterprise Architect compatible)
   */
  @Get(':id/export/xmi')
  async exportToXmi(
    @Param('id') id: string,
    @Request() req,
    @Res() res: Response,
  ) {
    const xmiContent = await this.xmiExportService.exportToXmi(id, req.user.userId);

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="diagram_${id}.xmi"`,
    );
    res.send(xmiContent);
  }

  /**
   * POST /api/diagrams/import/xmi
   * Imports a class diagram from an XMI 2.1 file (Enterprise Architect compatible)
   * Expects multipart/form-data with:
   *   - file: the .xmi file
   *   - workspaceId: target workspace
   *   - diagramName: (optional) name for the new diagram
   */
  @Post('import/xmi')
  @UseInterceptors(FileInterceptor('file'))
  async importFromXmi(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string },
    @Body() body: ImportXmiDto,
    @Request() req,
  ) {
    if (!file) {
      return { error: 'Se requiere un archivo XMI (campo: file)' };
    }

    const xmiContent = file.buffer.toString('utf-8');
    const diagramName =
      body.diagramName || file.originalname.replace(/\.(xmi|xml)$/i, '');

    return this.xmiExportService.importFromXmi(
      xmiContent,
      body.workspaceId,
      diagramName,
      req.user.userId,
    );
  }
}
