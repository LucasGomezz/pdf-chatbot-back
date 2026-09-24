import {
  Body,
  Controller,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';

type HistoryMessage = { role: 'user' | 'assistant'; content: string };

@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private chatService: ChatService) {}

  @Post('ask')
  @UseGuards(JwtAuthGuard)
  async ask(
    @Body() body: { question: string; history?: HistoryMessage[] },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = (req as any).user as { email: string; userId: string };
    const question = body?.question?.trim();
    const history = (body?.history ?? []).slice(-8).map((m) => ({
      role: m.role,
      content: String(m.content).slice(0, 800),
    }));

    this.logger.log(
      `ask from user=${user?.email}  q="${question?.slice(0, 60)}"  historyTurns=${history.length}`,
    );

    if (!question || question.length > 500) {
      res
        .status(400)
        .json({ message: 'La pregunta debe tener entre 1 y 500 caracteres.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      for await (const event of this.chatService.ask(
        user.userId,
        question,
        history,
      )) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err: any) {
      res.write(
        `data: ${JSON.stringify({ type: 'chat_error', data: 'Error interno del servidor' })}\n\n`,
      );
    } finally {
      res.end();
    }
  }
}
