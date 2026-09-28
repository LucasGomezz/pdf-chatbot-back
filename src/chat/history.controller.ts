import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HistoryService } from './history.service';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class HistoryController {
  constructor(private history: HistoryService) {}

  @Get('history')
  getHistory(@Request() req: any, @Query('limit') limit?: string) {
    const parsed = parseInt(limit ?? '', 10);
    const safeLimit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 20;
    return this.history.findByUser(req.user.userId, safeLimit);
  }

  @Get('history/:id')
  getOne(@Request() req: any, @Param('id') id: string) {
    return this.history.findOneForUser(id, req.user.userId);
  }
}
