import { getDatabaseSafe } from '../index';
import { CategoryConfig } from '../../constants/categories';

export const categoriesDb = {
  async findByUser(userId: string): Promise<CategoryConfig[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM custom_categories WHERE user_id = ? ORDER BY created_at ASC',
      [userId],
    );
    return rows.map((r) => ({
      key: r.key as string,
      label: r.label as string,
      icon: r.icon as string,
      color: r.color as string,
      isCustom: true,
    }));
  },

  async insert(
    userId: string,
    category: { id: string; key: string; label: string; icon: string; color: string; createdAt: string },
  ): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `INSERT INTO custom_categories (id, user_id, key, label, icon, color, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [category.id, userId, category.key, category.label, category.icon, category.color, category.createdAt],
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync('DELETE FROM custom_categories WHERE id = ?', [id]);
  },
};
