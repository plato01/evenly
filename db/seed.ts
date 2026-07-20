import { getDatabaseSafe } from './index';
import { usersDb } from './queries/users';
import { groupsDb } from './queries/groups';
import { expensesDb } from './queries/expenses';
import { settlementsDb } from './queries/settlements';
import { User, Group, GroupMember, Expense, ExpenseSplit, Settlement } from '../types';
import uuid from 'react-native-uuid';

const id = () => uuid.v4() as string;
const now = new Date().toISOString();
const daysAgo = (d: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString();
};

export async function seedTestData(currentUserId: string) {
  try {
    const db = await getDatabaseSafe();

    // Check if seed data already exists
    const existing = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM users WHERE id != ?', [currentUserId]
    );
    if (existing && existing.cnt > 2) return; // Already seeded
  } catch {
    console.warn('Seed check failed, skipping seed');
    return;
  }

  try {
  // ─── Users ──────────────────────────────────────────────────────────────
  const sarah: User = { id: id(), name: 'Sarah Miller', email: 'sarah@test.com', phone: '+1 555-0101', defaultCurrency: 'INR', createdAt: daysAgo(30) };
  const dave: User = { id: id(), name: 'Dave Wilson', email: 'dave@test.com', phone: '+1 555-0102', defaultCurrency: 'INR', createdAt: daysAgo(28) };
  const alex: User = { id: id(), name: 'Alex Chen', email: 'alex@test.com', phone: '+1 555-0103', defaultCurrency: 'INR', createdAt: daysAgo(25) };
  const priya: User = { id: id(), name: 'Priya Sharma', email: 'priya@test.com', phone: '+91 98765-00001', defaultCurrency: 'INR', createdAt: daysAgo(20) };

  for (const u of [sarah, dave, alex, priya]) {
    await usersDb.insert(u);
  }

  // ─── Groups ─────────────────────────────────────────────────────────────
  const roommates: Group = {
    id: id(), name: 'Roommates', type: 'home', color: '#7C9CF5',
    createdBy: currentUserId, archived: false, createdAt: daysAgo(25),
  };
  const goaTrip: Group = {
    id: id(), name: 'Goa Trip', type: 'trip', color: '#4ECDC4',
    createdBy: currentUserId, archived: false, createdAt: daysAgo(10),
  };
  const dinnerClub: Group = {
    id: id(), name: 'Dinner Club', type: 'other', color: '#C084FC',
    createdBy: currentUserId, archived: false, createdAt: daysAgo(15),
  };

  for (const g of [roommates, goaTrip, dinnerClub]) {
    await groupsDb.insert(g);
  }

  // ─── Members ────────────────────────────────────────────────────────────
  const members: GroupMember[] = [
    // Roommates: me, sarah, dave
    { id: id(), groupId: roommates.id, userId: currentUserId, joinedAt: daysAgo(25) },
    { id: id(), groupId: roommates.id, userId: sarah.id, joinedAt: daysAgo(25) },
    { id: id(), groupId: roommates.id, userId: dave.id, joinedAt: daysAgo(25) },
    // Goa Trip: me, sarah, alex, priya
    { id: id(), groupId: goaTrip.id, userId: currentUserId, joinedAt: daysAgo(10) },
    { id: id(), groupId: goaTrip.id, userId: sarah.id, joinedAt: daysAgo(10) },
    { id: id(), groupId: goaTrip.id, userId: alex.id, joinedAt: daysAgo(10) },
    { id: id(), groupId: goaTrip.id, userId: priya.id, joinedAt: daysAgo(10) },
    // Dinner Club: me, alex, priya
    { id: id(), groupId: dinnerClub.id, userId: currentUserId, joinedAt: daysAgo(15) },
    { id: id(), groupId: dinnerClub.id, userId: alex.id, joinedAt: daysAgo(15) },
    { id: id(), groupId: dinnerClub.id, userId: priya.id, joinedAt: daysAgo(15) },
  ];

  for (const m of members) {
    await groupsDb.addMember(m);
  }

  // ─── Expenses ───────────────────────────────────────────────────────────
  const expenses: Expense[] = [];

  const addExpense = (
    desc: string, amount: number, cat: string, paidBy: string,
    groupId: string, memberIds: string[], daysBack: number,
  ) => {
    const expId = id();
    const splitAmt = Math.round((amount / memberIds.length) * 100) / 100;
    const splits: ExpenseSplit[] = memberIds.map((uid) => ({
      id: id(), expenseId: expId, userId: uid, amount: splitAmt,
    }));
    expenses.push({
      id: expId, groupId, description: desc, totalAmount: amount,
      currency: 'INR', paidBy, splitType: 'equal', category: cat,
      date: daysAgo(daysBack), isRecurring: false, isPersonal: false,
      createdBy: paidBy, createdAt: daysAgo(daysBack), splits,
    });
  };

  // Roommates expenses
  const rmIds = [currentUserId, sarah.id, dave.id];
  addExpense('Electricity Bill', 3200, 'utilities', currentUserId, roommates.id, rmIds, 1);
  addExpense('Groceries - Big Bazaar', 2800, 'groceries', sarah.id, roommates.id, rmIds, 2);
  addExpense('WiFi - March', 1500, 'utilities', dave.id, roommates.id, rmIds, 5);
  addExpense('House Cleaning', 800, 'other', currentUserId, roommates.id, rmIds, 3);
  addExpense('Kitchen Supplies', 650, 'shopping', sarah.id, roommates.id, rmIds, 0);

  // Goa Trip expenses
  const goaIds = [currentUserId, sarah.id, alex.id, priya.id];
  addExpense('Flight Tickets', 12000, 'travel', currentUserId, goaTrip.id, goaIds, 8);
  addExpense('Hotel - 3 Nights', 9600, 'rent', alex.id, goaTrip.id, goaIds, 8);
  addExpense('Beach Shack Dinner', 3200, 'food', priya.id, goaTrip.id, goaIds, 7);
  addExpense('Scooter Rental', 1800, 'transport', currentUserId, goaTrip.id, goaIds, 7);
  addExpense('Water Sports', 4000, 'entertainment', sarah.id, goaTrip.id, goaIds, 6);
  addExpense('Lunch at Fisherman\'s', 2400, 'food', currentUserId, goaTrip.id, goaIds, 6);
  addExpense('Taxi to Airport', 2200, 'transport', alex.id, goaTrip.id, goaIds, 5);

  // Dinner Club expenses
  const dcIds = [currentUserId, alex.id, priya.id];
  addExpense('Italian Dinner', 4500, 'food', currentUserId, dinnerClub.id, dcIds, 0);
  addExpense('Sushi Night', 3800, 'food', alex.id, dinnerClub.id, dcIds, 4);
  addExpense('Pizza Party', 2200, 'food', priya.id, dinnerClub.id, dcIds, 1);

  // ─── Personal Expenses ───────────────────────────────────────────────
  const personalExpenses: Expense[] = [
    { id: id(), description: 'Morning Coffee', totalAmount: 180, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'food', date: daysAgo(0), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(0) },
    { id: id(), description: 'Uber to Office', totalAmount: 320, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'transport', date: daysAgo(0), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(0) },
    { id: id(), description: 'Lunch - Biryani', totalAmount: 250, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'food', date: daysAgo(1), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(1) },
    { id: id(), description: 'Netflix Subscription', totalAmount: 649, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'entertainment', date: daysAgo(2), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(2) },
    { id: id(), description: 'Groceries - DMart', totalAmount: 1850, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'groceries', date: daysAgo(3), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(3) },
    { id: id(), description: 'Gym Membership', totalAmount: 2500, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'medical', date: daysAgo(4), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(4) },
    { id: id(), description: 'Amazon - Headphones', totalAmount: 3499, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'shopping', date: daysAgo(5), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(5) },
    { id: id(), description: 'Electricity Bill', totalAmount: 1200, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'utilities', date: daysAgo(6), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(6) },
    { id: id(), description: 'Dinner - Pizza Hut', totalAmount: 890, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'food', date: daysAgo(7), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(7) },
    { id: id(), description: 'Petrol', totalAmount: 1500, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'transport', date: daysAgo(8), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(8) },
    { id: id(), description: 'Movie Tickets', totalAmount: 600, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'entertainment', date: daysAgo(10), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(10) },
    { id: id(), description: 'Haircut', totalAmount: 400, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'other', date: daysAgo(12), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(12) },
    { id: id(), description: 'Swiggy - Lunch', totalAmount: 350, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'food', date: daysAgo(14), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(14) },
    { id: id(), description: 'Medicines', totalAmount: 780, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'medical', date: daysAgo(15), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(15) },
    { id: id(), description: 'T-shirt - Myntra', totalAmount: 1299, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'shopping', date: daysAgo(18), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(18) },
  ];

  for (const e of [...expenses, ...personalExpenses]) {
    await expensesDb.insert(e);
  }

  // ─── Settlements ────────────────────────────────────────────────────────
  const settlements: Settlement[] = [
    {
      id: id(), fromUserId: sarah.id, toUserId: currentUserId,
      amount: 1500, currency: 'INR', groupId: roommates.id,
      note: 'WiFi share', status: 'confirmed',
      settledAt: daysAgo(3), createdAt: daysAgo(3),
    },
    {
      id: id(), fromUserId: dave.id, toUserId: currentUserId,
      amount: 800, currency: 'INR', groupId: roommates.id,
      note: 'Cleaning share', status: 'pending',
      settledAt: daysAgo(1), createdAt: daysAgo(1),
    },
    {
      id: id(), fromUserId: alex.id, toUserId: currentUserId,
      amount: 3000, currency: 'INR', groupId: goaTrip.id,
      note: 'Flight share', status: 'pending',
      settledAt: daysAgo(2), createdAt: daysAgo(2),
    },
  ];

  for (const s of settlements) {
    await settlementsDb.insert(s);
  }

  console.log('✅ Test data seeded successfully');
  } catch (err) {
    console.warn('Seed failed:', err);
  }
}

