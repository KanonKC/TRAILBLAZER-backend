export enum UserTier {
    FREE_TIER = 0,
    PRO_TIER = 1
}

export const PLAN_QUOTA: Record<number, number> = {
    [UserTier.FREE_TIER]: 1,
    [UserTier.PRO_TIER]: 10,
};

export const MAX_CANVAS_PER_TIER: Record<number, number> = {
    [UserTier.FREE_TIER]: 3,
    [UserTier.PRO_TIER]: 20,
};