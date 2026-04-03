
import { BrainCircuit } from 'lucide-react';

export default function Dashboard() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-white p-8">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-indigo-100">
          <BrainCircuit size={32} />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-3">AI Document Intelligence</h1>
        <p className="text-slate-500 mb-8 leading-relaxed">
          Upload your PDFs, CSVs, or text documents to generate instant insights. Click the "New Analysis" button in the sidebar to securely index your documents.
        </p>
      </div>
    </div>
  );
}
