import { useId, useSyncExternalStore } from 'react';
import { usePopover } from './components/usePopover';

/**
 * Translation hints for beginner students: short labels shown under key English text (<Tr>),
 * and longer explanations behind an ⓘ button (<InfoTip>). English stays the main language;
 * each viewer picks the hint language (or Off) in the account menu or on the sign-in page.
 * Existing bilingual brand text (e.g. "Book class · 予約確定") is separate and unchanged.
 */

export type HintLang = 'ja' | 'zh-TW' | 'off';

export const HINT_LANGS: { id: HintLang; label: string; lang?: string }[] = [
  { id: 'ja', label: '日本語', lang: 'ja' },
  { id: 'zh-TW', label: '繁體中文', lang: 'zh-Hant-TW' },
  { id: 'off', label: 'Off' },
];

const LANG_ATTR: Record<Exclude<HintLang, 'off'>, string> = { ja: 'ja', 'zh-TW': 'zh-Hant-TW' };

/** English (for reference), Japanese, Traditional Chinese (Taiwan). `{x}` is filled from params. */
const HINTS = {
  // Navigation and account
  'nav.home': { en: 'Home', ja: 'ホーム', zh: '首頁' },
  'nav.book': { en: 'Book a class', ja: 'レッスン予約', zh: '預約課程' },
  'nav.bookings': { en: 'My bookings', ja: '予約一覧', zh: '我的預約' },
  'menu.profile': { en: 'Profile settings', ja: 'プロフィール設定', zh: '個人資料設定' },
  'menu.announcements': { en: 'Announcements', ja: 'お知らせ', zh: '公告' },
  'menu.theme': { en: 'Theme', ja: 'テーマ', zh: '主題' },
  'menu.hints': { en: 'Translation hints', ja: '翻訳ヒント', zh: '翻譯提示' },
  'menu.signOut': { en: 'Sign out', ja: 'ログアウト', zh: '登出' },

  // Sign-in, sign-up and password reset
  'signin.login': { en: 'Username or email', ja: 'ユーザー名またはメールアドレス', zh: '使用者名稱或電子郵件' },
  'signin.password': { en: 'Password', ja: 'パスワード', zh: '密碼' },
  'signin.submit': { en: 'Sign in', ja: 'ログイン', zh: '登入' },
  'signin.forgot': { en: 'Forgot password?', ja: 'パスワードを忘れた場合', zh: '忘記密碼？' },
  'signin.create': { en: 'Create an account', ja: 'アカウントを作成', zh: '建立帳號' },
  'signin.back': { en: 'Back to sign in', ja: 'ログイン画面に戻る', zh: '返回登入' },
  'signup.email': { en: 'Email', ja: 'メールアドレス', zh: '電子郵件' },
  'signup.username': { en: 'Username', ja: 'ユーザー名', zh: '使用者名稱' },
  'signup.confirmPassword': { en: 'Confirm password', ja: 'パスワード（確認）', zh: '確認密碼' },
  'signup.sendCode': { en: 'Email me a code', ja: '確認コードをメールで受け取る', zh: '寄送驗證碼給我' },
  'signup.code': { en: 'Code', ja: '確認コード', zh: '驗證碼' },
  'signup.submit': { en: 'Create account', ja: 'アカウントを作成', zh: '建立帳號' },
  'signup.tip': {
    en: "We'll email you a code to confirm your address. Class emails go there too. No email? Ask your teacher.",
    ja: 'メールアドレス確認のためのコードをお送りします。レッスンの確認メールもこのアドレスに届きます。メールを使わない方は、先生にアカウントを作ってもらってください。',
    zh: '我們會寄送驗證碼到您的電子郵件以確認地址，課程確認信也會寄到這裡。沒有使用電子郵件嗎？請老師幫您建立帳號。',
  },
  'reset.tip': {
    en: "Enter your username or email and we'll email a code to set a new password. No email? Ask your teacher.",
    ja: 'ユーザー名またはメールアドレスを入力すると、新しいパスワードを設定するためのコードをメールでお送りします。メールを登録していない場合は、先生にパスワードの再設定を頼んでください。',
    zh: '輸入使用者名稱或電子郵件，我們會寄送驗證碼讓您設定新密碼。如果帳號沒有電子郵件，請老師幫您重設密碼。',
  },
  'reset.newPassword': { en: 'New password', ja: '新しいパスワード', zh: '新密碼' },
  'reset.confirmPassword': { en: 'Confirm new password', ja: '新しいパスワード（確認）', zh: '確認新密碼' },
  'reset.submit': { en: 'Set new password and sign in', ja: '新しいパスワードでログイン', zh: '設定新密碼並登入' },
  'reset.resend': { en: 'Send a new code', ja: 'コードを再送する', zh: '重新寄送驗證碼' },

  // Home
  'home.nextClass': { en: 'Next class', ja: '次のレッスン', zh: '下一堂課' },
  'home.details': { en: 'Class details', ja: 'レッスンの詳細', zh: '課程詳情' },
  'home.noUpcoming': {
    en: 'You have no upcoming classes yet.',
    ja: '予約しているレッスンはまだありません。',
    zh: '目前還沒有預約的課程。',
  },
  'home.upcoming': { en: 'Upcoming classes', ja: '今後のレッスン', zh: '即將到來的課程' },
  'home.recent': { en: 'Recent classes', ja: '最近のレッスン', zh: '最近的課程' },
  'home.lessons': { en: 'Lessons', ja: 'レッスン一覧', zh: '課程列表' },
  'bookings.view': { en: 'View My bookings', ja: '予約一覧を見る', zh: '查看我的預約' },

  // Book a class
  'book.rules': {
    en: 'Classes are {minutes} minutes. Times are in {zone}. Cancel up to {hours} hours before.',
    ja: 'レッスンは{minutes}分です。時間は{zone}の時刻で表示しています。レッスン開始の{hours}時間前までキャンセルできます。',
    zh: '每堂課{minutes}分鐘。時間以{zone}時區顯示。課程開始前{hours}小時內可以取消。',
  },
  'book.howTo': {
    en: 'Tap one or more times, then book them together.',
    ja: '希望の時間を1つ以上タップして、まとめて予約できます。灰色の時間は選べません（選んだ時間と重なっているか、予約できる数の上限に達しています）。',
    zh: '點選一個或多個時段，再一次完成預約。灰色的時段無法選擇（與已選時段重疊，或已達預約上限）。',
  },
  'book.list': { en: 'List', ja: 'リスト', zh: '列表' },
  'book.calendar': { en: 'Calendar', ja: 'カレンダー', zh: '月曆' },
  'book.noneChosen': { en: 'No times chosen yet.', ja: 'まだ時間を選んでいません。', zh: '尚未選擇時段。' },
  'book.submit': { en: 'Book', ja: '予約する', zh: '預約' },
  'book.lesson': { en: 'Lesson', ja: 'レッスン内容', zh: '課程內容' },
  'book.lessonTip': {
    en: 'Choose a lesson, or "Let my teacher choose".',
    ja: 'レッスンを選ぶか、「Let my teacher choose」を選んで先生に任せることができます。',
    zh: '可以選擇課程，或選「Let my teacher choose」交給老師決定。',
  },
  'book.focus': { en: 'What would you like to focus on?', ja: '練習したいこと（任意）', zh: '想加強的重點（選填）' },
  'book.note': { en: 'Note for your teacher', ja: '先生へのメッセージ（任意）', zh: '給老師的留言（選填）' },
  'book.back': { en: 'Back', ja: '戻る', zh: '返回' },
  'book.done': {
    en: 'Booked. A confirmation email is on its way.',
    ja: '予約が完了しました。確認メールをお送りします。',
    zh: '預約完成，確認信將寄給您。',
  },

  // My bookings and class details
  'filter.upcoming': { en: 'Upcoming', ja: '今後', zh: '即將到來' },
  'filter.past': { en: 'Past', ja: '過去', zh: '過去' },
  'filter.cancelled': { en: 'Cancelled', ja: 'キャンセル済み', zh: '已取消' },
  'filter.all': { en: 'All', ja: 'すべて', zh: '全部' },
  'view.table': { en: 'Table', ja: '表', zh: '表格' },
  'view.calendar': { en: 'Calendar', ja: 'カレンダー', zh: '月曆' },
  'view.timeline': { en: 'Timeline', ja: 'タイムライン', zh: '時間軸' },
  'class.join': { en: 'Join class', ja: 'レッスンに参加する', zh: '加入課程' },
  'class.cancel': { en: 'Cancel class', ja: 'レッスンをキャンセル', zh: '取消課程' },
  'class.confirmCancel': { en: 'Confirm cancellation', ja: 'キャンセルを確定する', zh: '確認取消' },

  // Profile
  'profile.title': { en: 'My profile', ja: 'プロフィール', zh: '個人資料' },
  'profile.email': { en: 'Email', ja: 'メールアドレス', zh: '電子郵件' },
  'profile.name': { en: 'Name', ja: '名前', zh: '姓名' },
  'profile.timeZone': { en: 'Time zone', ja: 'タイムゾーン', zh: '時區' },
  'profile.level': { en: 'English level', ja: '英語のレベル', zh: '英語程度' },
  'profile.nativeLanguage': { en: 'Native language', ja: '母語', zh: '母語' },
  'profile.goals': { en: 'Learning goals', ja: '学習の目標', zh: '學習目標' },
  'profile.contact': { en: 'Contact', ja: '連絡先', zh: '聯絡方式' },
  'profile.save': { en: 'Save', ja: '保存する', zh: '儲存' },
  'password.title': { en: 'Username and password', ja: 'ユーザー名とパスワード', zh: '使用者名稱與密碼' },
  'password.current': { en: 'Current password', ja: '現在のパスワード', zh: '目前的密碼' },
  'password.save': { en: 'Save password', ja: 'パスワードを保存する', zh: '儲存密碼' },

  // Notifications
  'bell.title': { en: 'Notifications', ja: '通知', zh: '通知' },
  'bell.markAll': { en: 'Mark all as read', ja: 'すべて既読にする', zh: '全部標為已讀' },
  'bell.todo': { en: 'To do', ja: 'やること', zh: '待辦事項' },
  'bell.updates': { en: 'Updates', ja: '新着情報', zh: '最新消息' },
} satisfies Record<string, { en: string; ja: string; zh: string }>;

