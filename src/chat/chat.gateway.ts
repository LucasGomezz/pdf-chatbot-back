import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from '../auth/ws-jwt.guard';
import { ChatService } from './chat.service';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/chat' })
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(private chatService: ChatService) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
    this.logger.log(`Client connected: ${client.id}  hasToken=${!!token}`);
    if (!token) {
      client.emit('chat_error', { message: 'No token provided' });
      client.disconnect(true);
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('ask')
  async handleAsk(@MessageBody() data: { question: string }, @ConnectedSocket() client: Socket) {
    const user = (client as any).user;
    const question = data?.question?.trim();

    this.logger.log(`ask from user=${user?.email}  q="${question?.slice(0, 60)}"`);

    if (!question || question.length > 500) {
      client.emit('chat_error', { message: 'La pregunta debe tener entre 1 y 500 caracteres.' });
      return;
    }

    for await (const event of this.chatService.ask(user.userId, question)) {
      client.emit(event.type, event.data);
    }
  }
}
