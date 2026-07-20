export * from './user';
export * from './group';
export * from './expense';
export * from './settlement';
export * from './activity';
export * from './comment';
export * from './tripBudget';
export * from './budget';
export * from './recurring';

export interface ApiResponse<T> {
  data: T;
  error?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
