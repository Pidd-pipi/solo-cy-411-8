export const Messages = {
  USER_CREATED: 'User created and demo CarbonTrack session opened',
  USER_LOGIN_OK: 'User login accepted',
  USER_PROFILE_UPDATED: 'User profile saved',
  ACTIVITY_CREATED: 'Activity carbon value calculated and stored',
  ACTIVITY_UPDATED: 'Activity carbon record updated',
  ACTIVITY_DELETED: 'Activity removed from carbon ledger',
  GOAL_CREATED: 'Goal created and progress linked to activities',
  GOAL_UPDATED: 'Goal status updated',
  FACTOR_CREATED: 'Carbon factor stored for region matching',
  FACTOR_VERSION_PUBLISHED: 'New carbon factor version scheduled for future effective date',
  FACTOR_VERSION_AMENDED: 'Not-yet-effective carbon factor version corrected',
  FACTOR_STATUS_UPDATED: 'Carbon factor version status updated; pinned activities unchanged',
  AUDIT_LOGGED: 'Audit log captured',
  BACKEND_SHARED: 'Shared backend/frontend copy used by coupled message constants'
} as const;
