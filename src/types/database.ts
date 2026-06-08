export type Platform = "facebook" | "instagram" | "linkedin" | "houzz";
export type PostStatus = "draft" | "scheduled" | "published" | "failed";

export interface PostRow {
  id: string;
  user_id: string;
  content: string;
  platforms: Platform[];
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  media_urls: string[];
  platform_post_ids: Record<string, string>;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostInsert {
  user_id: string;
  content: string;
  platforms: Platform[];
  status: PostStatus;
  scheduled_at?: string | null;
  published_at?: string | null;
  media_urls?: string[];
  platform_post_ids?: Record<string, string>;
  error_message?: string | null;
}

export interface PostUpdate {
  content?: string;
  platforms?: Platform[];
  status?: PostStatus;
  scheduled_at?: string | null;
  published_at?: string | null;
  media_urls?: string[];
  platform_post_ids?: Record<string, string>;
  error_message?: string | null;
}

export interface ConnectedAccountRow {
  id: string;
  user_id: string;
  platform: Platform;
  account_name: string;
  account_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  page_id: string | null;
  page_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConnectedAccountInsert {
  user_id: string;
  platform: Platform;
  account_name: string;
  account_id: string;
  access_token: string;
  refresh_token?: string | null;
  token_expires_at?: string | null;
  page_id?: string | null;
  page_name?: string | null;
  is_active?: boolean;
}

export interface MediaFileRow {
  id: string;
  user_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  public_url: string;
  created_at: string;
}

export interface MediaFileInsert {
  user_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  public_url: string;
}

export interface Database {
  public: {
    Tables: {
      posts: {
        Row: PostRow;
        Insert: PostInsert;
        Update: PostUpdate;
      };
      connected_accounts: {
        Row: ConnectedAccountRow;
        Insert: ConnectedAccountInsert;
        Update: Partial<ConnectedAccountInsert>;
      };
      media_files: {
        Row: MediaFileRow;
        Insert: MediaFileInsert;
        Update: Partial<MediaFileInsert>;
      };
    };
    Views: {
      [_ in never]?: never;
    };
    Functions: {
      [_ in never]?: never;
    };
    Enums: {
      [_ in never]?: never;
    };
    CompositeTypes: {
      [_ in never]?: never;
    };
  };
}
