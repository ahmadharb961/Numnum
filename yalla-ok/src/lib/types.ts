export type TaskStatus =
  | "draft"
  | "pending_payment"
  | "pending_approval"
  | "active"
  | "taken"
  | "expired"
  | "rejected";

/** Columns anyone may see for a live task. */
export type PublicTask = {
  id: string;
  poster_name: string;
  headline: string;
  description: string;
  reward_cents: number;
  location: string;
  image_path: string | null;
  duration_minutes: number;
  published_at: string;
  expires_at: string;
  is_demo: boolean;
};
export const PUBLIC_TASK_COLUMNS =
  "id, poster_name, headline, description, reward_cents, location, image_path, duration_minutes, published_at, expires_at, is_demo";

export type Task = Omit<PublicTask, "published_at" | "expires_at"> & {
  user_id: string | null;
  status: TaskStatus;
  is_free: boolean;
  fee_cents: number;
  flagged_reason: string | null;
  rejection_reason: string | null;
  published_at: string | null;
  expires_at: string | null;
  taken_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  role: "user" | "admin";
  status: "active" | "suspended" | "banned";
  free_posts_used: number;
  free_posts_bonus: number;
  created_at: string;
};

export type Settings = {
  brand_name: string;
  hero_title: string;
  hero_subtitle: string;
  posting_fee_cents: number;
  currency: string;
  free_posts: number;
  whish_account_name: string;
  whish_number: string;
  payment_instructions: string;
  allowed_durations: number[];
  auto_publish: boolean;
  max_tasks_per_hour: number;
  max_tasks_per_day: number;
  blocked_words: string[];
  updated_at: string;
};

export type PaymentSubmission = {
  id: string;
  task_id: string;
  user_id: string | null;
  amount_cents: number;
  currency: string;
  reference: string;
  reference_normalized: string;
  screenshot_path: string | null;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type Quota = { free_total: number; free_used: number; free_left: number; fee_cents: number; currency: string };

export type ActionState = { error?: string; ok?: string } | null;
