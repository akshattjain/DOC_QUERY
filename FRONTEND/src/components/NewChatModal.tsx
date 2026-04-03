import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './Button';
import { Input } from './Input';
import { useUploadFile, useCreateChat } from '../hooks/useChat';
import { X, UploadCloud, File as FileIcon } from 'lucide-react';

export default function NewChatModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);


  const { mutateAsync: uploadFile } = useUploadFile();
  const { mutateAsync: createChat } = useCreateChat();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || files.length === 0) return;

    setIsProcessing(true);

    try {
      // 1. Upload files concurrently or sequentially.
      // Doing sequentially here so we can optionally do progress properly, but Promise.all is faster.
      // Let's use Promise.all for speed.
      const uploadPromises = files.map(file => uploadFile(file));
      const uploadResults = await Promise.all(uploadPromises);
      
      const fileIds = uploadResults.map(res => res.file_id);

      // 2. Create the chat session
      const chatRes = await createChat({ title, file_ids: fileIds });
      
      // Reset & redirect
      onClose();
      setTitle('');
      setFiles([]);
      navigate(`/chat/${chatRes.chat_id}`);
    } catch (err) {
      console.error(err);
      alert('Failed to upload files and create chat. Check console for details.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-lg text-slate-800">New Document Analysis</h3>
          <button onClick={onClose} disabled={isProcessing} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <Input
            label="Analysis Title"
            placeholder="e.g. Q4 Financial Reports"
            value={title}
            onChange={e => setTitle(e.target.value)}
            disabled={isProcessing}
            required
            autoFocus
          />

          <div className="space-y-2">
            <label className="text-sm font-medium leading-none text-slate-700">Documents (.pdf, .csv, .txt)</label>
            
            {/* Simple Drag Drop / File Input UI */}
            <div className="relative w-full rounded-xl border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-slate-50 transition-all p-6 flex flex-col items-center justify-center group cursor-pointer">
              <input 
                type="file" 
                multiple 
                accept=".pdf,.csv,.txt"
                onChange={handleFileChange}
                disabled={isProcessing}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <UploadCloud size={24} />
              </div>
              <p className="text-sm font-medium text-slate-700">Click or drag files here</p>
              <p className="text-xs text-slate-500 mt-1">Select one or multiple files</p>
            </div>
            
            {/* Selected Files List */}
            {files.length > 0 && (
              <div className="mt-4 space-y-2 max-h-40 overflow-y-auto pr-1">
                {files.map((f, i) => (
                  <div key={i} className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileIcon size={16} className="text-indigo-500 shrink-0" />
                      <span className="truncate text-slate-700 font-medium">{f.name}</span>
                    </div>
                    {!isProcessing && (
                      <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500 shrink-0">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <Button 
              type="submit" 
              className="w-full" 
              disabled={files.length === 0 || !title || isProcessing}
              isLoading={isProcessing}
            >
              {isProcessing ? 'Processing Documents...' : 'Create Chat & Ingest Context'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
