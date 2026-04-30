--
-- PostgreSQL database dump
--

\restrict AFbf5H3HA1CYv9J7chH5UbYmXuj943pNo2R5sHGzI8s96ftFhrPbCOzZgax6JJb

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: chat_stage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.chat_stage AS ENUM (
    'new',
    'processing',
    'deciding',
    'on_site',
    'completed',
    'cancelled'
);


--
-- Name: dispatch_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dispatch_status AS ENUM (
    'sent',
    'responded',
    'assigned',
    'rejected'
);


--
-- Name: lead_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lead_status AS ENUM (
    'new',
    'processing',
    'sent_to_work',
    'non_target',
    'client_refusal'
);


--
-- Name: master_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.master_status AS ENUM (
    'active',
    'suspended',
    'inactive',
    'pending_contract'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'waiting_master',
    'master_assigned',
    'in_progress',
    'completed',
    'cancelled',
    'cancellation_requested'
);


--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_status AS ENUM (
    'pending',
    'paid',
    'overdue'
);


--
-- Name: task_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_category AS ENUM (
    'followup',
    'payment',
    'amount_check',
    'report_check',
    'quality_check',
    'rating',
    'general'
);


--
-- Name: task_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);


--
-- Name: task_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_status AS ENUM (
    'open',
    'in_progress',
    'done',
    'snoozed'
);


