export interface Comment {
  id: string;
  expenseId: string;
  userId: string;
  userName?: string;
  userAvatarUrl?: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}
