import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './Button';
import { Input } from './Input';
import { useCreateChat } from '../hooks/useChat';
import { chatService, MAX_FILE_SIZE } from '../services/chatService';
import { X, UploadCloud, File as FileIcon, CheckCircle, AlertCircle, Loader } from 'lucide-react';

type FileStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

interface FileEntry {
  file: File;
  status: FileStatus;
  uploadProgress: number; // 0-100, only relevant during 'uploading'
  error?: string;
}

function StatusIcon({ status }: { status: FileStatus }) {
  if (status === 'done') return <CheckCircle size={15} className="text-green-500 shrink-0" />;
  if (status === 'error') return <AlertCircle size={15} className="text-red-500 shrink-0" />;
  if (status === 'uploading' || status === 'processing')
    return <Loader size={15} className="text-indigo-500 shrink-0 animate-spin" />;
  return null;
}

function statusLabel(status: FileStatus, progress: number): string {
  if (status === 'uploading') return `Uploading ${progress}%`;
  if (status === 'processing') return 'Indexing...';
  if (status === 'done') return 'Ready';
  if (status === 'error') return 'Failed';
  return '';
}

export default function NewChatModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);

  const { mutateAsync: createChat } = useCreateChat();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const updateStatus = (index: number, status: FileStatus, error?: string) => {
    setFileEntries(prev =>
      prev.map((entry, i) => (i === index ? { ...entry, status, error } : entry))
    );
  };

  const updateProgress = (index: number, uploadProgress: number) => {
    setFileEntries(prev =>
      prev.map((entry, i) => (i === index ? { ...entry, uploadProgress } : entry))
    );
  };

  const pollUntilDone = (jobId: string, index: number): Promise<number> => {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const res = await chatService.getUploadStatus(jobId);
          if (res.status === 'done' && res.file_id !== null) {
            clearInterval(interval);
            updateStatus(index, 'done');
            resolve(res.file_id);
          } else if (res.status === 'error') {
            clearInterval(interval);
            updateStatus(index, 'error', res.error ?? 'Processing failed');
            reject(new Error(res.error ?? 'Processing failed'));
          }
          // still 'processing' — keep polling
        } catch (err) {
          clearInterval(interval);
          updateStatus(index, 'error', 'Status check failed');
          reject(err);
        }
      }, 2500);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || fileEntries.length === 0) return;

    setIsProcessing(true);

    try {
      // Phase 1: upload all files using chunked upload; returns job_id immediately after finalize
      const jobIds = await Promise.all(
        fileEntries.map(async (entry, index) => {
          updateStatus(index, 'uploading');
          const { job_id } = await chatService.uploadFileChunked(
            entry.file,
            (percent) => updateProgress(index, percent),
          );
          updateStatus(index, 'processing');
          return job_id;
        })
      );

      // Phase 2: poll each job until done
      const fileIds = await Promise.all(
        jobIds.map((jobId, index) => pollUntilDone(jobId, index))
      );

      // Phase 3: create chat session with all file IDs
      const chatRes = await createChat({ title, file_ids: fileIds });

      onClose();
      setTitle('');
      setFileEntries([]);
      navigate(`/chat/${chatRes.chat_id}`);
    } catch (err) {
      console.error(err);
      // Individual file errors are already shown inline; only alert for unexpected failures
      const anyError = fileEntries.some(e => e.status === 'error');
      if (!anyError) {
        alert('Failed to process files. Check console for details.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSizeError(null);
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const oversized = files.find(f => f.size > MAX_FILE_SIZE);
      if (oversized) {
        setSizeError(`"${oversized.name}" exceeds the 50 MB file size limit.`);
        return;
      }
      setFileEntries(files.map(file => ({ file, status: 'idle', uploadProgress: 0 })));
    }
  };

  const removeFile = (index: number) => {
    setFileEntries(prev => prev.filter((_, i) => i !== index));
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

            {sizeError && (
              <p className="text-xs text-red-500 mt-1">{sizeError}</p>
            )}

            {fileEntries.length > 0 && (
              <div className="mt-4 space-y-2 max-h-48 overflow-y-auto pr-1">
                {fileEntries.map((entry, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileIcon size={16} className="text-indigo-500 shrink-0" />
                        <span className="truncate text-slate-700 font-medium">{entry.file.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {entry.status !== 'idle' && (
                          <span className={`text-xs ${entry.status === 'error' ? 'text-red-500' : entry.status === 'done' ? 'text-green-600' : 'text-indigo-500'}`}>
                            {statusLabel(entry.status, entry.uploadProgress)}
                          </span>
                        )}
                        <StatusIcon status={entry.status} />
                        {!isProcessing && entry.status === 'idle' && (
                          <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500">
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    {entry.status === 'uploading' && (
                      <div className="mt-1.5 h-1 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all duration-150"
                          style={{ width: `${entry.uploadProgress}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {isProcessing && (
            <p className="text-xs text-slate-500 text-center">
              Large PDFs may take a while to index. Please keep this window open.
            </p>
          )}

          <div className="pt-2 flex flex-col gap-2">
            <Button
              type="submit"
              className="w-full"
              disabled={fileEntries.length === 0 || !title || isProcessing}
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
