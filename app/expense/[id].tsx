import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, Alert, TouchableOpacity, TextInput, ActivityIndicator, Linking } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { CustomText } from '../../components/ui/CustomText';
import { CustomAvatar } from '../../components/ui/CustomAvatar';
import { CustomDivider } from '../../components/ui/CustomDivider';
import { CustomLoader } from '../../components/ui/CustomLoader';
import { Colors } from '../../constants/colors';
import { useColors } from '../../hooks/useColors';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { formatCurrency } from '../../utils/currency';
import { formatDate, timeAgo } from '../../utils/dateUtils';
import { getCategoryConfig, CATEGORY_IONICONS } from '../../constants/categories';
import { useAppSelector } from '../../store';
import { selectExpenseById } from '../../store/selectors/expenseSelectors';
import { useExpenses } from '../../hooks/useExpenses';
import { useComments } from '../../hooks/useComments';
import { expensesDb } from '../../db/queries/expenses';
import { usersDb } from '../../db/queries/users';
import { explorerTxUrl } from '../../web3/anchor';
import { ExpenseSplit, ExpenseCategory } from '../../types';

interface SplitWithName extends ExpenseSplit {
  name: string;
  /** Real display name — avatar seed must never be the "You" label */
  avatarName: string;
  avatarUrl?: string | null;
  isCurrentUser: boolean;
  isPayer: boolean;
}

