import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ChatMessage } from '../core/types';
import { chatService } from '../services/chatService';

export const useChats = () => {
  return useQuery({
    queryKey: ['chats'],
    queryFn: chatService.getChats,
  });
};

export const useChatById = (chatId: string | number) => {
  return useQuery({
    queryKey: ['chats', chatId],
    queryFn: () => chatService.getChatById(chatId),
    enabled: !!chatId,
  });
};

export const useChatMessages = (chatId: string | number) => {
  return useQuery({
    queryKey: ['chats', chatId, 'messages'],
    queryFn: () => chatService.getMessages(chatId),
    enabled: !!chatId,
  });
};

export const useCreateChat = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chatService.createChat,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
};

export const useUploadFile = () => {
  return useMutation({
    mutationFn: chatService.uploadFile,
  });
};

export const useSendMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, content }: { chatId: string | number; content: string }) =>
      chatService.sendMessage(chatId, content),
    onMutate: async ({ chatId, content }) => {
      await queryClient.cancelQueries({ queryKey: ['chats', String(chatId), 'messages'] });
      const previousMessages = queryClient.getQueryData<ChatMessage[]>(['chats', String(chatId), 'messages']);
      
      if (previousMessages) {
        queryClient.setQueryData<ChatMessage[]>(['chats', String(chatId), 'messages'], [
          ...previousMessages,
          { 
            id: Date.now(), 
            role: 'user', 
            content, 
            created_at: new Date().toISOString() 
          }
        ]);
      }
      return { previousMessages };
    },
    onError: (_err, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['chats', String(variables.chatId), 'messages'], context.previousMessages);
      }
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chats', String(variables.chatId), 'messages'] });
    },
  });
};

export const useDeleteChat = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chatService.deleteChat,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
};
