import { GoogleGenAI } from '@google/genai';
import { usePlayerStore, useSettingsStore } from '../store/usePlayerStore';

export class ChatService {
  private ai: GoogleGenAI | null = null;
  private chatSession: any = null;

  constructor() {
    this.initAI();
  }

  private initAI() {
    const apiKey = useSettingsStore.getState().geminiApiKey;
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  // Обновление API клиента при смене ключа
  public updateApiKey() {
    this.initAI();
    this.chatSession = null; // Сбрасываем сессию при смене ключа
  }

  // Генерация системного промпта на основе текущего трека
  private getSystemContext(): string {
    const state = usePlayerStore.getState();
    const currentTrack = state.currentTrackIndex !== -1 
      ? state.queue[state.currentTrackIndex] 
      : null;

    let context = "Ты — умный музыкальный ИИ-ассистент, встроенный в десктопный плеер.\n";
    
    if (currentTrack) {
      context += `Прямо сейчас пользователь слушает трек:\n`;
      context += `- Название: ${currentTrack.title}\n`;
      context += `- Исполнитель: ${currentTrack.artist}\n`;
      context += `- Альбом: ${currentTrack.album}\n`;
      if (currentTrack.genre) {
        context += `- Жанр: ${currentTrack.genre}\n`;
      }
      context += `\nЕсли пользователь задает вопросы вроде "кто это поет?", "расскажи об этом треке", опирайся на эту информацию.`;
    } else {
      context += "Сейчас ничего не воспроизводится. В плейлисте пользователя есть треки, но воспроизведение остановлено.";
    }

    return context;
  }

  public async sendMessage(message: string): Promise<string> {
    if (!this.ai) {
      throw new Error("Gemini API Key не настроен. Пожалуйста, укажите его в настройках.");
    }

    try {
      // Инициализируем чат, если его еще нет
      if (!this.chatSession) {
        this.chatSession = this.ai.chats.create({
          model: 'gemini-2.5-flash',
          config: {
            systemInstruction: this.getSystemContext(),
          }
        });
      }

      const response = await this.chatSession.sendMessage({
          message: `[Контекст плеера: ${this.getSystemContext()}]\n\nВопрос пользователя: ${message}`
      });

      return response.text;
    } catch (error) {
      console.error("Ошибка при запросе к Gemini API:", error);
      throw new Error("Не удалось получить ответ от ИИ.");
    }
  }
}

export const chatService = new ChatService();