/** Seed only personal expenses (can be called independently) */
export async function seedPersonalExpenses(currentUserId: string) {
  try {
    const db = await getDatabaseSafe();
    const existing = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM expenses WHERE is_personal = 1 AND paid_by = ?', [currentUserId]
    );
    if (existing && existing.cnt >= 5) return; // Already seeded

    const personalExpenses: Expense[] = [
      { id: id(), description: 'Morning Coffee', totalAmount: 180, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'food', date: daysAgo(0), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(0) },
      { id: id(), description: 'Uber to Office', totalAmount: 320, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'transport', date: daysAgo(0), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(0) },
      { id: id(), description: 'Lunch - Biryani', totalAmount: 250, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'food', date: daysAgo(1), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(1) },
      { id: id(), description: 'Netflix Subscription', totalAmount: 649, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'entertainment', date: daysAgo(2), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(2) },
      { id: id(), description: 'Groceries - DMart', totalAmount: 1850, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'groceries', date: daysAgo(3), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(3) },
      { id: id(), description: 'Gym Membership', totalAmount: 2500, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'medical', date: daysAgo(4), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(4) },
      { id: id(), description: 'Amazon - Headphones', totalAmount: 3499, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'shopping', date: daysAgo(5), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(5) },
      { id: id(), description: 'Electricity Bill', totalAmount: 1200, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'utilities', date: daysAgo(6), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(6) },
      { id: id(), description: 'Dinner - Pizza Hut', totalAmount: 890, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'food', date: daysAgo(7), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(7) },
      { id: id(), description: 'Petrol', totalAmount: 1500, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'transport', date: daysAgo(8), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(8) },
      { id: id(), description: 'Movie Tickets', totalAmount: 600, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'entertainment', date: daysAgo(10), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(10) },
      { id: id(), description: 'Haircut', totalAmount: 400, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'other', date: daysAgo(12), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(12) },
      { id: id(), description: 'Swiggy - Lunch', totalAmount: 350, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'food', date: daysAgo(14), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(14) },
      { id: id(), description: 'Medicines', totalAmount: 780, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'medical', date: daysAgo(15), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(15) },
      { id: id(), description: 'T-shirt - Myntra', totalAmount: 1299, currency: 'INR', paidBy: currentUserId, splitType: 'equal', category: 'shopping', date: daysAgo(18), isRecurring: false, isPersonal: true, createdBy: currentUserId, createdAt: daysAgo(18) },
    ];

    for (const e of personalExpenses) {
      await expensesDb.insert(e);
    }
    console.log('✅ Personal expenses seeded');
  } catch (err) {
    console.warn('Personal seed failed:', err);
  }
}
