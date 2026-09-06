import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { XmiExportController } from './xmi-export.controller';
import { XmiExportService } from './xmi-export.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
      fileFilter: (_req, file, cb) => {
        const validMimes = ['application/xml', 'text/xml', 'application/octet-stream'];
        const isXmi = /\.(xmi|xml)$/i.test(file.originalname);
        if (isXmi || validMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Solo se aceptan archivos .xmi o .xml'), false);
        }
      },
    }),
  ],
  controllers: [XmiExportController],
  providers: [XmiExportService],
})
export class XmiExportModule {}
