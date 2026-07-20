import { useCallback, useEffect, useState } from 'react';
import uuid from 'react-native-uuid';

import { commentsDb } from '../db/queries/comments';
import { queuedCommentSync } from '../services/syncProxy';
import { supabase } from '../services/supabase';
import { useAppSelector } from '../store';
import { Comment } from '../types';

const nowISO = () => new Date().toISOString();

/**
 * Comment thread for one expense. Local SQLite renders instantly; a background
 * pull from Supabase merges comments other group members posted (cloudRestore
 * only runs on fresh devices, so this is how threads stay current). Writes go
 * local-first through the queued sync proxy like every other entity.
 */
export const useComments = (expenseId?: string) => {
  const currentUser = useAppSelector((s) => s.auth.currentUser);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadLocal = useCallback(async () => {
    if (!expenseId) return;
    setComments(await commentsDb.findByExpense(expenseId).catch(() => []));
  }, [expenseId]);

  // Pull the thread from the cloud and merge into SQLite, then re-read (the
  // local read joins user names/avatars, so merged rows render fully).
  const refresh = useCallback(async () => {
    if (!expenseId) return;
    try {
      const { data } = await supabase
        .from('comments')
        .select('id, expense_id, user_id, body, created_at, updated_at')
        .eq('expense_id', expenseId)
        .order('created_at', { ascending: true });
      for (const c of data ?? []) {
        await commentsDb.upsert({
          id: c.id,
          expenseId: c.expense_id,
          userId: c.user_id,
          body: c.body,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        });
      }
    } catch {
      // Offline — local copy is all we have, and that's fine.
    }
    await loadLocal();
  }, [expenseId, loadLocal]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadLocal();
      if (!cancelled) setIsLoading(false);
      await refresh();
    })();
    return () => { cancelled = true; };
  }, [loadLocal, refresh]);

  const postComment = async (body: string): Promise<boolean> => {
    const text = body.trim();
    if (!text || !expenseId || !currentUser) return false;
    const comment: Comment = {
      id: uuid.v4() as string,
      expenseId,
      userId: currentUser.id,
      userName: currentUser.name,
      userAvatarUrl: currentUser.avatarUrl,
      body: text,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    await commentsDb.insert(comment);
    queuedCommentSync.insert(comment);
    setComments((prev) => [...prev, comment]);
    return true;
  };

  const deleteComment = async (id: string): Promise<void> => {
    await commentsDb.delete(id);
    queuedCommentSync.delete(id);
    setComments((prev) => prev.filter((c) => c.id !== id));
  };

  return { comments, isLoading, postComment, deleteComment, refresh };
};
