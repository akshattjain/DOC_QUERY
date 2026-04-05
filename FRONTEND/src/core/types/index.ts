export interface User {
  id: number;
  email: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export interface Chat {
  id: number;
  user_id: number;
  title: string;
  file_ids: number[];
  created_at: string;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface MessageResponse {
  message: string;
  references?: Array<{ text: string }>;
}

export interface UploadResponse {
  job_id: string;
}

export interface UploadStatusResponse {
  status: 'processing' | 'done' | 'error';
  file_id: number | null;
  error: string | null;
}

export interface InitUploadResponse {
  upload_id: string;
}
