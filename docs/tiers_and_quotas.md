# Blaze Tiers and Widget Quota System

This document summarizes the differences between the **Free** and **Pro** tiers and explains how the **Widget Quota** system is implemented in the Blaze platform.

## 🚀 Plan Comparison

| Feature | Free Tier | Pro Tier |
| :--- | :--- | :--- |
| **Price** | 0 THB / Month | 69 THB / Month |
| **Widget Quota** | **1 Unit** | **10 Units** (Unlimited UI) |
| **Cloud Storage** | **5 MB** | **50 MB** |
| **Best For** | Beginners & Testing | Power users & Professional Streamers |

---

## ⚙️ How Widget Quota Works

The quota system is designed to be flexible, allowing users to swap between different widgets without needing to delete them.

### 1. Cost-Based Quota
Each widget in Blaze has an associated **Cost** (defined in the `WidgetType` model).
- Most widgets currently have a **default cost of 1**.
- The system calculates usage based on the **sum of costs** of all **Enabled** widgets.

### 2. Enabled vs. Disabled
- **Enabled Widgets**: Consume quota points.
- **Disabled Widgets**: Do **not** consume quota points. You can have as many disabled widgets as you like.

### 3. Logic Flow
When a user attempts to enable a widget (or when a new widget is created):
1. The system fetches the user's `UserTier`.
2. It identifies the `PLAN_QUOTA` (1 for Free, 10 for Pro).
3. It checks the current `usedQuota` (sum of costs of all currently enabled widgets owned by the user).
4. If `usedQuota + newWidgetCost > totalQuota`, the system prevents the action and throws a `WidgetQuotaLimitError`.

### 4. Code Implementation Snippet
The core logic resides in `WidgetService.authorizeTierUsage` within the backend:

```typescript
// src/services/widget/widget.service.ts
async authorizeTierUsage(userId: string, widgetId: string, isEnabling?: boolean) {
    const tier = await this.userService.getTier(userId);
    const quota = PLAN_QUOTA[tier >= UserTier.PRO_TIER ? UserTier.PRO_TIER : UserTier.FREE_TIER];

    const currentWidget = await this.get(widgetId);
    const currentWidgetCost = currentWidget.widget_type?.cost ?? 1;

    const usedQuota = await this.widgetRepository.getEnabledQuotaUsed(userId, [widgetId]);
    const resultingQuota = usedQuota + currentWidgetCost;

    if (resultingQuota > quota) {
        throw new WidgetQuotaLimitError();
    }
}
```

---

## 📂 Storage Quota
Storage limits are enforced during file uploads.
- **Free Tier**: 5 MB limit.
- **Pro Tier**: 50 MB limit.
- Limits are tracked via the `max_storage_mb` field in the `User` model and checked against the total size of `UploadedFile` records.
