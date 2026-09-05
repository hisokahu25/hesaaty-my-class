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
      attendance: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          session_date: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          session_date?: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          session_date?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_answer_keys: {
        Row: {
          correct_answer: string
          created_at: string
          question_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          correct_answer: string
          created_at?: string
          question_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          correct_answer?: string
          created_at?: string
          question_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_answer_keys_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "exam_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_answers: {
        Row: {
          answer_text: string
          created_at: string
          grader_comment: string
          id: string
          is_correct: boolean | null
          points_awarded: number | null
          question_id: string
          submission_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          answer_text?: string
          created_at?: string
          grader_comment?: string
          id?: string
          is_correct?: boolean | null
          points_awarded?: number | null
          question_id: string
          submission_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          answer_text?: string
          created_at?: string
          grader_comment?: string
          id?: string
          is_correct?: boolean | null
          points_awarded?: number | null
          question_id?: string
          submission_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "exam_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "exam_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_assignments: {
        Row: {
          created_at: string
          exam_id: string
          group_id: string | null
          id: string
          student_id: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          group_id?: string | null
          id?: string
          student_id?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          group_id?: string | null
          id?: string
          student_id?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_assignments_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_assignments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          created_at: string
          exam_id: string
          id: string
          options: Json
          points: number
          position: number
          prompt: string
          question_type: Database["public"]["Enums"]["exam_question_type"]
          teacher_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          id?: string
          options?: Json
          points?: number
          position?: number
          prompt: string
          question_type: Database["public"]["Enums"]["exam_question_type"]
          teacher_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          id?: string
          options?: Json
          points?: number
          position?: number
          prompt?: string
          question_type?: Database["public"]["Enums"]["exam_question_type"]
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_submissions: {
        Row: {
          auto_score: number
          created_at: string
          exam_id: string
          final_score: number | null
          graded_at: string | null
          id: string
          manual_score: number | null
          started_at: string
          status: Database["public"]["Enums"]["exam_submission_status"]
          student_id: string
          submitted_at: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          auto_score?: number
          created_at?: string
          exam_id: string
          final_score?: number | null
          graded_at?: string | null
          id?: string
          manual_score?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["exam_submission_status"]
          student_id: string
          submitted_at?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          auto_score?: number
          created_at?: string
          exam_id?: string
          final_score?: number | null
          graded_at?: string | null
          id?: string
          manual_score?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["exam_submission_status"]
          student_id?: string
          submitted_at?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_submissions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          created_at: string
          ends_at: string | null
          exam_date: string
          group_id: string | null
          id: string
          instructions: string
          kind: Database["public"]["Enums"]["exam_kind"]
          max_score: number
          publish_status: Database["public"]["Enums"]["exam_publish_status"]
          starts_at: string | null
          teacher_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          exam_date?: string
          group_id?: string | null
          id?: string
          instructions?: string
          kind?: Database["public"]["Enums"]["exam_kind"]
          max_score?: number
          publish_status?: Database["public"]["Enums"]["exam_publish_status"]
          starts_at?: string | null
          teacher_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          exam_date?: string
          group_id?: string | null
          id?: string
          instructions?: string
          kind?: Database["public"]["Enums"]["exam_kind"]
          max_score?: number
          publish_status?: Database["public"]["Enums"]["exam_publish_status"]
          starts_at?: string | null
          teacher_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          created_at: string
          exam_id: string
          id: string
          score: number
          student_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          id?: string
          score?: number
          student_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          id?: string
          score?: number
          student_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          days: string[]
          fee: number
          grade: string
          id: string
          location: string
          name: string
          start_time: string
          subject: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          days?: string[]
          fee?: number
          grade?: string
          id?: string
          location?: string
          name: string
          start_time?: string
          subject?: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          days?: string[]
          fee?: number
          grade?: string
          id?: string
          location?: string
          name?: string
          start_time?: string
          subject?: string
          teacher_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_due: number
          amount_paid: number
          created_at: string
          id: string
          month: string
          paid_at: string | null
          student_id: string
          teacher_id: string
        }
        Insert: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          id?: string
          month: string
          paid_at?: string | null
          student_id: string
          teacher_id: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          id?: string
          month?: string
          paid_at?: string | null
          student_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      student_portal_credentials: {
        Row: {
          created_at: string
          password_changed_at: string | null
          password_hash: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          password_changed_at?: string | null
          password_hash: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          password_changed_at?: string | null
          password_hash?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_portal_credentials_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_portal_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          student_id: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          student_id: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          student_id?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_portal_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string
          created_at: string
          full_name: string
          grade: string
          group_id: string | null
          id: string
          notes: string
          parent_phone: string
          parent_user_id: string | null
          school: string
          student_code: string
          teacher_id: string
        }
        Insert: {
          address?: string
          created_at?: string
          full_name: string
          grade?: string
          group_id?: string | null
          id?: string
          notes?: string
          parent_phone?: string
          parent_user_id?: string | null
          school?: string
          student_code?: string
          teacher_id: string
        }
        Update: {
          address?: string
          created_at?: string
          full_name?: string
          grade?: string
          group_id?: string | null
          id?: string
          notes?: string
          parent_phone?: string
          parent_user_id?: string | null
          school?: string
          student_code?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      authenticate_student_portal: {
        Args: { _password: string; _student_code: string }
        Returns: string
      }
      finalize_essay_submission: {
        Args: { _submission_id: string }
        Returns: undefined
      }
      generate_student_code: { Args: never; Returns: string }
      service_set_student_portal_password: {
        Args: { _password: string; _student_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "teacher" | "parent" | "student"
      attendance_status: "present" | "absent" | "late"
      exam_kind: "paper" | "online" | "essay"
      exam_publish_status: "draft" | "published"
      exam_question_type: "mcq" | "true_false" | "essay"
      exam_submission_status: "in_progress" | "submitted" | "graded"
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
    Enums: {
      app_role: ["admin", "teacher", "parent", "student"],
      attendance_status: ["present", "absent", "late"],
      exam_kind: ["paper", "online", "essay"],
      exam_publish_status: ["draft", "published"],
      exam_question_type: ["mcq", "true_false", "essay"],
      exam_submission_status: ["in_progress", "submitted", "graded"],
    },
  },
} as const
