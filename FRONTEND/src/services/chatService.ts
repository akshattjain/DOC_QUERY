import { api } from '../infrastructure/api/axiosClient';
import type { Chat, ChatMessage, MessageResponse, UploadResponse } from '../core/types';

export const chatService = {
  async uploadFile(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    
    // Explicitly set content-type to multipart for this request
    const response = await api.post<UploadResponse>('/chats/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  async getChats(): Promise<Chat[]> {
    const response = await api.get<Chat[]>('/chats/');
    return response.data;
  },

  async createChat(data: { title: string; file_ids: number[] }): Promise<{ chat_id: number }> {
    const response = await api.post<{ chat_id: number }>('/chats/', data);
    return response.data;
  },

  async getChatById(chatId: string | number): Promise<Chat> {
    const response = await api.get<Chat>(`/chats/${chatId}`);
    return response.data;
  },

  async deleteChat(chatId: string | number): Promise<void> {
    await api.delete(`/chats/${chatId}`);
  },

  async getMessages(chatId: string | number): Promise<ChatMessage[]> {
    const response = await api.get<ChatMessage[]>(`/chats/${chatId}/messages`);
    return response.data;
  },

  async sendMessage(chatId: string | number, content: string): Promise<MessageResponse> {
    const response = await api.post<MessageResponse>(`/chats/${chatId}/messages`, { content });
    return response.data;
  }
};
