import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useChatMessages, useChatById, useSendMessage } from '../hooks/useChat';
import { Send, Bot, User, Loader2, ChevronDown, ChevronRight, Activity, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../components/Button';

const MessageExtras = ({ msg }: { msg: any }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!msg.pipeline_data?.length && !msg.references?.length) return null;

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-700 transition"
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Activity size={14} />
        LangGraph Pipeline & Sources
      </button>

      {isOpen && (
        <div className="mt-3 space-y-4">
          {/* Pipeline */}
          {msg.pipeline_data?.length > 0 && (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Pipeline Execution</h4>
              <div className="space-y-2">
                {msg.pipeline_data.map((step: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></div>
                    <div>
                      <span className="font-medium text-slate-800">{step.step}:</span>{' '}
                      <span className={step.status === 'RELEVANT' ? 'text-green-600 font-medium' : 'text-slate-600'}>
                        {step.status}
                      </span>
                      {step.score !== undefined && <span className="ml-1 text-slate-500">(score: {step.score})</span>}
                      <p className="text-slate-500 mt-0.5">{step.details}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* References */}
          {msg.references?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide flex items-center gap-1">
                <FileText size={12} />
                Answer was built from these chunks
              </h4>
              <div className="space-y-2">
                {msg.references.map((ref: any, i: number) => (
                  <div key={i} className="bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-100 text-xs">
                    <div className="flex justify-between items-center mb-1 text-indigo-900 border-b border-indigo-100/50 pb-1">
                      <span className="font-medium truncate mr-2">{ref.filename} (Page {ref.page_number})</span>
                      <span className="shrink-0 bg-white px-2 py-0.5 rounded-full text-[10px] font-semibold border border-indigo-100">
                        Score: {ref.score}
                      </span>
                    </div>
                    <p className="text-slate-600 line-clamp-3 hover:line-clamp-none transition-all">{ref.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
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
                      <div>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                        <MessageExtras msg={msg} />
                      </div>
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
