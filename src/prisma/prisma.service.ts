import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: ['error', 'warn'],
    });
  }

  async onModuleInit() {
    let retries = 3;
    while (retries > 0) {
      try {
        await this.$connect();
        console.log('🗄️  Database connected successfully');
        return;
      } catch (error) {
        retries--;
        console.log(`⚠️  Database connection failed. Retries left: ${retries}`);
        if (retries === 0) {
          console.error('❌ Failed to connect to database after 3 attempts');
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('🗄️  Database disconnected');
  }

  // Helper method for retrying queries
  async retryQuery<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
    let lastError;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < maxRetries) {
          console.log(`⚠️  Query failed, retrying... (${i + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }
    throw lastError;
  }
}