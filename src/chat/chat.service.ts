import { Injectable, Logger } from '@nestjs/common';
import { RetrieverService } from '../rag/retriever.service';
import { GeminiService } from '../rag/gemini.service';
import { HistoryService } from './history.service';
import { UsageService } from './usage.service';
import { buildSystemPrompt, buildUserPrompt } from '../rag/prompts';
import { ConfigService } from '@nestjs/config';

const COURSE_TITLE = 'Cátedra';
const NO_CONTEXT_REPLY = 'No encuentro esa información en el material de la cátedra.';
const USER_LIMIT_REPLY = 'Alcanzaste el límite de consultas de hoy. Podés volver a preguntar mañana.';
const GLOBAL_LIMIT_REPLY = 'El asistente alcanzó su límite de uso por hoy. Por favor, volvé a intentar más tarde.';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private retriever: RetrieverService,
    private gemini: GeminiService,
    private historyService: HistoryService,
    private usage: UsageService,
    private config: ConfigService,
  ) {}

  async *ask(
    userId: string,
    question: string,
    history: { role: 'user' | 'assistant'; content: string }[] = [],
  ): AsyncGenerator<{ type: 'token' | 'done' | 'chat_error' | 'limit'; data: any }> {
    const quota = await this.usage.checkAndIncrement(userId);
    if (!quota.allowed) {
      this.logger.warn(`Quota exceeded (${quota.reason}) for user=${userId}`);
      const message = quota.reason === 'user' ? USER_LIMIT_REPLY : GLOBAL_LIMIT_REPLY;
      yield { type: 'limit', data: { message } };
      return;
    }

    const searchQuery = buildSearchQuery(question, history);
    if (searchQuery !== question) {
      this.logger.log(`Search query augmented: "${question}" → "${searchQuery}"`);
    }
    const chunks = await this.retriever.search(searchQuery);

    if (chunks.length === 0) {
      yield { type: 'token', data: NO_CONTEXT_REPLY };
      yield { type: 'done', data: { sources: [] } };
      await this.historyService.save(userId, question, NO_CONTEXT_REPLY, []);
      return;
    }

    const systemPrompt = buildSystemPrompt(this.config.get('COURSE_TITLE', COURSE_TITLE));
    const userPrompt = buildUserPrompt(question, chunks);

    this.logger.log(`Calling Gemini stream for question: "${question.slice(0, 60)}..."`);
    this.logger.log(`Context — ${chunks.length} chunks. First heading: "${chunks[0]?.heading}" snippet: "${chunks[0]?.text?.slice(0, 80)}"`);

    let fullAnswer = '';
    let tokenCount = 0;
    const seen = new Set<string>();
    const sources = chunks
      .filter((c) => { if (seen.has(c.heading)) return false; seen.add(c.heading); return true; })
      .map((c) => ({ chunkId: c.id, heading: c.heading, snippet: c.text.slice(0, 200) }));

    try {
      for await (const token of this.gemini.streamChat(systemPrompt, userPrompt, history)) {
        fullAnswer += token;
        tokenCount++;
        yield { type: 'token', data: token };
      }

      this.logger.log(`Stream complete — ${tokenCount} tokens, ${fullAnswer.length} chars`);
      yield { type: 'done', data: { sources } };
      await this.historyService.save(userId, question, fullAnswer, sources);
    } catch (err: any) {
      this.logger.error(`streamChat error: ${err.message}`);
      yield { type: 'chat_error', data: err.message || 'Error generating response' };
    }
  }
}

// If the question is a short follow-up, prepend the last user question so the
// vector search has enough context to find the right chunks.
function buildSearchQuery(
  question: string,
  history: { role: string; content: string }[],
): string {
  const FOLLOWUP_WORDS = /^(y|también|además|pero|entonces|qué|que|cómo|como|cuál|cual|podés|podes|explicá|explica|contame|contá|más|mas|eso|esto|ese|esa)\b/i;
  const isShort = question.trim().length < 25;
  const isFollowup = FOLLOWUP_WORDS.test(question.trim());

  if (!isShort && !isFollowup) return question;

  // Find the last user message in history
  const lastUser = [...history].reverse().find(m => m.role === 'user');
  if (!lastUser) return question;

  return `${lastUser.content} ${question}`;
}
