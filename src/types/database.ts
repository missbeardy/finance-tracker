export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          color_token: string
          created_at: string
          currency: string
          external_match_patterns: string[]
          id: number
          institution: string
          is_imported: boolean
          is_own: boolean
          name: string
          opening_balance: number | null
          type: string
          user_id: string
        }
        Insert: {
          color_token: string
          created_at?: string
          currency?: string
          external_match_patterns?: string[]
          id?: never
          institution: string
          is_imported?: boolean
          is_own?: boolean
          name: string
          opening_balance?: number | null
          type: string
          user_id?: string
        }
        Update: {
          color_token?: string
          created_at?: string
          currency?: string
          external_match_patterns?: string[]
          id?: never
          institution?: string
          is_imported?: boolean
          is_own?: boolean
          name?: string
          opening_balance?: number | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          amount: number
          category_id: number
          created_at: string
          id: number
          period_start: string
          period_type: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id: number
          created_at?: string
          id?: never
          period_start: string
          period_type?: string
          user_id?: string
        }
        Update: {
          amount?: number
          category_id?: number
          created_at?: string
          id?: never
          period_start?: string
          period_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color_token: string | null
          created_at: string
          id: number
          is_opaque: boolean
          is_system: boolean
          kind: string
          name: string
          parent_id: number | null
          user_id: string
        }
        Insert: {
          color_token?: string | null
          created_at?: string
          id?: never
          is_opaque?: boolean
          is_system?: boolean
          kind: string
          name: string
          parent_id?: number | null
          user_id?: string
        }
        Update: {
          color_token?: string | null
          created_at?: string
          id?: never
          is_opaque?: boolean
          is_system?: boolean
          kind?: string
          name?: string
          parent_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      commitments: {
        Row: {
          account_id: number | null
          amount: number
          annualised_cents: number | null
          cadence_days: number
          created_at: string
          id: number
          merchant: string
          next_expected_date: string | null
          status: string
          user_id: string
        }
        Insert: {
          account_id?: number | null
          amount: number
          annualised_cents?: number | null
          cadence_days: number
          created_at?: string
          id?: never
          merchant: string
          next_expected_date?: string | null
          status?: string
          user_id?: string
        }
        Update: {
          account_id?: number | null
          amount?: number
          annualised_cents?: number | null
          cadence_days?: number
          created_at?: string
          id?: never
          merchant?: string
          next_expected_date?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          account_id: number | null
          created_at: string
          date_max: string | null
          date_min: string | null
          duplicates_skipped: number
          filename: string
          id: number
          mapping_profile_hash: string | null
          row_count: number
          user_id: string
        }
        Insert: {
          account_id?: number | null
          created_at?: string
          date_max?: string | null
          date_min?: string | null
          duplicates_skipped?: number
          filename: string
          id?: never
          mapping_profile_hash?: string | null
          row_count?: number
          user_id?: string
        }
        Update: {
          account_id?: number | null
          created_at?: string
          date_max?: string | null
          date_min?: string | null
          duplicates_skipped?: number
          filename?: string
          id?: never
          mapping_profile_hash?: string | null
          row_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "imports_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      keep_alive: {
        Row: {
          id: number
          touched_at: string
        }
        Insert: {
          id?: never
          touched_at?: string
        }
        Update: {
          id?: never
          touched_at?: string
        }
        Relationships: []
      }
      merchant_aliases: {
        Row: {
          canonical_merchant: string
          created_at: string
          id: number
          pattern: string
          user_id: string
        }
        Insert: {
          canonical_merchant: string
          created_at?: string
          id?: never
          pattern: string
          user_id?: string
        }
        Update: {
          canonical_merchant?: string
          created_at?: string
          id?: never
          pattern?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          cadence_days: number
          created_at: string
          device_label: string | null
          endpoint: string
          id: number
          last_notified_at: string | null
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          cadence_days?: number
          created_at?: string
          device_label?: string | null
          endpoint: string
          id?: never
          last_notified_at?: string | null
          p256dh: string
          user_id?: string
        }
        Update: {
          auth?: string
          cadence_days?: number
          created_at?: string
          device_label?: string | null
          endpoint?: string
          id?: never
          last_notified_at?: string | null
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      rules: {
        Row: {
          account_scope: number | null
          amount_max: number | null
          amount_min: number | null
          category_id: number
          created_at: string
          enabled: boolean
          id: number
          match_type: string
          pattern: string
          priority: number
          user_id: string
        }
        Insert: {
          account_scope?: number | null
          amount_max?: number | null
          amount_min?: number | null
          category_id: number
          created_at?: string
          enabled?: boolean
          id?: never
          match_type: string
          pattern: string
          priority?: number
          user_id?: string
        }
        Update: {
          account_scope?: number | null
          amount_max?: number | null
          amount_min?: number | null
          category_id?: number
          created_at?: string
          enabled?: boolean
          id?: never
          match_type?: string
          pattern?: string
          priority?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rules_account_scope_fkey"
            columns: ["account_scope"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string
          id: number
          import_mappings: Json
          payday: string | null
          period_type: string
          reminder_cadence_days: number
          savings_target_cents: number | null
          savings_target_percent: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          import_mappings?: Json
          payday?: string | null
          period_type?: string
          reminder_cadence_days?: number
          savings_target_cents?: number | null
          savings_target_percent?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: never
          import_mappings?: Json
          payday?: string | null
          period_type?: string
          reminder_cadence_days?: number
          savings_target_cents?: number | null
          savings_target_percent?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: number
          amount: number
          balance: number | null
          category_id: number | null
          category_source: string | null
          created_at: string
          date: string
          dedupe_key: string
          description: string
          id: number
          import_id: number
          merchant: string
          notes: string | null
          posted_date: string | null
          split_parent_id: number | null
          status: string
          transfer_id: number | null
          user_id: string
        }
        Insert: {
          account_id: number
          amount: number
          balance?: number | null
          category_id?: number | null
          category_source?: string | null
          created_at?: string
          date: string
          dedupe_key: string
          description: string
          id?: never
          import_id: number
          merchant: string
          notes?: string | null
          posted_date?: string | null
          split_parent_id?: number | null
          status?: string
          transfer_id?: number | null
          user_id?: string
        }
        Update: {
          account_id?: number
          amount?: number
          balance?: number | null
          category_id?: number | null
          category_source?: string | null
          created_at?: string
          date?: string
          dedupe_key?: string
          description?: string
          id?: never
          import_id?: number
          merchant?: string
          notes?: string | null
          posted_date?: string | null
          split_parent_id?: number | null
          status?: string
          transfer_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_split_parent_id_fkey"
            columns: ["split_parent_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          account_in_id: number | null
          account_out_id: number | null
          amount: number
          confidence: string
          created_at: string
          id: number
          in_txn_id: number | null
          method: string
          out_txn_id: number | null
          status: string
          user_id: string
        }
        Insert: {
          account_in_id?: number | null
          account_out_id?: number | null
          amount: number
          confidence?: string
          created_at?: string
          id?: never
          in_txn_id?: number | null
          method?: string
          out_txn_id?: number | null
          status?: string
          user_id?: string
        }
        Update: {
          account_in_id?: number | null
          account_out_id?: number | null
          amount?: number
          confidence?: string
          created_at?: string
          id?: never
          in_txn_id?: number | null
          method?: string
          out_txn_id?: number | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_account_in_id_fkey"
            columns: ["account_in_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_account_out_id_fkey"
            columns: ["account_out_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_in_txn_id_fkey"
            columns: ["in_txn_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_out_txn_id_fkey"
            columns: ["out_txn_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