export type HintId = keyof typeof HINTS;
type Params = Record<string, string | number>;

// ---------------------------------------------------------------- Setting

const KEY = 'hintLanguage';
const listeners = new Set<() => void>();

function defaultLang(): HintLang {
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? 'zh-TW' : 'ja';
}

function read(): HintLang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ja' || saved === 'zh-TW' || saved === 'off') return saved;
  } catch {
    // Storage unavailable: fall back to the default.
  }
  return defaultLang();
}

let current = read();

function setHintLang(lang: HintLang): void {
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // The choice still applies until the page reloads.
  }
  listeners.forEach((l) => l());
}

/** The viewer's hint language and a setter shared by every component on the page. */
export function useHintLang(): [HintLang, (lang: HintLang) => void] {
  const lang = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
  return [lang, setHintLang];
}

function fill(text: string, params?: Params): string {
  return params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : text;
}

/** The hint text for `id` in the viewer's language, or null when hints are off. */
export function useHint(): (id: HintId, params?: Params) => { text: string; lang: string } | null {
  const [lang] = useHintLang();
  return (id, params) => {
    if (lang === 'off') return null;
    const entry = HINTS[id];
    return { text: fill(lang === 'ja' ? entry.ja : entry.zh, params), lang: LANG_ATTR[lang] };
  };
}

