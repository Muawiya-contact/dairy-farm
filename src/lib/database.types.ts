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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_farm_cash: boolean
          kind: string
          name: string
          opening_balance: number
          opening_date: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_farm_cash?: boolean
          kind: string
          name: string
          opening_balance?: number
          opening_date?: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_farm_cash?: boolean
          kind?: string
          name?: string
          opening_balance?: number
          opening_date?: string
          sort_order?: number
        }
        Relationships: []
      }
      animal_milk: {
        Row: {
          animal_id: string
          id: string
          litres: number
          shift_id: string
        }
        Insert: {
          animal_id: string
          id?: string
          litres: number
          shift_id: string
        }
        Update: {
          animal_id?: string
          id?: string
          litres?: number
          shift_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "animal_milk_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animal_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animal_milk_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animal_milk_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "milk_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      animals: {
        Row: {
          arrival_date: string | null
          birth_date: string | null
          breed: string | null
          category: string
          created_at: string
          estimated_age_months_at_arrival: number | null
          exit_date: string | null
          exit_reason: string | null
          id: string
          life_status: string
          milking_status: string
          mother_id: string | null
          name: string | null
          notes: string | null
          purchase_date: string | null
          purchase_price: number | null
          sale_price: number | null
          sex: string
          sire: string | null
          source: string
          species: string
          tag: string
          updated_at: string
        }
        Insert: {
          arrival_date?: string | null
          birth_date?: string | null
          breed?: string | null
          category?: string
          created_at?: string
          estimated_age_months_at_arrival?: number | null
          exit_date?: string | null
          exit_reason?: string | null
          id?: string
          life_status?: string
          milking_status?: string
          mother_id?: string | null
          name?: string | null
          notes?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          sale_price?: number | null
          sex?: string
          sire?: string | null
          source?: string
          species?: string
          tag: string
          updated_at?: string
        }
        Update: {
          arrival_date?: string | null
          birth_date?: string | null
          breed?: string | null
          category?: string
          created_at?: string
          estimated_age_months_at_arrival?: number | null
          exit_date?: string | null
          exit_reason?: string | null
          id?: string
          life_status?: string
          milking_status?: string
          mother_id?: string | null
          name?: string | null
          notes?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          sale_price?: number | null
          sex?: string
          sire?: string | null
          source?: string
          species?: string
          tag?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "animals_mother_id_fkey"
            columns: ["mother_id"]
            isOneToOne: false
            referencedRelation: "animal_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animals_mother_id_fkey"
            columns: ["mother_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
        ]
      }
      calving_offspring: {
        Row: {
          animal_id: string | null
          birth_order: number
          birth_weight_kg: number | null
          calving_id: string
          created_at: string
          id: string
          notes: string | null
          outcome: string
          sex: string | null
          tag_at_birth: string | null
        }
        Insert: {
          animal_id?: string | null
          birth_order: number
          birth_weight_kg?: number | null
          calving_id: string
          created_at?: string
          id?: string
          notes?: string | null
          outcome: string
          sex?: string | null
          tag_at_birth?: string | null
        }
        Update: {
          animal_id?: string | null
          birth_order?: number
          birth_weight_kg?: number | null
          calving_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          outcome?: string
          sex?: string | null
          tag_at_birth?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calving_offspring_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: true
            referencedRelation: "animal_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calving_offspring_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: true
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calving_offspring_calving_id_fkey"
            columns: ["calving_id"]
            isOneToOne: false
            referencedRelation: "calvings"
            referencedColumns: ["id"]
          },
        ]
      }
      calvings: {
        Row: {
          animal_id: string
          calf_id: string | null
          calving_date: string
          created_at: string
          ease_score: number | null
          id: string
          insemination_id: string | null
          notes: string | null
          outcome: string
          request_hash: string | null
          request_id: string | null
        }
        Insert: {
          animal_id: string
          calf_id?: string | null
          calving_date: string
          created_at?: string
          ease_score?: number | null
          id?: string
          insemination_id?: string | null
          notes?: string | null
          outcome?: string
          request_hash?: string | null
          request_id?: string | null
        }
        Update: {
          animal_id?: string
          calf_id?: string | null
          calving_date?: string
          created_at?: string
          ease_score?: number | null
          id?: string
          insemination_id?: string | null
          notes?: string | null
          outcome?: string
          request_hash?: string | null
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calvings_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animal_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calvings_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calvings_calf_id_fkey"
            columns: ["calf_id"]
            isOneToOne: false
            referencedRelation: "animal_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calvings_calf_id_fkey"
            columns: ["calf_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calvings_insemination_id_fkey"
            columns: ["insemination_id"]
            isOneToOne: false
            referencedRelation: "animal_status"
            referencedColumns: ["insemination_id"]
          },
          {
            foreignKeyName: "calvings_insemination_id_fkey"
            columns: ["insemination_id"]
            isOneToOne: false
            referencedRelation: "inseminations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_counts: {
        Row: {
          account_id: string
          count_date: string
          counted_amount: number
          created_at: string
          difference: number
          expected_balance: number
          id: string
          reason: string | null
        }
        Insert: {
          account_id: string
          count_date: string
          counted_amount: number
          created_at?: string
          difference?: number
          expected_balance?: number
          id?: string
          reason?: string | null
        }
        Update: {
          account_id?: string
          count_date?: string
          counted_amount?: number
          created_at?: string
          difference?: number
          expected_balance?: number
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_counts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      company_bills: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          from_date: string
          id: string
          litres: number
          notes: string | null
          to_date: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id: string
          from_date: string
          id?: string
          litres: number
          notes?: string | null
          to_date: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          from_date?: string
          id?: string
          litres?: number
          notes?: string | null
          to_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_bills_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "company_bills_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_rates: {
        Row: {
          customer_id: string
          effective_from: string
          id: string
          rate: number
        }
        Insert: {
          customer_id: string
          effective_from: string
          id?: string
          rate: number
        }
        Update: {
          customer_id?: string
          effective_from?: string
          id?: string
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_rates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_rates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          active: boolean
          created_at: string
          default_evening: number
          default_morning: number
          free_reason: string | null
          id: string
          kind: string
          name: string
          notes: string | null
          opening_balance: number
          opening_date: string
          phone: string | null
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_evening?: number
          default_morning?: number
          free_reason?: string | null
          id?: string
          kind: string
          name: string
          notes?: string | null
          opening_balance?: number
          opening_date?: string
          phone?: string | null
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          default_evening?: number
          default_morning?: number
          free_reason?: string | null
          id?: string
          kind?: string
          name?: string
          notes?: string | null
          opening_balance?: number
          opening_date?: string
          phone?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          active: boolean
          id: string
          is_farm_cost: boolean
          is_salary: boolean
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          id?: string
          is_farm_cost?: boolean
          is_salary?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          id?: string
          is_farm_cost?: boolean
          is_salary?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      expenses: {
        Row: {
          account_id: string
          amount: number
          category_id: string
          created_at: string
          expense_date: string
          id: string
          note: string | null
          quantity: number | null
          salary_period_id: string | null
          staff_id: string | null
          unit: string | null
        }
        Insert: {
          account_id: string
          amount: number
          category_id: string
          created_at?: string
          expense_date: string
          id?: string
          note?: string | null
          quantity?: number | null
          salary_period_id?: string | null
          staff_id?: string | null
          unit?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          category_id?: string
          created_at?: string
          expense_date?: string
          id?: string
          note?: string | null
          quantity?: number | null
          salary_period_id?: string | null
          staff_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_salary_period_id_fkey"
            columns: ["salary_period_id"]
            isOneToOne: false
            referencedRelation: "salary_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      health_events: {
        Row: {
          animal_id: string
          cost: number
          created_at: string
          event_date: string
          expense_id: string | null
          id: string
          kind: string
          medicine: string | null
          next_due_date: string | null
          notes: string | null
          title: string
          vet: string | null
        }
        Insert: {
          animal_id: string
          cost?: number
          created_at?: string
          event_date: string
          expense_id?: string | null
          id?: string
          kind: string
          medicine?: string | null
          next_due_date?: string | null
          notes?: string | null
          title: string
          vet?: string | null
        }
        Update: {
          animal_id?: string
          cost?: number
          created_at?: string
          event_date?: string
          expense_id?: string | null
          id?: string
          kind?: string
          medicine?: string | null
          next_due_date?: string | null
          notes?: string | null
          title?: string
          vet?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_events_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animal_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_events_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_expense_fk"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      inseminations: {
        Row: {
          abortion_date: string | null
          animal_id: string
          calving_due: string
          checkup_date: string | null
          checkup_due: string
          checkup_result: string | null
          created_at: string
          dry_off_date: string | null
          dry_off_due: string
          id: string
          notes: string | null
          semen_batch: string | null
          semen_name: string | null
          semen_type: string
          service_date: string
          status: string
          technician: string | null
          ultrasound_date: string | null
          ultrasound_due: string
          ultrasound_result: string | null
          updated_at: string
        }
        Insert: {
          abortion_date?: string | null
          animal_id: string
          calving_due: string
          checkup_date?: string | null
          checkup_due: string
          checkup_result?: string | null
          created_at?: string
          dry_off_date?: string | null
          dry_off_due: string
          id?: string
          notes?: string | null
          semen_batch?: string | null
          semen_name?: string | null
          semen_type?: string
          service_date: string
          status?: string
          technician?: string | null
          ultrasound_date?: string | null
          ultrasound_due: string
          ultrasound_result?: string | null
          updated_at?: string
        }
        Update: {
          abortion_date?: string | null
          animal_id?: string
          calving_due?: string
          checkup_date?: string | null
          checkup_due?: string
          checkup_result?: string | null
          created_at?: string
          dry_off_date?: string | null
          dry_off_due?: string
          id?: string
          notes?: string | null
          semen_batch?: string | null
          semen_name?: string | null
          semen_type?: string
          service_date?: string
          status?: string
          technician?: string | null
          ultrasound_date?: string | null
          ultrasound_due?: string
          ultrasound_result?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inseminations_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animal_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inseminations_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
        ]
      }
      milk_deliveries: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          delivery_date: string
          id: string
          litres: number
          rate: number | null
          shift: string
        }
        Insert: {
          amount?: number
          created_at?: string
          customer_id: string
          delivery_date: string
          id?: string
          litres: number
          rate?: number | null
          shift: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          delivery_date?: string
          id?: string
          litres?: number
          rate?: number | null
          shift?: string
        }
        Relationships: [
          {
            foreignKeyName: "milk_deliveries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "milk_deliveries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      milk_shifts: {
        Row: {
          created_at: string
          id: string
          milk_date: string
          mode: string
          notes: string | null
          shift: string
          total_litres: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          milk_date: string
          mode?: string
          notes?: string | null
          shift: string
          total_litres: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          milk_date?: string
          mode?: string
          notes?: string | null
          shift?: string
          total_litres?: number
          updated_at?: string
        }
        Relationships: []
      }
      month_locks: {
        Row: {
          locked_at: string
          month: string
          note: string | null
        }
        Insert: {
          locked_at?: string
          month: string
          note?: string | null
        }
        Update: {
          locked_at?: string
          month?: string
          note?: string | null
        }
        Relationships: []
      }
      other_income: {
        Row: {
          account_id: string
          amount: number
          animal_id: string | null
          created_at: string
          id: string
          income_date: string
          kind: string
          note: string | null
        }
        Insert: {
          account_id: string
          amount: number
          animal_id?: string | null
          created_at?: string
          id?: string
          income_date: string
          kind: string
          note?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          animal_id?: string | null
          created_at?: string
          id?: string
          income_date?: string
          kind?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "other_income_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "other_income_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animal_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "other_income_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_audit: {
        Row: {
          action: string
          actor_id: string | null
          after_row: Json | null
          before_row: Json
          changed_at: string
          customer_id: string
          id: string
          payment_id: string
          reason: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_row?: Json | null
          before_row: Json
          changed_at?: string
          customer_id: string
          id?: string
          payment_id: string
          reason: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_row?: Json | null
          before_row?: Json
          changed_at?: string
          customer_id?: string
          id?: string
          payment_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_audit_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payment_audit_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          customer_id: string
          delivery_id: string | null
          id: string
          kind: string
          method: string | null
          note: string | null
          payment_date: string
          revision: number
        }
        Insert: {
          account_id?: string | null
          amount: number
          created_at?: string
          customer_id: string
          delivery_id?: string | null
          id?: string
          kind?: string
          method?: string | null
          note?: string | null
          payment_date: string
          revision?: number
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          customer_id?: string
          delivery_id?: string | null
          id?: string
          kind?: string
          method?: string | null
          note?: string | null
          payment_date?: string
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: true
            referencedRelation: "milk_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_periods: {
        Row: {
          agreed_amount: number
          created_at: string
          id: string
          salary_month: string
          staff_id: string
        }
        Insert: {
          agreed_amount: number
          created_at?: string
          id?: string
          salary_month: string
          staff_id: string
        }
        Update: {
          agreed_amount?: number
          created_at?: string
          id?: string
          salary_month?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_periods_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          calving_days: number
          checkup_days: number
          contact_phone: string
          default_milk_rate: number
          dry_off_days: number
          farm_name: string
          fresh_days: number
          go_live_date: string
          id: number
          owner_name: string
          ultrasound_days: number
          whatsapp_footer: string
        }
        Insert: {
          calving_days?: number
          checkup_days?: number
          contact_phone?: string
          default_milk_rate?: number
          dry_off_days?: number
          farm_name?: string
          fresh_days?: number
          go_live_date?: string
          id?: number
          owner_name?: string
          ultrasound_days?: number
          whatsapp_footer?: string
        }
        Update: {
          calving_days?: number
          checkup_days?: number
          contact_phone?: string
          default_milk_rate?: number
          dry_off_days?: number
          farm_name?: string
          fresh_days?: number
          go_live_date?: string
          id?: number
          owner_name?: string
          ultrasound_days?: number
          whatsapp_footer?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          active: boolean
          created_at: string
          id: string
          monthly_salary: number
          name: string
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          monthly_salary?: number
          name: string
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          monthly_salary?: number
          name?: string
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transfers: {
        Row: {
          amount: number
          created_at: string
          from_account_id: string
          id: string
          note: string | null
          to_account_id: string
          transfer_date: string
        }
        Insert: {
          amount: number
          created_at?: string
          from_account_id: string
          id?: string
          note?: string | null
          to_account_id: string
          transfer_date: string
        }
        Update: {
          amount?: number
          created_at?: string
          from_account_id?: string
          id?: string
          note?: string | null
          to_account_id?: string
          transfer_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      animal_status: {
        Row: {
          birth_date: string | null
          breed: string | null
          breeding_status: string | null
          calving_due: string | null
          category: string | null
          checkup_due: string | null
          days_in_milk: number | null
          dry_off_due: string | null
          id: string | null
          insem_status: string | null
          insemination_id: string | null
          last_calving_date: string | null
          milking_status: string | null
          mother_id: string | null
          name: string | null
          semen_name: string | null
          semen_type: string | null
          service_date: string | null
          sex: string | null
          species: string | null
          tag: string | null
          ultrasound_due: string | null
        }
        Relationships: [
          {
            foreignKeyName: "animals_mother_id_fkey"
            columns: ["mother_id"]
            isOneToOne: false
            referencedRelation: "animal_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animals_mother_id_fkey"
            columns: ["mother_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_balances: {
        Row: {
          balance: number | null
          customer_id: string | null
          kind: string | null
          last_payment_date: string | null
          name: string | null
        }
        Insert: {
          balance?: never
          customer_id?: string | null
          kind?: string | null
          last_payment_date?: never
          name?: string | null
        }
        Update: {
          balance?: never
          customer_id?: string | null
          kind?: string | null
          last_payment_date?: never
          name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      account_balance_on: {
        Args: { p_account: string; p_date: string }
        Returns: number
      }
      account_entries: {
        Args: { p_account: string }
        Returns: {
          description: string
          entry_date: string
          entry_kind: string
          money_in: number
          money_out: number
          ref_id: string
        }[]
      }
      account_month_summary: {
        Args: { p_month: string }
        Returns: {
          account_id: string
          closing: number
          is_farm_cash: boolean
          kind: string
          money_in: number
          money_out: number
          name: string
          opening: number
        }[]
      }
      close_animal: {
        Args: {
          p_account_id: string
          p_animal_id: string
          p_exit_date: string
          p_reason: string
          p_sale_price: number
          p_status: string
        }
        Returns: string
      }
      correct_manual_payment: {
        Args: {
          p_account: string | null
          p_amount: number
          p_date: string
          p_id: string
          p_method: string | null
          p_reason: string
          p_revision: number
        }
        Returns: number
      }
      create_customer: {
        Args: {
          p_evening: number
          p_kind: string
          p_morning: number
          p_name: string
          p_opening_balance: number
          p_opening_date: string
          p_phone: string
          p_rate: number
        }
        Returns: string
      }
      customer_month_report: {
        Args: { p_month: string }
        Returns: {
          active: boolean
          amount: number
          balance: number
          customer_id: string
          discount: number
          free_reason: string
          kind: string
          litres: number
          name: string
          paid: number
          previous_balance: number
          sort_order: number
          total: number
        }[]
      }
      expense_month_report: {
        Args: { p_month: string }
        Returns: {
          amount: number
          category: string
          category_id: string
          is_farm_cost: boolean
          label: string
          sort_order: number
          staff_id: string
          staff_name: string
        }[]
      }
      farm_today: { Args: never; Returns: string }
      herd_alerts: {
        Args: { p_today: string }
        Returns: {
          alert_kind: string
          animal_id: string
          due_date: string
          message: string
          severity: string
          tag: string
        }[]
      }
      milk_month_summary: {
        Args: { p_month: string }
        Returns: {
          company_slip_litres: number
          delivered: number
          difference: number
          free_litres: number
          produced: number
          sold_litres: number
        }[]
      }
      pnl_month: {
        Args: { p_month: string }
        Returns: {
          farm_expenses: number
          milk_income: number
          other_income: number
          personal_expenses: number
          profit: number
          total_income: number
        }[]
      }
      rate_on: { Args: { p_customer: string; p_day: string }; Returns: number }
      record_calving: {
        Args: {
          p_calving_date: string
          p_insemination_id: string
          p_notes?: string
          p_outcome: string
        }
        Returns: string
      }
      record_calving_with_offspring: {
        Args: {
          p_calving_date: string
          p_ease_score?: number | null
          p_insemination_id: string
          p_notes?: string | null
          p_offspring: Json
          p_request_id: string
        }
        Returns: string
      }
      record_health_event: {
        Args: {
          p_account_id: string
          p_animal_id: string
          p_category_id: string
          p_cost: number
          p_event_date: string
          p_kind: string
          p_next_due_date: string
          p_title: string
        }
        Returns: string
      }
      save_milk_entry: {
        Args: {
          p_animals: Json
          p_date: string
          p_deliveries: Json
          p_mode: string
          p_shift: string
          p_total: number
        }
        Returns: string
      }
      void_manual_payment: {
        Args: { p_id: string; p_reason: string; p_revision: number }
        Returns: undefined
      }
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
