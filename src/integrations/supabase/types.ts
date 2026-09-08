export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_log: {
        Row: {
          action: string
          admin_id: string | null
          at: string
          details: Json
          id: number
          target: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          at?: string
          details?: Json
          id?: number
          target?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          at?: string
          details?: Json
          id?: number
          target?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          requester_id: string
          status: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          requester_id: string
          status?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          requester_id?: string
          status?: string
        }
        Relationships: []
      }
      game_invites: {
        Row: {
          created_at: string
          from_id: string
          id: string
          match_id: string
          status: string
          to_id: string
        }
        Insert: {
          created_at?: string
          from_id: string
          id?: string
          match_id: string
          status?: string
          to_id: string
        }
        Update: {
          created_at?: string
          from_id?: string
          id?: string
          match_id?: string
          status?: string
          to_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_invites_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          code: string
          created_at: string
          finished_at: string | null
          guest_id: string | null
          guest_name: string | null
          host_id: string | null
          host_name: string
          id: string
          rating_delta_guest: number | null
          rating_delta_host: number | null
          settings: Json
          settled_at: string | null
          state: Json | null
          status: string
          updated_at: string
          winner_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          finished_at?: string | null
          guest_id?: string | null
          guest_name?: string | null
          host_id?: string | null
          host_name: string
          id?: string
          rating_delta_guest?: number | null
          rating_delta_host?: number | null
          settings?: Json
          settled_at?: string | null
          state?: Json | null
          status?: string
          updated_at?: string
          winner_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          finished_at?: string | null
          guest_id?: string | null
          guest_name?: string | null
          host_id?: string | null
          host_name?: string
          id?: string
          rating_delta_guest?: number | null
          rating_delta_host?: number | null
          settings?: Json
          settled_at?: string | null
          state?: Json | null
          status?: string
          updated_at?: string
          winner_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_kind: string
          avatar_url: string | null
          banned: boolean
          claimed_local_tokens: boolean
          country: string | null
          created_at: string
          daily_bonus_at: string
          first_name: string | null
          id: string
          is_admin: boolean
          last_name: string | null
          last_seen_at: string | null
          local_tokens_total: number
          peak_rating: number
          rated_games: number
          rating: number
          referral_code: string | null
          rounds_played: number
          tokens: number
          updated_at: string
          username: string
        }
        Insert: {
          avatar_kind?: string
          avatar_url?: string | null
          banned?: boolean
          claimed_local_tokens?: boolean
          country?: string | null
          created_at?: string
          daily_bonus_at?: string
          first_name?: string | null
          id: string
          is_admin?: boolean
          last_name?: string | null
          last_seen_at?: string | null
          local_tokens_total?: number
          peak_rating?: number
          rated_games?: number
          rating?: number
          referral_code?: string | null
          rounds_played?: number
          tokens?: number
          updated_at?: string
          username: string
        }
        Update: {
          avatar_kind?: string
          avatar_url?: string | null
          banned?: boolean
          claimed_local_tokens?: boolean
          country?: string | null
          created_at?: string
          daily_bonus_at?: string
          first_name?: string | null
          id?: string
          is_admin?: boolean
          last_name?: string | null
          last_seen_at?: string | null
          local_tokens_total?: number
          peak_rating?: number
          rated_games?: number
          rating?: number
          referral_code?: string | null
          rounds_played?: number
          tokens?: number
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          bought_at: string
          item_id: string
          user_id: string
        }
        Insert: {
          bought_at?: string
          item_id: string
          user_id: string
        }
        Update: {
          bought_at?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          code: string
          created_at: string
          id: string
          invited_id: string
          reward: number
          sponsor_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          invited_id: string
          reward: number
          sponsor_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          invited_id?: string
          reward?: number
          sponsor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_invited_id_fkey"
            columns: ["invited_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_invited_id_fkey"
            columns: ["invited_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_items: {
        Row: {
          active: boolean
          data: Json
          hint: string | null
          id: string
          kind: string
          name: string | null
          price: number
          sort: number
        }
        Insert: {
          active?: boolean
          data?: Json
          hint?: string | null
          id: string
          kind: string
          name?: string | null
          price: number
          sort?: number
        }
        Update: {
          active?: boolean
          data?: Json
          hint?: string | null
          id?: string
          kind?: string
          name?: string | null
          price?: number
          sort?: number
        }
        Relationships: []
      }
    }
    Views: {
      public_profiles: {
        Row: {
          avatar_kind: string | null
          avatar_url: string | null
          country: string | null
          created_at: string | null
          id: string | null
          last_seen_at: string | null
          peak_rating: number | null
          rated_games: number | null
          rating: number | null
          rounds_played: number | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          avatar_kind?: string | null
          avatar_url?: string | null
          country?: string | null
          created_at?: string | null
          id?: string | null
          last_seen_at?: string | null
          peak_rating?: number | null
          rated_games?: number | null
          rating?: number | null
          rounds_played?: number | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          avatar_kind?: string | null
          avatar_url?: string | null
          country?: string | null
          created_at?: string | null
          id?: string | null
          last_seen_at?: string | null
          peak_rating?: number | null
          rated_games?: number | null
          rating?: number | null
          rounds_played?: number | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_game_invite: {
        Args: { _invite_id: string }
        Returns: {
          code: string
          created_at: string
          finished_at: string | null
          guest_id: string | null
          guest_name: string | null
          host_id: string | null
          host_name: string
          id: string
          rating_delta_guest: number | null
          rating_delta_host: number | null
          settings: Json
          settled_at: string | null
          state: Json | null
          status: string
          updated_at: string
          winner_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "matches"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_delete_item: { Args: { _id: string }; Returns: undefined }
      admin_grant_tokens: {
        Args: { _amount: number; _reason?: string; _user: string }
        Returns: number
      }
      admin_list_players: {
        Args: { _limit?: number; _query?: string }
        Returns: {
          avatar_kind: string
          avatar_url: string
          banned: boolean
          country: string
          created_at: string
          first_name: string
          id: string
          is_admin: boolean
          last_name: string
          last_seen_at: string
          purchases: number
          rated_games: number
          rating: number
          rounds_played: number
          tokens: number
          username: string
        }[]
      }
      admin_log_sound_change: {
        Args: { _action: string; _details?: Json; _id: string }
        Returns: undefined
      }
      admin_set_admin: {
        Args: { _is_admin: boolean; _user: string }
        Returns: undefined
      }
      admin_set_banned: {
        Args: { _banned: boolean; _user: string }
        Returns: undefined
      }
      admin_set_item: {
        Args: { _active: boolean; _item_id: string; _price: number }
        Returns: undefined
      }
      admin_set_setting: {
        Args: { _key: string; _value: Json }
        Returns: undefined
      }
      admin_stats: { Args: never; Returns: Json }
      admin_upsert_item: {
        Args: {
          _active: boolean
          _data: Json
          _hint: string
          _id: string
          _kind: string
          _name: string
          _price: number
          _sort?: number
        }
        Returns: undefined
      }
      apply_match_rating: {
        Args: { _loser: string; _match_id: string; _winner: string }
        Returns: undefined
      }
      award_ai_win: { Args: { _difficulty: string }; Returns: number }
      buy_item: { Args: { _item_id: string }; Returns: Json }
      claim_daily_bonus: { Args: never; Returns: Json }
      claim_local_tokens: { Args: { _amount: number }; Returns: number }
      create_profile: {
        Args: { _referral_code?: string; _username: string }
        Returns: {
          avatar_kind: string
          avatar_url: string | null
          banned: boolean
          claimed_local_tokens: boolean
          country: string | null
          created_at: string
          daily_bonus_at: string
          first_name: string | null
          id: string
          is_admin: boolean
          last_name: string | null
          last_seen_at: string | null
          local_tokens_total: number
          peak_rating: number
          rated_games: number
          rating: number
          referral_code: string | null
          rounds_played: number
          tokens: number
          updated_at: string
          username: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      elo_k: {
        Args: { _rated_games: number; _rating: number }
        Returns: number
      }
      generate_referral_code: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      join_match_by_code: {
        Args: { _code: string; _guest_name: string }
        Returns: {
          code: string
          created_at: string
          finished_at: string | null
          guest_id: string | null
          guest_name: string | null
          host_id: string | null
          host_name: string
          id: string
          rating_delta_guest: number | null
          rating_delta_host: number | null
          settings: Json
          settled_at: string | null
          state: Json | null
          status: string
          updated_at: string
          winner_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "matches"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      log_admin: {
        Args: { _action: string; _details: Json; _target: string }
        Returns: undefined
      }
      my_referral_code: { Args: never; Returns: string }
      my_referrals: {
        Args: never
        Returns: {
          created_at: string
          reward: number
          username: string
        }[]
      }
      rating_floor: { Args: never; Returns: number }
      require_admin: { Args: never; Returns: undefined }
      settle_match: { Args: { _match_id: string }; Returns: undefined }
      sync_google_identity: {
        Args: never
        Returns: {
          avatar_kind: string
          avatar_url: string | null
          banned: boolean
          claimed_local_tokens: boolean
          country: string | null
          created_at: string
          daily_bonus_at: string
          first_name: string | null
          id: string
          is_admin: boolean
          last_name: string | null
          last_seen_at: string | null
          local_tokens_total: number
          peak_rating: number
          rated_games: number
          rating: number
          referral_code: string | null
          rounds_played: number
          tokens: number
          updated_at: string
          username: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      touch_last_seen: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
