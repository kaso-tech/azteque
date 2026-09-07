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
          created_at: string
          daily_bonus_at: string
          id: string
          is_admin: boolean
          local_tokens_total: number
          tokens: number
          updated_at: string
          username: string
        }
        Insert: {
          avatar_kind?: string
          avatar_url?: string | null
          banned?: boolean
          claimed_local_tokens?: boolean
          created_at?: string
          daily_bonus_at?: string
          id: string
          is_admin?: boolean
          local_tokens_total?: number
          tokens?: number
          updated_at?: string
          username: string
        }
        Update: {
          avatar_kind?: string
          avatar_url?: string | null
          banned?: boolean
          claimed_local_tokens?: boolean
          created_at?: string
          daily_bonus_at?: string
          id?: string
          is_admin?: boolean
          local_tokens_total?: number
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
      shop_items: {
        Row: {
          active: boolean
          id: string
          kind: string
          price: number
        }
        Insert: {
          active?: boolean
          id: string
          kind: string
          price: number
        }
        Update: {
          active?: boolean
          id?: string
          kind?: string
          price?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
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
          created_at: string
          id: string
          is_admin: boolean
          purchases: number
          rated_games: number
          rating: number
          tokens: number
          username: string
        }[]
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
      award_ai_win: { Args: { _difficulty: string }; Returns: number }
      buy_item: { Args: { _item_id: string }; Returns: Json }
      claim_daily_bonus: { Args: never; Returns: Json }
      claim_local_tokens: { Args: { _amount: number }; Returns: number }
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
      require_admin: { Args: never; Returns: undefined }
      settle_match: { Args: { _match_id: string }; Returns: undefined }
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
