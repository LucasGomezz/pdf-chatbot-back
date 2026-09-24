import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatHistory, ChatHistorySchema } from './history.schema';
import { UserUsage, UserUsageSchema, GlobalUsage, GlobalUsageSchema } from './usage.schema';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { HistoryService } from './history.service';
import { HistoryController } from './history.controller';
import { UsageService } from './usage.service';
import { RagModule } from '../rag/rag.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatHistory.name, schema: ChatHistorySchema },
      { name: UserUsage.name, schema: UserUsageSchema },
      { name: GlobalUsage.name, schema: GlobalUsageSchema },
    ]),
    RagModule,
    AuthModule,
  ],
  providers: [ChatService, HistoryService, UsageService],
  controllers: [ChatController, HistoryController],
})
export class ChatModule {}