// ---------------------------------------------------------------- Components

/**
 * A short translation shown under English text. Hidden from screen readers, which read the
 * English, so it doesn't change accessible names.
 */
export function Tr({ id, params }: { id: HintId; params?: Params }) {
  const hint = useHint()(id, params);
  if (!hint) return null;
  return (
    <span className="tr" lang={hint.lang} aria-hidden="true">
      {hint.text}
    </span>
  );
}

/** An ⓘ button that shows a longer translation on tap (works on phones, unlike hover titles). */
export function InfoTip({ id, params }: { id: HintId; params?: Params }) {
  const hint = useHint()(id, params);
  const { open, setOpen, rootRef, buttonRef } = usePopover();
  const tipId = useId();
  if (!hint) return null;
  return (
    <span className="info-tip" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="info-tip-button"
        aria-expanded={open}
        aria-controls={tipId}
        aria-label="Show translation"
        onClick={() => setOpen((o) => !o)}
      >
        i
      </button>
      {open && (
        <span className="info-tip-panel" id={tipId} role="note" lang={hint.lang}>
          {hint.text}
        </span>
      )}
    </span>
  );
}

/** Lets the viewer choose the hint language (account menu, sign-in page). */
export function HintLanguagePicker({ compact = false }: { compact?: boolean }) {
  const [lang, setLang] = useHintLang();
  return (
    <fieldset className={compact ? 'hint-picker compact' : 'hint-picker'}>
      <legend>
        Translation hints
        <Tr id="menu.hints" />
      </legend>
      <div className="segmented">
        {HINT_LANGS.map((l) => (
          <label key={l.id} className={lang === l.id ? 'active' : ''} lang={l.lang}>
            <input
              type="radio"
              name={compact ? 'hint-lang-signin' : 'hint-lang'}
              value={l.id}
              checked={lang === l.id}
              onChange={() => setLang(l.id)}
            />
            {l.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
