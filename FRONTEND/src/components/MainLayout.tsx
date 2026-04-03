import { useState } from 'react';
import { Outlet, Link, useParams, useLocation } from 'react-router-dom';
import { useChats } from '../hooks/useChat';
import { logout } from '../hooks/useAuth';
import { MessageSquare, LogOut, Plus, BrainCircuit, Loader2 } from 'lucide-react';
import { cn } from './Button';
import NewChatModal from './NewChatModal';

export default function MainLayout() {
  const { data: chats, isLoading } = useChats();
  const { id } = useParams();
  const location = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar bg-slate-50 border-r border-slate-200 */}
      <aside className="w-72 bg-slate-50 border-r border-slate-200 flex flex-col transition-all">
        <div className="p-4 flex items-center gap-3 border-b border-slate-200">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
            <BrainCircuit size={18} />
          </div>
          <h2 className="font-semibold text-slate-800 text-lg tracking-tight">Doc.AI</h2>
        </div>

        <div className="p-4">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full h-10 flex items-center justify-center gap-2 bg-white border border-slate-200 hover:border-indigo-400 hover:text-indigo-600 text-slate-700 shadow-sm rounded-xl font-medium transition-all"
          >
            <Plus size={18} />
            New Analysis
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-slate-400">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : chats?.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm px-4">
              Upload documents to begin your first analysis.
            </div>
          ) : (
            chats?.map(chat => {
              const isActive = id === String(chat.id) || (location.pathname === `/chat/${chat.id}`);
              return (
                <Link
                  key={chat.id}
                  to={`/chat/${chat.id}`}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm group",
                    isActive 
                      ? "bg-indigo-50 text-indigo-700 font-medium" 
                      : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                  )}
                >
                  <MessageSquare size={16} className={isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"} />
                  <span className="truncate">{chat.title}</span>
                </Link>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-slate-200">
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-red-600 transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-white">
        <Outlet />
      </main>

      {/* New Chat Modal */}
      <NewChatModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
