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
      historical_records: {
        Row: {
          source_key: string
          kind: string
          record_date: string | null
          source_label: string | null
          canonical_label: string | null
          customer_id: string | null
          source_workbook: string
          source_sheet: string
          source_cell: string
          source_file_sha256: string
          row_sha256: string
          litres: number | null
          charged_rs: number | null
          paid_rs: number | null
          remaining_rs: number | null
          farm_debit_rs: number | null
          home_debit_rs: number | null
          daily_credit_rs: number | null
          details: Json
          flags: string[]
          imported_at: string
        }
        Insert: {
          source_key: string
          kind: string
          record_date?: string | null
          source_label?: string | null
          canonical_label?: string | null
          customer_id?: string | null
          source_workbook: string
          source_sheet: string
          source_cell: string
          source_file_sha256: string
          row_sha256: string
          litres?: number | null
          charged_rs?: number | null
          paid_rs?: number | null
          remaining_rs?: number | null
          farm_debit_rs?: number | null
          home_debit_rs?: number | null
          daily_credit_rs?: number | null
          details?: Json
          flags?: string[]
          imported_at?: string
        }
        Update: {
          source_key?: string
          kind?: string
          record_date?: string | null
          source_label?: string | null
          canonical_label?: string | null
          customer_id?: string | null
          source_workbook?: string
          source_sheet?: string
          source_cell?: string
          source_file_sha256?: string
          row_sha256?: string
          litres?: number | null
          charged_rs?: number | null
          paid_rs?: number | null
          remaining_rs?: number | null
          farm_debit_rs?: number | null
          home_debit_rs?: number | null
          daily_credit_rs?: number | null
          details?: Json
          flags?: string[]
          imported_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "historical_records_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_farm_cash: boolean
          is_owner: boolean
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
          is_owner?: boolean
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
          is_owner?: boolean
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
          purchase_location: string | null
          purchase_price: number | null
          photo_path: string | null
          sale_price: number | null
          seller_name: string | null
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
          purchase_location?: string | null
          purchase_price?: number | null
          photo_path?: string | null
          sale_price?: number | null
          seller_name?: string | null
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
          purchase_location?: string | null
          purchase_price?: number | null
          photo_path?: string | null
          sale_price?: number | null
          seller_name?: string | null
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
      animal_care_tasks: {
        Row: {
          animal_id: string
          category: string
          completed_date: string | null
          completion_notes: string | null
          created_at: string
          due_date: string
          id: string
          notes: string | null
          title: string
          updated_at: string
        }
        Insert: {
          animal_id: string
          category: string
          completed_date?: string | null
          completion_notes?: string | null
          created_at?: string
          due_date: string
          id?: string
          notes?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          animal_id?: string
          category?: string
          completed_date?: string | null
          completion_notes?: string | null
          created_at?: string
          due_date?: string
          id?: string
          notes?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "animal_care_tasks_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animal_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animal_care_tasks_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
        ]
      }
      animal_weight_records: {
        Row: {
          animal_id: string
          created_at: string
          id: string
          notes: string | null
          weight_date: string
          weight_kg: number
        }
        Insert: {
          animal_id: string
          created_at?: string
          id?: string
          notes?: string | null
          weight_date: string
          weight_kg: number
        }
        Update: {
          animal_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          weight_date?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "animal_weight_records_animal_id_fkey"
            columns: ["animal_id"]
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
      customer_balance_adjustments: {
        Row: {
          id: string
          customer_id: string
          adjustment_date: string
          balance_change: number
          reason: string
          created_at: string
          actor_id: string | null
        }
        Insert: {
          id: string
          customer_id: string
          adjustment_date: string
          balance_change: number
          reason: string
          created_at?: string
          actor_id?: string | null
        }
        Update: {
          id?: string
          customer_id?: string
          adjustment_date?: string
          balance_change?: number
          reason?: string
          created_at?: string
          actor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_balance_adjustments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_balance_adjustments_customer_id_fkey"
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
          default_noon: number
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
          default_noon?: number
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
          default_noon?: number
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
      animal_feed_entries: {
        Row: {
          animal_id: string
          created_at: string
          feed_date: string
          id: string
          inventory_item_id: string
          note: string | null
          quantity: number
          request_id: string
          request_payload: Json
          stock_quantity: number
          stock_unit: string
          stock_movement_id: string
          supersedes_id: string | null
          unit: string
        }
        Insert: {
          animal_id: string
          created_at?: string
          feed_date: string
          id?: string
          inventory_item_id: string
          note?: string | null
          quantity: number
          request_id: string
          request_payload: Json
          stock_quantity: number
          stock_unit: string
          stock_movement_id: string
          supersedes_id?: string | null
          unit: string
        }
        Update: {
          animal_id?: string
          created_at?: string
          feed_date?: string
          id?: string
          inventory_item_id?: string
          note?: string | null
          quantity?: number
          request_id?: string
          request_payload?: Json
          stock_quantity?: number
          stock_unit?: string
          stock_movement_id?: string
          supersedes_id?: string | null
          unit?: string
        }
        Relationships: [
          { foreignKeyName: "animal_feed_entries_animal_id_fkey"; columns: ["animal_id"]; isOneToOne: false; referencedRelation: "animals"; referencedColumns: ["id"] },
          { foreignKeyName: "animal_feed_entries_inventory_item_id_fkey"; columns: ["inventory_item_id"]; isOneToOne: false; referencedRelation: "inventory_items"; referencedColumns: ["id"] },
          { foreignKeyName: "animal_feed_entries_stock_movement_id_fkey"; columns: ["stock_movement_id"]; isOneToOne: true; referencedRelation: "inventory_movements"; referencedColumns: ["id"] },
          { foreignKeyName: "animal_feed_entries_supersedes_id_fkey"; columns: ["supersedes_id"]; isOneToOne: false; referencedRelation: "animal_feed_entries"; referencedColumns: ["id"] },
        ]
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
      expense_audit: {
        Row: {
          id: string; request_id: string; expense_id: string; before_row: Json;
          after_row: Json; reason: string; actor_id: string | null; changed_at: string
        }
        Insert: {
          id?: string; request_id: string; expense_id: string; before_row: Json;
          after_row: Json; reason: string; actor_id?: string | null; changed_at?: string
        }
        Update: {
          id?: string; request_id?: string; expense_id?: string; before_row?: Json;
          after_row?: Json; reason?: string; actor_id?: string | null; changed_at?: string
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
          received_by: string | null
          revision: number
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
          received_by?: string | null
          revision?: number
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
          received_by?: string | null
          revision?: number
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
      health_event_details: {
        Row: {
          current_condition: string | null
          diagnosis: string | null
          dosage: string | null
          health_event_id: string
          medicine_type: string | null
          route: string | null
          severity: string | null
          symptoms: string | null
          treatment_end_date: string | null
          treatment_start_date: string | null
        }
        Insert: {
          current_condition?: string | null
          diagnosis?: string | null
          dosage?: string | null
          health_event_id: string
          medicine_type?: string | null
          route?: string | null
          severity?: string | null
          symptoms?: string | null
          treatment_end_date?: string | null
          treatment_start_date?: string | null
        }
        Update: {
          current_condition?: string | null
          diagnosis?: string | null
          dosage?: string | null
          health_event_id?: string
          medicine_type?: string | null
          route?: string | null
          severity?: string | null
          symptoms?: string | null
          treatment_end_date?: string | null
          treatment_start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_event_details_health_event_id_fkey"
            columns: ["health_event_id"]
            isOneToOne: true
            referencedRelation: "health_events"
            referencedColumns: ["id"]
          },
        ]
      }
      health_event_attachments: {
        Row: {
          content_type: string
          created_at: string
          file_name: string
          health_event_id: string
          id: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          content_type: string
          created_at?: string
          file_name: string
          health_event_id: string
          id?: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          content_type?: string
          created_at?: string
          file_name?: string
          health_event_id?: string
          id?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_event_attachments_health_event_id_fkey"
            columns: ["health_event_id"]
            isOneToOne: false
            referencedRelation: "health_events"
            referencedColumns: ["id"]
          },
        ]
      }
      inseminations: {
        Row: {
          abortion_date: string | null
          animal_id: string
          calving_due: string
          calving_due_override: string | null
          checkup_date: string | null
          checkup_due: string
          checkup_due_override: string | null
          checkup_result: string | null
          created_at: string
          dry_off_date: string | null
          dry_off_due: string
          dry_off_due_override: string | null
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
          ultrasound_due_override: string | null
          ultrasound_result: string | null
          updated_at: string
        }
        Insert: {
          abortion_date?: string | null
          animal_id: string
          calving_due: string
          calving_due_override?: string | null
          checkup_date?: string | null
          checkup_due: string
          checkup_due_override?: string | null
          checkup_result?: string | null
          created_at?: string
          dry_off_date?: string | null
          dry_off_due: string
          dry_off_due_override?: string | null
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
          ultrasound_due_override?: string | null
          ultrasound_result?: string | null
          updated_at?: string
        }
        Update: {
          abortion_date?: string | null
          animal_id?: string
          calving_due?: string
          calving_due_override?: string | null
          checkup_date?: string | null
          checkup_due?: string
          checkup_due_override?: string | null
          checkup_result?: string | null
          created_at?: string
          dry_off_date?: string | null
          dry_off_due?: string
          dry_off_due_override?: string | null
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
          ultrasound_due_override?: string | null
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
          {
            foreignKeyName: "milk_deliveries_milk_shift_fkey"
            columns: ["delivery_date", "shift"]
            isOneToOne: false
            referencedRelation: "milk_shifts"
            referencedColumns: ["milk_date", "shift"]
          },
        ]
      }
      milk_dispositions: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          disposition_type: string
          id: string
          litres: number
          milk_date: string
          note: string | null
          recipient: string | null
          shift_id: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          disposition_type: string
          id?: string
          litres: number
          milk_date: string
          note?: string | null
          recipient?: string | null
          shift_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          disposition_type?: string
          id?: string
          litres?: number
          milk_date?: string
          note?: string | null
          recipient?: string | null
          shift_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "milk_dispositions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "milk_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      milk_shift_config: {
        Row: { effective_from: string; noon_enabled: boolean; changed_at: string }
        Insert: { effective_from: string; noon_enabled: boolean; changed_at?: string }
        Update: { effective_from?: string; noon_enabled?: boolean; changed_at?: string }
        Relationships: []
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
      month_lock_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          month: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          month: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          month?: string
          reason?: string | null
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
          reminder_days: number
          calving_reminder_days: number
          milk_drop_threshold_percent: number
          calving_days: number
          checkup_days: number
          contact_phone: string
          default_milk_rate: number
          dry_off_days: number
          eid_adha_start_date: string | null
          eid_fitr_start_date: string | null
          farm_name: string
          fresh_days: number
          go_live_date: string
          gyarhwin_reminder_enabled: boolean
          hijri_date_adjustment: number
          id: number
          owner_name: string
          ultrasound_days: number
          whatsapp_footer: string
        }
        Insert: {
          reminder_days?: number
          calving_reminder_days?: number
          milk_drop_threshold_percent?: number
          calving_days?: number
          checkup_days?: number
          contact_phone?: string
          default_milk_rate?: number
          dry_off_days?: number
          eid_adha_start_date?: string | null
          eid_fitr_start_date?: string | null
          farm_name?: string
          fresh_days?: number
          go_live_date?: string
          gyarhwin_reminder_enabled?: boolean
          hijri_date_adjustment?: number
          id?: number
          owner_name?: string
          ultrasound_days?: number
          whatsapp_footer?: string
        }
        Update: {
          reminder_days?: number
          calving_reminder_days?: number
          milk_drop_threshold_percent?: number
          calving_days?: number
          checkup_days?: number
          contact_phone?: string
          default_milk_rate?: number
          dry_off_days?: number
          eid_adha_start_date?: string | null
          eid_fitr_start_date?: string | null
          farm_name?: string
          fresh_days?: number
          go_live_date?: string
          gyarhwin_reminder_enabled?: boolean
          hijri_date_adjustment?: number
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
          created_by: string | null
          from_account_id: string
          id: string
          note: string | null
          to_account_id: string
          transfer_date: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          from_account_id: string
          id?: string
          note?: string | null
          to_account_id: string
          transfer_date: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
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
      inventory_categories: {
        Row: { id: string; name: string; description: string | null; sort_order: number; active: boolean; revision: number; create_request_id: string | null; create_request_payload: Json | null; created_by: string | null; updated_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; description?: string | null; sort_order?: number; active?: boolean; revision?: number; create_request_id?: string | null; create_request_payload?: Json | null; created_by?: string | null; updated_by?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; name?: string; description?: string | null; sort_order?: number; active?: boolean; revision?: number; create_request_id?: string | null; create_request_payload?: Json | null; created_by?: string | null; updated_by?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      inventory_items: {
        Row: { id: string; name: string; category_id: string; base_unit: string; item_type: string; minimum_stock: number; active: boolean; revision: number; create_request_id: string | null; create_request_payload: Json | null; created_by: string | null; updated_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; name: string; category_id: string; base_unit: string; item_type: string; minimum_stock?: number; active?: boolean; revision?: number; create_request_id?: string | null; create_request_payload?: Json | null; created_by?: string | null; updated_by?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; name?: string; category_id?: string; base_unit?: string; item_type?: string; minimum_stock?: number; active?: boolean; revision?: number; create_request_id?: string | null; create_request_payload?: Json | null; created_by?: string | null; updated_by?: string | null; created_at?: string; updated_at?: string }
        Relationships: [{ foreignKeyName: "inventory_items_category_id_fkey"; columns: ["category_id"]; isOneToOne: false; referencedRelation: "inventory_categories"; referencedColumns: ["id"] }]
      }
      inventory_movements: {
        Row: { id: string; movement_seq: number; item_id: string; movement_date: string; movement_type: string; quantity_delta: number; entered_quantity: number; entered_unit: string; stock_unit: string; recorded_stock_before: number; recorded_stock_after: number; unit_rate: number | null; total_amount: number | null; account_id: string | null; expense_id: string | null; staff_id: string | null; supplier: string | null; reference: string | null; batch_code: string | null; expiry_date: string | null; purpose: string | null; reason: string | null; note: string | null; actor_id: string | null; request_id: string; request_payload: Json; created_at: string }
        Insert: { id?: string; movement_seq?: number; item_id: string; movement_date: string; movement_type: string; quantity_delta: number; entered_quantity: number; entered_unit: string; stock_unit: string; recorded_stock_before: number; recorded_stock_after: number; unit_rate?: number | null; total_amount?: number | null; account_id?: string | null; expense_id?: string | null; staff_id?: string | null; supplier?: string | null; reference?: string | null; batch_code?: string | null; expiry_date?: string | null; purpose?: string | null; reason?: string | null; note?: string | null; actor_id?: string | null; request_id: string; request_payload: Json; created_at?: string }
        Update: { id?: string; movement_seq?: number; item_id?: string; movement_date?: string; movement_type?: string; quantity_delta?: number; entered_quantity?: number; entered_unit?: string; stock_unit?: string; recorded_stock_before?: number; recorded_stock_after?: number; unit_rate?: number | null; total_amount?: number | null; account_id?: string | null; expense_id?: string | null; staff_id?: string | null; supplier?: string | null; reference?: string | null; batch_code?: string | null; expiry_date?: string | null; purpose?: string | null; reason?: string | null; note?: string | null; actor_id?: string | null; request_id?: string; request_payload?: Json; created_at?: string }
        Relationships: [
          { foreignKeyName: "inventory_movements_item_id_fkey"; columns: ["item_id"]; isOneToOne: false; referencedRelation: "inventory_items"; referencedColumns: ["id"] },
          { foreignKeyName: "inventory_movements_account_id_fkey"; columns: ["account_id"]; isOneToOne: false; referencedRelation: "accounts"; referencedColumns: ["id"] },
          { foreignKeyName: "inventory_movements_expense_id_fkey"; columns: ["expense_id"]; isOneToOne: true; referencedRelation: "expenses"; referencedColumns: ["id"] },
          { foreignKeyName: "inventory_movements_staff_id_fkey"; columns: ["staff_id"]; isOneToOne: false; referencedRelation: "staff"; referencedColumns: ["id"] },
        ]
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
      can_manage_veterinary_details: {
        Args: never
        Returns: boolean
      }
      galla_daily_closing: {
        Args: { p_account: string; p_date: string }
        Returns: {
          account_id: string
          account_name: string
          expected_closing: number
          internal_transfers_in: number
          internal_transfers_out: number
          latest_count_date: string | null
          latest_count_difference: number | null
          latest_count_id: string | null
          latest_count_is_stale: boolean | null
          latest_count_reason: string | null
          latest_counted_amount: number | null
          money_paid: number
          money_received: number
          opening_balance: number
          other_transfers_in: number
          other_transfers_out: number
          owner_deposits: number
          owner_withdrawals: number
        }[]
      }
      owner_transfer_bounds: {
        Args: never
        Returns: { first_date: string; last_date: string }[]
      }
      owner_transfer_rows: {
        Args: { p_from: string; p_limit?: number; p_offset?: number; p_to: string }
        Returns: {
          amount: number
          direction: string
          farm_account_id: string
          farm_account_name: string
          note: string | null
          owner_account_id: string
          owner_account_name: string
          recorded_by: string | null
          transfer_date: string
          transfer_id: string
        }[]
      }
      owner_transfer_summary: {
        Args: { p_from: string; p_to: string }
        Returns: {
          deposit_count: number
          net_amount: number
          total_deposits: number
          total_withdrawals: number
          withdrawal_count: number
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
      close_farm_month: {
        Args: { p_month: string; p_note?: string | null }
        Returns: boolean
      }
      correct_expense: {
        Args: {
          p_request_id: string; p_id: string; p_revision: number; p_date: string;
          p_category: string; p_account: string; p_amount: number; p_note: string | null; p_reason: string
        }
        Returns: number
      }
      assert_kharcha_report_period: {
        Args: { p_from: string; p_to: string }
        Returns: undefined
      }
      correct_expense_with_recipient: {
        Args: {
          p_request_id: string; p_id: string; p_revision: number; p_date: string;
          p_category: string; p_account: string; p_amount: number; p_note: string | null;
          p_received_by: string | null; p_reason: string
        }
        Returns: number
      }
      kharcha_report_category_totals: {
        Args: { p_from: string; p_to: string; p_recipient?: string | null }
        Returns: { category: string; expense_type: string; entry_count: number; total_amount: number }[]
      }
      kharcha_report_date_bounds: {
        Args: Record<PropertyKey, never>
        Returns: { first_date: string | null; last_date: string }[]
      }
      kharcha_report_people: {
        Args: { p_from: string; p_to: string }
        Returns: { recipient: string }[]
      }
      kharcha_report_rows: {
        Args: {
          p_from: string; p_to: string; p_recipient?: string | null; p_limit?: number; p_offset?: number
        }
        Returns: {
          expense_id: string; expense_date: string; description: string; category: string;
          account: string; expense_type: string; amount: number; recipient: string | null
        }[]
      }
      kharcha_report_summary: {
        Args: { p_from: string; p_to: string; p_recipient?: string | null }
        Returns: {
          entry_count: number; total_expenses: number; farm_expenses: number;
          home_expenses: number; personal_expenses: number
        }[]
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
          p_free_reason?: string | null
          p_kind: string
          p_morning: number
          p_noon?: number
          p_name: string
          p_opening_balance: number
          p_opening_date: string
          p_phone: string
          p_rate: number
        }
        Returns: string
      }
      create_customer_once: {
        Args: {
          p_request_id: string
          p_name: string
          p_kind: string
          p_phone: string
          p_morning: number
          p_noon?: number
          p_evening: number
          p_rate: number
          p_opening_balance: number
          p_opening_date: string
          p_free_reason: string | null
        }
        Returns: string
      }
      customer_month_report: {
        Args: { p_month: string }
        Returns: {
          active: boolean
          amount: number
          balance: number
          balance_adjustment: number
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
      record_customer_balance_adjustment: {
        Args: {
          p_id: string
          p_customer: string
          p_date: string
          p_balance_change: number
          p_reason: string
        }
        Returns: string
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
      financial_report_cashflow: {
        Args: { p_from: string; p_to: string }
        Returns: {
          account_id: string; account_name: string; account_kind: string;
          opening_balance: number; money_received: number; money_paid: number;
          transfers_in: number; transfers_out: number; closing_balance: number;
          opening_date: string; opening_amount: number
        }[]
      }
      final_report_cash_position: {
        Args: { p_from: string; p_to: string }
        Returns: { closing_cash_bank_balance: number | null; cash_bank_account_count: number }[]
      }
      final_report_khata: {
        Args: { p_from: string; p_to: string }
        Returns: {
          is_grand_total: boolean; customer_id: string | null; name: string; sort_order: number;
          litres: number; opening_balance: number; opening_added: number; charges: number; balance_adjustments: number;
          total_payable: number; payments: number; discounts: number; refunds: number;
          closing_balance: number; receivables_due: number; customer_credits: number
        }[]
      }
      final_report_expense_categories: {
        Args: { p_from: string; p_to: string }
        Returns: { category: string; is_farm_cost: boolean; entries: number; amount: number }[]
      }
      financial_report_income_rows: {
        Args: { p_from: string; p_to: string; p_limit?: number; p_offset?: number }
        Returns: {
          income_id: string; income_date: string; kind: string; amount: number;
          note: string | null; animal_tag: string | null
        }[]
      }
      financial_report_salary_payables: {
        Args: { p_as_of: string }
        Returns: {
          staff_id: string; staff_name: string; salary_month: string;
          agreed_amount: number; paid_amount: number; outstanding_amount: number
        }[]
      }
      financial_report_trends: {
        Args: { p_from: string; p_to: string }
        Returns: {
          bucket_start: string; milk_income: number; other_income: number;
          customer_collections: number; farm_expenses: number; home_expenses: number;
          total_income: number; net_profit: number; cash_received: number; cash_paid: number
        }[]
      }
      farm_today: { Args: never; Returns: string }
      noon_enabled_on: { Args: { p_date: string }; Returns: boolean }
      expected_shifts: { Args: { p_date: string }; Returns: string[] }
      milk_shift_history: { Args: never; Returns: { effective_from: string; noon_enabled: boolean }[] }
      set_noon_milk: { Args: { p_enabled: boolean }; Returns: boolean }
      herd_alerts: {
        Args: { p_today: string }
        Returns: {
          alert_kind: string
          animal_id: string
          due_date: string
          days_left: number
          message: string
          severity: string
          tag: string
        }[]
      }
      animal_breeding_alerts: {
        Args: { p_today: string }
        Returns: {
          alert_kind: string
          animal_id: string
          due_date: string
          days_left: number
          message: string
          severity: string
          tag: string
        }[]
      }
      animal_care_alerts: {
        Args: { p_today: string }
        Returns: {
          alert_kind: string
          animal_id: string
          due_date: string
          days_left: number
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
      subscription_status: {
        Args: never
        Returns: { expires_on: string | null; farm_date: string; days_remaining: number | null; read_only: boolean }[]
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
      record_detailed_health_event: {
        Args: {
          p_account_id: string
          p_animal_id: string
          p_category_id: string
          p_cost: number
          p_current_condition: string
          p_diagnosis: string
          p_dosage: string
          p_event_date: string
          p_kind: string
          p_medicine: string
          p_medicine_type: string
          p_next_due_date: string
          p_notes: string
          p_route: string
          p_severity: string
          p_symptoms: string
          p_title: string
          p_treatment_end_date: string
          p_treatment_start_date: string
          p_vet: string
        }
        Returns: string
      }
      reopen_farm_month: {
        Args: { p_month: string; p_reason: string }
        Returns: boolean
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
      save_milk_entry_checked: {
        Args: {
          p_animals: Json
          p_date: string
          p_deliveries: Json
          p_expected_updated_at: string | null
          p_mode: string
          p_notes: string | null
          p_shift: string
          p_total: number
        }
        Returns: string
      }
      save_milk_entry_with_dispositions: {
        Args: {
          p_animals: Json
          p_date: string
          p_deliveries: Json
          p_dispositions: Json
          p_expected_updated_at: string | null
          p_mode: string
          p_notes: string | null
          p_shift: string
          p_total: number
        }
        Returns: string
      }
      correct_milk_entry_with_dispositions: {
        Args: {
          p_animals: Json
          p_date: string
          p_deliveries: Json
          p_dispositions: Json
          p_expected_updated_at: string
          p_mode: string
          p_notes: string | null
          p_reason: string
          p_shift: string
          p_total: number
        }
        Returns: string
      }
      milk_day_distribution_summary: {
        Args: { p_date: string }
        Returns: {
          allocated_litres: number
          available_litres: number
          cash_litres: number
          cash_received: number
          cash_sale_amount: number
          company_bill_amount: number
          farm_use_litres: number
          free_litres: number
          khata_amount: number
          khata_litres: number
          opening_litres: number
          produced_litres: number
          remaining_litres: number
          report_date: string
          wasted_litres: number
        }[]
      }
      milk_report_distribution_daily: {
        Args: { p_from: string; p_to: string }
        Returns: {
          allocated_litres: number
          available_litres: number
          cash_litres: number
          cash_received: number
          cash_sale_amount: number
          company_bill_amount: number
          farm_use_details: Json
          farm_use_litres: number
          free_details: Json
          free_litres: number
          galla_cash_received: number
          khata_amount: number
          khata_delivery_amount: number
          khata_litres: number
          opening_litres: number
          produced_litres: number
          remaining_litres: number
          report_date: string
          total_sales_amount: number
          waste_details: Json
          wasted_litres: number
        }[]
      }
      milk_report_distribution_summary: {
        Args: { p_from: string; p_to: string }
        Returns: {
          allocated_litres: number
          available_litres: number
          cash_litres: number
          cash_received: number
          cash_sale_amount: number
          company_bill_amount: number
          closing_litres: number
          farm_use_litres: number
          free_litres: number
          galla_cash_received: number
          khata_amount: number
          khata_delivery_amount: number
          khata_litres: number
          opening_litres: number
          outstanding_khata_amount: number
          produced_litres: number
          total_sales_amount: number
          wasted_litres: number
        }[]
      }
      milk_report_distribution_shifts: {
        Args: { p_from: string; p_to: string }
        Returns: {
          allocated_litres: number
          available_litres: number
          cash_litres: number
          cash_received: number
          cash_sale_amount: number
          farm_use_details: Json
          farm_use_litres: number
          free_details: Json
          free_litres: number
          galla_cash_received: number
          khata_delivery_amount: number
          khata_litres: number
          milk_shift: string
          opening_litres: number
          produced_litres: number
          remaining_litres: number
          report_date: string
          waste_details: Json
          wasted_litres: number
        }[]
      }
      milk_shift_distribution_summary: {
        Args: { p_date: string }
        Returns: {
          allocated_litres: number
          available_litres: number
          cash_litres: number
          cash_received: number
          cash_sale_amount: number
          farm_use_litres: number
          free_litres: number
          khata_amount: number
          khata_litres: number
          milk_shift: string
          opening_litres: number
          produced_litres: number
          remaining_litres: number
          wasted_litres: number
        }[]
      }
      void_manual_payment: {
        Args: { p_id: string; p_reason: string; p_revision: number }
        Returns: undefined
      }
      create_inventory_category_once: { Args: { p_request_id: string; p_name: string; p_description?: string | null }; Returns: string }
      update_inventory_category: { Args: { p_category_id: string; p_revision: number; p_name: string; p_description: string | null; p_active: boolean }; Returns: boolean }
      create_inventory_item_once: { Args: { p_request_id: string; p_name: string; p_category_id: string; p_base_unit: string; p_item_type: string; p_minimum_stock: number; p_opening_quantity?: number; p_opening_unit?: string | null; p_opening_date?: string | null }; Returns: string }
      update_inventory_item: { Args: { p_item_id: string; p_revision: number; p_name: string; p_category_id: string; p_base_unit: string; p_item_type: string; p_minimum_stock: number; p_active: boolean }; Returns: boolean }
      record_inventory_purchase: { Args: { p_request_id: string; p_item_id: string; p_quantity: number; p_unit: string; p_unit_rate: number; p_total_amount: number; p_movement_date: string; p_account_id: string; p_expense_category_id: string; p_supplier?: string | null; p_reference?: string | null; p_note?: string | null; p_batch_code?: string | null; p_expiry_date?: string | null }; Returns: string }
      record_inventory_usage: { Args: { p_request_id: string; p_item_id: string; p_quantity: number; p_unit: string; p_movement_date: string; p_purpose: string; p_staff_id?: string | null; p_note?: string | null }; Returns: string }
      record_inventory_adjustment: { Args: { p_request_id: string; p_item_id: string; p_quantity: number; p_unit: string; p_direction: number; p_movement_date: string; p_movement_type: string; p_reason: string; p_note?: string | null }; Returns: string }
      record_animal_feed_once: { Args: { p_request_id: string; p_animal_id: string; p_item_id: string; p_quantity: number; p_unit: string; p_feed_date: string; p_note?: string | null }; Returns: string }
      correct_animal_feed_once: { Args: { p_request_id: string; p_feed_entry_id: string; p_item_id: string; p_quantity: number; p_unit: string; p_note?: string | null }; Returns: string }
      inventory_stock_on: { Args: { p_as_of: string }; Returns: { item_id: string; item_name: string; category_id: string; category_name: string; base_unit: string; item_type: string; minimum_stock: number; active: boolean; current_stock: number; low_stock: boolean; out_of_stock: boolean; last_movement_date: string | null; revision: number }[] }
      inventory_item_history: { Args: { p_item_id: string; p_from: string; p_to: string }; Returns: { movement_id: string; movement_seq: number; item_id: string; movement_date: string; movement_type: string; quantity_delta: number; entered_quantity: number; entered_unit: string; stock_unit: string; recorded_stock_before: number; recorded_stock_after: number; running_balance_after: number; unit_rate: number | null; total_amount: number | null; account_id: string | null; account_name: string | null; expense_id: string | null; staff_id: string | null; staff_name: string | null; supplier: string | null; reference: string | null; batch_code: string | null; expiry_date: string | null; purpose: string | null; reason: string | null; note: string | null; actor_id: string | null }[] }
      inventory_report_summary: { Args: { p_from: string; p_to: string; p_item_id?: string | null; p_category_id?: string | null }; Returns: { item_id: string; item_name: string; category_id: string; category_name: string; stock_unit: string; active: boolean; minimum_stock: number; opening_stock: number; opening_entries_in: number; purchases_in: number; usage_out: number; adjustment_in: number; adjustment_out: number; wastage_out: number; closing_stock: number; purchase_amount: number; current_stock: number; current_low_stock: boolean; current_out_of_stock: boolean }[] }
      inventory_report_usage_by_staff: { Args: { p_from: string; p_to: string; p_item_id?: string | null; p_category_id?: string | null; p_staff_id?: string | null; p_unassigned?: boolean }; Returns: { item_id: string; item_name: string; category_id: string; category_name: string; stock_unit: string; staff_id: string | null; staff_name: string | null; total_quantity: number; transaction_count: number }[] }
      inventory_report_transactions: { Args: { p_from: string; p_to: string; p_item_id?: string | null; p_category_id?: string | null; p_staff_id?: string | null; p_unassigned?: boolean; p_search?: string | null; p_limit?: number; p_offset?: number }; Returns: { movement_id: string; movement_seq: number; item_id: string; item_name: string; category_id: string; category_name: string; movement_date: string; movement_type: string; quantity_delta: number; entered_quantity: number; entered_unit: string; stock_unit: string; running_balance_after: number; unit_rate: number | null; total_amount: number | null; account_name: string | null; expense_id: string | null; staff_id: string | null; staff_name: string | null; supplier: string | null; reference: string | null; batch_code: string | null; expiry_date: string | null; purpose: string | null; reason: string | null; note: string | null; actor_id: string | null; matched_count: number }[] }
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
