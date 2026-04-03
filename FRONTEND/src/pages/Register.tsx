import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { useRegister } from '../hooks/useAuth';
import { BrainCircuit } from 'lucide-react';

export default function Register() {
  const navigate = useNavigate();
  const { mutate: register, isPending } = useRegister();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    register({ email, password }, {
      onSuccess: () => {
        navigate('/');
      },
      onError: () => {
        setError('Registration failed. Please choose another email.');
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-fuchsia-500/20 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-indigo-500/20 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-white/70 backdrop-blur-xl border border-white p-8 rounded-2xl shadow-xl z-10 relative">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg mb-4">
            <BrainCircuit size={28} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Create Account</h1>
          <p className="text-slate-500 text-sm mt-1">Start analyzing documents instantly</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input 
            label="Email Address" 
            type="email" 
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required 
          />
          <Input 
            label="Password" 
            type="password" 
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required 
          />
          
          {error && <p className="text-red-500 text-sm font-medium text-center">{error}</p>}

          <Button type="submit" className="w-full mt-4" size="lg" isLoading={isPending}>
            Sign Up
          </Button>

          <p className="text-center text-sm text-slate-600 mt-6">
            Already have an account? <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-700 transition-colors">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
