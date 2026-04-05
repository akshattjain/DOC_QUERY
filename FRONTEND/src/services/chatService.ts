import { api } from '../infrastructure/api/axiosClient';
import type { Chat, ChatMessage, InitUploadResponse, MessageResponse, UploadResponse, UploadStatusResponse } from '../core/types';

const CHUNK_SIZE = 1 * 1024 * 1024; // 1 MB per chunk
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB hard limit

export const chatService = {
  async uploadFile(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<UploadResponse>('/chats/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async uploadFileChunked(
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<UploadResponse> {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File "${file.name}" exceeds the 50 MB limit.`);
    }

    // Small files skip chunking entirely
    if (file.size <= CHUNK_SIZE) {
      onProgress?.(100);
      return this.uploadFile(file);
    }

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // 1. Init session
    const initRes = await api.post<InitUploadResponse>('/chats/upload/init', {
      filename: file.name,
      total_chunks: totalChunks,
    });
    const { upload_id } = initRes.data;

    // 2. Upload each chunk sequentially
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunkBlob = file.slice(start, end);

      const formData = new FormData();
      formData.append('chunk', chunkBlob, `chunk_${i}`);

      await api.post(`/chats/upload/chunk/${upload_id}`, formData, {
        params: { chunk_index: i },
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
    }

    // 3. Finalize — assemble chunks and kick off indexing
    const finalRes = await api.post<UploadResponse>(`/chats/upload/finalize/${upload_id}`);
    return finalRes.data;
  },

  async getUploadStatus(jobId: string): Promise<UploadStatusResponse> {
    const response = await api.get<UploadStatusResponse>(`/chats/upload/status/${jobId}`);
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
