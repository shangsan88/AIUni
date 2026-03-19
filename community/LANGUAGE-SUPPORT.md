# Language Support Guide

> How to add new languages to OpenMAIC

---

## Supported Languages

| Code | Language | Status |
|------|----------|--------|
| `zh-CN` | 简体中文 | ✅ Complete |
| `en-US` | English (US) | ✅ Complete |

## Adding New Languages

### Step 1: UI Translations

Edit `lib/i18n/` files:

```typescript
// lib/i18n/common.ts
export const commonEnUS = {
  confirm: 'Confirm',
  cancel: 'Cancel',
};

export const commonZhCN = {
  confirm: '确认',
  cancel: '取消',
};

// Add new language
export const commonKnKN = {
  confirm: 'ದೃಢೀಕರಿಸಿ',
  cancel: 'ರದ್ದುಮಾಡಿ',
};
```

### Step 2: Register Language

Edit `lib/i18n/index.ts`:

```typescript
import { commonKnKN } from './common.kn';

export const translations = {
  'zh-CN': { ...commonZhCN, ... },
  'en-US': { ...commonEnUS, ... },
  'kn': { ...commonKnKN, ... },  // Add this
} as const;
```

### Step 3: Update Types

Edit `lib/i18n/types.ts`:

```typescript
export type Locale = 'zh-CN' | 'en-US' | 'kn';
```

## Language Architecture

- **UI Layer**: `lib/i18n/` - User interface translations
- **Content Layer**: `lib/generation/prompts/` - Lesson content language
- **Audio Layer**: `lib/audio/` - TTS voice selection
- **Orchestration**: `lib/orchestration/` - Agent communication

## Planned Languages

- Kannada (kn)
- Malayalam (ml)
- Hindi (hi)
- German (de)
- French (fr)

---

*For more details, see the full language support documentation.*