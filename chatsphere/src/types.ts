/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Screen = 'mensajes-privados' | 'chat-privado' | 'chat-sala' | 'lista-salas' | 'auth';

export interface RoomUser {
  userId: string;
  displayName: string;
  role: 'user' | 'moderator' | 'admin';
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  senderColor?: string;
  text: string;
  timestamp: string;
  isSentByMe: boolean;
  status?: 'sending' | 'sent' | 'read';
  docName?: string;
  docSize?: string;
  clientOffset?: string;
}

export interface ChatThread {
  id: string;
  name: string;
  avatar: string;
  isOnline: boolean;
  lastMessage: string;
  timeAgo: string;
  unreadCount: number;
}

export interface Room {
  id: string;
  name: string;
  icon: string;
  description: string;
  onlineCount: number;
  unreadCount?: number;
  code: 'general' | 'tech-hub' | 'gaming-zone' | 'creative-corner';
}
