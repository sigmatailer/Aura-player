import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles } from 'lucide-react';
import { chatService } from '../services/ChatService';

interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
}

const ChatSidebar: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'ai', text: 'Привет! Я твой музыкальный ИИ-ассистент. Спроси меня о текущем треке, исполнителе или просто попроси порекомендовать что-нибудь интересное!' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const responseText = await chatService.sendMessage(userMessage);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', text: responseText }]);
    } catch (error: any) {
      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'ai', 
        text: `Ошибка: ${error.message}` 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-black/20 backdrop-blur-md">
      {/* Шапка чата */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 text-[var(--text-main)]/90">
          <Sparkles size={18} className="text-purple-400" />
          <h2 className="font-medium text-sm">Smart Assistant</h2>
        </div>
        <button 
          onClick={onClose}
          className="p-1 rounded-full text-[var(--text-main)]/50 hover:text-[var(--text-main)] hover:bg-white/10 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Список сообщений */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 scrollbar-hide">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === 'user' 
                  ? 'bg-purple-600 text-[var(--text-main)] rounded-br-sm' 
                  : 'bg-white/10 text-[var(--text-main)]/90 rounded-bl-sm border border-white/5'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/10 text-[var(--text-main)]/50 rounded-2xl rounded-bl-sm px-4 py-3 border border-white/5 flex gap-1">
              <span className="animate-bounce">•</span>
              <span className="animate-bounce delay-75">•</span>
              <span className="animate-bounce delay-150">•</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Поле ввода */}
      <div className="p-4 border-t border-white/10 shrink-0">
        <form 
          onSubmit={handleSend}
          className="relative flex items-center"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Спроси о треке..."
            className="w-full bg-white/5 border border-white/10 rounded-full pl-4 pr-12 py-3 text-sm text-[var(--text-main)] placeholder-white/30 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-2 rounded-full text-[var(--text-main)]/50 hover:text-[var(--text-main)] hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-[var(--text-main)]/50 transition-colors"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatSidebar;
