import { Module } from '@nestjs/common';
import { CodeGenerationController } from './code-generation.controller';
import { CodeGenerationService } from './code-generation.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CodeGenerationController],
  providers: [CodeGenerationService],
  exports: [CodeGenerationService],
})
export class CodeGenerationModule {}