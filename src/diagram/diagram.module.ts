import { Module } from '@nestjs/common';
import { DiagramController } from './diagram.controller';
import { DiagramService } from './diagram.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DiagramController],
  providers: [DiagramService],
  exports: [DiagramService],
})
export class DiagramModule {}