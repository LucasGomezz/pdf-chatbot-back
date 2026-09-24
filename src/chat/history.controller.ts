import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HistoryService } from './history.service';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class HistoryController {
  constructor(private history: HistoryService) {}

  @Get('history')
  getHistory(@Request() req: any, @Query('limit') limit?: string) {
    return this.history.findByUser(req.user.userId, limit ? parseInt(limit, 10) : 20);
  }
}
