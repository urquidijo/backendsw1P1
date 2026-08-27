import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { DiagramModule } from './diagram/diagram.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { AiChatModule } from './ai-chat/ai-chat.module';
import { CodeGenerationModule } from './code-generation/code-generation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    WorkspaceModule,
    DiagramModule,
    CollaborationModule,
    AiChatModule,
    CodeGenerationModule,
  ],
})
export class AppModule {}