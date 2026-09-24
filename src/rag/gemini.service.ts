import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

const EMBED_DIMS = 768;
const MAX_RETRIES = 6;

@Injectable()
export class GeminiService implements OnModuleInit {
  private readonly logger = new Logger(GeminiService.name);
  private genAI: GoogleGenerativeAI;
  private groq: Groq;
  private chatModelName: string;
  private embedModelName: string;
  private apiKey: string;
  private groqApiKey: string;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    this.apiKey = this.config.get<string>('GEMINI_API_KEY')!;
    this.groqApiKey = this.config.get<string>('GROQ_API_KEY', '');
    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.groq = new Groq({ apiKey: this.groqApiKey });
    this.chatModelName = this.config.get<string>('GROQ_CHAT_MODEL', 'llama-3.3-70b-versatile');
    this.embedModelName = this.config.get<string>('GEMINI_EMBED_MODEL', 'gemini-embedding-001');
    this.logger.log(`chat=groq/${this.chatModelName}  embed=gemini/${this.embedModelName}  dims=${EMBED_DIMS}`);
  }

  async embedText(text: string): Promise<number[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.embedModelName}:embedContent?key=${this.apiKey}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${this.embedModelName}`,
          content: { parts: [{ text }] },
          outputDimensionality: EMBED_DIMS,
        }),
      });

      const data = await res.json();

      if (res.status === 429) {
        const wait = Math.pow(2, attempt + 1) * 1000;
        this.logger.warn(`Embed rate limit — attempt ${attempt}/${MAX_RETRIES}, waiting ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        this.logger.error(`embedText error: ${JSON.stringify(data?.error)}`);
        throw new Error(`Embed error ${res.status}: ${data?.error?.message}`);
      }

      return data.embedding.values as number[];
    }

    throw new Error('Embed failed after max retries');
  }

  async *streamChat(
    systemPrompt: string,
    userPrompt: string,
    history: { role: 'user' | 'assistant'; content: string }[] = [],
  ): AsyncGenerator<string> {
    const hasKey = !!this.groqApiKey;
    this.logger.log(`Groq request — model=${this.chatModelName}  keyPresent=${hasKey}  keyPrefix=${this.groqApiKey?.slice(0, 8) || 'EMPTY'}  historyTurns=${history.length}  userLen=${userPrompt.length}`);

    if (!hasKey) {
      this.logger.error('GROQ_API_KEY is empty — cannot call Groq');
      throw new Error('Groq API key not configured');
    }

    let tokenCount = 0;
    let charCount = 0;

    const stream = await this.groq.chat.completions.create({
      model: this.chatModelName,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      temperature: 0.3,
      max_tokens: 1024,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) {
        tokenCount++;
        charCount += text.length;
        yield text;
      }
    }

    this.logger.log(`Groq stream done — chunks=${tokenCount}  totalChars=${charCount}`);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
