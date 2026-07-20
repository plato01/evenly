/**
 * All SecureStore / storage keys in one place.
 * Rules: alphanumeric + "." + "-" + "_" only. No "@", "/", spaces.
 */
export const StorageKeys = {
  ONBOARDING_DONE:       'splitwise.onboarding_done',
  THEME_MODE:            'splitwise.theme_mode',
  NOTIFICATIONS_ENABLED: 'splitwise.notifications_enabled',
  FONT_FAMILY:           'splitwise.font_family',
  NUDGE_FREQUENCY:       'splitwise.nudge_frequency',
  NUDGE_MUTED_FRIENDS:   'splitwise.nudge_muted_friends',
  NUDGE_LAST_SCHEDULED:                  'splitwise.nudge_last_scheduled',
  RECURRING_REMINDERS_LAST_SCHEDULED:    'splitwise.recurring_reminders_last_scheduled',
} as const;