--
-- Name: task_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_type AS ENUM (
    'manual',
    'ai_auto'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'lead_operator',
    'master_operator'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: avito_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avito_settings (
    id integer NOT NULL,
    client_id text,
    client_secret text,
    access_token text,
    token_expires_at timestamp without time zone,
    avito_user_id text,
    avito_user_name text,
    enabled boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    refresh_token text,
    auth_type text DEFAULT 'client_credentials'::text,
    advance_balance integer DEFAULT 0,
    advance_balance_updated_at timestamp without time zone
);


--
-- Name: avito_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.avito_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: avito_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.avito_settings_id_seq OWNED BY public.avito_settings.id;


--
-- Name: bot_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bot_memory (
    id integer NOT NULL,
    master_id integer,
    category character varying(60) NOT NULL,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: bot_memory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bot_memory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bot_memory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bot_memory_id_seq OWNED BY public.bot_memory.id;


--
-- Name: bot_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bot_sessions (
    id integer NOT NULL,
    bot_type character varying(20) NOT NULL,
    user_id bigint NOT NULL,
    session_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: bot_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bot_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bot_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bot_sessions_id_seq OWNED BY public.bot_sessions.id;


--
-- Name: browser_agent_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.browser_agent_credentials (
    id integer NOT NULL,
    site text NOT NULL,
    login text NOT NULL,
    password_enc text NOT NULL,
    cookies jsonb,
    last_login_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: browser_agent_credentials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.browser_agent_credentials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: browser_agent_credentials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.browser_agent_credentials_id_seq OWNED BY public.browser_agent_credentials.id;


--
-- Name: browser_agent_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.browser_agent_logs (
    id integer NOT NULL,
    session_id text NOT NULL,
    action_type text NOT NULL,
    description text NOT NULL,
    screenshot_b64 text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: browser_agent_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.browser_agent_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: browser_agent_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.browser_agent_logs_id_seq OWNED BY public.browser_agent_logs.id;


--
-- Name: browser_agent_scenarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.browser_agent_scenarios (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    task_template text NOT NULL,
    icon text DEFAULT 'globe'::text,
    color text DEFAULT 'blue'::text,
    run_count integer DEFAULT 0 NOT NULL,
    last_run_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: browser_agent_scenarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.browser_agent_scenarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: browser_agent_scenarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.browser_agent_scenarios_id_seq OWNED BY public.browser_agent_scenarios.id;


--
-- Name: chat_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_cases (
    id integer NOT NULL,
    order_id integer NOT NULL,
    master_id integer NOT NULL,
    city text DEFAULT ''::text NOT NULL,
    district text DEFAULT ''::text NOT NULL,
    service_type text DEFAULT ''::text NOT NULL,
    order_status text DEFAULT ''::text NOT NULL,
    current_stage text DEFAULT 'assigned'::text NOT NULL,
    risk_level text DEFAULT 'green'::text NOT NULL,
    risk_reason text,
    summary text,
    next_action text DEFAULT 'no_action'::text NOT NULL,
    next_action_deadline timestamp without time zone,
    last_master_message_at timestamp without time zone,
    last_ai_message_at timestamp without time zone,
    hours_without_contact numeric(10,2),
    hours_without_estimate numeric(10,2),
    hours_without_payment numeric(10,2),
    expected_revenue numeric(12,2),
    expected_commission numeric(12,2),
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    confidence text DEFAULT 'high'::text NOT NULL,
    is_resolved boolean DEFAULT false NOT NULL,
    resolved_until timestamp without time zone,
    is_archived boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_cases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_cases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_cases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_cases_id_seq OWNED BY public.chat_cases.id;


--
-- Name: cities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cities (
    id integer NOT NULL,
    name text NOT NULL
);


--
-- Name: cities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cities_id_seq OWNED BY public.cities.id;


--
-- Name: client_support_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_support_messages (
    id integer NOT NULL,
    receipt_token character varying(64) NOT NULL,
    message text NOT NULL,
    from_client boolean DEFAULT true NOT NULL,
    operator_name text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    seen_at timestamp without time zone
);


--
-- Name: client_support_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.client_support_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: client_support_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.client_support_messages_id_seq OWNED BY public.client_support_messages.id;


--
-- Name: dispatcher_followups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispatcher_followups (
    id integer NOT NULL,
    master_id integer NOT NULL,
    order_id integer,
    followup_at timestamp without time zone NOT NULL,
    question text NOT NULL,
    context text,
    sent boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: dispatcher_followups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dispatcher_followups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dispatcher_followups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dispatcher_followups_id_seq OWNED BY public.dispatcher_followups.id;


--
-- Name: fomo_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fomo_events (
    id integer NOT NULL,
    master_id integer NOT NULL,
    event_type text NOT NULL,
    reason text,
    order_id integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fomo_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fomo_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fomo_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fomo_events_id_seq OWNED BY public.fomo_events.id;


--
-- Name: general_support_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.general_support_messages (
    id integer NOT NULL,
    client_phone character varying(20) NOT NULL,
    client_name text,
    message text NOT NULL,
    from_client boolean DEFAULT true NOT NULL,
    operator_name text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    seen_at timestamp without time zone
);


--
-- Name: general_support_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.general_support_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: general_support_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.general_support_messages_id_seq OWNED BY public.general_support_messages.id;


--
-- Name: lead_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_events (
    id integer NOT NULL,
    lead_id integer NOT NULL,
    event_type text NOT NULL,
    description text NOT NULL,
    user_alias text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lead_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lead_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lead_events_id_seq OWNED BY public.lead_events.id;


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id integer NOT NULL,
    client_name text NOT NULL,
    client_phone text NOT NULL,
    city text NOT NULL,
    district text NOT NULL,
    service_type text NOT NULL,
    area numeric(10,2) NOT NULL,
    scheduled_at timestamp without time zone,
    comment text,
    source text,
    status public.lead_status DEFAULT 'new'::public.lead_status NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    services text,
    photos text,
    deleted_at timestamp without time zone,
    cancellation_reason text,
    status_updated_at timestamp without time zone,
    avito_item_id text,
    avito_item_title text
);


--
-- Name: leads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leads_id_seq OWNED BY public.leads.id;


--
-- Name: master_checkins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_checkins (
    id integer NOT NULL,
    master_id integer NOT NULL,
    date date NOT NULL,
    is_available boolean,
    responded_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    reason text
);


--
-- Name: master_checkins_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.master_checkins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: master_checkins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.master_checkins_id_seq OWNED BY public.master_checkins.id;


--
-- Name: master_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_messages (
    id integer NOT NULL,
    master_id integer NOT NULL,
    telegram_chat_id text NOT NULL,
    text text NOT NULL,
    from_master boolean DEFAULT true NOT NULL,
    sender_name text,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    photo_url text,
    edited_at timestamp without time zone,
    telegram_message_id integer,
    max_mid text
);


--
-- Name: master_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.master_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: master_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.master_messages_id_seq OWNED BY public.master_messages.id;


--
-- Name: master_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_reviews (
    id integer NOT NULL,
    master_id integer NOT NULL,
    order_id integer,
    sentiment text DEFAULT 'neutral'::text NOT NULL,
    text text NOT NULL,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: master_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.master_reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: master_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.master_reviews_id_seq OWNED BY public.master_reviews.id;


--
-- Name: master_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_tasks (
    id integer NOT NULL,
    master_id integer NOT NULL,
    text text NOT NULL,
    due_at timestamp without time zone,
    is_completed boolean DEFAULT false NOT NULL,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: master_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.master_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: master_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.master_tasks_id_seq OWNED BY public.master_tasks.id;


--
-- Name: masters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.masters (
    id integer NOT NULL,
    alias text NOT NULL,
    city text NOT NULL,
    specialization text NOT NULL,
    telegram_id text,
    phone text,
    status public.master_status DEFAULT 'active'::public.master_status NOT NULL,
    rating numeric(3,2) DEFAULT 3.0 NOT NULL,
    total_orders integer DEFAULT 0 NOT NULL,
    accepted_orders integer DEFAULT 0 NOT NULL,
    avg_response_time numeric(10,2),
    debt numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    voronka_column_id integer,
    is_test_master boolean DEFAULT true NOT NULL,
    specializations text[] DEFAULT '{}'::text[] NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    custom_avatar_url text,
    contract_link text,
    deleted_at timestamp without time zone,
    pwa_login text,
    pwa_password_hash text,
    working_hours jsonb,
    preferred_districts text[] DEFAULT '{}'::text[] NOT NULL,
    min_area integer DEFAULT 0 NOT NULL,
    contract_signed_at timestamp without time zone,
    contract_sign_ip text,
    passport_photo_url text,
    passport_verified boolean DEFAULT false NOT NULL,
    passport_verify_note text,
    contract_full_name text,
    contract_passport_number text,
    contract_passport_date text,
    contract_passport_issuer text,
    contract_address text,
    last_seen_at timestamp without time zone,
    passport_reg_photo_url text,
    max_chat_id text,
    service_prices jsonb,
    total_leads_received integer DEFAULT 0 NOT NULL,
    suspended_at timestamp without time zone,
    suspension_reason text,
    fomo_disabled boolean DEFAULT false NOT NULL,
    max_active_orders integer DEFAULT 1 NOT NULL,
    consecutive_cancellations integer DEFAULT 0 NOT NULL,
    blocked_from_orders boolean DEFAULT false NOT NULL,
    blocked_at timestamp without time zone,
    blocked_reason text,
    last_cancel_at timestamp without time zone,
    last_completed_at timestamp without time zone,
    manual_unblocks_count integer DEFAULT 0 NOT NULL
);


--
-- Name: masters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.masters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: masters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.masters_id_seq OWNED BY public.masters.id;


--
-- Name: max_bot_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.max_bot_logs (
    id integer NOT NULL,
    master_id integer,
    max_user_id character varying(50),
    event character varying(100) NOT NULL,
    note text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: max_bot_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.max_bot_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: max_bot_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.max_bot_logs_id_seq OWNED BY public.max_bot_logs.id;


--
-- Name: order_broadcast_waves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_broadcast_waves (
    id integer NOT NULL,
    order_id integer NOT NULL,
    current_wave integer DEFAULT 1 NOT NULL,
    wave_1_sent_at timestamp without time zone,
    wave_2_sent_at timestamp without time zone,
    wave_3_sent_at timestamp without time zone,
    wave_4_sent_at timestamp without time zone,
    admin_alerted_at timestamp without time zone,
    wave_1_count integer DEFAULT 0 NOT NULL,
    wave_2_count integer DEFAULT 0 NOT NULL,
    wave_3_count integer DEFAULT 0 NOT NULL,
    wave_4_count integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: order_broadcast_waves_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_broadcast_waves_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_broadcast_waves_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_broadcast_waves_id_seq OWNED BY public.order_broadcast_waves.id;


--
-- Name: order_dispatches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_dispatches (
    id integer NOT NULL,
    order_id integer NOT NULL,
    master_id integer NOT NULL,
    telegram_chat_id text NOT NULL,
    telegram_message_id text,
    status public.dispatch_status DEFAULT 'sent'::public.dispatch_status NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    responded_at timestamp without time zone,
    rejection_reason text,
    response_note text
);


--
-- Name: order_dispatches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_dispatches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_dispatches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_dispatches_id_seq OWNED BY public.order_dispatches.id;


--
-- Name: order_status_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_logs (
    id integer NOT NULL,
    order_id integer NOT NULL,
    old_status text,
    new_status text NOT NULL,
    user_id integer,
    user_alias text,
    note text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: order_status_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_status_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_status_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_status_logs_id_seq OWNED BY public.order_status_logs.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    lead_id integer NOT NULL,
    city text NOT NULL,
    district text NOT NULL,
    service_type text NOT NULL,
    area numeric(10,2) NOT NULL,
    scheduled_at timestamp without time zone,
    comment text,
    status public.order_status DEFAULT 'waiting_master'::public.order_status NOT NULL,
    master_id integer,
    order_amount numeric(12,2),
    commission numeric(12,2),
    client_rating integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    dispatch_status text DEFAULT 'none'::text NOT NULL,
    proposed_amount numeric(12,2),
    cancel_reason text,
    services text,
    deleted_at timestamp without time zone,
    master_work_status text,
    photos_before text[] DEFAULT '{}'::text[] NOT NULL,
    photos_after text[] DEFAULT '{}'::text[] NOT NULL,
    photo_act text,
    operator_note text,
    assigned_at timestamp without time zone,
    completed_at timestamp without time zone,
    cancel_type text,
    broadcast_count integer DEFAULT 0 NOT NULL,
    last_broadcast_at timestamp without time zone,
    response_window_close_at timestamp without time zone,
    dispatch_wave integer DEFAULT 1 NOT NULL,
    avito_lead_id text,
    avito_chat_id text,
    client_name text,
    client_phone text,
    rooms_count integer,
    prepayment_amount numeric(10,2) DEFAULT 0 NOT NULL,
    prepayment_deducted boolean DEFAULT false NOT NULL,
    client_review text,
    reviewed_at timestamp without time zone,
    master_comment text,
    photos text[],
    source text DEFAULT 'crm'::text NOT NULL
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id integer NOT NULL,
    master_id integer NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.push_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.push_subscriptions_id_seq OWNED BY public.push_subscriptions.id;


--
-- Name: receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipts (
    id integer NOT NULL,
    token character varying(64) NOT NULL,
    order_id integer NOT NULL,
    master_id integer NOT NULL,
    client_name text NOT NULL,
    client_phone text NOT NULL,
    service_type text NOT NULL,
    city text NOT NULL,
    district text,
    prepayment_amount numeric(10,2) NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    line_items jsonb DEFAULT '[]'::jsonb NOT NULL,
    client_submitted_name text,
    prepayment_submitted_at timestamp without time zone,
    prepayment_screenshot_url text,
    prepayment_seen_at timestamp without time zone
);


--
-- Name: receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.receipts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.receipts_id_seq OWNED BY public.receipts.id;


--
-- Name: scenario_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scenario_notifications (
    id integer NOT NULL,
    scenario_id character varying(64) NOT NULL,
    order_id integer NOT NULL,
    master_id integer NOT NULL,
    tier character varying(32) NOT NULL,
    sent_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: scenario_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scenario_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scenario_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scenario_notifications_id_seq OWNED BY public.scenario_notifications.id;


--
-- Name: scenario_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scenario_runs (
    id integer NOT NULL,
    scenario text NOT NULL,
    run_type text DEFAULT 'manual'::text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    summary jsonb,
    error_text text,
    duration_ms integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: scenario_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scenario_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scenario_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scenario_runs_id_seq OWNED BY public.scenario_runs.id;


--
-- Name: scenario_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scenario_settings (
    scenario text NOT NULL,
    auto_enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: service_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_types (
    id integer NOT NULL,
    name text NOT NULL
);


--
-- Name: service_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.service_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: service_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.service_types_id_seq OWNED BY public.service_types.id;


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: system_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_tasks (
    id integer NOT NULL,
    title text NOT NULL,
    description text,
    type public.task_type DEFAULT 'manual'::public.task_type NOT NULL,
    status public.task_status DEFAULT 'open'::public.task_status NOT NULL,
    priority public.task_priority DEFAULT 'medium'::public.task_priority NOT NULL,
    category public.task_category DEFAULT 'general'::public.task_category NOT NULL,
    assigned_to text,
    related_master_id integer,
    related_order_id integer,
    due_at timestamp without time zone,
    completed_at timestamp without time zone,
    completed_by text,
    ai_reason text,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: system_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_tasks_id_seq OWNED BY public.system_tasks.id;


--
-- Name: telegram_chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_chats (
    id integer NOT NULL,
    telegram_chat_id text NOT NULL,
    username text,
    first_name text,
    last_name text,
    avatar_url text,
    stage public.chat_stage DEFAULT 'new'::public.chat_stage NOT NULL,
    assigned_operator_id integer,
    last_message text,
    last_message_at timestamp without time zone,
    unread_count integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: telegram_chats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.telegram_chats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: telegram_chats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.telegram_chats_id_seq OWNED BY public.telegram_chats.id;


--
-- Name: telegram_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_messages (
    id integer NOT NULL,
    chat_id text NOT NULL,
    telegram_message_id integer,
    text text NOT NULL,
    from_bot boolean DEFAULT false NOT NULL,
    sender_name text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: telegram_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.telegram_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: telegram_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.telegram_messages_id_seq OWNED BY public.telegram_messages.id;


--
-- Name: transaction_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transaction_payments (
    id integer NOT NULL,
    transaction_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    note text,
    paid_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: transaction_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transaction_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transaction_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transaction_payments_id_seq OWNED BY public.transaction_payments.id;


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id integer NOT NULL,
    order_id integer NOT NULL,
    master_id integer NOT NULL,
    order_amount numeric(12,2) NOT NULL,
    commission numeric(12,2) NOT NULL,
    payment_status public.payment_status DEFAULT 'pending'::public.payment_status NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    paid_at timestamp without time zone,
    prepayment_deducted numeric(12,2) DEFAULT 0 NOT NULL,
    source_type text,
    snooze_until timestamp without time zone,
    snooze_note text
);


--
-- Name: transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transactions_id_seq OWNED BY public.transactions.id;


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    login text NOT NULL,
    password_hash text NOT NULL,
    name text NOT NULL,
    role public.user_role NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    permissions jsonb DEFAULT '[]'::jsonb
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: voronka_columns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voronka_columns (
    id integer NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    receives_orders boolean DEFAULT false NOT NULL,
    color text DEFAULT 'blue'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: voronka_columns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.voronka_columns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: voronka_columns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.voronka_columns_id_seq OWNED BY public.voronka_columns.id;


--
-- Name: avito_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avito_settings ALTER COLUMN id SET DEFAULT nextval('public.avito_settings_id_seq'::regclass);


--
-- Name: bot_memory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_memory ALTER COLUMN id SET DEFAULT nextval('public.bot_memory_id_seq'::regclass);


--
-- Name: bot_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_sessions ALTER COLUMN id SET DEFAULT nextval('public.bot_sessions_id_seq'::regclass);


--
-- Name: browser_agent_credentials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.browser_agent_credentials ALTER COLUMN id SET DEFAULT nextval('public.browser_agent_credentials_id_seq'::regclass);


--
-- Name: browser_agent_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.browser_agent_logs ALTER COLUMN id SET DEFAULT nextval('public.browser_agent_logs_id_seq'::regclass);


--
-- Name: browser_agent_scenarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.browser_agent_scenarios ALTER COLUMN id SET DEFAULT nextval('public.browser_agent_scenarios_id_seq'::regclass);


--
-- Name: chat_cases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_cases ALTER COLUMN id SET DEFAULT nextval('public.chat_cases_id_seq'::regclass);


--
-- Name: cities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cities ALTER COLUMN id SET DEFAULT nextval('public.cities_id_seq'::regclass);


--
-- Name: client_support_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_support_messages ALTER COLUMN id SET DEFAULT nextval('public.client_support_messages_id_seq'::regclass);


--
-- Name: dispatcher_followups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispatcher_followups ALTER COLUMN id SET DEFAULT nextval('public.dispatcher_followups_id_seq'::regclass);


--
-- Name: fomo_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fomo_events ALTER COLUMN id SET DEFAULT nextval('public.fomo_events_id_seq'::regclass);


--
-- Name: general_support_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.general_support_messages ALTER COLUMN id SET DEFAULT nextval('public.general_support_messages_id_seq'::regclass);


--
-- Name: lead_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_events ALTER COLUMN id SET DEFAULT nextval('public.lead_events_id_seq'::regclass);


--
-- Name: leads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads ALTER COLUMN id SET DEFAULT nextval('public.leads_id_seq'::regclass);


--
-- Name: master_checkins id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_checkins ALTER COLUMN id SET DEFAULT nextval('public.master_checkins_id_seq'::regclass);


--
-- Name: master_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_messages ALTER COLUMN id SET DEFAULT nextval('public.master_messages_id_seq'::regclass);


--
-- Name: master_reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_reviews ALTER COLUMN id SET DEFAULT nextval('public.master_reviews_id_seq'::regclass);


--
-- Name: master_tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_tasks ALTER COLUMN id SET DEFAULT nextval('public.master_tasks_id_seq'::regclass);


--
-- Name: masters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.masters ALTER COLUMN id SET DEFAULT nextval('public.masters_id_seq'::regclass);


--
-- Name: max_bot_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.max_bot_logs ALTER COLUMN id SET DEFAULT nextval('public.max_bot_logs_id_seq'::regclass);


--
-- Name: order_broadcast_waves id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_broadcast_waves ALTER COLUMN id SET DEFAULT nextval('public.order_broadcast_waves_id_seq'::regclass);


--
-- Name: order_dispatches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_dispatches ALTER COLUMN id SET DEFAULT nextval('public.order_dispatches_id_seq'::regclass);


--
-- Name: order_status_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_logs ALTER COLUMN id SET DEFAULT nextval('public.order_status_logs_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: push_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.push_subscriptions_id_seq'::regclass);


--
-- Name: receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts ALTER COLUMN id SET DEFAULT nextval('public.receipts_id_seq'::regclass);


--
-- Name: scenario_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenario_notifications ALTER COLUMN id SET DEFAULT nextval('public.scenario_notifications_id_seq'::regclass);


--
-- Name: scenario_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenario_runs ALTER COLUMN id SET DEFAULT nextval('public.scenario_runs_id_seq'::regclass);


--
-- Name: service_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_types ALTER COLUMN id SET DEFAULT nextval('public.service_types_id_seq'::regclass);


--
-- Name: system_tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_tasks ALTER COLUMN id SET DEFAULT nextval('public.system_tasks_id_seq'::regclass);


--
-- Name: telegram_chats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_chats ALTER COLUMN id SET DEFAULT nextval('public.telegram_chats_id_seq'::regclass);


--
-- Name: telegram_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_messages ALTER COLUMN id SET DEFAULT nextval('public.telegram_messages_id_seq'::regclass);


--
-- Name: transaction_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_payments ALTER COLUMN id SET DEFAULT nextval('public.transaction_payments_id_seq'::regclass);


--
-- Name: transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions ALTER COLUMN id SET DEFAULT nextval('public.transactions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: voronka_columns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voronka_columns ALTER COLUMN id SET DEFAULT nextval('public.voronka_columns_id_seq'::regclass);


--
-- Name: avito_settings avito_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avito_settings
    ADD CONSTRAINT avito_settings_pkey PRIMARY KEY (id);


--
-- Name: bot_memory bot_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_memory
    ADD CONSTRAINT bot_memory_pkey PRIMARY KEY (id);


--
-- Name: bot_sessions bot_sessions_bot_type_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_sessions
    ADD CONSTRAINT bot_sessions_bot_type_user_id_key UNIQUE (bot_type, user_id);


--
-- Name: bot_sessions bot_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_sessions
    ADD CONSTRAINT bot_sessions_pkey PRIMARY KEY (id);


--
-- Name: browser_agent_credentials browser_agent_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.browser_agent_credentials
    ADD CONSTRAINT browser_agent_credentials_pkey PRIMARY KEY (id);


--
-- Name: browser_agent_credentials browser_agent_credentials_site_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.browser_agent_credentials
    ADD CONSTRAINT browser_agent_credentials_site_key UNIQUE (site);


--
-- Name: browser_agent_logs browser_agent_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.browser_agent_logs
    ADD CONSTRAINT browser_agent_logs_pkey PRIMARY KEY (id);


--
-- Name: browser_agent_scenarios browser_agent_scenarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.browser_agent_scenarios
    ADD CONSTRAINT browser_agent_scenarios_pkey PRIMARY KEY (id);


--
-- Name: chat_cases chat_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_cases
    ADD CONSTRAINT chat_cases_pkey PRIMARY KEY (id);


--
-- Name: cities cities_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_name_unique UNIQUE (name);


--
-- Name: cities cities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_pkey PRIMARY KEY (id);


--
-- Name: client_support_messages client_support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_support_messages
    ADD CONSTRAINT client_support_messages_pkey PRIMARY KEY (id);


--
-- Name: dispatcher_followups dispatcher_followups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispatcher_followups
    ADD CONSTRAINT dispatcher_followups_pkey PRIMARY KEY (id);


--
-- Name: fomo_events fomo_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fomo_events
    ADD CONSTRAINT fomo_events_pkey PRIMARY KEY (id);


--
-- Name: general_support_messages general_support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.general_support_messages
    ADD CONSTRAINT general_support_messages_pkey PRIMARY KEY (id);


--
-- Name: lead_events lead_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_events
    ADD CONSTRAINT lead_events_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: master_checkins master_checkins_master_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_checkins
    ADD CONSTRAINT master_checkins_master_id_date_key UNIQUE (master_id, date);


--
-- Name: master_checkins master_checkins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_checkins
    ADD CONSTRAINT master_checkins_pkey PRIMARY KEY (id);


--
-- Name: master_messages master_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_messages
    ADD CONSTRAINT master_messages_pkey PRIMARY KEY (id);


--
-- Name: master_reviews master_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_reviews
    ADD CONSTRAINT master_reviews_pkey PRIMARY KEY (id);


--
-- Name: master_tasks master_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_tasks
    ADD CONSTRAINT master_tasks_pkey PRIMARY KEY (id);


--
-- Name: masters masters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.masters
    ADD CONSTRAINT masters_pkey PRIMARY KEY (id);


--
-- Name: max_bot_logs max_bot_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.max_bot_logs
    ADD CONSTRAINT max_bot_logs_pkey PRIMARY KEY (id);


--
-- Name: order_broadcast_waves order_broadcast_waves_order_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_broadcast_waves
    ADD CONSTRAINT order_broadcast_waves_order_id_unique UNIQUE (order_id);


--
-- Name: order_broadcast_waves order_broadcast_waves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_broadcast_waves
    ADD CONSTRAINT order_broadcast_waves_pkey PRIMARY KEY (id);


--
-- Name: order_dispatches order_dispatches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_dispatches
    ADD CONSTRAINT order_dispatches_pkey PRIMARY KEY (id);


--
-- Name: order_status_logs order_status_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_logs
    ADD CONSTRAINT order_status_logs_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: receipts receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);


--
-- Name: receipts receipts_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_token_key UNIQUE (token);


--
-- Name: scenario_notifications scenario_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenario_notifications
    ADD CONSTRAINT scenario_notifications_pkey PRIMARY KEY (id);


--
-- Name: scenario_runs scenario_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenario_runs
    ADD CONSTRAINT scenario_runs_pkey PRIMARY KEY (id);


--
-- Name: scenario_settings scenario_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenario_settings
    ADD CONSTRAINT scenario_settings_pkey PRIMARY KEY (scenario);


--
-- Name: service_types service_types_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_types
    ADD CONSTRAINT service_types_name_unique UNIQUE (name);


--
-- Name: service_types service_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_types
    ADD CONSTRAINT service_types_pkey PRIMARY KEY (id);


--
-- Name: user_sessions session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: system_tasks system_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_tasks
    ADD CONSTRAINT system_tasks_pkey PRIMARY KEY (id);


--
-- Name: telegram_chats telegram_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_chats
    ADD CONSTRAINT telegram_chats_pkey PRIMARY KEY (id);


--
-- Name: telegram_chats telegram_chats_telegram_chat_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_chats
    ADD CONSTRAINT telegram_chats_telegram_chat_id_unique UNIQUE (telegram_chat_id);


--
-- Name: telegram_messages telegram_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_messages
    ADD CONSTRAINT telegram_messages_pkey PRIMARY KEY (id);


--
-- Name: transaction_payments transaction_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: users users_login_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_login_unique UNIQUE (login);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: voronka_columns voronka_columns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voronka_columns
    ADD CONSTRAINT voronka_columns_pkey PRIMARY KEY (id);


--
-- Name: browser_agent_logs_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX browser_agent_logs_session_idx ON public.browser_agent_logs USING btree (session_id);


--
-- Name: chat_cases_current_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_cases_current_stage_idx ON public.chat_cases USING btree (current_stage);


--
-- Name: chat_cases_deadline_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_cases_deadline_idx ON public.chat_cases USING btree (next_action_deadline);


--
-- Name: chat_cases_master_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_cases_master_id_idx ON public.chat_cases USING btree (master_id);


--
-- Name: chat_cases_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_cases_order_id_idx ON public.chat_cases USING btree (order_id);


--
-- Name: chat_cases_risk_level_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_cases_risk_level_idx ON public.chat_cases USING btree (risk_level);


--
-- Name: chat_cases_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_cases_updated_at_idx ON public.chat_cases USING btree (updated_at);


--
-- Name: fomo_events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fomo_events_created_at_idx ON public.fomo_events USING btree (created_at);


--
-- Name: fomo_events_event_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fomo_events_event_type_idx ON public.fomo_events USING btree (event_type);


--
-- Name: fomo_events_master_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fomo_events_master_id_idx ON public.fomo_events USING btree (master_id);


--
-- Name: idx_scen_notif_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scen_notif_lookup ON public.scenario_notifications USING btree (scenario_id, order_id, master_id, tier, sent_at DESC);


--
-- Name: leads_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_phone_idx ON public.leads USING btree (client_phone);


--
-- Name: leads_status_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_status_active_idx ON public.leads USING btree (status, deleted_at, created_at);


--
-- Name: orders_completed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_completed_at_idx ON public.orders USING btree (completed_at);


--
-- Name: orders_lead_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_lead_id_idx ON public.orders USING btree (lead_id);


--
-- Name: orders_master_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_master_status_idx ON public.orders USING btree (master_id, status, deleted_at);


--
-- Name: orders_status_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_status_active_idx ON public.orders USING btree (status, deleted_at, last_broadcast_at);


--
-- Name: receipts_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX receipts_order_id_idx ON public.receipts USING btree (order_id);


--
-- Name: receipts_pending_confirm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX receipts_pending_confirm_idx ON public.receipts USING btree (prepayment_submitted_at, prepayment_seen_at);


--
-- Name: scenario_runs_scenario_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scenario_runs_scenario_idx ON public.scenario_runs USING btree (scenario, created_at DESC);


--
-- Name: bot_memory bot_memory_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_memory
    ADD CONSTRAINT bot_memory_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id) ON DELETE CASCADE;


--
-- Name: chat_cases chat_cases_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_cases
    ADD CONSTRAINT chat_cases_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id);


--
-- Name: chat_cases chat_cases_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_cases
    ADD CONSTRAINT chat_cases_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: lead_events lead_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_events
    ADD CONSTRAINT lead_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: master_checkins master_checkins_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_checkins
    ADD CONSTRAINT master_checkins_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id);


--
-- Name: master_reviews master_reviews_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_reviews
    ADD CONSTRAINT master_reviews_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id) ON DELETE CASCADE;


--
-- Name: master_reviews master_reviews_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_reviews
    ADD CONSTRAINT master_reviews_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: master_tasks master_tasks_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_tasks
    ADD CONSTRAINT master_tasks_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id) ON DELETE CASCADE;


--
-- Name: order_dispatches order_dispatches_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_dispatches
    ADD CONSTRAINT order_dispatches_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id);


--
-- Name: order_dispatches order_dispatches_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_dispatches
    ADD CONSTRAINT order_dispatches_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: order_status_logs order_status_logs_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_logs
    ADD CONSTRAINT order_status_logs_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: orders orders_lead_id_leads_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_lead_id_leads_id_fk FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: orders orders_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id);


--
-- Name: push_subscriptions push_subscriptions_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id) ON DELETE CASCADE;


--
-- Name: receipts receipts_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id);


--
-- Name: receipts receipts_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: system_tasks system_tasks_related_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_tasks
    ADD CONSTRAINT system_tasks_related_master_id_masters_id_fk FOREIGN KEY (related_master_id) REFERENCES public.masters(id) ON DELETE SET NULL;


--
-- Name: system_tasks system_tasks_related_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_tasks
    ADD CONSTRAINT system_tasks_related_order_id_orders_id_fk FOREIGN KEY (related_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: transaction_payments transaction_payments_transaction_id_transactions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_transaction_id_transactions_id_fk FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id);


--
-- Name: transactions transactions_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- PostgreSQL database dump complete
--

\unrestrict AFbf5H3HA1CYv9J7chH5UbYmXuj943pNo2R5sHGzI8s96ftFhrPbCOzZgax6JJb

