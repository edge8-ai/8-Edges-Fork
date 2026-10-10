// GENERATED FILE — do not edit by hand.
//
// Produced by `npm run gen:types` (scripts/gen-supabase-types.mjs), which runs
//   supabase gen types typescript --project-id <the linked project> --schema public,company_os,htt
// and prepends this header. `npm run check:types-fresh` (CI job `types-fresh`)
// fails when the live schema no longer matches this file; regenerate and commit.
//
// The Supabase CLI output is deterministic for a given schema (verified by
// running it twice and comparing byte-for-byte), so a diff here means the
// database changed, not the tool. The generator's __InternalSupabase version
// block is stripped so the hosted and db-url paths produce the same bytes.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  company_os: {
    Tables: {
      access_codes: {
        Row: {
          code: string
          scope: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          scope: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          scope?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      access_role_assignments: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          person_id: string
          reason: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          role_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          person_id: string
          reason: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          person_id?: string
          reason?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_role_assignments_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_role_assignments_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_role_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_role_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_role_assignments_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_role_assignments_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "access_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_role_permissions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          permission: string
          revoked_at: string | null
          revoked_by: string | null
          role_id: string
          scope: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          permission: string
          revoked_at?: string | null
          revoked_by?: string | null
          role_id: string
          scope: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          permission?: string
          revoked_at?: string | null
          revoked_by?: string | null
          role_id?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_role_permissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_role_permissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_role_permissions_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_role_permissions_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "access_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_roles: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          description: string
          id: string
          key: string
          kind: string
          name: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          description: string
          id?: string
          key: string
          kind: string
          name: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          description?: string
          id?: string
          key?: string
          kind?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_roles_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_roles_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      account_health_snapshots: {
        Row: {
          company_id: string
          created_at: string
          id: string
          score: number
          signals: Json
          taken_on: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          score: number
          signals?: Json
          taken_on: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          score?: number
          signals?: Json
          taken_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_health_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      admins: {
        Row: {
          can_view_sensitive: boolean
          created_at: string
          created_by: string | null
          display_name: string | null
          email: string
          id: string
          person_id: string | null
        }
        Insert: {
          can_view_sensitive?: boolean
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email: string
          id?: string
          person_id?: string | null
        }
        Update: {
          can_view_sensitive?: boolean
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email?: string
          id?: string
          person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admins_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admins_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_commissions: {
        Row: {
          affiliate_id: string
          chosen_at: string | null
          commission_cents: number | null
          commission_usd_cents: number | null
          created_at: string
          fx_rate: number | null
          gross_cents: number
          gross_usd_cents: number | null
          id: string
          net_usd_cents: number | null
          notes: string | null
          order_id: string | null
          payout_id: string | null
          rate: number | null
          redemption_choice: string | null
          source_event: string
          source_ref: string | null
        }
        Insert: {
          affiliate_id: string
          chosen_at?: string | null
          commission_cents?: number | null
          commission_usd_cents?: number | null
          created_at?: string
          fx_rate?: number | null
          gross_cents: number
          gross_usd_cents?: number | null
          id?: string
          net_usd_cents?: number | null
          notes?: string | null
          order_id?: string | null
          payout_id?: string | null
          rate?: number | null
          redemption_choice?: string | null
          source_event?: string
          source_ref?: string | null
        }
        Update: {
          affiliate_id?: string
          chosen_at?: string | null
          commission_cents?: number | null
          commission_usd_cents?: number | null
          created_at?: string
          fx_rate?: number | null
          gross_cents?: number
          gross_usd_cents?: number | null
          id?: string
          net_usd_cents?: number | null
          notes?: string | null
          order_id?: string | null
          payout_id?: string | null
          rate?: number | null
          redemption_choice?: string | null
          source_event?: string
          source_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_commissions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "affiliate_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_payouts: {
        Row: {
          affiliate_id: string
          amount_cents: number
          created_at: string
          id: string
          method: string | null
          notes: string | null
          paid_at: string | null
          reference: string | null
        }
        Insert: {
          affiliate_id: string
          amount_cents: number
          created_at?: string
          id?: string
          method?: string | null
          notes?: string | null
          paid_at?: string | null
          reference?: string | null
        }
        Update: {
          affiliate_id?: string
          amount_cents?: number
          created_at?: string
          id?: string
          method?: string | null
          notes?: string | null
          paid_at?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payouts_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliates: {
        Row: {
          active: boolean
          code: string
          code_commission: string | null
          code_discount: string | null
          company_id: string | null
          created_at: string
          id: string
          notes: string | null
          person_id: string | null
          program_type: string
          rate: number
          referred_by: string | null
          stripe_coupon_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          code_commission?: string | null
          code_discount?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          person_id?: string | null
          program_type?: string
          rate?: number
          referred_by?: string | null
          stripe_coupon_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          code_commission?: string | null
          code_discount?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          person_id?: string | null
          program_type?: string
          rate?: number
          referred_by?: string | null
          stripe_coupon_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliates_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliates_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_calls: {
        Row: {
          cache_read_tokens: number | null
          cache_write_tokens: number | null
          class: string
          cost_usd: number | null
          created_at: string
          error_kind: string | null
          id: string
          input_hash: string
          input_tokens: number | null
          latency_ms: number
          model: string
          ok: boolean
          output_tokens: number | null
          prompt_version: string
          provider: string
          run_id: string | null
          site: string
        }
        Insert: {
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          class: string
          cost_usd?: number | null
          created_at?: string
          error_kind?: string | null
          id?: string
          input_hash: string
          input_tokens?: number | null
          latency_ms: number
          model: string
          ok: boolean
          output_tokens?: number | null
          prompt_version: string
          provider: string
          run_id?: string | null
          site: string
        }
        Update: {
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          class?: string
          cost_usd?: number | null
          created_at?: string
          error_kind?: string | null
          id?: string
          input_hash?: string
          input_tokens?: number | null
          latency_ms?: number
          model?: string
          ok?: boolean
          output_tokens?: number | null
          prompt_version?: string
          provider?: string
          run_id?: string | null
          site?: string
        }
        Relationships: []
      }
      ai_programs: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_programs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      application_stage_log: {
        Row: {
          application_id: string
          from_stage_id: string | null
          id: string
          moved_at: string
          moved_by: string | null
          note: string | null
          to_stage_id: string | null
        }
        Insert: {
          application_id: string
          from_stage_id?: string | null
          id?: string
          moved_at?: string
          moved_by?: string | null
          note?: string | null
          to_stage_id?: string | null
        }
        Update: {
          application_id?: string
          from_stage_id?: string | null
          id?: string
          moved_at?: string
          moved_by?: string | null
          note?: string | null
          to_stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_stage_log_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_stage_log_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "application_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_stage_log_moved_by_fkey"
            columns: ["moved_by"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_stage_log_moved_by_fkey"
            columns: ["moved_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_stage_log_moved_by_fkey"
            columns: ["moved_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_stage_log_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "application_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      application_stages: {
        Row: {
          created_at: string
          id: string
          is_terminal: boolean
          job_requisition_id: string
          name: string
          position: number
          stage_kind: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_terminal?: boolean
          job_requisition_id: string
          name: string
          position?: number
          stage_kind?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_terminal?: boolean
          job_requisition_id?: string
          name?: string
          position?: number
          stage_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_stages_job_requisition_id_fkey"
            columns: ["job_requisition_id"]
            isOneToOne: false
            referencedRelation: "job_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          ai_model: string | null
          ai_rating: number | null
          ai_screen_error: string | null
          ai_screen_flags: Json | null
          ai_screen_status: string | null
          ai_screened_at: string | null
          ai_summary: Json | null
          answers: Json
          applied_at: string
          archived_at: string | null
          candidate_id: string | null
          chain_error: string | null
          chain_proposal: Json | null
          chain_started_at: string | null
          chain_step: string | null
          cover_letter: string | null
          created_at: string
          current_stage_id: string | null
          decided_at: string | null
          hr_assessment: string | null
          id: string
          job_requisition_id: string
          metadata: Json
          person_id: string | null
          rating: number | null
          referrer_person_id: string | null
          rejection_reason: string | null
          resume_assessment: string | null
          resume_document_id: string | null
          source: string
          source_detail: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ai_model?: string | null
          ai_rating?: number | null
          ai_screen_error?: string | null
          ai_screen_flags?: Json | null
          ai_screen_status?: string | null
          ai_screened_at?: string | null
          ai_summary?: Json | null
          answers?: Json
          applied_at?: string
          archived_at?: string | null
          candidate_id?: string | null
          chain_error?: string | null
          chain_proposal?: Json | null
          chain_started_at?: string | null
          chain_step?: string | null
          cover_letter?: string | null
          created_at?: string
          current_stage_id?: string | null
          decided_at?: string | null
          hr_assessment?: string | null
          id?: string
          job_requisition_id: string
          metadata?: Json
          person_id?: string | null
          rating?: number | null
          referrer_person_id?: string | null
          rejection_reason?: string | null
          resume_assessment?: string | null
          resume_document_id?: string | null
          source?: string
          source_detail?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ai_model?: string | null
          ai_rating?: number | null
          ai_screen_error?: string | null
          ai_screen_flags?: Json | null
          ai_screen_status?: string | null
          ai_screened_at?: string | null
          ai_summary?: Json | null
          answers?: Json
          applied_at?: string
          archived_at?: string | null
          candidate_id?: string | null
          chain_error?: string | null
          chain_proposal?: Json | null
          chain_started_at?: string | null
          chain_step?: string | null
          cover_letter?: string | null
          created_at?: string
          current_stage_id?: string | null
          decided_at?: string | null
          hr_assessment?: string | null
          id?: string
          job_requisition_id?: string
          metadata?: Json
          person_id?: string | null
          rating?: number | null
          referrer_person_id?: string | null
          rejection_reason?: string | null
          resume_assessment?: string | null
          resume_document_id?: string | null
          source?: string
          source_detail?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "application_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_requisition_id_fkey"
            columns: ["job_requisition_id"]
            isOneToOne: false
            referencedRelation: "job_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_referrer_person_id_fkey"
            columns: ["referrer_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_referrer_person_id_fkey"
            columns: ["referrer_person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_resume_document_id_fkey"
            columns: ["resume_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          approver_permission: string | null
          approver_person_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          metadata: Json
          reason: string | null
          requested_by: string | null
          state: string
          subject_id: string
          subject_type: string
          updated_at: string
        }
        Insert: {
          approver_permission?: string | null
          approver_person_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          requested_by?: string | null
          state?: string
          subject_id: string
          subject_type: string
          updated_at?: string
        }
        Update: {
          approver_permission?: string | null
          approver_person_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          requested_by?: string | null
          state?: string
          subject_id?: string
          subject_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_approver_person_id_fkey"
            columns: ["approver_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_approver_person_id_fkey"
            columns: ["approver_person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_conversations: {
        Row: {
          archived_at: string | null
          created_at: string
          display_items: Json
          id: string
          last_message_at: string | null
          messages: Json
          owner_auth_user_id: string
          owner_person_id: string | null
          surface: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          display_items?: Json
          id?: string
          last_message_at?: string | null
          messages?: Json
          owner_auth_user_id: string
          owner_person_id?: string | null
          surface: string
          title?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          display_items?: Json
          id?: string
          last_message_at?: string | null
          messages?: Json
          owner_auth_user_id?: string
          owner_person_id?: string | null
          surface?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_conversations_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_conversations_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          actor_label: string | null
          actor_person_id: string | null
          changed_at: string
          context: Json
          id: string
          new_data: Json | null
          old_data: Json | null
          operation: string
          record_id: string | null
          table_name: string
        }
        Insert: {
          actor_label?: string | null
          actor_person_id?: string | null
          changed_at?: string
          context?: Json
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          record_id?: string | null
          table_name: string
        }
        Update: {
          actor_label?: string | null
          actor_person_id?: string | null
          changed_at?: string
          context?: Json
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          record_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_person_id_fkey"
            columns: ["actor_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_actor_person_id_fkey"
            columns: ["actor_person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_effects: {
        Row: {
          attempt: number
          claimed_at: string
          detail: Json | null
          done_at: string | null
          id: string
          key: string
          kind: string
          provider_ref: string | null
          routine_id: string
          run_id: string | null
          status: string
          summary: string | null
        }
        Insert: {
          attempt?: number
          claimed_at?: string
          detail?: Json | null
          done_at?: string | null
          id?: string
          key: string
          kind: string
          provider_ref?: string | null
          routine_id: string
          run_id?: string | null
          status: string
          summary?: string | null
        }
        Update: {
          attempt?: number
          claimed_at?: string
          detail?: Json | null
          done_at?: string | null
          id?: string
          key?: string
          kind?: string
          provider_ref?: string | null
          routine_id?: string
          run_id?: string | null
          status?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_effects_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "routine_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      board_columns: {
        Row: {
          board_id: string
          created_at: string
          id: string
          is_done: boolean
          is_not_doing: boolean
          name: string
          position: number
          updated_at: string
          wip_limit: number | null
        }
        Insert: {
          board_id: string
          created_at?: string
          id?: string
          is_done?: boolean
          is_not_doing?: boolean
          name: string
          position?: number
          updated_at?: string
          wip_limit?: number | null
        }
        Update: {
          board_id?: string
          created_at?: string
          id?: string
          is_done?: boolean
          is_not_doing?: boolean
          name?: string
          position?: number
          updated_at?: string
          wip_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "board_columns_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      board_members: {
        Row: {
          board_id: string
          created_at: string
          id: string
          person_id: string
          role: string
        }
        Insert: {
          board_id: string
          created_at?: string
          id?: string
          person_id: string
          role?: string
        }
        Update: {
          board_id?: string
          created_at?: string
          id?: string
          person_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_members_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      boards: {
        Row: {
          ai_program_id: string | null
          archived_at: string | null
          archived_by: string | null
          client_company_id: string | null
          created_at: string
          description: string | null
          id: string
          metadata: Json
          name: string
          owner_id: string | null
          slug: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          ai_program_id?: string | null
          archived_at?: string | null
          archived_by?: string | null
          client_company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          name: string
          owner_id?: string | null
          slug: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          ai_program_id?: string | null
          archived_at?: string | null
          archived_by?: string | null
          client_company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          name?: string
          owner_id?: string | null
          slug?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "boards_ai_program_id_fkey"
            columns: ["ai_program_id"]
            isOneToOne: false
            referencedRelation: "ai_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_client_company_id_fkey"
            columns: ["client_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      book_chapters: {
        Row: {
          body_md: string
          book_id: string
          created_at: string
          id: string
          part: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          body_md: string
          book_id: string
          created_at?: string
          id?: string
          part?: string | null
          sort_order: number
          title: string
          updated_at?: string
        }
        Update: {
          body_md?: string
          book_id?: string
          created_at?: string
          id?: string
          part?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          amount_cents: number
          amount_usd_cents: number | null
          created_at: string
          currency: string
          end_date: string | null
          id: string
          kind: string
          metadata: Json
          order_id: string | null
          party_size: number | null
          person_id: string
          product_id: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          amount_usd_cents?: number | null
          created_at?: string
          currency?: string
          end_date?: string | null
          id?: string
          kind?: string
          metadata?: Json
          order_id?: string | null
          party_size?: number | null
          person_id: string
          product_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          amount_usd_cents?: number | null
          created_at?: string
          currency?: string
          end_date?: string | null
          id?: string
          kind?: string
          metadata?: Json
          order_id?: string | null
          party_size?: number | null
          person_id?: string
          product_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          audience: string | null
          brand_id: string
          created_at: string
          description: string | null
          format: string
          id: string
          reader_path: string | null
          slug: string
          sort_order: number
          status: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string | null
          brand_id: string
          created_at?: string
          description?: string | null
          format?: string
          id?: string
          reader_path?: string | null
          slug: string
          sort_order?: number
          status?: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string | null
          brand_id?: string
          created_at?: string
          description?: string | null
          format?: string
          id?: string
          reader_path?: string | null
          slug?: string
          sort_order?: number
          status?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "books_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_profiles: {
        Row: {
          audience: string | null
          author_md: string | null
          auto_publish: boolean
          blog_styles_md: string | null
          brand_id: string
          channels_md: string | null
          content_rules_md: string | null
          created_at: string
          editing_lens_md: string | null
          image_style_md: string | null
          offer: string | null
          positioning: string | null
          preferred_blog_types: string[]
          preferred_image_styles: string[]
          preferred_social_styles: string[]
          primary_cta: string | null
          process_md: string | null
          rules_md: string | null
          seo_lens_md: string | null
          updated_at: string
          updated_by: string | null
          voice_md: string | null
        }
        Insert: {
          audience?: string | null
          author_md?: string | null
          auto_publish?: boolean
          blog_styles_md?: string | null
          brand_id: string
          channels_md?: string | null
          content_rules_md?: string | null
          created_at?: string
          editing_lens_md?: string | null
          image_style_md?: string | null
          offer?: string | null
          positioning?: string | null
          preferred_blog_types?: string[]
          preferred_image_styles?: string[]
          preferred_social_styles?: string[]
          primary_cta?: string | null
          process_md?: string | null
          rules_md?: string | null
          seo_lens_md?: string | null
          updated_at?: string
          updated_by?: string | null
          voice_md?: string | null
        }
        Update: {
          audience?: string | null
          author_md?: string | null
          auto_publish?: boolean
          blog_styles_md?: string | null
          brand_id?: string
          channels_md?: string | null
          content_rules_md?: string | null
          created_at?: string
          editing_lens_md?: string | null
          image_style_md?: string | null
          offer?: string | null
          positioning?: string | null
          preferred_blog_types?: string[]
          preferred_image_styles?: string[]
          preferred_social_styles?: string[]
          primary_cta?: string | null
          process_md?: string | null
          rules_md?: string | null
          seo_lens_md?: string | null
          updated_at?: string
          updated_by?: string | null
          voice_md?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_profiles_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          primary_domain: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          primary_domain?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          primary_domain?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      call_scorecards: {
        Row: {
          call_transcript_id: string
          coaching_md: string | null
          created_at: string
          id: string
          question_count: number | null
          score_next_step: number | null
          score_objection_surfaced: number | null
          score_pain_quantified: number | null
          score_product_fit: number | null
          score_talk_ratio: number | null
          scored_at: string
          scored_by: string
          talk_ratio: number | null
          updated_at: string
        }
        Insert: {
          call_transcript_id: string
          coaching_md?: string | null
          created_at?: string
          id?: string
          question_count?: number | null
          score_next_step?: number | null
          score_objection_surfaced?: number | null
          score_pain_quantified?: number | null
          score_product_fit?: number | null
          score_talk_ratio?: number | null
          scored_at?: string
          scored_by?: string
          talk_ratio?: number | null
          updated_at?: string
        }
        Update: {
          call_transcript_id?: string
          coaching_md?: string | null
          created_at?: string
          id?: string
          question_count?: number | null
          score_next_step?: number | null
          score_objection_surfaced?: number | null
          score_pain_quantified?: number | null
          score_product_fit?: number | null
          score_talk_ratio?: number | null
          scored_at?: string
          scored_by?: string
          talk_ratio?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_scorecards_call_transcript_id_fkey"
            columns: ["call_transcript_id"]
            isOneToOne: true
            referencedRelation: "call_transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      call_transcripts: {
        Row: {
          call_type: string
          created_at: string
          duration_seconds: number | null
          id: string
          meeting_id: string | null
          minute_token: string | null
          search: unknown
          source: string
          started_at: string | null
          title: string
          transcript: string
          updated_at: string
        }
        Insert: {
          call_type?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          meeting_id?: string | null
          minute_token?: string | null
          search?: unknown
          source?: string
          started_at?: string | null
          title: string
          transcript: string
          updated_at?: string
        }
        Update: {
          call_type?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          meeting_id?: string | null
          minute_token?: string | null
          search?: unknown
          source?: string
          started_at?: string | null
          title?: string
          transcript?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_transcripts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_messages: {
        Row: {
          application_id: string
          approved_at: string | null
          approved_by: string | null
          body_md: string
          claimed_at: string | null
          created_at: string
          drafted_body_md: string
          error: string | null
          id: string
          kind: string
          mode: string
          person_id: string | null
          provider_ref: string | null
          run_tick: string | null
          send_key: string
          sent_at: string | null
          stage_id: string | null
          status: string
          subject: string
          to_email: string
          updated_at: string
          version: string
        }
        Insert: {
          application_id: string
          approved_at?: string | null
          approved_by?: string | null
          body_md: string
          claimed_at?: string | null
          created_at?: string
          drafted_body_md: string
          error?: string | null
          id?: string
          kind: string
          mode?: string
          person_id?: string | null
          provider_ref?: string | null
          run_tick?: string | null
          send_key: string
          sent_at?: string | null
          stage_id?: string | null
          status?: string
          subject: string
          to_email: string
          updated_at?: string
          version: string
        }
        Update: {
          application_id?: string
          approved_at?: string | null
          approved_by?: string | null
          body_md?: string
          claimed_at?: string | null
          created_at?: string
          drafted_body_md?: string
          error?: string | null
          id?: string
          kind?: string
          mode?: string
          person_id?: string | null
          provider_ref?: string | null
          run_tick?: string | null
          send_key?: string
          sent_at?: string | null
          stage_id?: string | null
          status?: string
          subject?: string
          to_email?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_messages_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_messages_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_messages_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_messages_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_messages_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_messages_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "application_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_profile: {
        Row: {
          created_at: string
          current_title: string | null
          do_not_hire: boolean
          english_proficiency: string | null
          headline: string | null
          id: string
          notice_period: string | null
          person_id: string
          pool_status: string | null
          portfolio_url: string | null
          salary_expectation_cents: number | null
          salary_expectation_currency: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_title?: string | null
          do_not_hire?: boolean
          english_proficiency?: string | null
          headline?: string | null
          id?: string
          notice_period?: string | null
          person_id: string
          pool_status?: string | null
          portfolio_url?: string | null
          salary_expectation_cents?: number | null
          salary_expectation_currency?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_title?: string | null
          do_not_hire?: boolean
          english_proficiency?: string | null
          headline?: string | null
          id?: string
          notice_period?: string | null
          person_id?: string
          pool_status?: string | null
          portfolio_url?: string | null
          salary_expectation_cents?: number | null
          salary_expectation_currency?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_profile_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_profile_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_sensitive: {
        Row: {
          ai_salary_expectation: string | null
          created_at: string
          notes: string | null
          person_id: string
          salary_expectation_cents: number | null
          salary_expectation_currency: string | null
          updated_at: string
        }
        Insert: {
          ai_salary_expectation?: string | null
          created_at?: string
          notes?: string | null
          person_id: string
          salary_expectation_cents?: number | null
          salary_expectation_currency?: string | null
          updated_at?: string
        }
        Update: {
          ai_salary_expectation?: string | null
          created_at?: string
          notes?: string | null
          person_id?: string
          salary_expectation_cents?: number | null
          salary_expectation_currency?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_sensitive_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_sensitive_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          availability: string | null
          created_at: string
          currency: string | null
          current_company_id: string | null
          current_title: string | null
          desired_salary_cents: number | null
          headline: string | null
          id: string
          linkedin_url: string | null
          metadata: Json
          notes: string | null
          owner_recruiter_id: string | null
          person_id: string
          pool_status: string
          portfolio_url: string | null
          resume_document_id: string | null
          updated_at: string
        }
        Insert: {
          availability?: string | null
          created_at?: string
          currency?: string | null
          current_company_id?: string | null
          current_title?: string | null
          desired_salary_cents?: number | null
          headline?: string | null
          id?: string
          linkedin_url?: string | null
          metadata?: Json
          notes?: string | null
          owner_recruiter_id?: string | null
          person_id: string
          pool_status?: string
          portfolio_url?: string | null
          resume_document_id?: string | null
          updated_at?: string
        }
        Update: {
          availability?: string | null
          created_at?: string
          currency?: string | null
          current_company_id?: string | null
          current_title?: string | null
          desired_salary_cents?: number | null
          headline?: string | null
          id?: string
          linkedin_url?: string | null
          metadata?: Json
          notes?: string | null
          owner_recruiter_id?: string | null
          person_id?: string
          pool_status?: string
          portfolio_url?: string | null
          resume_document_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidates_current_company_id_fkey"
            columns: ["current_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_owner_recruiter_id_fkey"
            columns: ["owner_recruiter_id"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_owner_recruiter_id_fkey"
            columns: ["owner_recruiter_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_owner_recruiter_id_fkey"
            columns: ["owner_recruiter_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_resume_document_id_fkey"
            columns: ["resume_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      capacity_commitments: {
        Row: {
          archived_at: string | null
          company_id: string | null
          created_at: string
          ends_on: string | null
          hours_per_week: number
          id: string
          note: string | null
          role_id: string
          source: string
          starts_on: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          company_id?: string | null
          created_at?: string
          ends_on?: string | null
          hours_per_week: number
          id?: string
          note?: string | null
          role_id: string
          source?: string
          starts_on: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          company_id?: string | null
          created_at?: string
          ends_on?: string | null
          hours_per_week?: number
          id?: string
          note?: string | null
          role_id?: string
          source?: string
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capacity_commitments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capacity_commitments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "capacity_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      capacity_roles: {
        Row: {
          archived_at: string | null
          created_at: string
          effective_from: string
          hours_per_week: number
          id: string
          name: string
          position_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          effective_from?: string
          hours_per_week: number
          id?: string
          name: string
          position_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          effective_from?: string
          hours_per_week?: number
          id?: string
          name?: string
          position_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capacity_roles_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      client_backlog_items: {
        Row: {
          ai_program_id: string | null
          archived_at: string | null
          archived_by: string | null
          build_desc: string | null
          client_note: string | null
          client_priority: string | null
          client_sort_order: number | null
          company_id: string
          created_at: string
          edge8_priority: string
          group_key: string
          id: string
          needs: string[]
          ref: string | null
          sort_order: number
          source: string
          status: string
          title: string
          today_state: string | null
          token_high: number | null
          token_low: number | null
          updated_at: string
          who: string | null
        }
        Insert: {
          ai_program_id?: string | null
          archived_at?: string | null
          archived_by?: string | null
          build_desc?: string | null
          client_note?: string | null
          client_priority?: string | null
          client_sort_order?: number | null
          company_id: string
          created_at?: string
          edge8_priority?: string
          group_key: string
          id?: string
          needs?: string[]
          ref?: string | null
          sort_order?: number
          source?: string
          status?: string
          title: string
          today_state?: string | null
          token_high?: number | null
          token_low?: number | null
          updated_at?: string
          who?: string | null
        }
        Update: {
          ai_program_id?: string | null
          archived_at?: string | null
          archived_by?: string | null
          build_desc?: string | null
          client_note?: string | null
          client_priority?: string | null
          client_sort_order?: number | null
          company_id?: string
          created_at?: string
          edge8_priority?: string
          group_key?: string
          id?: string
          needs?: string[]
          ref?: string | null
          sort_order?: number
          source?: string
          status?: string
          title?: string
          today_state?: string | null
          token_high?: number | null
          token_low?: number | null
          updated_at?: string
          who?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_backlog_items_ai_program_id_fkey"
            columns: ["ai_program_id"]
            isOneToOne: false
            referencedRelation: "ai_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_backlog_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_roadmap_groups: {
        Row: {
          ai_program_id: string | null
          archived_at: string | null
          archived_by: string | null
          company_id: string
          created_at: string
          id: string
          intro: string | null
          key: string
          sort_order: number
          step_label: string | null
          title: string
          updated_at: string
        }
        Insert: {
          ai_program_id?: string | null
          archived_at?: string | null
          archived_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          intro?: string | null
          key: string
          sort_order?: number
          step_label?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          ai_program_id?: string | null
          archived_at?: string | null
          archived_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          intro?: string | null
          key?: string
          sort_order?: number
          step_label?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_roadmap_groups_ai_program_id_fkey"
            columns: ["ai_program_id"]
            isOneToOne: false
            referencedRelation: "ai_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_roadmap_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_roadmap_overview: {
        Row: {
          ai_program_id: string | null
          body: string
          company_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ai_program_id?: string | null
          body?: string
          company_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ai_program_id?: string | null
          body?: string
          company_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_roadmap_overview_ai_program_id_fkey"
            columns: ["ai_program_id"]
            isOneToOne: false
            referencedRelation: "ai_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_roadmap_overview_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_status_reports: {
        Row: {
          ai_draft: Json | null
          body_html: string | null
          company_id: string
          created_at: string
          edited_at: string | null
          edited_by: string | null
          error: string | null
          facts: Json | null
          id: string
          released_at: string | null
          released_by: string | null
          started_at: string
          step: string
          updated_at: string
          version: string | null
          week: string
        }
        Insert: {
          ai_draft?: Json | null
          body_html?: string | null
          company_id: string
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          error?: string | null
          facts?: Json | null
          id?: string
          released_at?: string | null
          released_by?: string | null
          started_at?: string
          step?: string
          updated_at?: string
          version?: string | null
          week: string
        }
        Update: {
          ai_draft?: Json | null
          body_html?: string | null
          company_id?: string
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          error?: string | null
          facts?: Json | null
          id?: string
          released_at?: string | null
          released_by?: string | null
          started_at?: string
          step?: string
          updated_at?: string
          version?: string | null
          week?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_status_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_status_reports_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_status_reports_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_status_reports_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_status_reports_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_checkins: {
        Row: {
          coach_note_md: string | null
          coaching_profile_id: string
          created_at: string
          id: string
          message_markdown: string | null
          moved_md: string | null
          responded_at: string | null
          sent_at: string
          stuck_md: string | null
          talk_md: string | null
        }
        Insert: {
          coach_note_md?: string | null
          coaching_profile_id: string
          created_at?: string
          id?: string
          message_markdown?: string | null
          moved_md?: string | null
          responded_at?: string | null
          sent_at?: string
          stuck_md?: string | null
          talk_md?: string | null
        }
        Update: {
          coach_note_md?: string | null
          coaching_profile_id?: string
          created_at?: string
          id?: string
          message_markdown?: string | null
          moved_md?: string | null
          responded_at?: string | null
          sent_at?: string
          stuck_md?: string | null
          talk_md?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaching_checkins_coaching_profile_id_fkey"
            columns: ["coaching_profile_id"]
            isOneToOne: false
            referencedRelation: "coaching_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_commitment_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          commitment_id: string
          id: string
          status_after: string | null
          status_before: string | null
          title_after: string | null
          title_before: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          commitment_id: string
          id?: string
          status_after?: string | null
          status_before?: string | null
          title_after?: string | null
          title_before?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          commitment_id?: string
          id?: string
          status_after?: string | null
          status_before?: string | null
          title_after?: string | null
          title_before?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaching_commitment_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_commitment_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_commitment_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_commitment_history_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "coaching_commitments"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_commitments: {
        Row: {
          ask_now_sent_at: string | null
          card_done_at: string | null
          closed_at: string | null
          coaching_profile_id: string
          created_at: string
          created_by: string | null
          due_on: string | null
          id: string
          one_on_one_id: string | null
          owner: string
          plan_md: string | null
          sort_order: number
          status: string
          status_note: string | null
          status_updated_at: string | null
          status_updated_by: string | null
          title: string
          updated_at: string
        }
        Insert: {
          ask_now_sent_at?: string | null
          card_done_at?: string | null
          closed_at?: string | null
          coaching_profile_id: string
          created_at?: string
          created_by?: string | null
          due_on?: string | null
          id?: string
          one_on_one_id?: string | null
          owner?: string
          plan_md?: string | null
          sort_order?: number
          status?: string
          status_note?: string | null
          status_updated_at?: string | null
          status_updated_by?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          ask_now_sent_at?: string | null
          card_done_at?: string | null
          closed_at?: string | null
          coaching_profile_id?: string
          created_at?: string
          created_by?: string | null
          due_on?: string | null
          id?: string
          one_on_one_id?: string | null
          owner?: string
          plan_md?: string | null
          sort_order?: number
          status?: string
          status_note?: string | null
          status_updated_at?: string | null
          status_updated_by?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_commitments_coaching_profile_id_fkey"
            columns: ["coaching_profile_id"]
            isOneToOne: false
            referencedRelation: "coaching_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_commitments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_commitments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_commitments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_commitments_one_on_one_id_fkey"
            columns: ["one_on_one_id"]
            isOneToOne: false
            referencedRelation: "coaching_one_on_ones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_commitments_status_updated_by_fkey"
            columns: ["status_updated_by"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_commitments_status_updated_by_fkey"
            columns: ["status_updated_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_commitments_status_updated_by_fkey"
            columns: ["status_updated_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_context: {
        Row: {
          coach_id: string | null
          created_at: string
          id: string
          kind: string
          markdown: string
          title: string
          updated_at: string
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          id?: string
          kind: string
          markdown: string
          title: string
          updated_at?: string
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          markdown?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_context_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_context_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_context_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_goal_comments: {
        Row: {
          author_team_member_id: string
          body: string
          created_at: string
          goal_id: string
          id: string
        }
        Insert: {
          author_team_member_id: string
          body: string
          created_at?: string
          goal_id: string
          id?: string
        }
        Update: {
          author_team_member_id?: string
          body?: string
          created_at?: string
          goal_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_goal_comments_author_team_member_id_fkey"
            columns: ["author_team_member_id"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_goal_comments_author_team_member_id_fkey"
            columns: ["author_team_member_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_goal_comments_author_team_member_id_fkey"
            columns: ["author_team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_goal_comments_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_member_notes: {
        Row: {
          archived_at: string | null
          body: string
          coaching_profile_id: string
          created_at: string
          id: string
        }
        Insert: {
          archived_at?: string | null
          body: string
          coaching_profile_id: string
          created_at?: string
          id?: string
        }
        Update: {
          archived_at?: string | null
          body?: string
          coaching_profile_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_member_notes_coaching_profile_id_fkey"
            columns: ["coaching_profile_id"]
            isOneToOne: false
            referencedRelation: "coaching_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_noticed: {
        Row: {
          archived_at: string | null
          body: string
          coaching_profile_id: string
          created_at: string
          id: string
          noticed_on: string
          subject: string | null
          value_id: string | null
          written_by: string
        }
        Insert: {
          archived_at?: string | null
          body: string
          coaching_profile_id: string
          created_at?: string
          id?: string
          noticed_on?: string
          subject?: string | null
          value_id?: string | null
          written_by: string
        }
        Update: {
          archived_at?: string | null
          body?: string
          coaching_profile_id?: string
          created_at?: string
          id?: string
          noticed_on?: string
          subject?: string | null
          value_id?: string | null
          written_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_noticed_coaching_profile_id_fkey"
            columns: ["coaching_profile_id"]
            isOneToOne: false
            referencedRelation: "coaching_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_noticed_value_id_fkey"
            columns: ["value_id"]
            isOneToOne: false
            referencedRelation: "core_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_noticed_written_by_fkey"
            columns: ["written_by"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_noticed_written_by_fkey"
            columns: ["written_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_noticed_written_by_fkey"
            columns: ["written_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_ocean_profiles: {
        Row: {
          agreeableness_evidence: string | null
          agreeableness_rating: string | null
          coaching_profile_id: string
          conscientiousness_evidence: string | null
          conscientiousness_rating: string | null
          created_at: string
          extraversion_evidence: string | null
          extraversion_rating: string | null
          guidance_markdown: string | null
          id: string
          neuroticism_evidence: string | null
          neuroticism_rating: string | null
          openness_evidence: string | null
          openness_rating: string | null
          published: boolean
          snapshot_markdown: string | null
          updated_at: string
        }
        Insert: {
          agreeableness_evidence?: string | null
          agreeableness_rating?: string | null
          coaching_profile_id: string
          conscientiousness_evidence?: string | null
          conscientiousness_rating?: string | null
          created_at?: string
          extraversion_evidence?: string | null
          extraversion_rating?: string | null
          guidance_markdown?: string | null
          id?: string
          neuroticism_evidence?: string | null
          neuroticism_rating?: string | null
          openness_evidence?: string | null
          openness_rating?: string | null
          published?: boolean
          snapshot_markdown?: string | null
          updated_at?: string
        }
        Update: {
          agreeableness_evidence?: string | null
          agreeableness_rating?: string | null
          coaching_profile_id?: string
          conscientiousness_evidence?: string | null
          conscientiousness_rating?: string | null
          created_at?: string
          extraversion_evidence?: string | null
          extraversion_rating?: string | null
          guidance_markdown?: string | null
          id?: string
          neuroticism_evidence?: string | null
          neuroticism_rating?: string | null
          openness_evidence?: string | null
          openness_rating?: string | null
          published?: boolean
          snapshot_markdown?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_ocean_profiles_coaching_profile_id_fkey"
            columns: ["coaching_profile_id"]
            isOneToOne: true
            referencedRelation: "coaching_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_one_on_ones: {
        Row: {
          ai_error: string | null
          ai_model: string | null
          archived_at: string | null
          coach_voltage_md: string | null
          coaching_profile_id: string
          created_at: string
          format: string | null
          held_on: string
          held_source: string | null
          id: string
          kind: string
          lark_hold_error: string | null
          lark_hold_id: string | null
          lark_hold_synced_at: string | null
          led_by: string | null
          marked_held_on: string | null
          meeting_id: string | null
          minutes_token: string | null
          mode_coach_pct: number | null
          mode_direct_pct: number | null
          mode_mentor_pct: number | null
          move_reason: string | null
          moved_from: string | null
          prep_generated_at: string | null
          prep_markdown: string | null
          prep_member_edits: Json | null
          prep_shared_markdown: string | null
          shared_published_at: string | null
          shared_summary_markdown: string | null
          skip_reason: string | null
          starts_at: string | null
          status: string
          summary_markdown: string | null
          transcript_sha256: string | null
          transcript_source: string | null
          updated_at: string
        }
        Insert: {
          ai_error?: string | null
          ai_model?: string | null
          archived_at?: string | null
          coach_voltage_md?: string | null
          coaching_profile_id: string
          created_at?: string
          format?: string | null
          held_on: string
          held_source?: string | null
          id?: string
          kind?: string
          lark_hold_error?: string | null
          lark_hold_id?: string | null
          lark_hold_synced_at?: string | null
          led_by?: string | null
          marked_held_on?: string | null
          meeting_id?: string | null
          minutes_token?: string | null
          mode_coach_pct?: number | null
          mode_direct_pct?: number | null
          mode_mentor_pct?: number | null
          move_reason?: string | null
          moved_from?: string | null
          prep_generated_at?: string | null
          prep_markdown?: string | null
          prep_member_edits?: Json | null
          prep_shared_markdown?: string | null
          shared_published_at?: string | null
          shared_summary_markdown?: string | null
          skip_reason?: string | null
          starts_at?: string | null
          status?: string
          summary_markdown?: string | null
          transcript_sha256?: string | null
          transcript_source?: string | null
          updated_at?: string
        }
        Update: {
          ai_error?: string | null
          ai_model?: string | null
          archived_at?: string | null
          coach_voltage_md?: string | null
          coaching_profile_id?: string
          created_at?: string
          format?: string | null
          held_on?: string
          held_source?: string | null
          id?: string
          kind?: string
          lark_hold_error?: string | null
          lark_hold_id?: string | null
          lark_hold_synced_at?: string | null
          led_by?: string | null
          marked_held_on?: string | null
          meeting_id?: string | null
          minutes_token?: string | null
          mode_coach_pct?: number | null
          mode_direct_pct?: number | null
          mode_mentor_pct?: number | null
          move_reason?: string | null
          moved_from?: string | null
          prep_generated_at?: string | null
          prep_markdown?: string | null
          prep_member_edits?: Json | null
          prep_shared_markdown?: string | null
          shared_published_at?: string | null
          shared_summary_markdown?: string | null
          skip_reason?: string | null
          starts_at?: string | null
          status?: string
          summary_markdown?: string | null
          transcript_sha256?: string | null
          transcript_source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_one_on_ones_coaching_profile_id_fkey"
            columns: ["coaching_profile_id"]
            isOneToOne: false
            referencedRelation: "coaching_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_one_on_ones_led_by_fkey"
            columns: ["led_by"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_one_on_ones_led_by_fkey"
            columns: ["led_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_one_on_ones_led_by_fkey"
            columns: ["led_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_one_on_ones_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_priorities: {
        Row: {
          coaching_profile_id: string
          created_at: string
          detail_markdown: string | null
          id: string
          key_result_id: string | null
          link_title: string | null
          link_url: string | null
          objective_id: string | null
          sort_order: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          coaching_profile_id: string
          created_at?: string
          detail_markdown?: string | null
          id?: string
          key_result_id?: string | null
          link_title?: string | null
          link_url?: string | null
          objective_id?: string | null
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          coaching_profile_id?: string
          created_at?: string
          detail_markdown?: string | null
          id?: string
          key_result_id?: string | null
          link_title?: string | null
          link_url?: string | null
          objective_id?: string | null
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_priorities_coaching_profile_id_fkey"
            columns: ["coaching_profile_id"]
            isOneToOne: false
            referencedRelation: "coaching_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_priorities_key_result_id_fkey"
            columns: ["key_result_id"]
            isOneToOne: false
            referencedRelation: "key_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_priorities_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_profiles: {
        Row: {
          active: boolean
          cadence_days: number
          coach_id: string | null
          created_at: string
          how_best_hours_md: string | null
          how_curious_md: string | null
          how_feedback_md: string | null
          how_quiet_md: string | null
          id: string
          okrs_markdown: string | null
          one_on_ones_paused_at: string | null
          preferred_time: string | null
          private_profile_markdown: string | null
          proposed_by: string | null
          proposed_one_on_one_on: string | null
          recap_language: string | null
          retention_root: string | null
          team_member_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          cadence_days?: number
          coach_id?: string | null
          created_at?: string
          how_best_hours_md?: string | null
          how_curious_md?: string | null
          how_feedback_md?: string | null
          how_quiet_md?: string | null
          id?: string
          okrs_markdown?: string | null
          one_on_ones_paused_at?: string | null
          preferred_time?: string | null
          private_profile_markdown?: string | null
          proposed_by?: string | null
          proposed_one_on_one_on?: string | null
          recap_language?: string | null
          retention_root?: string | null
          team_member_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          cadence_days?: number
          coach_id?: string | null
          created_at?: string
          how_best_hours_md?: string | null
          how_curious_md?: string | null
          how_feedback_md?: string | null
          how_quiet_md?: string | null
          id?: string
          okrs_markdown?: string | null
          one_on_ones_paused_at?: string | null
          preferred_time?: string | null
          private_profile_markdown?: string | null
          proposed_by?: string | null
          proposed_one_on_one_on?: string | null
          recap_language?: string | null
          retention_root?: string | null
          team_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_profiles_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: true
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_profiles_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: true
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_profiles_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: true
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_talking_points: {
        Row: {
          addressed_at: string | null
          author_team_member_id: string | null
          body: string
          coaching_profile_id: string
          created_at: string
          id: string
        }
        Insert: {
          addressed_at?: string | null
          author_team_member_id?: string | null
          body: string
          coaching_profile_id: string
          created_at?: string
          id?: string
        }
        Update: {
          addressed_at?: string | null
          author_team_member_id?: string | null
          body?: string
          coaching_profile_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_talking_points_author_team_member_id_fkey"
            columns: ["author_team_member_id"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_talking_points_author_team_member_id_fkey"
            columns: ["author_team_member_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_talking_points_author_team_member_id_fkey"
            columns: ["author_team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_talking_points_coaching_profile_id_fkey"
            columns: ["coaching_profile_id"]
            isOneToOne: false
            referencedRelation: "coaching_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_trends: {
        Row: {
          ai_error: string | null
          ai_model: string | null
          coaching_profile_id: string
          created_at: string
          id: string
          one_on_one_id: string | null
          period: string
          report_markdown: string | null
        }
        Insert: {
          ai_error?: string | null
          ai_model?: string | null
          coaching_profile_id: string
          created_at?: string
          id?: string
          one_on_one_id?: string | null
          period: string
          report_markdown?: string | null
        }
        Update: {
          ai_error?: string | null
          ai_model?: string | null
          coaching_profile_id?: string
          created_at?: string
          id?: string
          one_on_one_id?: string | null
          period?: string
          report_markdown?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coaching_trends_coaching_profile_id_fkey"
            columns: ["coaching_profile_id"]
            isOneToOne: false
            referencedRelation: "coaching_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_trends_one_on_one_id_fkey"
            columns: ["one_on_one_id"]
            isOneToOne: false
            referencedRelation: "coaching_one_on_ones"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          billing_address: string | null
          client_end_date: string | null
          client_start_date: string | null
          client_types: string[]
          country: string | null
          created_at: string
          id: string
          industry: string | null
          industry_normalized: string | null
          is_ai_program: boolean
          lifecycle_stage: string
          metadata: Json
          name: string
          notes: string | null
          owner_id: string | null
          priority: string | null
          size_band: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          billing_address?: string | null
          client_end_date?: string | null
          client_start_date?: string | null
          client_types?: string[]
          country?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          industry_normalized?: string | null
          is_ai_program?: boolean
          lifecycle_stage?: string
          metadata?: Json
          name: string
          notes?: string | null
          owner_id?: string | null
          priority?: string | null
          size_band?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          billing_address?: string | null
          client_end_date?: string | null
          client_start_date?: string | null
          client_types?: string[]
          country?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          industry_normalized?: string | null
          is_ai_program?: boolean
          lifecycle_stage?: string
          metadata?: Json
          name?: string
          notes?: string | null
          owner_id?: string | null
          priority?: string | null
          size_band?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      company_github_orgs: {
        Row: {
          company_id: string
          created_at: string
          id: string
          org_login: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          org_login: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          org_login?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_github_orgs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_information: {
        Row: {
          archived_at: string | null
          body: string
          category: string | null
          created_at: string
          id: string
          slug: string
          source: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          body: string
          category?: string | null
          created_at?: string
          id?: string
          slug: string
          source?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          body?: string
          category?: string | null
          created_at?: string
          id?: string
          slug?: string
          source?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_profile: {
        Row: {
          content: string | null
          created_at: string
          id: string
          label: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          label: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_profile_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_profile_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation_sensitive: {
        Row: {
          amount_cents: number
          approved_by: string | null
          change_reason: string | null
          comp_type: string
          created_at: string
          currency: string
          effective_from: string
          effective_to: string | null
          id: string
          is_current: boolean
          notes: string | null
          pay_period: string
          salary_usd_cents: number | null
          salary_vnd: number | null
          team_member_id: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          approved_by?: string | null
          change_reason?: string | null
          comp_type?: string
          created_at?: string
          currency?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          is_current?: boolean
          notes?: string | null
          pay_period?: string
          salary_usd_cents?: number | null
          salary_vnd?: number | null
          team_member_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          approved_by?: string | null
          change_reason?: string | null
          comp_type?: string
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_current?: boolean
          notes?: string | null
          pay_period?: string
          salary_usd_cents?: number | null
          salary_vnd?: number | null
          team_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compensation_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          decided_at: string | null
          decided_by: string | null
          id: string
          note: string | null
          paid_at: string | null
          period_month: string
          person_id: string
          status: string
          summary: string | null
          total_overtime_hours: number
          total_regular_hours: number
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          note?: string | null
          paid_at?: string | null
          period_month: string
          person_id: string
          status?: string
          summary?: string | null
          total_overtime_hours?: number
          total_regular_hours?: number
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          note?: string | null
          paid_at?: string | null
          period_month?: string
          person_id?: string
          status?: string
          summary?: string | null
          total_overtime_hours?: number
          total_regular_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_payments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_payments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_work_events: {
        Row: {
          actor: string | null
          actor_type: string
          body: string | null
          created_at: string
          id: string
          meta: Json
          request_id: string
          type: string
        }
        Insert: {
          actor?: string | null
          actor_type: string
          body?: string | null
          created_at?: string
          id?: string
          meta?: Json
          request_id: string
          type: string
        }
        Update: {
          actor?: string | null
          actor_type?: string
          body?: string | null
          created_at?: string
          id?: string
          meta?: Json
          request_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_work_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "contractor_work_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_work_requests: {
        Row: {
          accepted_at: string | null
          access_token: string
          actual_hours: number | null
          actual_overtime_hours: number
          billed_amount_cents: number | null
          billed_at: string | null
          billed_invoice_id: string | null
          billed_rate_cents: number | null
          billing_error: string | null
          billing_status: string | null
          brief: string
          client_company_id: string | null
          created_at: string
          created_by: string
          decided_at: string | null
          estimate_submitted_at: string | null
          estimated_hours: number | null
          id: string
          origin: string
          payment_id: string | null
          person_id: string
          plan_text: string | null
          requested_by_person_id: string | null
          status: string
          title: string
          updated_at: string
          work_link: string | null
          work_submitted_at: string | null
          work_summary: string | null
        }
        Insert: {
          accepted_at?: string | null
          access_token: string
          actual_hours?: number | null
          actual_overtime_hours?: number
          billed_amount_cents?: number | null
          billed_at?: string | null
          billed_invoice_id?: string | null
          billed_rate_cents?: number | null
          billing_error?: string | null
          billing_status?: string | null
          brief: string
          client_company_id?: string | null
          created_at?: string
          created_by: string
          decided_at?: string | null
          estimate_submitted_at?: string | null
          estimated_hours?: number | null
          id?: string
          origin?: string
          payment_id?: string | null
          person_id: string
          plan_text?: string | null
          requested_by_person_id?: string | null
          status?: string
          title: string
          updated_at?: string
          work_link?: string | null
          work_submitted_at?: string | null
          work_summary?: string | null
        }
        Update: {
          accepted_at?: string | null
          access_token?: string
          actual_hours?: number | null
          actual_overtime_hours?: number
          billed_amount_cents?: number | null
          billed_at?: string | null
          billed_invoice_id?: string | null
          billed_rate_cents?: number | null
          billing_error?: string | null
          billing_status?: string | null
          brief?: string
          client_company_id?: string | null
          created_at?: string
          created_by?: string
          decided_at?: string | null
          estimate_submitted_at?: string | null
          estimated_hours?: number | null
          id?: string
          origin?: string
          payment_id?: string | null
          person_id?: string
          plan_text?: string | null
          requested_by_person_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          work_link?: string | null
          work_submitted_at?: string | null
          work_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_work_requests_billed_invoice_id_fkey"
            columns: ["billed_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_work_requests_client_company_id_fkey"
            columns: ["client_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_work_requests_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "contractor_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_work_requests_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_work_requests_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_work_requests_requested_by_person_id_fkey"
            columns: ["requested_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_work_requests_requested_by_person_id_fkey"
            columns: ["requested_by_person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      core_values: {
        Row: {
          created_at: string
          description: string
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          sort_order: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ddl_log: {
        Row: {
          application_name: string | null
          at: string
          command_tag: string
          id: number
          migration_version: string
          object_identity: string | null
          object_type: string | null
          session_user_name: string
        }
        Insert: {
          application_name?: string | null
          at?: string
          command_tag: string
          id?: never
          migration_version: string
          object_identity?: string | null
          object_type?: string | null
          session_user_name: string
        }
        Update: {
          application_name?: string | null
          at?: string
          command_tag?: string
          id?: never
          migration_version?: string
          object_identity?: string | null
          object_type?: string | null
          session_user_name?: string
        }
        Relationships: []
      }
      ddl_proof_abort: {
        Row: {
          id: number
          object_identity: string | null
        }
        Insert: {
          id?: never
          object_identity?: string | null
        }
        Update: {
          id?: never
          object_identity?: string | null
        }
        Relationships: []
      }
      deal_stage_log: {
        Row: {
          deal_id: string
          from_stage_id: string | null
          id: string
          kind: string
          moved_at: string
          moved_by: string | null
          note: string | null
          to_stage_id: string | null
        }
        Insert: {
          deal_id: string
          from_stage_id?: string | null
          id?: string
          kind?: string
          moved_at?: string
          moved_by?: string | null
          note?: string | null
          to_stage_id?: string | null
        }
        Update: {
          deal_id?: string
          from_stage_id?: string | null
          id?: string
          kind?: string
          moved_at?: string
          moved_by?: string | null
          note?: string | null
          to_stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_stage_log_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_log_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_log_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          affiliate_id: string | null
          amount_cents: number
          amount_usd_cents: number | null
          archived_at: string | null
          archived_by: string | null
          campaign_id: string | null
          closed_at: string | null
          company_id: string | null
          contract_url: string | null
          created_at: string
          currency: string
          expected_close_date: string | null
          fx_rate: number | null
          fx_rate_fetched_at: string | null
          handoff_decided_at: string | null
          handoff_note: string | null
          handoff_rejected_reason: string | null
          handoff_status: string
          id: string
          lost_reason: string | null
          metadata: Json
          next_step: string | null
          next_step_date: string | null
          owner_id: string | null
          person_id: string | null
          pipeline_id: string
          position: number
          probability: number | null
          proposal_url: string | null
          referrer_company_id: string | null
          referrer_id: string | null
          service_line_id: string | null
          source: string | null
          stage_id: string | null
          stage_move_note: string | null
          stage_moved_by: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          affiliate_id?: string | null
          amount_cents?: number
          amount_usd_cents?: number | null
          archived_at?: string | null
          archived_by?: string | null
          campaign_id?: string | null
          closed_at?: string | null
          company_id?: string | null
          contract_url?: string | null
          created_at?: string
          currency?: string
          expected_close_date?: string | null
          fx_rate?: number | null
          fx_rate_fetched_at?: string | null
          handoff_decided_at?: string | null
          handoff_note?: string | null
          handoff_rejected_reason?: string | null
          handoff_status?: string
          id?: string
          lost_reason?: string | null
          metadata?: Json
          next_step?: string | null
          next_step_date?: string | null
          owner_id?: string | null
          person_id?: string | null
          pipeline_id: string
          position?: number
          probability?: number | null
          proposal_url?: string | null
          referrer_company_id?: string | null
          referrer_id?: string | null
          service_line_id?: string | null
          source?: string | null
          stage_id?: string | null
          stage_move_note?: string | null
          stage_moved_by?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          affiliate_id?: string | null
          amount_cents?: number
          amount_usd_cents?: number | null
          archived_at?: string | null
          archived_by?: string | null
          campaign_id?: string | null
          closed_at?: string | null
          company_id?: string | null
          contract_url?: string | null
          created_at?: string
          currency?: string
          expected_close_date?: string | null
          fx_rate?: number | null
          fx_rate_fetched_at?: string | null
          handoff_decided_at?: string | null
          handoff_note?: string | null
          handoff_rejected_reason?: string | null
          handoff_status?: string
          id?: string
          lost_reason?: string | null
          metadata?: Json
          next_step?: string | null
          next_step_date?: string | null
          owner_id?: string | null
          person_id?: string | null
          pipeline_id?: string
          position?: number
          probability?: number | null
          proposal_url?: string | null
          referrer_company_id?: string | null
          referrer_id?: string | null
          service_line_id?: string | null
          source?: string | null
          stage_id?: string | null
          stage_move_note?: string | null
          stage_moved_by?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_referrer_company_id_fkey"
            columns: ["referrer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_service_line_id_fkey"
            columns: ["service_line_id"]
            isOneToOne: false
            referencedRelation: "service_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          head_team_member_id: string | null
          id: string
          name: string
          parent_department_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          head_team_member_id?: string | null
          id?: string
          name: string
          parent_department_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          head_team_member_id?: string | null
          id?: string
          name?: string
          parent_department_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_head_team_member_fk"
            columns: ["head_team_member_id"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_head_team_member_fk"
            columns: ["head_team_member_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_head_team_member_fk"
            columns: ["head_team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_parent_department_id_fkey"
            columns: ["parent_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          byte_size: number | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          mime_type: string | null
          storage_path: string
          title: string | null
          uploaded_by: string | null
        }
        Insert: {
          byte_size?: number | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          mime_type?: string | null
          storage_path: string
          title?: string | null
          uploaded_by?: string | null
        }
        Update: {
          byte_size?: number | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          mime_type?: string | null
          storage_path?: string
          title?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      email_agent_skills: {
        Row: {
          agent_id: string
          body_md: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          version: number
        }
        Insert: {
          agent_id: string
          body_md: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          version: number
        }
        Update: {
          agent_id?: string
          body_md?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_agent_skills_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "email_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      email_agents: {
        Row: {
          active: boolean
          archived_at: string | null
          audience_id: string
          brand_id: string | null
          cadence_days: number
          created_at: string
          created_by: string | null
          from_email: string | null
          id: string
          max_words: number
          name: string
          reply_to: string | null
          review_mode: string
          sample_size: number
          send_hour: number
          sources: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          audience_id: string
          brand_id?: string | null
          cadence_days?: number
          created_at?: string
          created_by?: string | null
          from_email?: string | null
          id?: string
          max_words?: number
          name: string
          reply_to?: string | null
          review_mode?: string
          sample_size?: number
          send_hour?: number
          sources?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          audience_id?: string
          brand_id?: string | null
          cadence_days?: number
          created_at?: string
          created_by?: string | null
          from_email?: string | null
          id?: string
          max_words?: number
          name?: string
          reply_to?: string | null
          review_mode?: string
          sample_size?: number
          send_hour?: number
          sources?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_agents_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "email_audiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_agents_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      email_audiences: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          rules: Json
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          rules?: Json
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          rules?: Json
          updated_at?: string
        }
        Relationships: []
      }
      email_campaign_recipients: {
        Row: {
          campaign_id: string
          claimed_at: string | null
          created_at: string
          email: string
          error: string | null
          id: string
          person_id: string
          resend_email_id: string | null
          send_after: string | null
          sent_at: string | null
          skip_reason: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          claimed_at?: string | null
          created_at?: string
          email: string
          error?: string | null
          id?: string
          person_id: string
          resend_email_id?: string | null
          send_after?: string | null
          sent_at?: string | null
          skip_reason?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          claimed_at?: string | null
          created_at?: string
          email?: string
          error?: string | null
          id?: string
          person_id?: string
          resend_email_id?: string | null
          send_after?: string | null
          sent_at?: string | null
          skip_reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaign_recipients_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaign_recipients_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          agent_error: string | null
          agent_notes: Json
          agent_started_at: string | null
          agent_step: string | null
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          archived_by: string | null
          audience_id: string | null
          batch_size: number
          blocks: Json
          body_md: string
          brand_id: string | null
          created_at: string
          created_by: string | null
          from_email: string | null
          id: string
          name: string
          preheader: string | null
          reply_to: string | null
          scheduled_at: string | null
          segment: Json
          sent_at: string | null
          series_id: string | null
          status: string
          subject: string
          summary_posted_at: string | null
          updated_at: string
        }
        Insert: {
          agent_error?: string | null
          agent_notes?: Json
          agent_started_at?: string | null
          agent_step?: string | null
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          archived_by?: string | null
          audience_id?: string | null
          batch_size?: number
          blocks?: Json
          body_md?: string
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          from_email?: string | null
          id?: string
          name: string
          preheader?: string | null
          reply_to?: string | null
          scheduled_at?: string | null
          segment?: Json
          sent_at?: string | null
          series_id?: string | null
          status?: string
          subject: string
          summary_posted_at?: string | null
          updated_at?: string
        }
        Update: {
          agent_error?: string | null
          agent_notes?: Json
          agent_started_at?: string | null
          agent_step?: string | null
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          archived_by?: string | null
          audience_id?: string | null
          batch_size?: number
          blocks?: Json
          body_md?: string
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          from_email?: string | null
          id?: string
          name?: string
          preheader?: string | null
          reply_to?: string | null
          scheduled_at?: string | null
          segment?: Json
          sent_at?: string | null
          series_id?: string | null
          status?: string
          subject?: string
          summary_posted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "email_audiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "email_series"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          campaign_id: string | null
          created_at: string
          event_type: string
          id: string
          message_id: string | null
          metadata: Json
          occurred_at: string
          person_id: string | null
          recipient: string
          resend_email_id: string
          subject: string | null
          svix_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          message_id?: string | null
          metadata?: Json
          occurred_at: string
          person_id?: string | null
          recipient: string
          resend_email_id: string
          subject?: string | null
          svix_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          message_id?: string | null
          metadata?: Json
          occurred_at?: string
          person_id?: string | null
          recipient?: string
          resend_email_id?: string
          subject?: string | null
          svix_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_campaign_fk"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          agent_id: string
          approved_at: string | null
          approved_by: string | null
          body_md: string
          claimed_at: string | null
          created_at: string
          edited_at: string | null
          error: string | null
          facts: Json
          hold_reason: string | null
          id: string
          interaction_id: string | null
          person_id: string
          resend_email_id: string | null
          routine_run_id: string | null
          send_after: string | null
          sent_at: string | null
          skill_id: string
          skip_reason: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          approved_at?: string | null
          approved_by?: string | null
          body_md?: string
          claimed_at?: string | null
          created_at?: string
          edited_at?: string | null
          error?: string | null
          facts?: Json
          hold_reason?: string | null
          id?: string
          interaction_id?: string | null
          person_id: string
          resend_email_id?: string | null
          routine_run_id?: string | null
          send_after?: string | null
          sent_at?: string | null
          skill_id: string
          skip_reason?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          approved_at?: string | null
          approved_by?: string | null
          body_md?: string
          claimed_at?: string | null
          created_at?: string
          edited_at?: string | null
          error?: string | null
          facts?: Json
          hold_reason?: string | null
          id?: string
          interaction_id?: string | null
          person_id?: string
          resend_email_id?: string | null
          routine_run_id?: string | null
          send_after?: string | null
          sent_at?: string | null
          skill_id?: string
          skip_reason?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "email_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_routine_run_id_fkey"
            columns: ["routine_run_id"]
            isOneToOne: false
            referencedRelation: "routine_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "email_agent_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      email_series: {
        Row: {
          active: boolean
          archived_at: string | null
          audience_id: string
          batch_size: number
          body_template: string
          brand_id: string | null
          created_at: string
          created_by: string | null
          draft_hour: number
          draft_weekday: number
          from_email: string | null
          id: string
          name: string
          reply_to: string | null
          send_hour: number
          send_weekday: number
          subject: string
          time_zone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          audience_id: string
          batch_size?: number
          body_template?: string
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          draft_hour?: number
          draft_weekday?: number
          from_email?: string | null
          id?: string
          name: string
          reply_to?: string | null
          send_hour?: number
          send_weekday?: number
          subject?: string
          time_zone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          audience_id?: string
          batch_size?: number
          body_template?: string
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          draft_hour?: number
          draft_weekday?: number
          from_email?: string | null
          id?: string
          name?: string
          reply_to?: string | null
          send_hour?: number
          send_weekday?: number
          subject?: string
          time_zone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_series_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "email_audiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_series_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      epics: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          board_id: string
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          board_id: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          board_id?: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "epics_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          asset_tag: string
          brand: string | null
          condition: string | null
          cost_usd: number | null
          cost_vnd: number | null
          created_at: string
          current_holder_id: string | null
          id: string
          image_url: string | null
          invoice_ref: string | null
          model: string | null
          model_year: number | null
          name: string
          notes: string | null
          processor: string | null
          purchase_date: string | null
          ram: string | null
          screen_size: number | null
          serial_number: string | null
          status: string
          storage: string | null
          type: string
          updated_at: string
          vendor_id: string | null
          vendor_name_raw: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          asset_tag?: string
          brand?: string | null
          condition?: string | null
          cost_usd?: number | null
          cost_vnd?: number | null
          created_at?: string
          current_holder_id?: string | null
          id?: string
          image_url?: string | null
          invoice_ref?: string | null
          model?: string | null
          model_year?: number | null
          name: string
          notes?: string | null
          processor?: string | null
          purchase_date?: string | null
          ram?: string | null
          screen_size?: number | null
          serial_number?: string | null
          status?: string
          storage?: string | null
          type?: string
          updated_at?: string
          vendor_id?: string | null
          vendor_name_raw?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          asset_tag?: string
          brand?: string | null
          condition?: string | null
          cost_usd?: number | null
          cost_vnd?: number | null
          created_at?: string
          current_holder_id?: string | null
          id?: string
          image_url?: string | null
          invoice_ref?: string | null
          model?: string | null
          model_year?: number | null
          name?: string
          notes?: string | null
          processor?: string | null
          purchase_date?: string | null
          ram?: string | null
          screen_size?: number | null
          serial_number?: string | null
          status?: string
          storage?: string | null
          type?: string
          updated_at?: string
          vendor_id?: string | null
          vendor_name_raw?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_current_holder_id_fkey"
            columns: ["current_holder_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_current_holder_id_fkey"
            columns: ["current_holder_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_assignments: {
        Row: {
          assigned_at: string
          condition_in: string | null
          condition_out: string | null
          created_at: string
          created_by: string | null
          equipment_id: string
          id: string
          note: string | null
          person_id: string
          returned_at: string | null
        }
        Insert: {
          assigned_at?: string
          condition_in?: string | null
          condition_out?: string | null
          created_at?: string
          created_by?: string | null
          equipment_id: string
          id?: string
          note?: string | null
          person_id: string
          returned_at?: string | null
        }
        Update: {
          assigned_at?: string
          condition_in?: string | null
          condition_out?: string | null
          created_at?: string
          created_by?: string | null
          equipment_id?: string
          id?: string
          note?: string | null
          person_id?: string
          returned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_assignments_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          needed_by: string | null
          person_id: string
          reason: string | null
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          needed_by?: string | null
          person_id: string
          reason?: string | null
          status?: string
          type: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          needed_by?: string | null
          person_id?: string
          reason?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_requests_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_requests_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      event_agenda_blocks: {
        Row: {
          body: string | null
          created_at: string
          day_date: string | null
          day_index: number
          day_label: string | null
          event_id: string
          guest_visible: boolean
          id: string
          period: string | null
          room: string | null
          sort_order: number
          time_label: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          day_date?: string | null
          day_index?: number
          day_label?: string | null
          event_id: string
          guest_visible?: boolean
          id?: string
          period?: string | null
          room?: string | null
          sort_order?: number
          time_label?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          day_date?: string | null
          day_index?: number
          day_label?: string | null
          event_id?: string
          guest_visible?: boolean
          id?: string
          period?: string | null
          room?: string | null
          sort_order?: number
          time_label?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_agenda_blocks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_agenda_staff: {
        Row: {
          block_id: string
          created_at: string
          id: string
          note: string | null
          person_id: string
          role: string
        }
        Insert: {
          block_id: string
          created_at?: string
          id?: string
          note?: string | null
          person_id: string
          role?: string
        }
        Update: {
          block_id?: string
          created_at?: string
          id?: string
          note?: string | null
          person_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_agenda_staff_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "event_agenda_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_agenda_staff_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_agenda_staff_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      event_deliveries: {
        Row: {
          delivered_at: string
          duration_ms: number | null
          error: string | null
          event_id: string
          event_name: string
          id: string
          ok: boolean
          subscriber: string
        }
        Insert: {
          delivered_at?: string
          duration_ms?: number | null
          error?: string | null
          event_id: string
          event_name: string
          id?: string
          ok: boolean
          subscriber: string
        }
        Update: {
          delivered_at?: string
          duration_ms?: number | null
          error?: string | null
          event_id?: string
          event_name?: string
          id?: string
          ok?: boolean
          subscriber?: string
        }
        Relationships: []
      }
      event_outbox: {
        Row: {
          attempts: number
          claimed_at: string | null
          created_at: string
          dedupe_key: string
          event_name: string
          id: string
          last_error: string | null
          payload: Json
          published_at: string | null
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          dedupe_key: string
          event_name: string
          id?: string
          last_error?: string | null
          payload: Json
          published_at?: string | null
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          dedupe_key?: string
          event_name?: string
          id?: string
          last_error?: string | null
          payload?: Json
          published_at?: string | null
        }
        Relationships: []
      }
      event_pnl_lines: {
        Row: {
          actual_cents: number | null
          actual_currency: string | null
          actual_usd_cents: number | null
          attendees: number | null
          classification: string
          created_at: string
          description: string | null
          estimated_cents: number | null
          estimated_currency: string | null
          estimated_usd_cents: number | null
          event_id: string
          id: string
          note: string | null
          payment_status: string
          person_id: string | null
          side: string
          sort_order: number
          staff_days: number | null
          updated_at: string
        }
        Insert: {
          actual_cents?: number | null
          actual_currency?: string | null
          actual_usd_cents?: number | null
          attendees?: number | null
          classification: string
          created_at?: string
          description?: string | null
          estimated_cents?: number | null
          estimated_currency?: string | null
          estimated_usd_cents?: number | null
          event_id: string
          id?: string
          note?: string | null
          payment_status?: string
          person_id?: string | null
          side: string
          sort_order?: number
          staff_days?: number | null
          updated_at?: string
        }
        Update: {
          actual_cents?: number | null
          actual_currency?: string | null
          actual_usd_cents?: number | null
          attendees?: number | null
          classification?: string
          created_at?: string
          description?: string | null
          estimated_cents?: number | null
          estimated_currency?: string | null
          estimated_usd_cents?: number | null
          event_id?: string
          id?: string
          note?: string | null
          payment_status?: string
          person_id?: string | null
          side?: string
          sort_order?: number
          staff_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_pnl_lines_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_pnl_lines_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_pnl_lines_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          attendee_email: string | null
          attendee_name: string | null
          cancelled_at: string | null
          checked_in_at: string | null
          confirmation_sent_at: string | null
          created_at: string
          event_id: string | null
          guest_count: number
          id: string
          notes: string | null
          order_id: string | null
          person_id: string
          product_id: string | null
          status: string
          ticket_code: string | null
          waitlist_position: number | null
        }
        Insert: {
          attendee_email?: string | null
          attendee_name?: string | null
          cancelled_at?: string | null
          checked_in_at?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          event_id?: string | null
          guest_count?: number
          id?: string
          notes?: string | null
          order_id?: string | null
          person_id: string
          product_id?: string | null
          status?: string
          ticket_code?: string | null
          waitlist_position?: number | null
        }
        Update: {
          attendee_email?: string | null
          attendee_name?: string | null
          cancelled_at?: string | null
          checked_in_at?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          event_id?: string | null
          guest_count?: number
          id?: string
          notes?: string | null
          order_id?: string | null
          person_id?: string
          product_id?: string | null
          status?: string
          ticket_code?: string | null
          waitlist_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      event_talks: {
        Row: {
          event_id: string
          talk_id: string
        }
        Insert: {
          event_id: string
          talk_id: string
        }
        Update: {
          event_id?: string
          talk_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_talks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_talks_talk_id_fkey"
            columns: ["talk_id"]
            isOneToOne: false
            referencedRelation: "talks"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          archived_at: string | null
          attendee_count_override: number | null
          blurb: string | null
          capacity: number | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          feedback_survey_id: string | null
          id: string
          landing_path: string | null
          location: string | null
          media: Json
          metadata: Json
          notes: string | null
          owner_person_id: string | null
          registered_count_override: number | null
          slug: string
          starts_at: string | null
          status: string
          timezone: string
          title: string
          type: string
          updated_at: string
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          attendee_count_override?: number | null
          blurb?: string | null
          capacity?: number | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          feedback_survey_id?: string | null
          id?: string
          landing_path?: string | null
          location?: string | null
          media?: Json
          metadata?: Json
          notes?: string | null
          owner_person_id?: string | null
          registered_count_override?: number | null
          slug: string
          starts_at?: string | null
          status?: string
          timezone?: string
          title: string
          type: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          attendee_count_override?: number | null
          blurb?: string | null
          capacity?: number | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          feedback_survey_id?: string | null
          id?: string
          landing_path?: string | null
          location?: string | null
          media?: Json
          metadata?: Json
          notes?: string | null
          owner_person_id?: string | null
          registered_count_override?: number | null
          slug?: string
          starts_at?: string | null
          status?: string
          timezone?: string
          title?: string
          type?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_feedback_survey_id_fkey"
            columns: ["feedback_survey_id"]
            isOneToOne: false
            referencedRelation: "survey_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_feedback_survey_id_fkey"
            columns: ["feedback_survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_cents: number
          category: string | null
          company_id: string | null
          created_at: string
          currency: string
          description: string | null
          external_id: string | null
          id: string
          incurred_on: string | null
          lines: Json
          metadata: Json
          paid: boolean
          source: string
          synced_at: string | null
          txn_type: string | null
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          amount_cents: number
          category?: string | null
          company_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          external_id?: string | null
          id?: string
          incurred_on?: string | null
          lines?: Json
          metadata?: Json
          paid?: boolean
          source?: string
          synced_at?: string | null
          txn_type?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          amount_cents?: number
          category?: string | null
          company_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          external_id?: string | null
          id?: string
          incurred_on?: string | null
          lines?: Json
          metadata?: Json
          paid?: boolean
          source?: string
          synced_at?: string | null
          txn_type?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          currency: string
          rate_to_usd: number
          updated_at: string
        }
        Insert: {
          currency: string
          rate_to_usd: number
          updated_at?: string
        }
        Update: {
          currency?: string
          rate_to_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
      gallery_photo_people: {
        Row: {
          created_at: string
          person_id: string
          photo_id: string
          tagged_by: string | null
        }
        Insert: {
          created_at?: string
          person_id: string
          photo_id: string
          tagged_by?: string | null
        }
        Update: {
          created_at?: string
          person_id?: string
          photo_id?: string
          tagged_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_photo_people_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_photo_people_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_photo_people_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "gallery_photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_photo_people_tagged_by_fkey"
            columns: ["tagged_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_photo_people_tagged_by_fkey"
            columns: ["tagged_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_photos: {
        Row: {
          caption: string | null
          category: string | null
          created_at: string
          id: string
          image_url: string
          storage_path: string
          taken_on: string | null
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          category?: string | null
          created_at?: string
          id?: string
          image_url: string
          storage_path: string
          taken_on?: string | null
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string
          storage_path?: string
          taken_on?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      goals: {
        Row: {
          coaching_profile_id: string
          created_at: string
          created_by: string | null
          current_value: number | null
          description_markdown: string | null
          due_date: string | null
          id: string
          key_result_id: string | null
          letter_md: string | null
          letter_sealed_on: string | null
          metric_unit: string | null
          objective_id: string | null
          quarter_label: string | null
          sort_order: number
          start_value: number | null
          status: string
          stretch_markdown: string | null
          target_value: number | null
          title: string
          updated_at: string
        }
        Insert: {
          coaching_profile_id: string
          created_at?: string
          created_by?: string | null
          current_value?: number | null
          description_markdown?: string | null
          due_date?: string | null
          id?: string
          key_result_id?: string | null
          letter_md?: string | null
          letter_sealed_on?: string | null
          metric_unit?: string | null
          objective_id?: string | null
          quarter_label?: string | null
          sort_order?: number
          start_value?: number | null
          status?: string
          stretch_markdown?: string | null
          target_value?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          coaching_profile_id?: string
          created_at?: string
          created_by?: string | null
          current_value?: number | null
          description_markdown?: string | null
          due_date?: string | null
          id?: string
          key_result_id?: string | null
          letter_md?: string | null
          letter_sealed_on?: string | null
          metric_unit?: string | null
          objective_id?: string | null
          quarter_label?: string | null
          sort_order?: number
          start_value?: number | null
          status?: string
          stretch_markdown?: string | null
          target_value?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_goals_coaching_profile_id_fkey"
            columns: ["coaching_profile_id"]
            isOneToOne: false
            referencedRelation: "coaching_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_goals_key_result_id_fkey"
            columns: ["key_result_id"]
            isOneToOne: false
            referencedRelation: "key_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_goals_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      hiring_shortlists: {
        Row: {
          created_at: string
          decided_at: string | null
          id: string
          items: Json
          job_requisition_id: string
          mode: string
          round: number
          status: string
          version: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          id?: string
          items: Json
          job_requisition_id: string
          mode?: string
          round: number
          status?: string
          version: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          id?: string
          items?: Json
          job_requisition_id?: string
          mode?: string
          round?: number
          status?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "hiring_shortlists_job_requisition_id_fkey"
            columns: ["job_requisition_id"]
            isOneToOne: false
            referencedRelation: "job_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          country: string | null
          created_at: string
          date: string
          id: string
          is_company_closure: boolean
          name: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          date: string
          id?: string
          is_company_closure?: boolean
          name: string
        }
        Update: {
          country?: string | null
          created_at?: string
          date?: string
          id?: string
          is_company_closure?: boolean
          name?: string
        }
        Relationships: []
      }
      idea_builds: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          body: string
          created_at: string
          id: string
          idea_id: string
          person_id: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          body: string
          created_at?: string
          id?: string
          idea_id: string
          person_id: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          body?: string
          created_at?: string
          id?: string
          idea_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idea_builds_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_builds_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_builds_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_builds_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_builds_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_reactions: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          id: string
          idea_id: string
          kind: string
          person_id: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          id?: string
          idea_id: string
          kind: string
          person_id: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          id?: string
          idea_id?: string
          kind?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idea_reactions_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_reactions_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_reactions_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_reactions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_reactions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_trend_reports: {
        Row: {
          generated_at: string
          id: string
          model: string | null
          source_count: number
          themes: Json
        }
        Insert: {
          generated_at?: string
          id?: string
          model?: string | null
          source_count?: number
          themes?: Json
        }
        Update: {
          generated_at?: string
          id?: string
          model?: string | null
          source_count?: number
          themes?: Json
        }
        Relationships: []
      }
      ideas: {
        Row: {
          ai_error: string | null
          ai_model: string | null
          ai_plan: string | null
          created_at: string
          data_needed: string | null
          id: string
          kind: string
          office: string | null
          person_id: string
          problem: string | null
          roi: string | null
          source_urls: string[] | null
          status: string
          story: string | null
          takeaway: string | null
          title: string
          updated_at: string
          workflow: string | null
        }
        Insert: {
          ai_error?: string | null
          ai_model?: string | null
          ai_plan?: string | null
          created_at?: string
          data_needed?: string | null
          id?: string
          kind?: string
          office?: string | null
          person_id: string
          problem?: string | null
          roi?: string | null
          source_urls?: string[] | null
          status?: string
          story?: string | null
          takeaway?: string | null
          title: string
          updated_at?: string
          workflow?: string | null
        }
        Update: {
          ai_error?: string | null
          ai_model?: string | null
          ai_plan?: string | null
          created_at?: string
          data_needed?: string | null
          id?: string
          kind?: string
          office?: string | null
          person_id?: string
          problem?: string | null
          roi?: string | null
          source_urls?: string[] | null
          status?: string
          story?: string | null
          takeaway?: string | null
          title?: string
          updated_at?: string
          workflow?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ideas_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiries: {
        Row: {
          affiliate_id: string | null
          campaign_id: string | null
          created_at: string
          deal_id: string | null
          id: string
          message: string | null
          metadata: Json
          person_id: string
          source: string | null
          source_site: string | null
          status: string
          subject: string | null
          type: string
        }
        Insert: {
          affiliate_id?: string | null
          campaign_id?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          message?: string | null
          metadata?: Json
          person_id: string
          source?: string | null
          source_site?: string | null
          status?: string
          subject?: string | null
          type?: string
        }
        Update: {
          affiliate_id?: string | null
          campaign_id?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          message?: string | null
          metadata?: Json
          person_id?: string
          source?: string | null
          source_site?: string | null
          status?: string
          subject?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_triage: {
        Row: {
          company_created: boolean | null
          company_id: string | null
          company_match: string | null
          corrected_fit: number | null
          corrected_verdict: string | null
          created_at: string
          customer_deal_id: string | null
          error: string | null
          filed_at: string | null
          fit: number | null
          gpct_suggested: Json | null
          injection_suspected: boolean
          inquiry_id: string
          mode: string
          not_sales_kind: string | null
          notice: string | null
          notified_at: string | null
          possible_duplicate_ids: string[] | null
          prompt_version: string | null
          qualified_at: string | null
          reasons: string[] | null
          review: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          routed: string | null
          started_at: string
          step: string
          updated_at: string
          verdict: string | null
          would_route: string | null
        }
        Insert: {
          company_created?: boolean | null
          company_id?: string | null
          company_match?: string | null
          corrected_fit?: number | null
          corrected_verdict?: string | null
          created_at?: string
          customer_deal_id?: string | null
          error?: string | null
          filed_at?: string | null
          fit?: number | null
          gpct_suggested?: Json | null
          injection_suspected?: boolean
          inquiry_id: string
          mode: string
          not_sales_kind?: string | null
          notice?: string | null
          notified_at?: string | null
          possible_duplicate_ids?: string[] | null
          prompt_version?: string | null
          qualified_at?: string | null
          reasons?: string[] | null
          review?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          routed?: string | null
          started_at?: string
          step?: string
          updated_at?: string
          verdict?: string | null
          would_route?: string | null
        }
        Update: {
          company_created?: boolean | null
          company_id?: string | null
          company_match?: string | null
          corrected_fit?: number | null
          corrected_verdict?: string | null
          created_at?: string
          customer_deal_id?: string | null
          error?: string | null
          filed_at?: string | null
          fit?: number | null
          gpct_suggested?: Json | null
          injection_suspected?: boolean
          inquiry_id?: string
          mode?: string
          not_sales_kind?: string | null
          notice?: string | null
          notified_at?: string | null
          possible_duplicate_ids?: string[] | null
          prompt_version?: string | null
          qualified_at?: string | null
          reasons?: string[] | null
          review?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          routed?: string | null
          started_at?: string
          step?: string
          updated_at?: string
          verdict?: string | null
          would_route?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_triage_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_triage_company_match_fkey"
            columns: ["company_match"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_triage_customer_deal_id_fkey"
            columns: ["customer_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_triage_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: true
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_triage_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_triage_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sources: {
        Row: {
          active: boolean
          base_url: string | null
          created_at: string
          id: string
          kind: string | null
          name: string
          slug: string
        }
        Insert: {
          active?: boolean
          base_url?: string | null
          created_at?: string
          id?: string
          kind?: string | null
          name: string
          slug: string
        }
        Update: {
          active?: boolean
          base_url?: string | null
          created_at?: string
          id?: string
          kind?: string | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      interactions: {
        Row: {
          body: string | null
          category: string | null
          company_id: string | null
          created_at: string
          id: string
          kind: string
          metadata: Json
          occurred_at: string
          owner_id: string | null
          person_id: string | null
          subject: string | null
          subject_id: string | null
          subject_type: string | null
        }
        Insert: {
          body?: string | null
          category?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          occurred_at?: string
          owner_id?: string | null
          person_id?: string | null
          subject?: string | null
          subject_id?: string | null
          subject_type?: string | null
        }
        Update: {
          body?: string | null
          category?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          occurred_at?: string
          owner_id?: string | null
          person_id?: string | null
          subject?: string | null
          subject_id?: string | null
          subject_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_interviewers: {
        Row: {
          created_at: string
          id: string
          interview_id: string
          interviewer_id: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          interview_id: string
          interviewer_id: string
          role?: string
        }
        Update: {
          created_at?: string
          id?: string
          interview_id?: string
          interviewer_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_interviewers_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_interviewers_interviewer_id_fkey"
            columns: ["interviewer_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_interviewers_interviewer_id_fkey"
            columns: ["interviewer_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_scorecards: {
        Row: {
          created_at: string
          id: string
          interview_id: string
          interviewer_id: string
          overall_score: number | null
          recommendation: string | null
          submitted_at: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          interview_id: string
          interviewer_id: string
          overall_score?: number | null
          recommendation?: string | null
          submitted_at?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          interview_id?: string
          interviewer_id?: string
          overall_score?: number | null
          recommendation?: string | null
          submitted_at?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_scorecards_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_scorecards_interviewer_id_fkey"
            columns: ["interviewer_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_scorecards_interviewer_id_fkey"
            columns: ["interviewer_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          application_id: string
          application_stage_id: string | null
          created_at: string
          duration_minutes: number | null
          id: string
          lark_event_id: string | null
          location: string | null
          loop_step_id: string | null
          meeting_id: string | null
          mode: string
          scheduled_at: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          application_id: string
          application_stage_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          lark_event_id?: string | null
          location?: string | null
          loop_step_id?: string | null
          meeting_id?: string | null
          mode?: string
          scheduled_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          application_stage_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          lark_event_id?: string | null
          location?: string | null
          loop_step_id?: string | null
          meeting_id?: string | null
          mode?: string
          scheduled_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_application_stage_id_fkey"
            columns: ["application_stage_id"]
            isOneToOne: false
            referencedRelation: "application_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_loop_step_id_fkey"
            columns: ["loop_step_id"]
            isOneToOne: false
            referencedRelation: "requisition_loop_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          amount_usd_cents: number | null
          balance_cents: number
          balance_usd_cents: number | null
          company_id: string | null
          created_at: string
          currency: string
          customer_id: string | null
          customer_name: string | null
          deal_id: string | null
          doc_number: string | null
          due_date: string | null
          entity: string
          external_id: string
          fx_rate: number | null
          id: string
          kind: string | null
          lines: Json
          memo: string | null
          payment_link: string | null
          source: string
          status: string
          synced_at: string
          txn_date: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          amount_usd_cents?: number | null
          balance_cents?: number
          balance_usd_cents?: number | null
          company_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_name?: string | null
          deal_id?: string | null
          doc_number?: string | null
          due_date?: string | null
          entity?: string
          external_id: string
          fx_rate?: number | null
          id?: string
          kind?: string | null
          lines?: Json
          memo?: string | null
          payment_link?: string | null
          source?: string
          status: string
          synced_at?: string
          txn_date: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          amount_usd_cents?: number | null
          balance_cents?: number
          balance_usd_cents?: number | null
          company_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_name?: string | null
          deal_id?: string | null
          doc_number?: string | null
          due_date?: string | null
          entity?: string
          external_id?: string
          fx_rate?: number | null
          id?: string
          kind?: string | null
          lines?: Json
          memo?: string | null
          payment_link?: string | null
          source?: string
          status?: string
          synced_at?: string
          txn_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      issues: {
        Row: {
          assignee_person_id: string | null
          created_at: string
          diagnosis: string
          filed_by: string
          id: string
          key_result_id: string | null
          notes_md: string | null
          resolved_at: string | null
          status: string
          title: string
        }
        Insert: {
          assignee_person_id?: string | null
          created_at?: string
          diagnosis?: string
          filed_by: string
          id?: string
          key_result_id?: string | null
          notes_md?: string | null
          resolved_at?: string | null
          status?: string
          title: string
        }
        Update: {
          assignee_person_id?: string | null
          created_at?: string
          diagnosis?: string
          filed_by?: string
          id?: string
          key_result_id?: string | null
          notes_md?: string | null
          resolved_at?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "issues_assignee_person_id_fkey"
            columns: ["assignee_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_assignee_person_id_fkey"
            columns: ["assignee_person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_key_result_id_fkey"
            columns: ["key_result_id"]
            isOneToOne: false
            referencedRelation: "key_results"
            referencedColumns: ["id"]
          },
        ]
      }
      job_requisitions: {
        Row: {
          application_questions: Json
          candidate_ranking: string | null
          chain_error: string | null
          chain_started_at: string | null
          chain_step: string | null
          client_company_id: string | null
          closed_at: string | null
          created_at: string
          currency: string
          department_id: string | null
          description: string | null
          employment_type: string
          full_jd: string | null
          headcount: number
          hiring_manager_id: string | null
          id: string
          is_public: boolean
          location: string | null
          metadata: Json
          opened_at: string | null
          position_id: string | null
          recruiter_id: string | null
          remote_policy: string | null
          requirements: string | null
          responsibilities: string | null
          salary_max_cents: number | null
          salary_min_cents: number | null
          slug: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          application_questions?: Json
          candidate_ranking?: string | null
          chain_error?: string | null
          chain_started_at?: string | null
          chain_step?: string | null
          client_company_id?: string | null
          closed_at?: string | null
          created_at?: string
          currency?: string
          department_id?: string | null
          description?: string | null
          employment_type?: string
          full_jd?: string | null
          headcount?: number
          hiring_manager_id?: string | null
          id?: string
          is_public?: boolean
          location?: string | null
          metadata?: Json
          opened_at?: string | null
          position_id?: string | null
          recruiter_id?: string | null
          remote_policy?: string | null
          requirements?: string | null
          responsibilities?: string | null
          salary_max_cents?: number | null
          salary_min_cents?: number | null
          slug?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          application_questions?: Json
          candidate_ranking?: string | null
          chain_error?: string | null
          chain_started_at?: string | null
          chain_step?: string | null
          client_company_id?: string | null
          closed_at?: string | null
          created_at?: string
          currency?: string
          department_id?: string | null
          description?: string | null
          employment_type?: string
          full_jd?: string | null
          headcount?: number
          hiring_manager_id?: string | null
          id?: string
          is_public?: boolean
          location?: string | null
          metadata?: Json
          opened_at?: string | null
          position_id?: string | null
          recruiter_id?: string | null
          remote_policy?: string | null
          requirements?: string | null
          responsibilities?: string | null
          salary_max_cents?: number | null
          salary_min_cents?: number | null
          slug?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_requisitions_client_company_id_fkey"
            columns: ["client_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_requisitions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_requisitions_hiring_manager_id_fkey"
            columns: ["hiring_manager_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_requisitions_hiring_manager_id_fkey"
            columns: ["hiring_manager_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_requisitions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_requisitions_recruiter_id_fkey"
            columns: ["recruiter_id"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_requisitions_recruiter_id_fkey"
            columns: ["recruiter_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_requisitions_recruiter_id_fkey"
            columns: ["recruiter_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      key_results: {
        Row: {
          accountable_person_id: string
          created_at: string
          current_value: number
          delivery_mix: string
          direction: string
          executing_agent: string | null
          id: string
          objective_id: string
          sort_order: number
          source: string
          source_detail: string | null
          status: string
          target_value: number | null
          title: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          accountable_person_id: string
          created_at?: string
          current_value?: number
          delivery_mix?: string
          direction?: string
          executing_agent?: string | null
          id?: string
          objective_id: string
          sort_order?: number
          source?: string
          source_detail?: string | null
          status?: string
          target_value?: number | null
          title: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          accountable_person_id?: string
          created_at?: string
          current_value?: number
          delivery_mix?: string
          direction?: string
          executing_agent?: string | null
          id?: string
          objective_id?: string
          sort_order?: number
          source?: string
          source_detail?: string | null
          status?: string
          target_value?: number | null
          title?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_results_accountable_person_id_fkey"
            columns: ["accountable_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_results_accountable_person_id_fkey"
            columns: ["accountable_person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_results_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      kr_logs: {
        Row: {
          author_agent: string | null
          author_kind: string
          author_person_id: string | null
          created_at: string
          id: string
          key_result_id: string
          note_md: string | null
          value: number | null
          week_start: string
        }
        Insert: {
          author_agent?: string | null
          author_kind: string
          author_person_id?: string | null
          created_at?: string
          id?: string
          key_result_id: string
          note_md?: string | null
          value?: number | null
          week_start: string
        }
        Update: {
          author_agent?: string | null
          author_kind?: string
          author_person_id?: string | null
          created_at?: string
          id?: string
          key_result_id?: string
          note_md?: string | null
          value?: number | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "kr_logs_author_person_id_fkey"
            columns: ["author_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kr_logs_author_person_id_fkey"
            columns: ["author_person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kr_logs_key_result_id_fkey"
            columns: ["key_result_id"]
            isOneToOne: false
            referencedRelation: "key_results"
            referencedColumns: ["id"]
          },
        ]
      }
      kudos: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          body: string
          created_at: string
          from_person_id: string
          given_on: string
          id: string
          to_person_id: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          body: string
          created_at?: string
          from_person_id: string
          given_on?: string
          id?: string
          to_person_id: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          body?: string
          created_at?: string
          from_person_id?: string
          given_on?: string
          id?: string
          to_person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kudos_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kudos_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kudos_from_person_id_fkey"
            columns: ["from_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kudos_from_person_id_fkey"
            columns: ["from_person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kudos_to_person_id_fkey"
            columns: ["to_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kudos_to_person_id_fkey"
            columns: ["to_person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      lark_user_connections: {
        Row: {
          access_token: string
          access_token_expires_at: string
          connected_at: string
          last_error: string | null
          open_id: string
          refresh_token: string
          refresh_token_expires_at: string
          scope: string | null
          team_member_id: string
          updated_at: string
        }
        Insert: {
          access_token: string
          access_token_expires_at: string
          connected_at?: string
          last_error?: string | null
          open_id: string
          refresh_token: string
          refresh_token_expires_at: string
          scope?: string | null
          team_member_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          access_token_expires_at?: string
          connected_at?: string
          last_error?: string | null
          open_id?: string
          refresh_token?: string
          refresh_token_expires_at?: string
          scope?: string | null
          team_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lark_user_connections_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: true
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lark_user_connections_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: true
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lark_user_connections_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: true
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      lead: {
        Row: {
          attempt_count: number
          created_at: string
          disqualified_reason: string | null
          id: string
          owner_id: string | null
          person_id: string
          pinned_at: string | null
          sla_due_at: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          disqualified_reason?: string | null
          id?: string
          owner_id?: string | null
          person_id: string
          pinned_at?: string | null
          sla_due_at?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          disqualified_reason?: string | null
          id?: string
          owner_id?: string | null
          person_id?: string
          pinned_at?: string | null
          sla_due_at?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_adjustments: {
        Row: {
          created_at: string
          created_by: string | null
          delta_days: number
          effective_date: string
          external_key: string | null
          id: string
          kind: string
          leave_type: string
          reason: string | null
          source: string | null
          team_member_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta_days: number
          effective_date: string
          external_key?: string | null
          id?: string
          kind: string
          leave_type: string
          reason?: string | null
          source?: string | null
          team_member_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta_days?: number
          effective_date?: string
          external_key?: string | null
          id?: string
          kind?: string
          leave_type?: string
          reason?: string | null
          source?: string | null
          team_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_adjustments_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_adjustments_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_adjustments_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_policies: {
        Row: {
          accrual_cadence: string
          auto_approve: boolean
          bank_leave_types: string[]
          carry_cap_hours: number | null
          counts_from: string
          created_at: string
          honour_imported_balance: boolean
          hours_per_day: number
          id: string
          min_increment_hours: number
          name: string
          policy_text: string | null
          tiers: Json
          updated_at: string
          year_basis: string
        }
        Insert: {
          accrual_cadence?: string
          auto_approve?: boolean
          bank_leave_types?: string[]
          carry_cap_hours?: number | null
          counts_from?: string
          created_at?: string
          honour_imported_balance?: boolean
          hours_per_day?: number
          id?: string
          min_increment_hours?: number
          name: string
          policy_text?: string | null
          tiers?: Json
          updated_at?: string
          year_basis?: string
        }
        Update: {
          accrual_cadence?: string
          auto_approve?: boolean
          bank_leave_types?: string[]
          carry_cap_hours?: number | null
          counts_from?: string
          created_at?: string
          honour_imported_balance?: boolean
          hours_per_day?: number
          id?: string
          min_increment_hours?: number
          name?: string
          policy_text?: string | null
          tiers?: Json
          updated_at?: string
          year_basis?: string
        }
        Relationships: []
      }
      legal_entities: {
        Row: {
          active: boolean
          base_currency: string
          country: string | null
          created_at: string
          entity_type: string | null
          id: string
          incorporated_on: string | null
          jurisdiction: string | null
          legal_name: string | null
          legal_representative_person_id: string | null
          name: string
          registered_address: string | null
          registration_number: string | null
          slug: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_currency?: string
          country?: string | null
          created_at?: string
          entity_type?: string | null
          id?: string
          incorporated_on?: string | null
          jurisdiction?: string | null
          legal_name?: string | null
          legal_representative_person_id?: string | null
          name: string
          registered_address?: string | null
          registration_number?: string | null
          slug: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_currency?: string
          country?: string | null
          created_at?: string
          entity_type?: string | null
          id?: string
          incorporated_on?: string | null
          jurisdiction?: string | null
          legal_name?: string | null
          legal_representative_person_id?: string | null
          name?: string
          registered_address?: string | null
          registration_number?: string | null
          slug?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_entities_legal_representative_person_id_fkey"
            columns: ["legal_representative_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_entities_legal_representative_person_id_fkey"
            columns: ["legal_representative_person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      library_documents: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          brand: string
          byte_size: number | null
          category: string
          content_hash: string | null
          description: string
          id: string
          published_at: string
          published_by: string | null
          slug: string
          sort_order: number
          storage_path: string
          tags: string[]
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          brand: string
          byte_size?: number | null
          category: string
          content_hash?: string | null
          description?: string
          id?: string
          published_at?: string
          published_by?: string | null
          slug: string
          sort_order?: number
          storage_path: string
          tags?: string[]
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          brand?: string
          byte_size?: number | null
          category?: string
          content_hash?: string | null
          description?: string
          id?: string
          published_at?: string
          published_by?: string | null
          slug?: string
          sort_order?: number
          storage_path?: string
          tags?: string[]
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_documents_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_documents_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_documents_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_documents_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      lifecycle_transitions: {
        Row: {
          changed_by: string | null
          company_id: string | null
          from_stage: string | null
          from_status: string | null
          id: string
          note: string | null
          occurred_at: string
          person_id: string | null
          reason: string | null
          to_stage: string | null
          to_status: string | null
        }
        Insert: {
          changed_by?: string | null
          company_id?: string | null
          from_stage?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          occurred_at?: string
          person_id?: string | null
          reason?: string | null
          to_stage?: string | null
          to_status?: string | null
        }
        Update: {
          changed_by?: string | null
          company_id?: string | null
          from_stage?: string | null
          from_status?: string | null
          id?: string
          note?: string | null
          occurred_at?: string
          person_id?: string | null
          reason?: string | null
          to_stage?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_transitions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_transitions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_transitions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_transitions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_transitions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_asset_images: {
        Row: {
          created_at: string
          created_by: string | null
          entry_id: string
          id: string
          is_selected: boolean
          model: string | null
          prompt_used: string | null
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_id: string
          id?: string
          is_selected?: boolean
          model?: string | null
          prompt_used?: string | null
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_id?: string
          id?: string
          is_selected?: boolean
          model?: string | null
          prompt_used?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_asset_images_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "marketing_content"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          brand_id: string | null
          created_at: string
          created_by: string | null
          ends_on: string | null
          id: string
          idea: string | null
          name: string
          objective: string | null
          pillar_id: string | null
          seo_geo_md: string | null
          starts_on: string | null
          status: string
          updated_at: string
          utm_campaign: string | null
          writer_error: string | null
          writer_started_at: string | null
          writer_step: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          idea?: string | null
          name: string
          objective?: string | null
          pillar_id?: string | null
          seo_geo_md?: string | null
          starts_on?: string | null
          status?: string
          updated_at?: string
          utm_campaign?: string | null
          writer_error?: string | null
          writer_started_at?: string | null
          writer_step?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          idea?: string | null
          name?: string
          objective?: string | null
          pillar_id?: string | null
          seo_geo_md?: string | null
          starts_on?: string | null
          status?: string
          updated_at?: string
          utm_campaign?: string | null
          writer_error?: string | null
          writer_started_at?: string | null
          writer_step?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_pillar_id_fkey"
            columns: ["pillar_id"]
            isOneToOne: false
            referencedRelation: "marketing_pillars"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_content: {
        Row: {
          ai_search_question: string | null
          asset_url: string | null
          attributes_best_guess: boolean
          blog_style: string | null
          body_html: string | null
          brand_id: string | null
          broadcast_id: string | null
          campaign_id: string | null
          category: string | null
          category_slug: string | null
          channel: string
          copy_md: string | null
          created_at: string
          created_by: string | null
          excerpt: string | null
          id: string
          image_brief_md: string | null
          image_style: string | null
          image_type: string | null
          image_url: string | null
          meta_description: string | null
          notes: string | null
          parent_id: string | null
          pillar: string | null
          pillar_id: string | null
          posted_url: string | null
          primary_keyword: string | null
          publish_date: string | null
          published_at: string | null
          read_time: string | null
          seo_md: string | null
          slug: string | null
          social_style: string | null
          sort_order: number
          status: string
          title: string
          title_tag: string | null
          updated_at: string
        }
        Insert: {
          ai_search_question?: string | null
          asset_url?: string | null
          attributes_best_guess?: boolean
          blog_style?: string | null
          body_html?: string | null
          brand_id?: string | null
          broadcast_id?: string | null
          campaign_id?: string | null
          category?: string | null
          category_slug?: string | null
          channel: string
          copy_md?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          id?: string
          image_brief_md?: string | null
          image_style?: string | null
          image_type?: string | null
          image_url?: string | null
          meta_description?: string | null
          notes?: string | null
          parent_id?: string | null
          pillar?: string | null
          pillar_id?: string | null
          posted_url?: string | null
          primary_keyword?: string | null
          publish_date?: string | null
          published_at?: string | null
          read_time?: string | null
          seo_md?: string | null
          slug?: string | null
          social_style?: string | null
          sort_order?: number
          status?: string
          title: string
          title_tag?: string | null
          updated_at?: string
        }
        Update: {
          ai_search_question?: string | null
          asset_url?: string | null
          attributes_best_guess?: boolean
          blog_style?: string | null
          body_html?: string | null
          brand_id?: string | null
          broadcast_id?: string | null
          campaign_id?: string | null
          category?: string | null
          category_slug?: string | null
          channel?: string
          copy_md?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          id?: string
          image_brief_md?: string | null
          image_style?: string | null
          image_type?: string | null
          image_url?: string | null
          meta_description?: string | null
          notes?: string | null
          parent_id?: string | null
          pillar?: string | null
          pillar_id?: string | null
          posted_url?: string | null
          primary_keyword?: string | null
          publish_date?: string | null
          published_at?: string | null
          read_time?: string | null
          seo_md?: string | null
          slug?: string | null
          social_style?: string | null
          sort_order?: number
          status?: string
          title?: string
          title_tag?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_calendar_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_calendar_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_calendar_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_calendar_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "marketing_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_calendar_pillar_id_fkey"
            columns: ["pillar_id"]
            isOneToOne: false
            referencedRelation: "marketing_pillars"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_pillars: {
        Row: {
          active: boolean
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_pillars_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_recaps: {
        Row: {
          generated_at: string
          id: string
          metrics: Json
          model: string | null
          period_month: string
          readout: string
          suggestions: Json
        }
        Insert: {
          generated_at?: string
          id?: string
          metrics?: Json
          model?: string | null
          period_month: string
          readout: string
          suggestions?: Json
        }
        Update: {
          generated_at?: string
          id?: string
          metrics?: Json
          model?: string | null
          period_month?: string
          readout?: string
          suggestions?: Json
        }
        Relationships: []
      }
      meeting_action_items: {
        Row: {
          assignee_id: string | null
          created_at: string
          detail: string | null
          due_date: string | null
          evidence: string | null
          file_note: string | null
          file_state: string | null
          id: string
          meeting_id: string
          origin: string | null
          owner_name: string | null
          owner_side: string | null
          position: number
          shadow_mark: string | null
          status: string
          task_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          detail?: string | null
          due_date?: string | null
          evidence?: string | null
          file_note?: string | null
          file_state?: string | null
          id?: string
          meeting_id: string
          origin?: string | null
          owner_name?: string | null
          owner_side?: string | null
          position?: number
          shadow_mark?: string | null
          status?: string
          task_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          detail?: string | null
          due_date?: string | null
          evidence?: string | null
          file_note?: string | null
          file_state?: string | null
          id?: string
          meeting_id?: string
          origin?: string | null
          owner_name?: string | null
          owner_side?: string | null
          position?: number
          shadow_mark?: string | null
          status?: string
          task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_action_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_action_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_action_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_action_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_associations: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          meeting_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          meeting_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          meeting_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_links_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_followups: {
        Row: {
          ai_body_md: string | null
          ai_subject: string | null
          approver_person_id: string | null
          body_md: string | null
          commitments: string[]
          contact_ids: string[]
          created_at: string
          error: string | null
          id: string
          meeting_id: string
          mode: string
          send_claimed_at: string | null
          sent_at: string | null
          shadow_verdict: string | null
          skip_reason: string | null
          started_at: string
          step: string
          subject: string | null
          to_person_ids: string[]
          transcript_sha256: string | null
          updated_at: string
          version: string | null
        }
        Insert: {
          ai_body_md?: string | null
          ai_subject?: string | null
          approver_person_id?: string | null
          body_md?: string | null
          commitments?: string[]
          contact_ids?: string[]
          created_at?: string
          error?: string | null
          id?: string
          meeting_id: string
          mode?: string
          send_claimed_at?: string | null
          sent_at?: string | null
          shadow_verdict?: string | null
          skip_reason?: string | null
          started_at?: string
          step?: string
          subject?: string | null
          to_person_ids?: string[]
          transcript_sha256?: string | null
          updated_at?: string
          version?: string | null
        }
        Update: {
          ai_body_md?: string | null
          ai_subject?: string | null
          approver_person_id?: string | null
          body_md?: string | null
          commitments?: string[]
          contact_ids?: string[]
          created_at?: string
          error?: string | null
          id?: string
          meeting_id?: string
          mode?: string
          send_claimed_at?: string | null
          sent_at?: string | null
          shadow_verdict?: string | null
          skip_reason?: string | null
          started_at?: string
          step?: string
          subject?: string | null
          to_person_ids?: string[]
          transcript_sha256?: string | null
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_followups_approver_person_id_fkey"
            columns: ["approver_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_followups_approver_person_id_fkey"
            columns: ["approver_person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_followups_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_participants: {
        Row: {
          attended: boolean
          created_at: string
          display_name: string | null
          external_email: string | null
          id: string
          meeting_id: string
          person_id: string | null
          role: string
        }
        Insert: {
          attended?: boolean
          created_at?: string
          display_name?: string | null
          external_email?: string | null
          id?: string
          meeting_id: string
          person_id?: string | null
          role?: string
        }
        Update: {
          attended?: boolean
          created_at?: string
          display_name?: string | null
          external_email?: string | null
          id?: string
          meeting_id?: string
          person_id?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          ai_error: string | null
          ai_model: string | null
          ai_program_id: string | null
          ai_status: string | null
          archived_at: string | null
          attendees: string[] | null
          company_id: string | null
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          ended_at: string | null
          external_id: string | null
          id: string
          meeting_type: string | null
          metadata: Json
          minutes_url: string | null
          owner_id: string | null
          published_at: string | null
          recording_url: string | null
          source: string
          source_file_name: string | null
          source_file_path: string | null
          started_at: string | null
          summary: string | null
          summary_ciphertext: string | null
          summary_encrypted: boolean
          title: string | null
          transcript_url: string | null
          updated_at: string
        }
        Insert: {
          ai_error?: string | null
          ai_model?: string | null
          ai_program_id?: string | null
          ai_status?: string | null
          archived_at?: string | null
          attendees?: string[] | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          external_id?: string | null
          id?: string
          meeting_type?: string | null
          metadata?: Json
          minutes_url?: string | null
          owner_id?: string | null
          published_at?: string | null
          recording_url?: string | null
          source?: string
          source_file_name?: string | null
          source_file_path?: string | null
          started_at?: string | null
          summary?: string | null
          summary_ciphertext?: string | null
          summary_encrypted?: boolean
          title?: string | null
          transcript_url?: string | null
          updated_at?: string
        }
        Update: {
          ai_error?: string | null
          ai_model?: string | null
          ai_program_id?: string | null
          ai_status?: string | null
          archived_at?: string | null
          attendees?: string[] | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          external_id?: string | null
          id?: string
          meeting_type?: string | null
          metadata?: Json
          minutes_url?: string | null
          owner_id?: string | null
          published_at?: string | null
          recording_url?: string | null
          source?: string
          source_file_name?: string | null
          source_file_path?: string | null
          started_at?: string | null
          summary?: string | null
          summary_ciphertext?: string | null
          summary_encrypted?: boolean
          title?: string | null
          transcript_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_ai_program_id_fkey"
            columns: ["ai_program_id"]
            isOneToOne: false
            referencedRelation: "ai_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          kind: string
          muted: boolean
          person_id: string
          updated_at: string
        }
        Insert: {
          kind: string
          muted?: boolean
          person_id: string
          updated_at?: string
        }
        Update: {
          kind?: string
          muted?: boolean
          person_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_prefs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          attempts: number
          carried_by: string | null
          channel: string
          created_at: string
          dedupe_key: string
          deliver_after: string
          error: string | null
          id: string
          kind: string
          message: Json
          person_id: string | null
          reason: string
          recipient: string
          sent_at: string | null
          status: string
          subject: string
          urgency: string
        }
        Insert: {
          attempts?: number
          carried_by?: string | null
          channel: string
          created_at?: string
          dedupe_key: string
          deliver_after: string
          error?: string | null
          id?: string
          kind: string
          message: Json
          person_id?: string | null
          reason: string
          recipient: string
          sent_at?: string | null
          status?: string
          subject: string
          urgency?: string
        }
        Update: {
          attempts?: number
          carried_by?: string | null
          channel?: string
          created_at?: string
          dedupe_key?: string
          deliver_after?: string
          error?: string | null
          id?: string
          kind?: string
          message?: Json
          person_id?: string | null
          reason?: string
          recipient?: string
          sent_at?: string | null
          status?: string
          subject?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notification_id: string
          person_id: string
          read_at: string
        }
        Insert: {
          notification_id: string
          person_id: string
          read_at?: string
        }
        Update: {
          notification_id?: string
          person_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_reads_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_reads_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          admin_href: string | null
          body: string | null
          created_at: string
          event_key: string
          id: string
          kind: string
          person_id: string
          team_href: string | null
          title: string
        }
        Insert: {
          admin_href?: string | null
          body?: string | null
          created_at?: string
          event_key: string
          id?: string
          kind: string
          person_id: string
          team_href?: string | null
          title: string
        }
        Update: {
          admin_href?: string | null
          body?: string | null
          created_at?: string
          event_key?: string
          id?: string
          kind?: string
          person_id?: string
          team_href?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      objectives: {
        Row: {
          brand: string | null
          business_line: string | null
          created_at: string
          id: string
          level: string
          office: string | null
          owner_agent: string | null
          owner_person_id: string | null
          parent_kr_id: string | null
          quarter: string
          sort_order: number
          status: string
          strategy_id: string | null
          title: string
          updated_at: string
          year: number
        }
        Insert: {
          brand?: string | null
          business_line?: string | null
          created_at?: string
          id?: string
          level: string
          office?: string | null
          owner_agent?: string | null
          owner_person_id?: string | null
          parent_kr_id?: string | null
          quarter: string
          sort_order?: number
          status?: string
          strategy_id?: string | null
          title: string
          updated_at?: string
          year?: number
        }
        Update: {
          brand?: string | null
          business_line?: string | null
          created_at?: string
          id?: string
          level?: string
          office?: string | null
          owner_agent?: string | null
          owner_person_id?: string | null
          parent_kr_id?: string | null
          quarter?: string
          sort_order?: number
          status?: string
          strategy_id?: string | null
          title?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "objectives_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objectives_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objectives_parent_kr_fkey"
            columns: ["parent_kr_id"]
            isOneToOne: false
            referencedRelation: "key_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objectives_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          amount_cents: number
          application_id: string
          approved_by: string | null
          bonus_cents: number | null
          contract_document_id: string | null
          created_at: string
          currency: string
          equity_note: string | null
          expires_at: string | null
          id: string
          notes: string | null
          pay_period: string
          position_id: string | null
          responded_at: string | null
          sent_at: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          application_id: string
          approved_by?: string | null
          bonus_cents?: number | null
          contract_document_id?: string | null
          created_at?: string
          currency?: string
          equity_note?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          pay_period?: string
          position_id?: string | null
          responded_at?: string | null
          sent_at?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          application_id?: string
          approved_by?: string | null
          bonus_cents?: number | null
          contract_document_id?: string | null
          created_at?: string
          currency?: string
          equity_note?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          pay_period?: string
          position_id?: string | null
          responded_at?: string | null
          sent_at?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_contract_document_id_fkey"
            columns: ["contract_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_plans: {
        Row: {
          completed_at: string | null
          created_at: string
          day180_email_sent_at: string | null
          day45_email_sent_at: string | null
          day60_promoted_at: string | null
          day8_response_id: string | null
          day8_survey_sent_at: string | null
          decision: string | null
          decision_at: string | null
          decision_by: string | null
          id: string
          plan_path: string | null
          plan_uploaded_at: string | null
          plan_uploaded_by: string | null
          plan_url: string | null
          stage: string
          team_member_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          day180_email_sent_at?: string | null
          day45_email_sent_at?: string | null
          day60_promoted_at?: string | null
          day8_response_id?: string | null
          day8_survey_sent_at?: string | null
          decision?: string | null
          decision_at?: string | null
          decision_by?: string | null
          id?: string
          plan_path?: string | null
          plan_uploaded_at?: string | null
          plan_uploaded_by?: string | null
          plan_url?: string | null
          stage?: string
          team_member_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          day180_email_sent_at?: string | null
          day45_email_sent_at?: string | null
          day60_promoted_at?: string | null
          day8_response_id?: string | null
          day8_survey_sent_at?: string | null
          decision?: string | null
          decision_at?: string | null
          decision_by?: string | null
          id?: string
          plan_path?: string | null
          plan_uploaded_at?: string | null
          plan_uploaded_by?: string | null
          plan_url?: string | null
          stage?: string
          team_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_plans_decision_by_fkey"
            columns: ["decision_by"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_plans_decision_by_fkey"
            columns: ["decision_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_plans_decision_by_fkey"
            columns: ["decision_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_plans_plan_uploaded_by_fkey"
            columns: ["plan_uploaded_by"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_plans_plan_uploaded_by_fkey"
            columns: ["plan_uploaded_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_plans_plan_uploaded_by_fkey"
            columns: ["plan_uploaded_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_plans_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: true
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_plans_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: true
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_plans_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: true
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_tasks: {
        Row: {
          application_id: string | null
          assignee_id: string | null
          category: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          position: number
          status: string
          team_member_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          assignee_id?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number
          status?: string
          team_member_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          assignee_id?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number
          status?: string
          team_member_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_tasks_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_tasks_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_tasks_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_tasks_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          affiliate_id: string | null
          amount_cents: number
          amount_usd_cents: number | null
          created_at: string
          currency: string
          fx_rate: number | null
          id: string
          metadata: Json
          payment_method: string
          person_id: string
          product_id: string | null
          refunded_cents: number
          seat_hold_expires_at: string | null
          status: string
          stripe_customer_id: string | null
          stripe_fee_cents: number | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          tax_cents: number
          updated_at: string
          vnd_amount: number | null
        }
        Insert: {
          affiliate_id?: string | null
          amount_cents?: number
          amount_usd_cents?: number | null
          created_at?: string
          currency?: string
          fx_rate?: number | null
          id?: string
          metadata?: Json
          payment_method?: string
          person_id: string
          product_id?: string | null
          refunded_cents?: number
          seat_hold_expires_at?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_fee_cents?: number | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          tax_cents?: number
          updated_at?: string
          vnd_amount?: number | null
        }
        Update: {
          affiliate_id?: string | null
          amount_cents?: number
          amount_usd_cents?: number | null
          created_at?: string
          currency?: string
          fx_rate?: number | null
          id?: string
          metadata?: Json
          payment_method?: string
          person_id?: string
          product_id?: string | null
          refunded_cents?: number
          seat_hold_expires_at?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_fee_cents?: number | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          tax_cents?: number
          updated_at?: string
          vnd_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_lines_sensitive: {
        Row: {
          adjustments: Json
          annual_leave_days: number
          bonus_vnd: number
          contract_salary_vnd: number | null
          created_at: string
          days_worked: number | null
          dependents: number
          employee_hi_vnd: number
          employee_si_vnd: number
          employee_ui_vnd: number
          employer_hi_vnd: number
          employer_si_vnd: number
          employer_ui_vnd: number
          family_deduction_vnd: number
          gross_salary_vnd: number | null
          id: string
          insurance_base_vnd: number | null
          internet_allowance_vnd: number
          lunch_allowance_vnd: number
          net_salary_vnd: number | null
          on_probation: boolean
          other_allowance_vnd: number
          other_payable_vnd: number
          other_receivable_vnd: number
          overtime_hours: number
          overtime_vnd: number
          paid_vnd: number | null
          payroll_run_id: string
          phone_allowance_vnd: number
          pit_vnd: number
          position: string | null
          self_deduction_vnd: number
          source_row: number | null
          taxable_income_vnd: number | null
          team_member_id: string
          total_income_vnd: number | null
          unpaid_leave_days: number
          updated_at: string
        }
        Insert: {
          adjustments?: Json
          annual_leave_days?: number
          bonus_vnd?: number
          contract_salary_vnd?: number | null
          created_at?: string
          days_worked?: number | null
          dependents?: number
          employee_hi_vnd?: number
          employee_si_vnd?: number
          employee_ui_vnd?: number
          employer_hi_vnd?: number
          employer_si_vnd?: number
          employer_ui_vnd?: number
          family_deduction_vnd?: number
          gross_salary_vnd?: number | null
          id?: string
          insurance_base_vnd?: number | null
          internet_allowance_vnd?: number
          lunch_allowance_vnd?: number
          net_salary_vnd?: number | null
          on_probation?: boolean
          other_allowance_vnd?: number
          other_payable_vnd?: number
          other_receivable_vnd?: number
          overtime_hours?: number
          overtime_vnd?: number
          paid_vnd?: number | null
          payroll_run_id: string
          phone_allowance_vnd?: number
          pit_vnd?: number
          position?: string | null
          self_deduction_vnd?: number
          source_row?: number | null
          taxable_income_vnd?: number | null
          team_member_id: string
          total_income_vnd?: number | null
          unpaid_leave_days?: number
          updated_at?: string
        }
        Update: {
          adjustments?: Json
          annual_leave_days?: number
          bonus_vnd?: number
          contract_salary_vnd?: number | null
          created_at?: string
          days_worked?: number | null
          dependents?: number
          employee_hi_vnd?: number
          employee_si_vnd?: number
          employee_ui_vnd?: number
          employer_hi_vnd?: number
          employer_si_vnd?: number
          employer_ui_vnd?: number
          family_deduction_vnd?: number
          gross_salary_vnd?: number | null
          id?: string
          insurance_base_vnd?: number | null
          internet_allowance_vnd?: number
          lunch_allowance_vnd?: number
          net_salary_vnd?: number | null
          on_probation?: boolean
          other_allowance_vnd?: number
          other_payable_vnd?: number
          other_receivable_vnd?: number
          overtime_hours?: number
          overtime_vnd?: number
          paid_vnd?: number | null
          payroll_run_id?: string
          phone_allowance_vnd?: number
          pit_vnd?: number
          position?: string | null
          self_deduction_vnd?: number
          source_row?: number | null
          taxable_income_vnd?: number | null
          team_member_id?: string
          total_income_vnd?: number | null
          unpaid_leave_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_lines_sensitive_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs_sensitive"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_lines_sensitive_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_lines_sensitive_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_lines_sensitive_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs_sensitive: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          imported_at: string | null
          imported_by: string | null
          is_estimate: boolean
          legal_entity_id: string
          notes: string | null
          period: string
          source_file: string | null
          status: string
          updated_at: string
          working_days: number | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          is_estimate?: boolean
          legal_entity_id: string
          notes?: string | null
          period: string
          source_file?: string | null
          status?: string
          updated_at?: string
          working_days?: number | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          is_estimate?: boolean
          legal_entity_id?: string
          notes?: string | null
          period?: string
          source_file?: string | null
          status?: string
          updated_at?: string
          working_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_sensitive_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          auth_user_id: string | null
          avatar_url: string | null
          city: string | null
          country: string | null
          created_at: string
          daily_focus_hours: number
          display_name: string | null
          do_not_contact: boolean
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          first_name: string | null
          full_name: string | null
          gender: string | null
          github_login: string | null
          graduated_from: string | null
          id: string
          is_team_member: boolean
          lark_dm_opt_out: boolean
          lark_email: string | null
          last_name: string | null
          linkedin_url: string | null
          marketing_consent: string
          marketing_consent_at: string | null
          marketing_consent_source: string | null
          metadata: Json
          notes: string | null
          owner_id: string | null
          persona: string | null
          phone: string | null
          preferred_name: string | null
          source: string | null
          state_province: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          daily_focus_hours?: number
          display_name?: string | null
          do_not_contact?: boolean
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name?: string | null
          full_name?: string | null
          gender?: string | null
          github_login?: string | null
          graduated_from?: string | null
          id?: string
          is_team_member?: boolean
          lark_dm_opt_out?: boolean
          lark_email?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          marketing_consent?: string
          marketing_consent_at?: string | null
          marketing_consent_source?: string | null
          metadata?: Json
          notes?: string | null
          owner_id?: string | null
          persona?: string | null
          phone?: string | null
          preferred_name?: string | null
          source?: string | null
          state_province?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          daily_focus_hours?: number
          display_name?: string | null
          do_not_contact?: boolean
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name?: string | null
          full_name?: string | null
          gender?: string | null
          github_login?: string | null
          graduated_from?: string | null
          id?: string
          is_team_member?: boolean
          lark_dm_opt_out?: boolean
          lark_email?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          marketing_consent?: string
          marketing_consent_at?: string | null
          marketing_consent_source?: string | null
          metadata?: Json
          notes?: string | null
          owner_id?: string | null
          persona?: string | null
          phone?: string | null
          preferred_name?: string | null
          source?: string | null
          state_province?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      people_sensitive: {
        Row: {
          bank_account_number: string | null
          bank_branch: string | null
          bank_name: string | null
          created_at: string
          current_address: string | null
          date_of_birth: string | null
          id_back_path: string | null
          id_front_path: string | null
          id_selfie_path: string | null
          marital_status: string | null
          national_id_issue_date: string | null
          national_id_issue_place: string | null
          national_id_number: string | null
          native_province: string | null
          notes: string | null
          permanent_address: string | null
          person_id: string
          place_of_birth: string | null
          social_insurance_number: string | null
          tax_code: string | null
          updated_at: string
        }
        Insert: {
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          created_at?: string
          current_address?: string | null
          date_of_birth?: string | null
          id_back_path?: string | null
          id_front_path?: string | null
          id_selfie_path?: string | null
          marital_status?: string | null
          national_id_issue_date?: string | null
          national_id_issue_place?: string | null
          national_id_number?: string | null
          native_province?: string | null
          notes?: string | null
          permanent_address?: string | null
          person_id: string
          place_of_birth?: string | null
          social_insurance_number?: string | null
          tax_code?: string | null
          updated_at?: string
        }
        Update: {
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          created_at?: string
          current_address?: string | null
          date_of_birth?: string | null
          id_back_path?: string | null
          id_front_path?: string | null
          id_selfie_path?: string | null
          marital_status?: string | null
          national_id_issue_date?: string | null
          national_id_issue_place?: string | null
          national_id_number?: string | null
          native_province?: string | null
          notes?: string | null
          permanent_address?: string | null
          person_id?: string
          place_of_birth?: string | null
          social_insurance_number?: string | null
          tax_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_sensitive_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_sensitive_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reviews: {
        Row: {
          access_token: string | null
          achievements: string | null
          acknowledged_at: string | null
          comments: string | null
          created_at: string
          cycle_label: string | null
          decision: string | null
          id: string
          improvements: string | null
          keeper: boolean | null
          link_sent_at: string | null
          metadata: Json
          overall_rating: string | null
          period_end: string | null
          period_start: string | null
          rater_kind: string
          rating_scale: string | null
          ratings: Json
          review_type: string
          reviewer_email: string | null
          reviewer_id: string | null
          reviewer_name: string | null
          source: string
          status: string
          submitted_at: string | null
          summary: string | null
          team_member_id: string
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          achievements?: string | null
          acknowledged_at?: string | null
          comments?: string | null
          created_at?: string
          cycle_label?: string | null
          decision?: string | null
          id?: string
          improvements?: string | null
          keeper?: boolean | null
          link_sent_at?: string | null
          metadata?: Json
          overall_rating?: string | null
          period_end?: string | null
          period_start?: string | null
          rater_kind?: string
          rating_scale?: string | null
          ratings?: Json
          review_type?: string
          reviewer_email?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          source?: string
          status?: string
          submitted_at?: string | null
          summary?: string | null
          team_member_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          achievements?: string | null
          acknowledged_at?: string | null
          comments?: string | null
          created_at?: string
          cycle_label?: string | null
          decision?: string | null
          id?: string
          improvements?: string | null
          keeper?: boolean | null
          link_sent_at?: string | null
          metadata?: Json
          overall_rating?: string | null
          period_end?: string | null
          period_start?: string | null
          rater_kind?: string
          rating_scale?: string | null
          ratings?: Json
          review_type?: string
          reviewer_email?: string | null
          reviewer_id?: string | null
          reviewer_name?: string | null
          source?: string
          status?: string
          submitted_at?: string | null
          summary?: string | null
          team_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reviews_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reviews_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reviews_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      person_companies: {
        Row: {
          company_id: string
          created_at: string
          end_date: string | null
          id: string
          is_primary: boolean
          ownership_pct: number | null
          person_id: string
          role: string
          start_date: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_primary?: boolean
          ownership_pct?: number | null
          person_id: string
          role?: string
          start_date?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_primary?: boolean
          ownership_pct?: number | null
          person_id?: string
          role?: string
          start_date?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_companies_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_companies_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      person_git_emails: {
        Row: {
          created_at: string
          git_email: string
          id: string
          is_primary: boolean
          person_id: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          git_email: string
          id?: string
          is_primary?: boolean
          person_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          git_email?: string
          id?: string
          is_primary?: boolean
          person_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_git_emails_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_git_emails_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      person_qualifications: {
        Row: {
          authority: string | null
          budget: string | null
          captured_by: string | null
          challenge: string | null
          created_at: string
          goal: string | null
          id: string
          person_id: string
          plan: string | null
          timeline: string | null
          updated_at: string
        }
        Insert: {
          authority?: string | null
          budget?: string | null
          captured_by?: string | null
          challenge?: string | null
          created_at?: string
          goal?: string | null
          id?: string
          person_id: string
          plan?: string | null
          timeline?: string | null
          updated_at?: string
        }
        Update: {
          authority?: string | null
          budget?: string | null
          captured_by?: string | null
          challenge?: string | null
          created_at?: string
          goal?: string | null
          id?: string
          person_id?: string
          plan?: string | null
          timeline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_qualifications_captured_by_fkey"
            columns: ["captured_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_qualifications_captured_by_fkey"
            columns: ["captured_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_qualifications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_qualifications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          created_at: string
          default_probability: number | null
          id: string
          is_lost: boolean
          is_won: boolean
          name: string
          pipeline_id: string
          position: number
        }
        Insert: {
          created_at?: string
          default_probability?: number | null
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name: string
          pipeline_id: string
          position?: number
        }
        Update: {
          created_at?: string
          default_probability?: number | null
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name?: string
          pipeline_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      portal_assume_sessions: {
        Row: {
          company_id: string
          ended_at: string | null
          ended_by: string | null
          expires_at: string
          id: string
          person_id: string
          started_at: string
          started_by: string
        }
        Insert: {
          company_id: string
          ended_at?: string | null
          ended_by?: string | null
          expires_at: string
          id?: string
          person_id: string
          started_at?: string
          started_by: string
        }
        Update: {
          company_id?: string
          ended_at?: string | null
          ended_by?: string | null
          expires_at?: string
          id?: string
          person_id?: string
          started_at?: string
          started_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_assume_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_assume_sessions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_assume_sessions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_members: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          invited_at: string
          invited_by: string | null
          person_id: string
          revoked_at: string | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          person_id: string
          revoked_at?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          person_id?: string
          revoked_at?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          active: boolean
          created_at: string
          department_id: string | null
          description: string | null
          employment_type: string
          id: string
          is_people_manager: boolean
          level: string | null
          slug: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          department_id?: string | null
          description?: string | null
          employment_type?: string
          id?: string
          is_people_manager?: boolean
          level?: string | null
          slug?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          department_id?: string | null
          description?: string | null
          employment_type?: string
          id?: string
          is_people_manager?: boolean
          level?: string | null
          slug?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          amount_cents: number
          amount_usd_cents: number | null
          capacity: number | null
          cohort_slug: string | null
          created_at: string
          currency: string
          date_end: string | null
          date_start: string | null
          description: string | null
          event_id: string | null
          id: string
          location: string | null
          payment_method_local_vn: boolean
          service_line_id: string | null
          slug: string
          sort_order: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          subtitle: string | null
          tier: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_cents?: number
          amount_usd_cents?: number | null
          capacity?: number | null
          cohort_slug?: string | null
          created_at?: string
          currency?: string
          date_end?: string | null
          date_start?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          location?: string | null
          payment_method_local_vn?: boolean
          service_line_id?: string | null
          slug: string
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          subtitle?: string | null
          tier?: string | null
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_cents?: number
          amount_usd_cents?: number | null
          capacity?: number | null
          cohort_slug?: string | null
          created_at?: string
          currency?: string
          date_end?: string | null
          date_start?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          location?: string | null
          payment_method_local_vn?: boolean
          service_line_id?: string | null
          slug?: string
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          subtitle?: string | null
          tier?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_service_line_id_fkey"
            columns: ["service_line_id"]
            isOneToOne: false
            referencedRelation: "service_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      program_documents: {
        Row: {
          ai_program_id: string | null
          company_id: string
          created_at: string
          filename: string
          id: string
          size_bytes: number | null
          storage_path: string | null
          uploaded_by: string | null
          url: string | null
        }
        Insert: {
          ai_program_id?: string | null
          company_id: string
          created_at?: string
          filename: string
          id?: string
          size_bytes?: number | null
          storage_path?: string | null
          uploaded_by?: string | null
          url?: string | null
        }
        Update: {
          ai_program_id?: string | null
          company_id?: string
          created_at?: string
          filename?: string
          id?: string
          size_bytes?: number | null
          storage_path?: string | null
          uploaded_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_documents_ai_program_id_fkey"
            columns: ["ai_program_id"]
            isOneToOne: false
            referencedRelation: "ai_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      program_plans: {
        Row: {
          ai_program_id: string
          brief_html: string | null
          created_at: string
          created_by: string | null
          id: string
          method: string
          title: string
          updated_at: string
        }
        Insert: {
          ai_program_id: string
          brief_html?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          method: string
          title: string
          updated_at?: string
        }
        Update: {
          ai_program_id?: string
          brief_html?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_plans_ai_program_id_fkey"
            columns: ["ai_program_id"]
            isOneToOne: false
            referencedRelation: "ai_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_drafts: {
        Row: {
          ai_sections: Json | null
          amount_cents: number | null
          company_id: string
          created_at: string
          crm_applied: Json | null
          crm_patch: Json | null
          currency: string | null
          deal_id: string | null
          error: string | null
          facts: Json | null
          finished_at: string | null
          html: string | null
          id: string
          inputs: Json | null
          line_items: Json | null
          lint: Json | null
          meeting_id: string | null
          mode: string
          published_at: string | null
          published_url: string | null
          requested_by: string | null
          screen: Json | null
          sections: Json | null
          slug: string | null
          started_at: string
          step: string
          updated_at: string
          version: string | null
        }
        Insert: {
          ai_sections?: Json | null
          amount_cents?: number | null
          company_id: string
          created_at?: string
          crm_applied?: Json | null
          crm_patch?: Json | null
          currency?: string | null
          deal_id?: string | null
          error?: string | null
          facts?: Json | null
          finished_at?: string | null
          html?: string | null
          id?: string
          inputs?: Json | null
          line_items?: Json | null
          lint?: Json | null
          meeting_id?: string | null
          mode: string
          published_at?: string | null
          published_url?: string | null
          requested_by?: string | null
          screen?: Json | null
          sections?: Json | null
          slug?: string | null
          started_at?: string
          step?: string
          updated_at?: string
          version?: string | null
        }
        Update: {
          ai_sections?: Json | null
          amount_cents?: number | null
          company_id?: string
          created_at?: string
          crm_applied?: Json | null
          crm_patch?: Json | null
          currency?: string | null
          deal_id?: string | null
          error?: string | null
          facts?: Json | null
          finished_at?: string | null
          html?: string | null
          id?: string
          inputs?: Json | null
          line_items?: Json | null
          lint?: Json | null
          meeting_id?: string | null
          mode?: string
          published_at?: string | null
          published_url?: string | null
          requested_by?: string | null
          screen?: Json | null
          sections?: Json | null
          slug?: string | null
          started_at?: string
          step?: string
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_drafts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_drafts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_drafts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_drafts_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_drafts_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_connection: {
        Row: {
          access_token: string
          access_token_expires_at: string
          connected_by: string
          created_at: string
          environment: string
          id: string
          realm_id: string
          refresh_token: string
          refresh_token_expires_at: string
          updated_at: string
        }
        Insert: {
          access_token: string
          access_token_expires_at: string
          connected_by: string
          created_at?: string
          environment?: string
          id?: string
          realm_id: string
          refresh_token: string
          refresh_token_expires_at: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          access_token_expires_at?: string
          connected_by?: string
          created_at?: string
          environment?: string
          id?: string
          realm_id?: string
          refresh_token?: string
          refresh_token_expires_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reimbursement_claim_events: {
        Row: {
          actor_person_id: string | null
          claim_id: string
          created_at: string
          declined_item_ids: string[]
          from_status: string | null
          id: string
          metadata: Json
          reason: string | null
          to_status: string
        }
        Insert: {
          actor_person_id?: string | null
          claim_id: string
          created_at?: string
          declined_item_ids?: string[]
          from_status?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          to_status: string
        }
        Update: {
          actor_person_id?: string | null
          claim_id?: string
          created_at?: string
          declined_item_ids?: string[]
          from_status?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reimbursement_claim_events_actor_person_id_fkey"
            columns: ["actor_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claim_events_actor_person_id_fkey"
            columns: ["actor_person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claim_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "reimbursement_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      reimbursement_claim_items: {
        Row: {
          ai_flags: string[]
          ai_reading: Json | null
          amount_cents: number
          amount_vnd: number | null
          bought_in_vietnam: boolean
          bought_on: string | null
          category: string
          charged_vnd: number | null
          claim_id: string
          created_at: string
          currency: string
          decline_reason: string | null
          declined_at: string | null
          declined_by: string | null
          description: string | null
          duplicate_of_item_id: string | null
          fx_as_of: string | null
          fx_rate: number | null
          fx_source: string
          id: string
          lost_receipt_note: string | null
          position: number
          rebill: boolean
          rebill_company_id: string | null
          remove_reason: string | null
          removed_at: string | null
          removed_by: string | null
          seller: string | null
          updated_at: string
        }
        Insert: {
          ai_flags?: string[]
          ai_reading?: Json | null
          amount_cents: number
          amount_vnd?: number | null
          bought_in_vietnam: boolean
          bought_on?: string | null
          category: string
          charged_vnd?: number | null
          claim_id: string
          created_at?: string
          currency: string
          decline_reason?: string | null
          declined_at?: string | null
          declined_by?: string | null
          description?: string | null
          duplicate_of_item_id?: string | null
          fx_as_of?: string | null
          fx_rate?: number | null
          fx_source?: string
          id?: string
          lost_receipt_note?: string | null
          position?: number
          rebill?: boolean
          rebill_company_id?: string | null
          remove_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          seller?: string | null
          updated_at?: string
        }
        Update: {
          ai_flags?: string[]
          ai_reading?: Json | null
          amount_cents?: number
          amount_vnd?: number | null
          bought_in_vietnam?: boolean
          bought_on?: string | null
          category?: string
          charged_vnd?: number | null
          claim_id?: string
          created_at?: string
          currency?: string
          decline_reason?: string | null
          declined_at?: string | null
          declined_by?: string | null
          description?: string | null
          duplicate_of_item_id?: string | null
          fx_as_of?: string | null
          fx_rate?: number | null
          fx_source?: string
          id?: string
          lost_receipt_note?: string | null
          position?: number
          rebill?: boolean
          rebill_company_id?: string | null
          remove_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          seller?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reimbursement_claim_items_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "reimbursement_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claim_items_declined_by_fkey"
            columns: ["declined_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claim_items_declined_by_fkey"
            columns: ["declined_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claim_items_duplicate_of_item_id_fkey"
            columns: ["duplicate_of_item_id"]
            isOneToOne: false
            referencedRelation: "reimbursement_claim_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claim_items_rebill_company_id_fkey"
            columns: ["rebill_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claim_items_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claim_items_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      reimbursement_claims: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_total_vnd: number | null
          checked_at: string | null
          checked_by: string | null
          created_at: string
          id: string
          in_run_at: string | null
          metadata: Json
          paid_at: string | null
          payment_id: string | null
          payment_run_id: string | null
          person_id: string
          status: string
          submitted_at: string | null
          team_member_id: string
          title: string
          trip_event_id: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_total_vnd?: number | null
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          in_run_at?: string | null
          metadata?: Json
          paid_at?: string | null
          payment_id?: string | null
          payment_run_id?: string | null
          person_id: string
          status?: string
          submitted_at?: string | null
          team_member_id: string
          title: string
          trip_event_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_total_vnd?: number | null
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          in_run_at?: string | null
          metadata?: Json
          paid_at?: string | null
          payment_id?: string | null
          payment_run_id?: string | null
          person_id?: string
          status?: string
          submitted_at?: string | null
          team_member_id?: string
          title?: string
          trip_event_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reimbursement_claims_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claims_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claims_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claims_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claims_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "reimbursement_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claims_payment_run_id_fkey"
            columns: ["payment_run_id"]
            isOneToOne: false
            referencedRelation: "reimbursement_payment_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claims_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claims_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claims_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claims_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claims_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_claims_trip_event_id_fkey"
            columns: ["trip_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      reimbursement_files: {
        Row: {
          claim_item_id: string | null
          confirmed_at: string | null
          created_at: string
          filename: string
          id: string
          kind: string
          mime_type: string | null
          page_count: number | null
          payment_id: string | null
          replaced_at: string | null
          replaced_by: string | null
          sha256: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          claim_item_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          filename: string
          id?: string
          kind: string
          mime_type?: string | null
          page_count?: number | null
          payment_id?: string | null
          replaced_at?: string | null
          replaced_by?: string | null
          sha256?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          claim_item_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          filename?: string
          id?: string
          kind?: string
          mime_type?: string | null
          page_count?: number | null
          payment_id?: string | null
          replaced_at?: string | null
          replaced_by?: string | null
          sha256?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reimbursement_files_claim_item_id_fkey"
            columns: ["claim_item_id"]
            isOneToOne: false
            referencedRelation: "reimbursement_claim_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_files_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "reimbursement_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_files_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_files_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      reimbursement_fx_rates: {
        Row: {
          currency: string
          entered_by: string | null
          fetched_at: string
          rate_date: string
          rate_vnd: number
          source: string
        }
        Insert: {
          currency: string
          entered_by?: string | null
          fetched_at?: string
          rate_date: string
          rate_vnd: number
          source: string
        }
        Update: {
          currency?: string
          entered_by?: string | null
          fetched_at?: string
          rate_date?: string
          rate_vnd?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "reimbursement_fx_rates_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_fx_rates_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      reimbursement_payment_runs: {
        Row: {
          built_at: string
          claims_count: number
          created_at: string
          cutoff_at: string
          id: string
          notified_at: string | null
          paid_at: string | null
          people_count: number
          run_date: string
          status: string
          total_vnd: number
        }
        Insert: {
          built_at?: string
          claims_count?: number
          created_at?: string
          cutoff_at: string
          id?: string
          notified_at?: string | null
          paid_at?: string | null
          people_count?: number
          run_date: string
          status?: string
          total_vnd?: number
        }
        Update: {
          built_at?: string
          claims_count?: number
          created_at?: string
          cutoff_at?: string
          id?: string
          notified_at?: string | null
          paid_at?: string | null
          people_count?: number
          run_date?: string
          status?: string
          total_vnd?: number
        }
        Relationships: []
      }
      reimbursement_payments: {
        Row: {
          amount_vnd: number
          bank_account_last4: string | null
          bank_name_snapshot: string | null
          bank_receipt_file_id: string | null
          created_at: string
          id: string
          paid_at: string | null
          paid_by: string | null
          paid_vnd: number | null
          person_id: string
          run_id: string
          status: string
        }
        Insert: {
          amount_vnd: number
          bank_account_last4?: string | null
          bank_name_snapshot?: string | null
          bank_receipt_file_id?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          paid_vnd?: number | null
          person_id: string
          run_id: string
          status?: string
        }
        Update: {
          amount_vnd?: number
          bank_account_last4?: string | null
          bank_name_snapshot?: string | null
          bank_receipt_file_id?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          paid_vnd?: number | null
          person_id?: string
          run_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reimbursement_payments_bank_receipt_fkey"
            columns: ["bank_receipt_file_id"]
            isOneToOne: false
            referencedRelation: "reimbursement_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_payments_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_payments_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_payments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_payments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_payments_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "reimbursement_payment_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      renewals: {
        Row: {
          archived_at: string | null
          company_id: string
          created_at: string
          id: string
          note: string | null
          renews_on: string
          status: string
          term_months: number | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          company_id: string
          created_at?: string
          id?: string
          note?: string | null
          renews_on: string
          status?: string
          term_months?: number | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          note?: string | null
          renews_on?: string
          status?: string
          term_months?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      requisition_loop_interviewers: {
        Row: {
          created_at: string
          id: string
          interviewer_id: string
          loop_step_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          interviewer_id: string
          loop_step_id: string
        }
        Update: {
          created_at?: string
          id?: string
          interviewer_id?: string
          loop_step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisition_loop_interviewers_interviewer_id_fkey"
            columns: ["interviewer_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_loop_interviewers_interviewer_id_fkey"
            columns: ["interviewer_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_loop_interviewers_loop_step_id_fkey"
            columns: ["loop_step_id"]
            isOneToOne: false
            referencedRelation: "requisition_loop_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      requisition_loop_steps: {
        Row: {
          created_at: string
          duration_minutes: number | null
          id: string
          job_requisition_id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          job_requisition_id: string
          name: string
          position: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          job_requisition_id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisition_loop_steps_job_requisition_id_fkey"
            columns: ["job_requisition_id"]
            isOneToOne: false
            referencedRelation: "job_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_snapshots: {
        Row: {
          by_stage: Json
          cash_90d_cents: number
          created_at: string
          id: string
          inquiries_30d: number
          open_deals: number
          open_usd_cents: number
          open_weighted_usd_cents: number
          overdue_cents: number
          receivable_cents: number
          taken_on: string
          won_mtd_usd_cents: number
        }
        Insert: {
          by_stage?: Json
          cash_90d_cents?: number
          created_at?: string
          id?: string
          inquiries_30d?: number
          open_deals?: number
          open_usd_cents?: number
          open_weighted_usd_cents?: number
          overdue_cents?: number
          receivable_cents?: number
          taken_on: string
          won_mtd_usd_cents?: number
        }
        Update: {
          by_stage?: Json
          cash_90d_cents?: number
          created_at?: string
          id?: string
          inquiries_30d?: number
          open_deals?: number
          open_usd_cents?: number
          open_weighted_usd_cents?: number
          overdue_cents?: number
          receivable_cents?: number
          taken_on?: string
          won_mtd_usd_cents?: number
        }
        Relationships: []
      }
      revenue_targets: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          metric: string
          note: string | null
          period_kind: string
          period_start: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          metric: string
          note?: string | null
          period_kind?: string
          period_start: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          metric?: string
          note?: string | null
          period_kind?: string
          period_start?: string
          updated_at?: string
        }
        Relationships: []
      }
      routine_config: {
        Row: {
          mode: string
          paused_reason: string | null
          routine_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          mode?: string
          paused_reason?: string | null
          routine_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          mode?: string
          paused_reason?: string | null
          routine_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routine_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_runs: {
        Row: {
          ai_cache_read_tokens: number
          ai_cache_write_tokens: number
          ai_calls: number
          ai_input_tokens: number
          ai_output_tokens: number
          attempt: number
          created_at: string
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          host: string
          id: string
          log: string | null
          mode: string
          result: Json | null
          routine_id: string
          started_at: string
          status: string
          step_deadline_at: string | null
          summary: string | null
          tick_key: string | null
          workflow_run_id: string | null
        }
        Insert: {
          ai_cache_read_tokens?: number
          ai_cache_write_tokens?: number
          ai_calls?: number
          ai_input_tokens?: number
          ai_output_tokens?: number
          attempt?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          host: string
          id?: string
          log?: string | null
          mode?: string
          result?: Json | null
          routine_id: string
          started_at?: string
          status?: string
          step_deadline_at?: string | null
          summary?: string | null
          tick_key?: string | null
          workflow_run_id?: string | null
        }
        Update: {
          ai_cache_read_tokens?: number
          ai_cache_write_tokens?: number
          ai_calls?: number
          ai_input_tokens?: number
          ai_output_tokens?: number
          attempt?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          host?: string
          id?: string
          log?: string | null
          mode?: string
          result?: Json | null
          routine_id?: string
          started_at?: string
          status?: string
          step_deadline_at?: string | null
          summary?: string | null
          tick_key?: string | null
          workflow_run_id?: string | null
        }
        Relationships: []
      }
      scorecard_scores: {
        Row: {
          comment: string | null
          created_at: string
          criterion: string
          id: string
          position: number
          score: number | null
          scorecard_id: string
          weight: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          criterion: string
          id?: string
          position?: number
          score?: number | null
          scorecard_id: string
          weight?: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          criterion?: string
          id?: string
          position?: number
          score?: number | null
          scorecard_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "scorecard_scores_scorecard_id_fkey"
            columns: ["scorecard_id"]
            isOneToOne: false
            referencedRelation: "interview_scorecards"
            referencedColumns: ["id"]
          },
        ]
      }
      service_lines: {
        Row: {
          active: boolean
          business_unit: string
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          active?: boolean
          business_unit: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          active?: boolean
          business_unit?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      sprints: {
        Row: {
          board_id: string
          closed_at: string | null
          created_at: string
          ends_on: string | null
          focus_improvement: string | null
          goal: string | null
          going_well: string | null
          id: string
          locked_at: string | null
          meeting_id: string | null
          meeting_summary: string | null
          name: string
          sort_order: number
          starts_on: string | null
          status: string
          updated_at: string
          week: string | null
        }
        Insert: {
          board_id: string
          closed_at?: string | null
          created_at?: string
          ends_on?: string | null
          focus_improvement?: string | null
          goal?: string | null
          going_well?: string | null
          id?: string
          locked_at?: string | null
          meeting_id?: string | null
          meeting_summary?: string | null
          name: string
          sort_order?: number
          starts_on?: string | null
          status?: string
          updated_at?: string
          week?: string | null
        }
        Update: {
          board_id?: string
          closed_at?: string | null
          created_at?: string
          ends_on?: string | null
          focus_improvement?: string | null
          goal?: string | null
          going_well?: string | null
          id?: string
          locked_at?: string | null
          meeting_id?: string | null
          meeting_summary?: string | null
          name?: string
          sort_order?: number
          starts_on?: string | null
          status?: string
          updated_at?: string
          week?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sprints_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprints_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_assignments: {
        Row: {
          client_manager_person_id: string | null
          client_visible: boolean
          company_id: string
          created_at: string
          end_date: string | null
          id: string
          notes: string | null
          role_title: string | null
          start_date: string | null
          status: string
          team_member_id: string
          updated_at: string
        }
        Insert: {
          client_manager_person_id?: string | null
          client_visible?: boolean
          company_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          role_title?: string | null
          start_date?: string | null
          status?: string
          team_member_id: string
          updated_at?: string
        }
        Update: {
          client_manager_person_id?: string | null
          client_visible?: boolean
          company_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          role_title?: string | null
          start_date?: string | null
          status?: string
          team_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_assignments_client_manager_person_id_fkey"
            columns: ["client_manager_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_assignments_client_manager_person_id_fkey"
            columns: ["client_manager_person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_assignments_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_assignments_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_assignments_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      strategies: {
        Row: {
          body_md: string | null
          created_at: string
          id: string
          title: string
          updated_at: string
          year: number
        }
        Insert: {
          body_md?: string | null
          created_at?: string
          id?: string
          title: string
          updated_at?: string
          year: number
        }
        Update: {
          body_md?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          affiliate_id: string | null
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          id: string
          person_id: string
          product_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          affiliate_id?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          person_id: string
          product_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          affiliate_id?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          person_id?: string
          product_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_answers: {
        Row: {
          created_at: string
          field_id: string
          id: string
          response_id: string
          value: string | null
          value_json: Json | null
        }
        Insert: {
          created_at?: string
          field_id: string
          id?: string
          response_id: string
          value?: string | null
          value_json?: Json | null
        }
        Update: {
          created_at?: string
          field_id?: string
          id?: string
          response_id?: string
          value?: string | null
          value_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "survey_answers_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "survey_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_answers_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "capability_pulse_responses"
            referencedColumns: ["response_id"]
          },
          {
            foreignKeyName: "survey_answers_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "survey_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string
          cohort_slug: string | null
          completed_at: string | null
          due_on: string | null
          id: string
          last_reminded_at: string | null
          person_id: string
          reminder_count: number
          response_id: string | null
          survey_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          cohort_slug?: string | null
          completed_at?: string | null
          due_on?: string | null
          id?: string
          last_reminded_at?: string | null
          person_id: string
          reminder_count?: number
          response_id?: string | null
          survey_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          cohort_slug?: string | null
          completed_at?: string | null
          due_on?: string | null
          id?: string
          last_reminded_at?: string | null
          person_id?: string
          reminder_count?: number
          response_id?: string | null
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_assignments_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "capability_pulse_responses"
            referencedColumns: ["response_id"]
          },
          {
            foreignKeyName: "survey_assignments_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "survey_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_assignments_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "survey_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_assignments_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_fields: {
        Row: {
          config: Json
          created_at: string
          help_text: string | null
          id: string
          label: string
          position: number
          required: boolean
          survey_id: string
          type: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          help_text?: string | null
          id?: string
          label: string
          position?: number
          required?: boolean
          survey_id: string
          type: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          help_text?: string | null
          id?: string
          label?: string
          position?: number
          required?: boolean
          survey_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_fields_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "survey_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_fields_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_responses: {
        Row: {
          cohort_slug: string | null
          created_at: string
          id: string
          metadata: Json
          person_id: string | null
          respondent_email: string | null
          respondent_kind: string | null
          respondent_name: string | null
          submitted_at: string
          survey_id: string
        }
        Insert: {
          cohort_slug?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          person_id?: string | null
          respondent_email?: string | null
          respondent_kind?: string | null
          respondent_name?: string | null
          submitted_at?: string
          survey_id: string
        }
        Update: {
          cohort_slug?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          person_id?: string | null
          respondent_email?: string | null
          respondent_kind?: string | null
          respondent_name?: string | null
          submitted_at?: string
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_responses_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "survey_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      surveys: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          intro_text: string | null
          is_anonymous: boolean
          metadata: Json
          name: string
          purpose: string | null
          slug: string
          status: string
          thank_you_text: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          intro_text?: string | null
          is_anonymous?: boolean
          metadata?: Json
          name: string
          purpose?: string | null
          slug: string
          status?: string
          thank_you_text?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          intro_text?: string | null
          is_anonymous?: boolean
          metadata?: Json
          name?: string
          purpose?: string | null
          slug?: string
          status?: string
          thank_you_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sync_packets: {
        Row: {
          body_md: string
          created_at: string
          created_by: string
          id: string
          week_start: string
        }
        Insert: {
          body_md: string
          created_at?: string
          created_by: string
          id?: string
          week_start: string
        }
        Update: {
          body_md?: string
          created_at?: string
          created_by?: string
          id?: string
          week_start?: string
        }
        Relationships: []
      }
      taggables: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          tag_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "taggables_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          kind: string | null
          label: string
          slug: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          kind?: string | null
          label: string
          slug: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          kind?: string | null
          label?: string
          slug?: string
        }
        Relationships: []
      }
      talks: {
        Row: {
          active: boolean
          created_at: string
          id: string
          slug: string
          sort_order: number
          title: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          slug: string
          sort_order?: number
          title: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          slug?: string
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      task_attachments: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          confirmed_at: string | null
          created_at: string
          filename: string | null
          height: number | null
          id: string
          kind: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string | null
          task_id: string
          title: string | null
          uploaded_by: string | null
          url: string | null
          width: number | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          confirmed_at?: string | null
          created_at?: string
          filename?: string | null
          height?: number | null
          id?: string
          kind: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          task_id: string
          title?: string | null
          uploaded_by?: string | null
          url?: string | null
          width?: number | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          confirmed_at?: string | null
          created_at?: string
          filename?: string | null
          height?: number | null
          id?: string
          kind?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          task_id?: string
          title?: string | null
          uploaded_by?: string | null
          url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_label: string
          author_person_id: string | null
          body: string
          created_at: string
          id: string
          mentions: string[]
          parent_comment_id: string | null
          resolved_at: string | null
          resolved_by_label: string | null
          resolved_by_person_id: string | null
          task_id: string
        }
        Insert: {
          author_label: string
          author_person_id?: string | null
          body: string
          created_at?: string
          id?: string
          mentions?: string[]
          parent_comment_id?: string | null
          resolved_at?: string | null
          resolved_by_label?: string | null
          resolved_by_person_id?: string | null
          task_id: string
        }
        Update: {
          author_label?: string
          author_person_id?: string | null
          body?: string
          created_at?: string
          id?: string
          mentions?: string[]
          parent_comment_id?: string | null
          resolved_at?: string | null
          resolved_by_label?: string | null
          resolved_by_person_id?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_person_id_fkey"
            columns: ["author_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_author_person_id_fkey"
            columns: ["author_person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_resolved_by_person_id_fkey"
            columns: ["resolved_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_resolved_by_person_id_fkey"
            columns: ["resolved_by_person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_stage_log: {
        Row: {
          from_column_id: string | null
          from_sprint_id: string | null
          id: string
          kind: string
          moved_at: string
          moved_by: string | null
          note: string | null
          task_id: string
          to_column_id: string | null
          to_sprint_id: string | null
        }
        Insert: {
          from_column_id?: string | null
          from_sprint_id?: string | null
          id?: string
          kind?: string
          moved_at?: string
          moved_by?: string | null
          note?: string | null
          task_id: string
          to_column_id?: string | null
          to_sprint_id?: string | null
        }
        Update: {
          from_column_id?: string | null
          from_sprint_id?: string | null
          id?: string
          kind?: string
          moved_at?: string
          moved_by?: string | null
          note?: string | null
          task_id?: string
          to_column_id?: string | null
          to_sprint_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_stage_log_from_column_id_fkey"
            columns: ["from_column_id"]
            isOneToOne: false
            referencedRelation: "board_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_stage_log_from_sprint_id_fkey"
            columns: ["from_sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_stage_log_moved_by_fkey"
            columns: ["moved_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_stage_log_moved_by_fkey"
            columns: ["moved_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_stage_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_stage_log_to_column_id_fkey"
            columns: ["to_column_id"]
            isOneToOne: false
            referencedRelation: "board_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_stage_log_to_sprint_id_fkey"
            columns: ["to_sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          assignee_id: string | null
          board_column_id: string | null
          board_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          epic_id: string | null
          human_tokens: number | null
          id: string
          internal: boolean
          metadata: Json
          parent_task_id: string | null
          position: number
          priority: string
          sprint_id: string | null
          status: string
          subject_id: string | null
          subject_type: string | null
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          assignee_id?: string | null
          board_column_id?: string | null
          board_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          epic_id?: string | null
          human_tokens?: number | null
          id?: string
          internal?: boolean
          metadata?: Json
          parent_task_id?: string | null
          position?: number
          priority?: string
          sprint_id?: string | null
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          assignee_id?: string | null
          board_column_id?: string | null
          board_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          epic_id?: string | null
          human_tokens?: number | null
          id?: string
          internal?: boolean
          metadata?: Json
          parent_task_id?: string | null
          position?: number
          priority?: string
          sprint_id?: string | null
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_board_column_id_fkey"
            columns: ["board_column_id"]
            isOneToOne: false
            referencedRelation: "board_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_epic_id_fkey"
            columns: ["epic_id"]
            isOneToOne: false
            referencedRelation: "epics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          career_level: string | null
          career_track: string | null
          contract_start_date: string | null
          created_at: string
          department_id: string | null
          employee_number: string | null
          employment_stage: string | null
          employment_type: string
          end_date: string | null
          id: string
          leave_policy_id: string | null
          manager_id: string | null
          permissions: string[]
          person_id: string
          position_id: string | null
          probation_ends_on: string | null
          start_date: string | null
          status: string
          termination_reason: string | null
          updated_at: string
          work_location: string | null
          work_schedule: string | null
        }
        Insert: {
          career_level?: string | null
          career_track?: string | null
          contract_start_date?: string | null
          created_at?: string
          department_id?: string | null
          employee_number?: string | null
          employment_stage?: string | null
          employment_type?: string
          end_date?: string | null
          id?: string
          leave_policy_id?: string | null
          manager_id?: string | null
          permissions?: string[]
          person_id: string
          position_id?: string | null
          probation_ends_on?: string | null
          start_date?: string | null
          status?: string
          termination_reason?: string | null
          updated_at?: string
          work_location?: string | null
          work_schedule?: string | null
        }
        Update: {
          career_level?: string | null
          career_track?: string | null
          contract_start_date?: string | null
          created_at?: string
          department_id?: string | null
          employee_number?: string | null
          employment_stage?: string | null
          employment_type?: string
          end_date?: string | null
          id?: string
          leave_policy_id?: string | null
          manager_id?: string | null
          permissions?: string[]
          person_id?: string
          position_id?: string | null
          probation_ends_on?: string | null
          start_date?: string | null
          status?: string
          termination_reason?: string | null
          updated_at?: string
          work_location?: string | null
          work_schedule?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_leave_policy_id_fkey"
            columns: ["leave_policy_id"]
            isOneToOne: false
            referencedRelation: "leave_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      time_off: {
        Row: {
          approved_at: string | null
          created_at: string
          days: number | null
          end_date: string
          external_id: string | null
          external_source: string | null
          hours: number | null
          id: string
          is_half_day: boolean
          leave_type: string
          manager_note: string | null
          reason: string | null
          requested_at: string | null
          start_date: string
          status: string
          team_member_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          days?: number | null
          end_date: string
          external_id?: string | null
          external_source?: string | null
          hours?: number | null
          id?: string
          is_half_day?: boolean
          leave_type?: string
          manager_note?: string | null
          reason?: string | null
          requested_at?: string | null
          start_date: string
          status?: string
          team_member_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          days?: number | null
          end_date?: string
          external_id?: string | null
          external_source?: string | null
          hours?: number | null
          id?: string
          is_half_day?: boolean
          leave_type?: string
          manager_note?: string | null
          reason?: string | null
          requested_at?: string | null
          start_date?: string
          status?: string
          team_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "current_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      token_purchases: {
        Row: {
          amount_cents: number
          company_id: string
          created_at: string
          currency: string
          id: string
          order_id: string | null
          packs: number
          paid_at: string | null
          person_id: string
          status: string
          stripe_session_id: string | null
          tokens: number
        }
        Insert: {
          amount_cents: number
          company_id: string
          created_at?: string
          currency?: string
          id?: string
          order_id?: string | null
          packs: number
          paid_at?: string | null
          person_id: string
          status?: string
          stripe_session_id?: string | null
          tokens: number
        }
        Update: {
          amount_cents?: number
          company_id?: string
          created_at?: string
          currency?: string
          id?: string
          order_id?: string | null
          packs?: number
          paid_at?: string | null
          person_id?: string
          status?: string
          stripe_session_id?: string | null
          tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "token_purchases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_purchases_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_purchases_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_purchases_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          archived_at: string | null
          archived_by: string | null
          bank_info: string | null
          created_at: string
          id: string
          metadata: Json
          name: string
          notes: string | null
          phone: string | null
          price_range: string | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          primary_contact_phone: string | null
          rating: string | null
          secondary_contact_email: string | null
          secondary_contact_name: string | null
          secondary_contact_phone: string | null
          status: string
          tax_id: string | null
          type: string
          updated_at: string
          url: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          bank_info?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          notes?: string | null
          phone?: string | null
          price_range?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          rating?: string | null
          secondary_contact_email?: string | null
          secondary_contact_name?: string | null
          secondary_contact_phone?: string | null
          status?: string
          tax_id?: string | null
          type?: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          bank_info?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          notes?: string | null
          phone?: string | null
          price_range?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          rating?: string | null
          secondary_contact_email?: string | null
          secondary_contact_name?: string | null
          secondary_contact_phone?: string | null
          status?: string
          tax_id?: string | null
          type?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      capability_pulse_responses: {
        Row: {
          channel: string | null
          cohort_slug: string | null
          module: string | null
          pulse_capable: number | null
          pulse_improve: string | null
          pulse_loved: string | null
          respondent_email: string | null
          respondent_kind: string | null
          respondent_name: string | null
          response_id: string | null
          session_key: string | null
          session_title: string | null
          source: string | null
          sr_apply_this_week: number | null
          sr_note: string | null
          sr_quote_ok: boolean | null
          sr_ready_to_lead: number | null
          submitted_at: string | null
        }
        Relationships: []
      }
      capability_pulse_sessions: {
        Row: {
          avg_pulse_capable: number | null
          avg_score: number | null
          avg_sr_apply_this_week: number | null
          avg_sr_ready_to_lead: number | null
          cohort_slug: string | null
          first_response_at: string | null
          kind: string | null
          last_response_at: string | null
          quote_ok_count: number | null
          responses: number | null
          session_key: string | null
          session_title: string | null
          sources: string | null
        }
        Relationships: []
      }
      current_team_members: {
        Row: {
          auth_user_id: string | null
          department_name: string | null
          email: string | null
          employee_number: string | null
          employment_type: string | null
          end_date: string | null
          full_name: string | null
          id: string | null
          leave_policy: string | null
          leave_policy_name: string | null
          location: string | null
          manager_name: string | null
          person_id: string | null
          position_title: string | null
          start_date: string | null
          status: string | null
          team: string | null
          work_schedule: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_stage_current: {
        Row: {
          deal_id: string | null
          moved_at: string | null
          to_stage_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_stage_log_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_log_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      people_with_deals: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          auth_user_id: string | null
          avatar_url: string | null
          city: string | null
          country: string | null
          created_at: string | null
          deal_count: number | null
          deal_value_usd_cents: number | null
          disqualified_reason: string | null
          do_not_contact: boolean | null
          email: string | null
          first_name: string | null
          full_name: string | null
          gender: string | null
          id: string | null
          is_team_member: boolean | null
          last_name: string | null
          lead_status: string | null
          lifecycle_stage: string | null
          linkedin_url: string | null
          metadata: Json | null
          notes: string | null
          owner_id: string | null
          persona: string | null
          phone: string | null
          preferred_name: string | null
          source: string | null
          state_province: string | null
          timezone: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_list: {
        Row: {
          archived_at: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string | null
          intro_text: string | null
          is_anonymous: boolean | null
          last_response_at: string | null
          metadata: Json | null
          name: string | null
          purpose: string | null
          response_count: number | null
          slug: string | null
          status: string | null
          thank_you_text: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      team_directory: {
        Row: {
          auth_user_id: string | null
          department_name: string | null
          display_name: string | null
          email: string | null
          employee_number: string | null
          employment_type: string | null
          end_date: string | null
          full_name: string | null
          id: string | null
          leave_policy: string | null
          leave_policy_name: string | null
          location: string | null
          manager_name: string | null
          person_id: string | null
          position_title: string | null
          preferred_name: string | null
          start_date: string | null
          status: string | null
          team: string | null
          work_schedule: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people_with_deals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      append_task_position: {
        Args: { p_board_id: string; p_column_id: string }
        Returns: number
      }
      assign_company_metadata_id: {
        Args: { p_company_id?: string; p_key: string; p_value: string }
        Returns: boolean
      }
      assign_equipment: {
        Args: {
          p_actor?: string
          p_assigned_at?: string
          p_condition_out?: string
          p_equipment_id: string
          p_note?: string
          p_person_id: string
        }
        Returns: string
      }
      campaign_recipient_stats: {
        Args: { p_campaign_id: string }
        Returns: {
          n: number
          status: string
        }[]
      }
      claim_campaign_batch: {
        Args: {
          p_campaign_id: string
          p_limit: number
          p_reclaim_after?: string
        }
        Returns: {
          email: string
          id: string
          person_id: string
        }[]
      }
      claim_effect: {
        Args: {
          p_key: string
          p_kind: string
          p_routine: string
          p_run: string
        }
        Returns: {
          attempt: number
          id: string
        }[]
      }
      claim_tick: {
        Args: {
          p_host: string
          p_mode: string
          p_routine: string
          p_step_s: number
          p_tick: string
        }
        Returns: string
      }
      deal_stage_velocity: {
        Args: { p_since?: string }
        Returns: {
          advanced: number
          avg_days: number
          entered: number
          exited: number
          lost: number
          median_days: number
          stage_id: string
          won: number
        }[]
      }
      email_delivery_stats: {
        Args: { p_campaign_id?: string; p_since?: string }
        Returns: {
          event_type: string
          unique_emails: number
        }[]
      }
      find_or_create_company_by_host: {
        Args: { p_create: boolean; p_host: string; p_name: string }
        Returns: {
          company_id: string
          created: boolean
        }[]
      }
      interactions_by_month: {
        Args: { p_months?: number }
        Returns: {
          kind: string
          month: string
          n: number
        }[]
      }
      merge_company_metadata: {
        Args: { p_company_id: string; p_patch: Json }
        Returns: boolean
      }
      new_ticket_code: { Args: { len?: number }; Returns: string }
      normalize_meeting_type: { Args: { raw: string }; Returns: string }
      offboard_team_member: {
        Args: {
          p_actor?: string
          p_end_date?: string
          p_status: string
          p_team_member_id: string
        }
        Returns: Json
      }
      record_application_decision: {
        Args: {
          p_application: string
          p_by: string
          p_outcome: string
          p_reason: string
        }
        Returns: boolean
      }
      register_for_event: {
        Args: {
          p_attendee_email?: string
          p_attendee_name?: string
          p_event_id: string
          p_guest_count?: number
          p_hold_for_payment?: boolean
          p_order_id?: string
          p_person_id: string
          p_product_id?: string
        }
        Returns: Json
      }
      return_equipment: {
        Args: {
          p_condition_in?: string
          p_equipment_id: string
          p_note?: string
          p_returned_at?: string
        }
        Returns: string
      }
      set_deal_positions: {
        Args: { p_ids: string[]; p_start?: number }
        Returns: undefined
      }
      set_deal_positions_in_stage: {
        Args: { p_ids: string[]; p_stage_id: string }
        Returns: undefined
      }
      workshop_attendees_total: { Args: { p_year?: number }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  htt: {
    Tables: {
      client_identities: {
        Row: {
          created_at: string
          git_email: string | null
          github_login: string | null
          id: string
          label: string | null
          repo_id: string | null
        }
        Insert: {
          created_at?: string
          git_email?: string | null
          github_login?: string | null
          id?: string
          label?: string | null
          repo_id?: string | null
        }
        Update: {
          created_at?: string
          git_email?: string | null
          github_login?: string | null
          id?: string
          label?: string | null
          repo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_identities_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repos"
            referencedColumns: ["id"]
          },
        ]
      }
      delivered_additions: {
        Row: {
          company_id: string
          hours: number
          id: string
          kind: string
          reason: string
          seq: number
          set_at: string
          set_by_email: string
        }
        Insert: {
          company_id: string
          hours: number
          id?: string
          kind: string
          reason: string
          seq?: never
          set_at?: string
          set_by_email: string
        }
        Update: {
          company_id?: string
          hours?: number
          id?: string
          kind?: string
          reason?: string
          seq?: never
          set_at?: string
          set_by_email?: string
        }
        Relationships: []
      }
      engineer_keys: {
        Row: {
          issued_at: string
          key_hash: string
          key_id: string
          member: string
          status: string
        }
        Insert: {
          issued_at?: string
          key_hash: string
          key_id: string
          member: string
          status?: string
        }
        Update: {
          issued_at?: string
          key_hash?: string
          key_id?: string
          member?: string
          status?: string
        }
        Relationships: []
      }
      man_hour_entries: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          currency: string | null
          description: string | null
          evidence: Json | null
          hours: number
          id: string
          measured_hours: number | null
          needs_review: boolean
          occurred_hour: number | null
          occurred_on: string
          person_id: string | null
          primary_role: string | null
          rate_cents: number | null
          repo_id: string | null
          source: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          evidence?: Json | null
          hours: number
          id?: string
          measured_hours?: number | null
          needs_review?: boolean
          occurred_hour?: number | null
          occurred_on: string
          person_id?: string | null
          primary_role?: string | null
          rate_cents?: number | null
          repo_id?: string | null
          source: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          evidence?: Json | null
          hours?: number
          id?: string
          measured_hours?: number | null
          needs_review?: boolean
          occurred_hour?: number | null
          occurred_on?: string
          person_id?: string | null
          primary_role?: string | null
          rate_cents?: number | null
          repo_id?: string | null
          source?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "man_hour_entries_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repos"
            referencedColumns: ["id"]
          },
        ]
      }
      model_prices: {
        Row: {
          cache_read_multiplier: number
          cache_write_1h_multiplier: number
          cache_write_5m_multiplier: number
          input_usd_per_million: number
          model: string
          notes: string | null
          output_usd_per_million: number
          updated_at: string | null
        }
        Insert: {
          cache_read_multiplier?: number
          cache_write_1h_multiplier?: number
          cache_write_5m_multiplier?: number
          input_usd_per_million: number
          model: string
          notes?: string | null
          output_usd_per_million: number
          updated_at?: string | null
        }
        Update: {
          cache_read_multiplier?: number
          cache_write_1h_multiplier?: number
          cache_write_5m_multiplier?: number
          input_usd_per_million?: number
          model?: string
          notes?: string | null
          output_usd_per_million?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      project_goals: {
        Row: {
          created_at: string
          id: string
          metric: string
          period: string
          quantity: number | null
          repo_id: string
          seq: number
          set_by: string
          source: string
          source_key: string
          state: string | null
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          metric: string
          period: string
          quantity?: number | null
          repo_id: string
          seq?: never
          set_by: string
          source: string
          source_key: string
          state?: string | null
          unit: string
        }
        Update: {
          created_at?: string
          id?: string
          metric?: string
          period?: string
          quantity?: number | null
          repo_id?: string
          seq?: never
          set_by?: string
          source?: string
          source_key?: string
          state?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_goals_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repos"
            referencedColumns: ["id"]
          },
        ]
      }
      project_summaries: {
        Row: {
          as_of: string | null
          content: string
          generated_at: string
          id: string
          kind: string
          model: string
          repo_id: string
          source_key: string
        }
        Insert: {
          as_of?: string | null
          content: string
          generated_at?: string
          id?: string
          kind: string
          model: string
          repo_id: string
          source_key: string
        }
        Update: {
          as_of?: string | null
          content?: string
          generated_at?: string
          id?: string
          kind?: string
          model?: string
          repo_id?: string
          source_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_summaries_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repos"
            referencedColumns: ["id"]
          },
        ]
      }
      pull_requests: {
        Row: {
          author_login: string | null
          author_person_id: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          github_pr_id: number | null
          head_branch: string | null
          id: string
          merged_at: string | null
          number: number | null
          opened_at: string
          repo_id: string
          session_id: string | null
          session_start_source: string | null
          session_started_at: string | null
          state: string
          status: string
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          author_login?: string | null
          author_person_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          github_pr_id?: number | null
          head_branch?: string | null
          id?: string
          merged_at?: string | null
          number?: number | null
          opened_at: string
          repo_id: string
          session_id?: string | null
          session_start_source?: string | null
          session_started_at?: string | null
          state: string
          status?: string
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          author_login?: string | null
          author_person_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          github_pr_id?: number | null
          head_branch?: string | null
          id?: string
          merged_at?: string | null
          number?: number | null
          opened_at?: string
          repo_id?: string
          session_id?: string | null
          session_start_source?: string | null
          session_started_at?: string | null
          state?: string
          status?: string
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pull_requests_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repos"
            referencedColumns: ["id"]
          },
        ]
      }
      repos: {
        Row: {
          ai_program_id: string
          company_id: string
          created_at: string
          created_by: string | null
          ended_at: string | null
          github_repo: string | null
          github_repo_aliases: string[]
          github_repo_id: number | null
          id: string
          last_synced_at: string | null
          live_url: string | null
          name: string
          roi_metric_baseline: number | null
          roi_metric_name: string | null
          roi_metric_period: string | null
          roi_metric_target: number | null
          roi_metric_unit: string | null
          slug: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ai_program_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          github_repo?: string | null
          github_repo_aliases?: string[]
          github_repo_id?: number | null
          id?: string
          last_synced_at?: string | null
          live_url?: string | null
          name: string
          roi_metric_baseline?: number | null
          roi_metric_name?: string | null
          roi_metric_period?: string | null
          roi_metric_target?: number | null
          roi_metric_unit?: string | null
          slug?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ai_program_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          github_repo?: string | null
          github_repo_aliases?: string[]
          github_repo_id?: number | null
          id?: string
          last_synced_at?: string | null
          live_url?: string | null
          name?: string
          roi_metric_baseline?: number | null
          roi_metric_name?: string | null
          roi_metric_period?: string | null
          roi_metric_target?: number | null
          roi_metric_unit?: string | null
          slug?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          backfill: boolean
          errors: Json
          finished_at: string | null
          id: string
          projects_synced: number
          prs_upserted: number
          started_at: string
          unattributed: number
        }
        Insert: {
          backfill?: boolean
          errors?: Json
          finished_at?: string | null
          id?: string
          projects_synced?: number
          prs_upserted?: number
          started_at?: string
          unattributed?: number
        }
        Update: {
          backfill?: boolean
          errors?: Json
          finished_at?: string | null
          id?: string
          projects_synced?: number
          prs_upserted?: number
          started_at?: string
          unattributed?: number
        }
        Relationships: []
      }
      token_allocations: {
        Row: {
          company_id: string
          id: string
          kind: string | null
          reason: string | null
          seq: number
          set_at: string
          set_by_email: string
          tokens: number | null
        }
        Insert: {
          company_id: string
          id?: string
          kind?: string | null
          reason?: string | null
          seq?: never
          set_at?: string
          set_by_email: string
          tokens?: number | null
        }
        Update: {
          company_id?: string
          id?: string
          kind?: string | null
          reason?: string | null
          seq?: never
          set_at?: string
          set_by_email?: string
          tokens?: number | null
        }
        Relationships: []
      }
      token_entries: {
        Row: {
          amount: number
          cache_read_tokens: number | null
          cache_write_1h_tokens: number | null
          cache_write_5m_tokens: number | null
          cache_write_tokens: number | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          input_tokens: number | null
          kind: string
          model: string | null
          occurred_at: string
          occurred_on: string | null
          output_tokens: number | null
          person_id: string | null
          pull_request_id: string | null
          repo_id: string | null
          session_branch: string | null
          session_id: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          cache_read_tokens?: number | null
          cache_write_1h_tokens?: number | null
          cache_write_5m_tokens?: number | null
          cache_write_tokens?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          input_tokens?: number | null
          kind: string
          model?: string | null
          occurred_at: string
          occurred_on?: string | null
          output_tokens?: number | null
          person_id?: string | null
          pull_request_id?: string | null
          repo_id?: string | null
          session_branch?: string | null
          session_id?: string | null
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          cache_read_tokens?: number | null
          cache_write_1h_tokens?: number | null
          cache_write_5m_tokens?: number | null
          cache_write_tokens?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          input_tokens?: number | null
          kind?: string
          model?: string | null
          occurred_at?: string
          occurred_on?: string | null
          output_tokens?: number | null
          person_id?: string | null
          pull_request_id?: string | null
          repo_id?: string | null
          session_branch?: string | null
          session_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_entries_pull_request_id_fkey"
            columns: ["pull_request_id"]
            isOneToOne: false
            referencedRelation: "pull_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_entries_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repos"
            referencedColumns: ["id"]
          },
        ]
      }
      work_sessions: {
        Row: {
          active_intervals: Json
          company_id: string
          created_at: string
          ended_at: string | null
          human_turns: Json
          id: string
          occurred_on: string | null
          person_id: string | null
          repo_id: string
          session_id: string
          started_at: string | null
          tokens_total: number
          tool: string | null
          updated_at: string
        }
        Insert: {
          active_intervals?: Json
          company_id: string
          created_at?: string
          ended_at?: string | null
          human_turns?: Json
          id?: string
          occurred_on?: string | null
          person_id?: string | null
          repo_id: string
          session_id: string
          started_at?: string | null
          tokens_total?: number
          tool?: string | null
          updated_at?: string
        }
        Update: {
          active_intervals?: Json
          company_id?: string
          created_at?: string
          ended_at?: string | null
          human_turns?: Json
          id?: string
          occurred_on?: string | null
          person_id?: string | null
          repo_id?: string
          session_id?: string
          started_at?: string | null
          tokens_total?: number
          tool?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_sessions_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      resolve_contributor: { Args: { p_email: string }; Returns: string }
      resolve_team_member: { Args: { p_email: string }; Returns: string }
      resolve_team_member_by_login: {
        Args: { p_github_login: string }
        Returns: string
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
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      semantic_search_edge8: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          id: number
          metadata: Json
          similarity: number
          text: string
        }[]
      }
      semantic_search_silklounge: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          id: string
          metadata: Json
          similarity: number
          text: string
        }[]
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
  company_os: {
    Enums: {},
  },
  htt: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
