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
  message: string;
  file_id: number;
}
