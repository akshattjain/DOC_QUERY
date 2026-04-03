import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useChatMessages, useChatById, useSendMessage } from '../hooks/useChat';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../components/Button';

export default function ChatView() {
  const { id } = useParams();
  const { data: chat } = useChatById(id!);
  const { data: messages, isLoading } = useChatMessages(id!);
  const { mutateAsync: sendMessage, isPending } = useSendMessage();
  
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isPending]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isPending) return;
    const content = input;
    setInput('');
    try {
      await sendMessage({ chatId: id!, content });
    } catch (err) {
      console.error(err);
      setInput(content); // Revert on error
    }
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Header */}
      <header className="h-16 flex items-center px-6 border-b border-slate-200 bg-white/80 backdrop-blur-md z-10 sticky top-0 shrink-0">
        <div>
          <h2 className="font-semibold text-slate-800 tracking-tight">{chat?.title || 'Loading Context...'}</h2>
          {chat && (
            <p className="text-xs text-slate-500">
              Attached Contexts: {chat.file_ids.length} documents
            </p>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
        <div className="max-w-3xl mx-auto space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center p-8 text-slate-400">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : messages?.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Bot size={28} className="text-slate-400" />
              </div>
              <p>Type your first message below to chat with the context.</p>
            </div>
          ) : (
            messages?.map((msg) => {
              const isAssistant = msg.role === 'assistant';
              return (
                <div key={msg.id} className={cn("flex gap-4", isAssistant ? "flex-row" : "flex-row-reverse")}>
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1",
                    isAssistant ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-700"
                  )}>
                    {isAssistant ? <Bot size={18} /> : <User size={18} />}
                  </div>
                  <div className={cn(
                    "px-4 py-3 rounded-2xl max-w-[80%] text-[0.95rem] leading-relaxed shadow-sm overflow-hidden",
                    isAssistant 
                      ? "bg-white border border-slate-200 text-slate-800 rounded-tl-sm prose prose-sm prose-slate max-w-none prose-p:leading-relaxed prose-pre:bg-slate-50 prose-pre:border prose-pre:border-slate-200 prose-pre:text-slate-800"
                      : "bg-indigo-600 text-white rounded-tr-sm"
                  )}>
                    {isAssistant ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                         {msg.content}
                      </ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              );
            })
          )}
          {isPending && (
             <div className="flex gap-4 flex-row">
               <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1 bg-indigo-100 text-indigo-700">
                 <Bot size={18} />
               </div>
               <div className="px-4 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-800 rounded-tl-sm flex items-center gap-2">
                 <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"></span>
                 <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce delay-75"></span>
                 <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce delay-150"></span>
               </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-slate-100 shrink-0">
        <form onSubmit={handleSend} className="max-w-3xl mx-auto relative flex items-center">
          <input
            type="text"
            className="w-full pl-5 pr-14 py-3.5 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all shadow-sm pe-12"
            placeholder="Ask about your documents..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isPending}
          />
          <button 
            type="submit" 
            disabled={!input.trim() || isPending}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
            <Send size={18} className="translate-x-[1px]" />
          </button>
        </form>
        <p className="text-center text-[11px] text-slate-400 mt-3 font-medium">AI can make mistakes. Verify critical claims with references.</p>
      </div>
    </div>
  );
}