export default function ExpenseDetailScreen() {
  const colors = useColors();
  const font = useFont();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reduxExpense = useAppSelector(selectExpenseById(id ?? ''));
  const currentUser = useAppSelector((s) => s.auth.currentUser);
  const { deleteExpense } = useExpenses();

  const [expense, setExpense] = useState(reduxExpense);
  const [splits, setSplits] = useState<SplitWithName[]>([]);
  const [payerName, setPayerName] = useState('');
  const [loading, setLoading] = useState(true);

  // Comments — useComments renders the local thread instantly and pulls the
  // latest from the cloud, so comments posted by other group members appear.
  const { comments, postComment, deleteComment } = useComments(id);
  const [commentText, setCommentText] = useState('');
  const [commentSending, setCommentSending] = useState(false);

  const handleSendComment = async () => {
    if (!commentText.trim() || !currentUser || !id) return;
    setCommentSending(true);
    const ok = await postComment(commentText);
    if (ok) {
      setCommentText('');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setCommentSending(false);
  };

  const handleDeleteComment = (commentId: string) => {
    Alert.alert('Delete Comment', 'Remove this comment?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteComment(commentId) },
    ]);
  };

  // Load expense. Show the Redux copy instantly, but ALWAYS refresh from the DB
  // — the DB row carries chain_tx_hash written by the async anchor, which the
  // Redux copy lacks (otherwise the detail screen shows "Not anchored yet"
  // even after the record is on-chain).
  useEffect(() => {
    if (reduxExpense) setExpense(reduxExpense);
    if (!id) { setLoading(false); return; }
    expensesDb.findById(id).then((dbExpense) => {
      if (dbExpense) setExpense(dbExpense);
      else if (!reduxExpense) setLoading(false);
    }).catch(() => { if (!reduxExpense) setLoading(false); });
  }, [id, reduxExpense]);

  // If opened before the async anchor finished, poll the DB briefly so the
  // "Verified on-chain" badge appears without needing to reopen the screen.
  useEffect(() => {
    if (!id || !expense || expense.chainTxHash) return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      const fresh = await expensesDb.findById(id);
      if (fresh?.chainTxHash) { setExpense(fresh); clearInterval(timer); }
      else if (tries >= 6) clearInterval(timer);
    }, 2000);
    return () => clearInterval(timer);
  }, [id, expense?.id, expense?.chainTxHash]);

  useEffect(() => {
    if (!id || !expense) return;

    const load = async () => {
      // Load splits from DB (Redux may not have them after restart)
      let rawSplits = expense.splits;
      if (!rawSplits || rawSplits.length === 0) {
        rawSplits = await expensesDb.getSplits(id);
      }

      // Resolve user names
      const resolved: SplitWithName[] = await Promise.all(
        rawSplits.map(async (s) => {
          if (s.userId === currentUser?.id) {
            return {
              ...s,
              name: 'You',
              avatarName: currentUser?.name ?? 'You',
              avatarUrl: currentUser?.avatarUrl,
              isCurrentUser: true,
              isPayer: expense.paidBy === s.userId,
            };
          }
          const user = await usersDb.findById(s.userId);
          return {
            ...s,
            name: user?.name ?? 'Unknown',
            avatarName: user?.name ?? 'Unknown',
            avatarUrl: user?.avatarUrl,
            isCurrentUser: false,
            isPayer: expense.paidBy === s.userId,
          };
        })
      );

      // Sort: payer first, then current user, then alphabetical
      resolved.sort((a, b) => {
        if (a.isPayer !== b.isPayer) return a.isPayer ? -1 : 1;
        if (a.isCurrentUser !== b.isCurrentUser) return a.isCurrentUser ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      setSplits(resolved);

      // Resolve payer name
      if (expense.paidBy === currentUser?.id) {
        setPayerName('You');
      } else {
        const payer = await usersDb.findById(expense.paidBy);
        setPayerName(payer?.name ?? 'Unknown');
      }

      setLoading(false);
    };

    load();
  }, [id, expense, currentUser]);

  if (!expense && loading) {
    return <CustomLoader fullScreen />;
  }

  if (!expense) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <CustomText color={colors.textMuted} style={styles.center}>Expense not found.</CustomText>
      </SafeAreaView>
    );
  }

  const category = getCategoryConfig(expense.category);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Category badge */}
        <View style={styles.categoryRow}>
          <View style={[styles.categoryBadge, { backgroundColor: category.color + '22' }]}>
            <Ionicons name={(CATEGORY_IONICONS[expense.category] ?? 'ellipsis-horizontal-outline') as any} size={20} color={category.color} />
          </View>
        </View>

        {/* Title + Amount */}
        <CustomText variant="heading2" style={styles.description}>{expense.description}</CustomText>
        <View style={styles.amountWrap}>
          <Text
            style={[styles.amount, { fontFamily: font.bold, color: colors.textPrimary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
          >
            {formatCurrency(expense.totalAmount, expense.currency)}
          </Text>
        </View>

        {/* Personal badge */}
        {expense.isPersonal && (
          <View style={[styles.personalBadge, { backgroundColor: '#14B8A618' }]}>
            <Ionicons name="wallet-outline" size={14} color="#14B8A6" />
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 12, color: '#14B8A6', marginLeft: 4 }}>
              Personal Expense
            </CustomText>
          </View>
        )}

        {/* Info card */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <InfoRow icon="pricetag-outline" label="Category" value={category.label} />
          <CustomDivider />
          {!expense.isPersonal && (<>
            <InfoRow icon="person-outline" label="Paid by" value={payerName || '...'} />
            <CustomDivider />
          </>)}
          <InfoRow icon="calendar-outline" label="Date" value={formatDate(expense.date)} />
          {!expense.isPersonal && (<>
            <CustomDivider />
            <InfoRow icon="git-branch-outline" label="Split type" value={expense.splitType.charAt(0).toUpperCase() + expense.splitType.slice(1)} />
          </>)}
        </View>

        {/* Split Breakdown (hidden for personal expenses) */}
        {!expense.isPersonal && (
        <View style={[styles.splitCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <CustomText variant="heading4" style={{ marginBottom: Spacing.md }}>Split Breakdown</CustomText>

          {loading ? (
            <CustomLoader />
          ) : splits.length === 0 ? (
            <CustomText variant="caption" color={colors.textMuted}>No split data available.</CustomText>
          ) : (
            splits.map((s, i) => {
              const owesText = s.isPayer
                ? 'paid'
                : s.isCurrentUser
                ? 'you owe'
                : 'owes';

              return (
                <View key={s.id ?? i} style={[styles.splitRow, i < splits.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}>
                  <View style={styles.splitLeft}>
                    <CustomAvatar name={s.avatarName} uri={s.avatarUrl} size={36} />
                    <View style={{ marginLeft: Spacing.md }}>
                      <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }}>
                        {s.name}
                      </CustomText>
                      <CustomText variant="caption" color={s.isPayer ? Colors.owed : Colors.owe}>
                        {owesText}
                      </CustomText>
                    </View>
                  </View>
                  <CustomText style={{
                    fontFamily: font.bold,
                    fontSize: 15,
                    color: s.isPayer ? Colors.owed : colors.textPrimary,
                  }}>
                    {formatCurrency(s.amount, expense.currency)}
                  </CustomText>
                </View>
              );
            })
          )}
        </View>
        )}

        {/* Notes */}
        {expense.notes ? (
          <View style={[styles.notesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <CustomText variant="label" color={colors.textMuted} style={{ marginBottom: Spacing.xs }}>Notes</CustomText>
            <CustomText style={{ fontSize: 14, color: colors.textPrimary, lineHeight: 20 }}>{expense.notes}</CustomText>
          </View>
        ) : null}

        {/* Tags */}
        {expense.tags ? (
          <View style={[styles.tagsRow, { marginTop: Spacing.sm }]}>
            {expense.tags.split(',').map((tag, i) => (
              <View key={i} style={[styles.tagChip, { backgroundColor: colors.primary + '18' }]}>
                <Ionicons name="pricetag" size={12} color={colors.primary} />
                <CustomText style={{ fontSize: 12, color: colors.primary, marginLeft: 4, fontFamily: font.medium }}>
                  {tag.trim()}
                </CustomText>
              </View>
            ))}
          </View>
        ) : null}

        {/* Comments */}
        <View style={[styles.commentsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.commentHeader}>
            <Ionicons name="chatbubble-outline" size={16} color={colors.textMuted} />
            <CustomText variant="heading4" style={{ marginLeft: Spacing.xs }}>
              Comments{comments.length > 0 ? ` (${comments.length})` : ''}
            </CustomText>
          </View>

          {comments.length === 0 && (
            <CustomText style={{ fontSize: 13, color: colors.textMuted, marginBottom: Spacing.sm }}>
              No comments yet
            </CustomText>
          )}

          {comments.map((c) => (
            <View key={c.id} style={[styles.commentRow, { borderColor: colors.divider }]}>
              <CustomAvatar name={c.userName ?? 'U'} uri={c.userAvatarUrl} size={28} />
              <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.textPrimary }}>
                    {c.userId === currentUser?.id ? 'You' : (c.userName ?? 'Unknown')}
                  </CustomText>
                  <CustomText style={{ fontSize: 11, color: colors.textMuted }}>
                    {timeAgo(c.createdAt)}
                  </CustomText>
                </View>
                <CustomText style={{ fontSize: 13, color: colors.textPrimary, marginTop: 2, lineHeight: 18 }}>
                  {c.body}
                </CustomText>
              </View>
              {c.userId === currentUser?.id && (
                <TouchableOpacity onPress={() => handleDeleteComment(c.id)} hitSlop={8}>
                  <Ionicons name="close" size={14} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          ))}

          {/* Comment input */}
          <View style={[styles.commentInput, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <TextInput
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Add a comment..."
              placeholderTextColor={colors.textMuted}
              style={{ flex: 1, fontSize: 14, color: colors.textPrimary, fontFamily: font.regular, paddingVertical: 0 }}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              onPress={handleSendComment}
              disabled={!commentText.trim() || commentSending}
              hitSlop={8}
              style={{ marginLeft: Spacing.sm, opacity: commentText.trim() ? 1 : 0.3 }}
            >
              {commentSending
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Ionicons name="send" size={18} color={colors.primary} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Blockchain verification */}
        <View style={[styles.chainCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.chainHeader}>
            <Ionicons
              name={expense?.chainTxHash ? 'shield-checkmark' : 'shield-outline'}
              size={18}
              color={expense?.chainTxHash ? colors.success : colors.textMuted}
            />
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary, marginLeft: Spacing.xs }}>
              {expense?.chainTxHash ? 'Verified on-chain' : 'Not anchored yet'}
            </CustomText>
          </View>
          <CustomText style={{ fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 }}>
            {expense?.chainTxHash
              ? 'A tamper-proof fingerprint of this expense is recorded on the Monad blockchain.'
              : 'This expense will be anchored to the blockchain shortly (or was created before anchoring was enabled).'}
          </CustomText>

          {expense?.chainTxHash && (
            <TouchableOpacity
              style={[styles.chainBtn, { backgroundColor: colors.success }]}
              onPress={() => Linking.openURL(explorerTxUrl(expense.chainTxHash as `0x${string}`)).catch(() => {})}
              activeOpacity={0.8}
            >
              <Ionicons name="open-outline" size={16} color="#fff" />
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: '#fff', marginLeft: Spacing.xs }}>
                View on Monad Explorer
              </CustomText>
            </TouchableOpacity>
          )}

          {expense?.chainTxHash && (
            <CustomText style={{ fontSize: 10, color: colors.textMuted, marginTop: Spacing.xs }} numberOfLines={1}>
              tx {expense.chainTxHash}
            </CustomText>
          )}
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: colors.primary }]}
            onPress={() => router.push(`/expense/edit/${id}` as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="pencil" size={16} color={colors.primary} />
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.primary, marginLeft: Spacing.xs }}>
              Edit
            </CustomText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: Colors.danger }]}
            onPress={() => {
              Alert.alert('Delete Expense', 'Are you sure? This cannot be undone.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    if (id) {
                      await deleteExpense(id);
                      router.back();
                    }
                  },
                },
              ]);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: Colors.danger, marginLeft: Spacing.xs }}>
              Delete
            </CustomText>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const colors = useColors();
  const font = useFont();
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={18} color={colors.textMuted} />
      <CustomText variant="label" color={colors.textMuted} style={{ marginLeft: Spacing.md, flex: 1 }}>{label}</CustomText>
      <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: colors.textPrimary }}>{value}</CustomText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['4xl'] },
  center: { textAlign: 'center', marginTop: 40 },

  categoryRow: { alignItems: 'center', marginBottom: Spacing.sm },
  categoryBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  personalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.sm,
  },
  description: { textAlign: 'center', marginBottom: Spacing.xs },
  amountWrap: { width: '100%', paddingHorizontal: Spacing.sm, marginBottom: Spacing.lg },
  amount: { fontSize: 36, textAlign: 'center' },

  infoCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },

  splitCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.base,
    marginBottom: Spacing.md,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  splitLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  notesCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.base,
  },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, paddingHorizontal: Spacing.xs },
  tagChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  commentsCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.base,
    marginTop: Spacing.md,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  commentInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    minHeight: 40,
  },

  chainCard: {
    marginTop: Spacing.lg,
    padding: Spacing.base,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  chainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
  },
});
