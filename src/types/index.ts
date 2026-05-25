/**
 * 后端统一类型定义 - 基于 schema.prisma
 * 
 * 字段命名规范：
 * - 数据库字段名使用 camelCase（如 avatarCid, createdAt）
 * - 关系字段使用语义化名称（如 author, sender, receiver）
 * - ID字段使用数字类型（数据库为Int）
 * - 时间字段使用 Date 类型（Prisma）
 */

// ==================== 用户相关 ====================

export interface UserResponse {
  id: number;
  username: string;
  nickname?: string | null;
  avatarCid?: string | null;
  bio?: string | null;
  isAdmin: boolean;
  isFrozen: boolean;
  createdAt: Date;
  allowFollow: boolean;
  allowMessage: boolean;
  hideFollowers: boolean;
  hideFollowing: boolean;
  backgroundCid?: string | null;
  backgroundColor: string;
  globalBackgroundCid?: string | null;
  globalBackgroundColor: string;
}

export interface UserProfileResponse extends Partial<UserResponse> {
  id: number;
  username: string;
  followerCount?: number;
  followingCount?: number;
  postCount?: number;
  articleCount?: number;
  isFollowing?: boolean;
  isBlocked?: boolean;
}

// ==================== 帖子相关 ====================

export interface PostAuthorResponse {
  id: number;
  username: string;
  avatarCid?: string | null;
}

export interface PostCircleResponse {
  id: number;
  name: string;
}

export interface PostResponse {
  id: number;
  title?: string | null;
  content: string;
  mediaCid?: string | null;
  visibility: string;
  authorId: number;
  circleId?: number | null;
  createdAt: Date;
  updatedAt: Date;
  author: PostAuthorResponse;
  circle?: PostCircleResponse | null;
  likes: number;
  comments: number;
  isLiked?: boolean;
  isCollected?: boolean;
}

// ==================== 消息相关 ====================

export interface MessageSenderResponse {
  id: number;
  username: string;
  avatarCid?: string | null;
}

export interface MessageResponse {
  id: number;
  content: string;
  mediaCid?: string | null;
  isRead: boolean;
  senderId: number;
  receiverId: number;
  createdAt: Date;
  sender: MessageSenderResponse;
}

export interface ConversationResponse {
  userId: number;
  user: MessageSenderResponse;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
}

// ==================== 通知相关 ====================

export interface NotificationUserResponse {
  id: number;
  username: string;
  avatarCid?: string | null;
}

export interface NotificationResponse {
  id: number;
  type: string;
  userId: number;
  fromUserId?: number | null;
  postId?: number | null;
  commentId?: number | null;
  content?: string | null;
  isRead: boolean;
  createdAt: Date;
  user: NotificationUserResponse;
  postContent?: string | null;
}

// ==================== 圈子相关 ====================

export interface CircleResponse {
  id: number;
  name: string;
  description?: string | null;
  avatarCid?: string | null;
  category: string;
  creatorId: number;
  adminIds?: string | null;
  createdAt: Date;
  updatedAt: Date;
  creator?: PostAuthorResponse;
  memberCount?: number;
  postCount?: number;
  isMember?: boolean;
}
