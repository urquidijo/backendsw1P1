import { Module } from '@nestjs/common';
import { AiChatController } from './ai-chat.controller';
import { AiChatService } from './ai-chat.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DiagramModule } from '../diagram/diagram.module';

@Module({
  imports: [PrismaModule, DiagramModule],
  controllers: [AiChatController],
  providers: [AiChatService],
  exports: [AiChatService],
})
export class AiChatModule {}