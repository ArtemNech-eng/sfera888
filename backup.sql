--
-- PostgreSQL database dump
--

\restrict uSbbvjsyaPlLcHnMHOaUlmDeHGVqB977X7aEgR41HEcoWgrv6U7XebvVqDH1weP

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
-- Name: chat_stage; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.chat_stage AS ENUM (
    'new',
    'processing',
    'deciding',
    'on_site',
    'completed',
    'cancelled'
);


ALTER TYPE public.chat_stage OWNER TO postgres;

--
-- Name: dispatch_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.dispatch_status AS ENUM (
    'sent',
    'responded',
    'assigned',
    'rejected'
);


ALTER TYPE public.dispatch_status OWNER TO postgres;

--
-- Name: lead_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.lead_status AS ENUM (
    'new',
    'processing',
    'sent_to_work',
    'non_target',
    'client_refusal'
);


ALTER TYPE public.lead_status OWNER TO postgres;

--
-- Name: master_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.master_status AS ENUM (
    'active',
    'suspended',
    'inactive',
    'pending_contract'
);


ALTER TYPE public.master_status OWNER TO postgres;

--
-- Name: order_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.order_status AS ENUM (
    'waiting_master',
    'master_assigned',
    'in_progress',
    'completed',
    'cancelled',
    'cancellation_requested'
);


ALTER TYPE public.order_status OWNER TO postgres;

--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.payment_status AS ENUM (
    'pending',
    'paid',
    'overdue'
);


ALTER TYPE public.payment_status OWNER TO postgres;

--
-- Name: task_category; Type: TYPE; Schema: public; Owner: postgres
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


ALTER TYPE public.task_category OWNER TO postgres;

--
-- Name: task_priority; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.task_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);


ALTER TYPE public.task_priority OWNER TO postgres;

--
-- Name: task_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.task_status AS ENUM (
    'open',
    'in_progress',
    'done',
    'snoozed'
);


ALTER TYPE public.task_status OWNER TO postgres;

--
-- Name: task_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.task_type AS ENUM (
    'manual',
    'ai_auto'
);


ALTER TYPE public.task_type OWNER TO postgres;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'lead_operator',
    'master_operator'
);


ALTER TYPE public.user_role OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: avito_settings; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.avito_settings OWNER TO postgres;

--
-- Name: avito_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.avito_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.avito_settings_id_seq OWNER TO postgres;

--
-- Name: avito_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.avito_settings_id_seq OWNED BY public.avito_settings.id;


--
-- Name: bot_memory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bot_memory (
    id integer NOT NULL,
    master_id integer,
    category character varying(60) NOT NULL,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bot_memory OWNER TO postgres;

--
-- Name: bot_memory_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.bot_memory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_memory_id_seq OWNER TO postgres;

--
-- Name: bot_memory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.bot_memory_id_seq OWNED BY public.bot_memory.id;


--
-- Name: bot_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bot_sessions (
    id integer NOT NULL,
    bot_type character varying(20) NOT NULL,
    user_id bigint NOT NULL,
    session_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bot_sessions OWNER TO postgres;

--
-- Name: bot_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.bot_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bot_sessions_id_seq OWNER TO postgres;

--
-- Name: bot_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.bot_sessions_id_seq OWNED BY public.bot_sessions.id;


--
-- Name: browser_agent_credentials; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.browser_agent_credentials OWNER TO postgres;

--
-- Name: browser_agent_credentials_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.browser_agent_credentials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.browser_agent_credentials_id_seq OWNER TO postgres;

--
-- Name: browser_agent_credentials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.browser_agent_credentials_id_seq OWNED BY public.browser_agent_credentials.id;


--
-- Name: browser_agent_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.browser_agent_logs (
    id integer NOT NULL,
    session_id text NOT NULL,
    action_type text NOT NULL,
    description text NOT NULL,
    screenshot_b64 text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.browser_agent_logs OWNER TO postgres;

--
-- Name: browser_agent_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.browser_agent_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.browser_agent_logs_id_seq OWNER TO postgres;

--
-- Name: browser_agent_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.browser_agent_logs_id_seq OWNED BY public.browser_agent_logs.id;


--
-- Name: browser_agent_scenarios; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.browser_agent_scenarios OWNER TO postgres;

--
-- Name: browser_agent_scenarios_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.browser_agent_scenarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.browser_agent_scenarios_id_seq OWNER TO postgres;

--
-- Name: browser_agent_scenarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.browser_agent_scenarios_id_seq OWNED BY public.browser_agent_scenarios.id;


--
-- Name: chat_cases; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.chat_cases OWNER TO postgres;

--
-- Name: chat_cases_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.chat_cases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chat_cases_id_seq OWNER TO postgres;

--
-- Name: chat_cases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.chat_cases_id_seq OWNED BY public.chat_cases.id;


--
-- Name: cities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cities (
    id integer NOT NULL,
    name text NOT NULL
);


ALTER TABLE public.cities OWNER TO postgres;

--
-- Name: cities_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.cities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cities_id_seq OWNER TO postgres;

--
-- Name: cities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.cities_id_seq OWNED BY public.cities.id;


--
-- Name: client_support_messages; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.client_support_messages OWNER TO postgres;

--
-- Name: client_support_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.client_support_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.client_support_messages_id_seq OWNER TO postgres;

--
-- Name: client_support_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.client_support_messages_id_seq OWNED BY public.client_support_messages.id;


--
-- Name: dispatcher_followups; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.dispatcher_followups OWNER TO postgres;

--
-- Name: dispatcher_followups_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.dispatcher_followups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dispatcher_followups_id_seq OWNER TO postgres;

--
-- Name: dispatcher_followups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.dispatcher_followups_id_seq OWNED BY public.dispatcher_followups.id;


--
-- Name: fomo_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fomo_events (
    id integer NOT NULL,
    master_id integer NOT NULL,
    event_type text NOT NULL,
    reason text,
    order_id integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.fomo_events OWNER TO postgres;

--
-- Name: fomo_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.fomo_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.fomo_events_id_seq OWNER TO postgres;

--
-- Name: fomo_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.fomo_events_id_seq OWNED BY public.fomo_events.id;


--
-- Name: general_support_messages; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.general_support_messages OWNER TO postgres;

--
-- Name: general_support_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.general_support_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.general_support_messages_id_seq OWNER TO postgres;

--
-- Name: general_support_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.general_support_messages_id_seq OWNED BY public.general_support_messages.id;


--
-- Name: lead_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_events (
    id integer NOT NULL,
    lead_id integer NOT NULL,
    event_type text NOT NULL,
    description text NOT NULL,
    user_alias text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.lead_events OWNER TO postgres;

--
-- Name: lead_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lead_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lead_events_id_seq OWNER TO postgres;

--
-- Name: lead_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lead_events_id_seq OWNED BY public.lead_events.id;


--
-- Name: leads; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.leads OWNER TO postgres;

--
-- Name: leads_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.leads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.leads_id_seq OWNER TO postgres;

--
-- Name: leads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.leads_id_seq OWNED BY public.leads.id;


--
-- Name: master_checkins; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.master_checkins OWNER TO postgres;

--
-- Name: master_checkins_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.master_checkins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.master_checkins_id_seq OWNER TO postgres;

--
-- Name: master_checkins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.master_checkins_id_seq OWNED BY public.master_checkins.id;


--
-- Name: master_messages; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.master_messages OWNER TO postgres;

--
-- Name: master_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.master_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.master_messages_id_seq OWNER TO postgres;

--
-- Name: master_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.master_messages_id_seq OWNED BY public.master_messages.id;


--
-- Name: master_reviews; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.master_reviews OWNER TO postgres;

--
-- Name: master_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.master_reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.master_reviews_id_seq OWNER TO postgres;

--
-- Name: master_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.master_reviews_id_seq OWNED BY public.master_reviews.id;


--
-- Name: master_tasks; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.master_tasks OWNER TO postgres;

--
-- Name: master_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.master_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.master_tasks_id_seq OWNER TO postgres;

--
-- Name: master_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.master_tasks_id_seq OWNED BY public.master_tasks.id;


--
-- Name: masters; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.masters OWNER TO postgres;

--
-- Name: masters_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.masters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.masters_id_seq OWNER TO postgres;

--
-- Name: masters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.masters_id_seq OWNED BY public.masters.id;


--
-- Name: max_bot_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.max_bot_logs (
    id integer NOT NULL,
    master_id integer,
    max_user_id character varying(50),
    event character varying(100) NOT NULL,
    note text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.max_bot_logs OWNER TO postgres;

--
-- Name: max_bot_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.max_bot_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.max_bot_logs_id_seq OWNER TO postgres;

--
-- Name: max_bot_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.max_bot_logs_id_seq OWNED BY public.max_bot_logs.id;


--
-- Name: order_broadcast_waves; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.order_broadcast_waves OWNER TO postgres;

--
-- Name: order_broadcast_waves_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_broadcast_waves_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_broadcast_waves_id_seq OWNER TO postgres;

--
-- Name: order_broadcast_waves_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_broadcast_waves_id_seq OWNED BY public.order_broadcast_waves.id;


--
-- Name: order_dispatches; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.order_dispatches OWNER TO postgres;

--
-- Name: order_dispatches_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_dispatches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_dispatches_id_seq OWNER TO postgres;

--
-- Name: order_dispatches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_dispatches_id_seq OWNED BY public.order_dispatches.id;


--
-- Name: order_status_logs; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.order_status_logs OWNER TO postgres;

--
-- Name: order_status_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_status_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_status_logs_id_seq OWNER TO postgres;

--
-- Name: order_status_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_status_logs_id_seq OWNED BY public.order_status_logs.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_id_seq OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.push_subscriptions (
    id integer NOT NULL,
    master_id integer NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.push_subscriptions OWNER TO postgres;

--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.push_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.push_subscriptions_id_seq OWNER TO postgres;

--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.push_subscriptions_id_seq OWNED BY public.push_subscriptions.id;


--
-- Name: receipts; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.receipts OWNER TO postgres;

--
-- Name: receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.receipts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.receipts_id_seq OWNER TO postgres;

--
-- Name: receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.receipts_id_seq OWNED BY public.receipts.id;


--
-- Name: scenario_notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scenario_notifications (
    id integer NOT NULL,
    scenario_id character varying(64) NOT NULL,
    order_id integer NOT NULL,
    master_id integer NOT NULL,
    tier character varying(32) NOT NULL,
    sent_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.scenario_notifications OWNER TO postgres;

--
-- Name: scenario_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.scenario_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.scenario_notifications_id_seq OWNER TO postgres;

--
-- Name: scenario_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.scenario_notifications_id_seq OWNED BY public.scenario_notifications.id;


--
-- Name: scenario_runs; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.scenario_runs OWNER TO postgres;

--
-- Name: scenario_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.scenario_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.scenario_runs_id_seq OWNER TO postgres;

--
-- Name: scenario_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.scenario_runs_id_seq OWNED BY public.scenario_runs.id;


--
-- Name: scenario_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scenario_settings (
    scenario text NOT NULL,
    auto_enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.scenario_settings OWNER TO postgres;

--
-- Name: service_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.service_types (
    id integer NOT NULL,
    name text NOT NULL
);


ALTER TABLE public.service_types OWNER TO postgres;

--
-- Name: service_types_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.service_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.service_types_id_seq OWNER TO postgres;

--
-- Name: service_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.service_types_id_seq OWNED BY public.service_types.id;


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.system_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.system_settings OWNER TO postgres;

--
-- Name: system_tasks; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.system_tasks OWNER TO postgres;

--
-- Name: system_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.system_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.system_tasks_id_seq OWNER TO postgres;

--
-- Name: system_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.system_tasks_id_seq OWNED BY public.system_tasks.id;


--
-- Name: telegram_chats; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.telegram_chats OWNER TO postgres;

--
-- Name: telegram_chats_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.telegram_chats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.telegram_chats_id_seq OWNER TO postgres;

--
-- Name: telegram_chats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.telegram_chats_id_seq OWNED BY public.telegram_chats.id;


--
-- Name: telegram_messages; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.telegram_messages OWNER TO postgres;

--
-- Name: telegram_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.telegram_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.telegram_messages_id_seq OWNER TO postgres;

--
-- Name: telegram_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.telegram_messages_id_seq OWNED BY public.telegram_messages.id;


--
-- Name: transaction_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transaction_payments (
    id integer NOT NULL,
    transaction_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    note text,
    paid_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.transaction_payments OWNER TO postgres;

--
-- Name: transaction_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.transaction_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.transaction_payments_id_seq OWNER TO postgres;

--
-- Name: transaction_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.transaction_payments_id_seq OWNED BY public.transaction_payments.id;


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.transactions OWNER TO postgres;

--
-- Name: transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.transactions_id_seq OWNER TO postgres;

--
-- Name: transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.transactions_id_seq OWNED BY public.transactions.id;


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_sessions (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


ALTER TABLE public.user_sessions OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: voronka_columns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.voronka_columns (
    id integer NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    receives_orders boolean DEFAULT false NOT NULL,
    color text DEFAULT 'blue'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.voronka_columns OWNER TO postgres;

--
-- Name: voronka_columns_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.voronka_columns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.voronka_columns_id_seq OWNER TO postgres;

--
-- Name: voronka_columns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.voronka_columns_id_seq OWNED BY public.voronka_columns.id;


--
-- Name: avito_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.avito_settings ALTER COLUMN id SET DEFAULT nextval('public.avito_settings_id_seq'::regclass);


--
-- Name: bot_memory id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bot_memory ALTER COLUMN id SET DEFAULT nextval('public.bot_memory_id_seq'::regclass);


--
-- Name: bot_sessions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bot_sessions ALTER COLUMN id SET DEFAULT nextval('public.bot_sessions_id_seq'::regclass);


--
-- Name: browser_agent_credentials id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.browser_agent_credentials ALTER COLUMN id SET DEFAULT nextval('public.browser_agent_credentials_id_seq'::regclass);


--
-- Name: browser_agent_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.browser_agent_logs ALTER COLUMN id SET DEFAULT nextval('public.browser_agent_logs_id_seq'::regclass);


--
-- Name: browser_agent_scenarios id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.browser_agent_scenarios ALTER COLUMN id SET DEFAULT nextval('public.browser_agent_scenarios_id_seq'::regclass);


--
-- Name: chat_cases id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_cases ALTER COLUMN id SET DEFAULT nextval('public.chat_cases_id_seq'::regclass);


--
-- Name: cities id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cities ALTER COLUMN id SET DEFAULT nextval('public.cities_id_seq'::regclass);


--
-- Name: client_support_messages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_support_messages ALTER COLUMN id SET DEFAULT nextval('public.client_support_messages_id_seq'::regclass);


--
-- Name: dispatcher_followups id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dispatcher_followups ALTER COLUMN id SET DEFAULT nextval('public.dispatcher_followups_id_seq'::regclass);


--
-- Name: fomo_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fomo_events ALTER COLUMN id SET DEFAULT nextval('public.fomo_events_id_seq'::regclass);


--
-- Name: general_support_messages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.general_support_messages ALTER COLUMN id SET DEFAULT nextval('public.general_support_messages_id_seq'::regclass);


--
-- Name: lead_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_events ALTER COLUMN id SET DEFAULT nextval('public.lead_events_id_seq'::regclass);


--
-- Name: leads id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leads ALTER COLUMN id SET DEFAULT nextval('public.leads_id_seq'::regclass);


--
-- Name: master_checkins id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.master_checkins ALTER COLUMN id SET DEFAULT nextval('public.master_checkins_id_seq'::regclass);


--
-- Name: master_messages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.master_messages ALTER COLUMN id SET DEFAULT nextval('public.master_messages_id_seq'::regclass);


--
-- Name: master_reviews id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.master_reviews ALTER COLUMN id SET DEFAULT nextval('public.master_reviews_id_seq'::regclass);


--
-- Name: master_tasks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.master_tasks ALTER COLUMN id SET DEFAULT nextval('public.master_tasks_id_seq'::regclass);


--
-- Name: masters id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters ALTER COLUMN id SET DEFAULT nextval('public.masters_id_seq'::regclass);


--
-- Name: max_bot_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.max_bot_logs ALTER COLUMN id SET DEFAULT nextval('public.max_bot_logs_id_seq'::regclass);


--
-- Name: order_broadcast_waves id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_broadcast_waves ALTER COLUMN id SET DEFAULT nextval('public.order_broadcast_waves_id_seq'::regclass);


--
-- Name: order_dispatches id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_dispatches ALTER COLUMN id SET DEFAULT nextval('public.order_dispatches_id_seq'::regclass);


--
-- Name: order_status_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_status_logs ALTER COLUMN id SET DEFAULT nextval('public.order_status_logs_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: push_subscriptions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.push_subscriptions_id_seq'::regclass);


--
-- Name: receipts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts ALTER COLUMN id SET DEFAULT nextval('public.receipts_id_seq'::regclass);


--
-- Name: scenario_notifications id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scenario_notifications ALTER COLUMN id SET DEFAULT nextval('public.scenario_notifications_id_seq'::regclass);


--
-- Name: scenario_runs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scenario_runs ALTER COLUMN id SET DEFAULT nextval('public.scenario_runs_id_seq'::regclass);


--
-- Name: service_types id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_types ALTER COLUMN id SET DEFAULT nextval('public.service_types_id_seq'::regclass);


--
-- Name: system_tasks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_tasks ALTER COLUMN id SET DEFAULT nextval('public.system_tasks_id_seq'::regclass);


--
-- Name: telegram_chats id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.telegram_chats ALTER COLUMN id SET DEFAULT nextval('public.telegram_chats_id_seq'::regclass);


--
-- Name: telegram_messages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.telegram_messages ALTER COLUMN id SET DEFAULT nextval('public.telegram_messages_id_seq'::regclass);


--
-- Name: transaction_payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_payments ALTER COLUMN id SET DEFAULT nextval('public.transaction_payments_id_seq'::regclass);


--
-- Name: transactions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions ALTER COLUMN id SET DEFAULT nextval('public.transactions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: voronka_columns id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.voronka_columns ALTER COLUMN id SET DEFAULT nextval('public.voronka_columns_id_seq'::regclass);


--
-- Data for Name: avito_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.avito_settings (id, client_id, client_secret, access_token, token_expires_at, avito_user_id, avito_user_name, enabled, created_at, updated_at, refresh_token, auth_type, advance_balance, advance_balance_updated_at) FROM stdin;
1	brxMsT2cgSZ7R6qVoISQ	OauLlX9ZOr07BzKVNvuA0xYur3rJ0aFNAhT923Xh	\N	\N	\N	\N	f	2026-04-13 13:06:43.240583	2026-04-13 13:30:22.192	\N	client_credentials	0	\N
\.


--
-- Data for Name: bot_memory; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bot_memory (id, master_id, category, content, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: bot_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bot_sessions (id, bot_type, user_id, session_data, updated_at) FROM stdin;
\.


--
-- Data for Name: browser_agent_credentials; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.browser_agent_credentials (id, site, login, password_enc, cookies, last_login_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: browser_agent_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.browser_agent_logs (id, session_id, action_type, description, screenshot_b64, created_at) FROM stdin;
\.


--
-- Data for Name: browser_agent_scenarios; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.browser_agent_scenarios (id, name, description, task_template, icon, color, run_count, last_run_at, created_at, updated_at) FROM stdin;
1	Проверить сообщения на Авито	Авторизоваться и прочитать последние диалоги	Зайди на avito.ru, авторизуйся используя сохранённые учётные данные для avito.ru, открой раздел «Сообщения» и покажи последние 5 диалогов — с кем переписка, что спрашивают.	message	blue	0	\N	2026-04-07 17:28:14.95091	2026-04-07 17:28:14.95091
2	Написать конкурентам на Авито	Найти конкурентов по ремонту и написать им	Зайди на avito.ru, найди объявления по запросу «ремонт квартиры» в Краснодаре. Открой первые 3 объявления конкурентов и напиши каждому: «Здравствуйте! Рассматриваете ли вы сотрудничество или партнёрство?»	users	orange	0	\N	2026-04-07 17:28:14.998853	2026-04-07 17:28:14.998853
3	Мониторинг цен конкурентов	Проверить расценки на укладку плитки в городе	Зайди на avito.ru, найди объявления «укладка плитки» в Краснодаре. Посмотри цены первых 5 объявлений и составь краткий отчёт: минимальная цена, максимальная цена, средняя цена за м².	chart	green	0	\N	2026-04-07 17:28:15.00233	2026-04-07 17:28:15.00233
4	Разместить объявление	Создать новое объявление на Авито	Зайди на avito.ru, авторизуйся используя сохранённые данные для avito.ru. Нажми «Разместить объявление», выбери категорию «Ремонт и строительство → Отделочные работы». Заполни: заголовок «Укладка плитки профессионально», описание «Профессиональная укладка плитки. Опыт 10 лет. Гарантия качества. Бесплатный замер», цена «от 800 руб за м²». Нажми «Опубликовать».	plus	purple	0	\N	2026-04-07 17:28:15.005893	2026-04-07 17:28:15.005893
5	Проверить объявления	Посмотреть статистику своих объявлений	Зайди на avito.ru, авторизуйся используя сохранённые данные. Открой раздел «Мои объявления». Запиши количество просмотров и звонков по каждому активному объявлению.	eye	teal	0	\N	2026-04-07 17:28:15.009119	2026-04-07 17:28:15.009119
6	Найти и заказать билеты	Найти билеты на конкретный маршрут	Зайди на rzd.ru (РЖД) и найди билеты на поезд из [откуда] в [куда] на [дата]. Покажи доступные варианты с ценами и временем отправления.	train	red	0	\N	2026-04-07 17:28:15.011885	2026-04-07 17:28:15.011885
\.


--
-- Data for Name: chat_cases; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.chat_cases (id, order_id, master_id, city, district, service_type, order_status, current_stage, risk_level, risk_reason, summary, next_action, next_action_deadline, last_master_message_at, last_ai_message_at, hours_without_contact, hours_without_estimate, hours_without_payment, expected_revenue, expected_commission, tags, confidence, is_resolved, resolved_until, is_archived, created_at, updated_at) FROM stdin;
1	11	12	Краснодар	Сормовская	Натяжные потолки	master_assigned	assigned	red	Заказ завис > 14 дней	Мастер Краснодар назначен 969ч назад. Риск: критический — Заказ завис > 14 дней.	no_action	\N	\N	\N	0.00	0.00	0.00	\N	\N	{}	high	f	\N	f	2026-04-17 08:49:17.458	2026-04-24 10:01:53.758
2	13	54	Москва	Центральный	Укладка плитки	master_assigned	assigned	red	Заказ завис > 14 дней	Мастер Тест назначен 1060ч назад. Риск: критический — Заказ завис > 14 дней.	no_action	\N	\N	\N	0.00	0.00	0.00	\N	600.00	{}	high	f	\N	f	2026-04-17 08:49:17.458	2026-04-30 06:36:54.317
\.


--
-- Data for Name: cities; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cities (id, name) FROM stdin;
1	Москва
2	Санкт-Петербург
3	Екатеринбург
4	Новосибирск
5	Краснодар
\.


--
-- Data for Name: client_support_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.client_support_messages (id, receipt_token, message, from_client, operator_name, created_at, seen_at) FROM stdin;
1	design-preview-token-2024	Добрый день! Хотел уточнить по смете.	t	\N	2026-03-28 21:05:34.389794	\N
\.


--
-- Data for Name: dispatcher_followups; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.dispatcher_followups (id, master_id, order_id, followup_at, question, context, sent, created_at) FROM stdin;
\.


--
-- Data for Name: fomo_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.fomo_events (id, master_id, event_type, reason, order_id, created_at) FROM stdin;
\.


--
-- Data for Name: general_support_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.general_support_messages (id, client_phone, client_name, message, from_client, operator_name, created_at, seen_at) FROM stdin;
\.


--
-- Data for Name: lead_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.lead_events (id, lead_id, event_type, description, user_alias, created_at) FROM stdin;
\.


--
-- Data for Name: leads; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.leads (id, client_name, client_phone, city, district, service_type, area, scheduled_at, comment, source, status, created_at, updated_at, services, photos, deleted_at, cancellation_reason, status_updated_at, avito_item_id, avito_item_title) FROM stdin;
11	Иван	+79892860863	Краснодар	Сормовская	Натяжные потолки	100.00	\N		\N	sent_to_work	2026-03-15 01:02:59.560934	2026-03-15 01:03:04.438	[{"type":"Натяжные потолки","area":100,"pricePerM2":300}]	\N	\N	\N	\N	\N	\N
48	Клиент Тест	79991234567	Москва	Центральный	Укладка плитки	45.00	\N	\N	\N	new	2026-03-17 02:58:07.395056	2026-03-17 02:58:07.395056	\N	\N	\N	\N	\N	\N	\N
49	Клиент2	79991234568	Москва	Южный	Поклейка обоев	30.00	\N	\N	\N	new	2026-03-17 03:10:11.498971	2026-03-17 03:10:11.498971	\N	\N	\N	\N	\N	\N	\N
50	Клиент3	79991234569	СПб	Невский	Штукатурка стен	60.00	\N	\N	\N	new	2026-03-17 08:26:34.103797	2026-03-17 08:26:34.103797	\N	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: master_checkins; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.master_checkins (id, master_id, date, is_available, responded_at, created_at, reason) FROM stdin;
\.


--
-- Data for Name: master_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.master_messages (id, master_id, telegram_chat_id, text, from_master, sender_name, is_read, created_at, photo_url, edited_at, telegram_message_id, max_mid) FROM stdin;
33	12	7260307561	🆕 Начало регистрации через Telegram-бот	f	system	t	2026-03-14 23:21:11.770707	\N	\N	\N	\N
34	12	7260307561	✏️ Имя: Краснодар	f	system	t	2026-03-14 23:22:06.665297	\N	\N	\N	\N
35	12	7260307561	🏙️ Город: Краснодар	f	system	t	2026-03-14 23:23:01.719346	\N	\N	\N	\N
36	12	7260307561	🔧 Специальности: Монтаж ламината, Поклейка обоев, Покраска стен	f	system	t	2026-03-14 23:23:29.648148	\N	\N	\N	\N
37	12	7260307561	📱 Телефон: 89892860863	f	system	t	2026-03-14 23:24:02.283174	\N	\N	\N	\N
38	12	7260307561	📸 Фото профиля загружено	f	system	t	2026-03-14 23:25:09.397003	\N	\N	\N	\N
39	12	7260307561	📝 Договор отправлен на подписание	f	system	t	2026-03-14 23:25:09.538752	\N	\N	\N	\N
40	12	7260307561	🙋 Откликнулся на заявку #11	f	system	t	2026-03-15 10:34:23.783544	\N	\N	\N	\N
41	12	7260307561	Сегодня сможете посмотреть?	f	Администратор	t	2026-03-15 10:34:52.174937	\N	\N	\N	\N
55	14	5903117133	Как получить заказ?	t	Александр	t	2026-03-15 11:53:37.502725	\N	\N	\N	\N
43	12	7260307561	✅ Назначен на заявку #11	f	system	t	2026-03-15 10:35:23.370523	\N	\N	\N	\N
57	14	5903117133	Я всё прошёл, что ещё нужно сделать?	t	Александр	t	2026-03-15 12:46:18.920141	\N	\N	\N	\N
59	14	5903117133	Фото выслал ни как не загружается	t	Александр	t	2026-03-15 12:47:58.7097	\N	\N	\N	\N
62	12	7260307561	?	f	Администратор	t	2026-03-15 17:51:51.594646	\N	\N	\N	\N
77	54	pwa_54	🙋 Откликнулся на заявку #15 (Штукатурка стен, СПб, Невский)	t	Тест	f	2026-03-17 08:26:34.208737	\N	\N	\N	\N
63	15	1879917284	🆕 Начало регистрации через Telegram-бот	f	system	t	2026-03-16 10:29:27.457937	\N	\N	\N	\N
64	15	1879917284	✏️ Имя: Геннадий	f	system	t	2026-03-16 10:29:42.681859	\N	\N	\N	\N
58	14	5903117133	Фото еще, до договора, договор уже есть	f	Администратор	t	2026-03-15 12:47:15.547174	\N	\N	\N	\N
78	15	1879917284	Тест рассылки — это тестовое сообщение	f	📢 Администратор	t	2026-03-28 10:49:01.23014	\N	\N	\N	\N
44	13	330645502	🆕 Начало регистрации через Telegram-бот	f	system	t	2026-03-15 11:04:14.148288	\N	\N	\N	\N
45	13	330645502	🔧 Специальности: Поклейка обоев, Монтаж ламината, Покраска стен, Штукатурка стен, Комплексный ремонт	f	system	t	2026-03-15 11:06:27.503728	\N	\N	\N	\N
46	13	330645502	📱 Телефон: +79184207679	f	system	t	2026-03-15 11:07:00.075753	\N	\N	\N	\N
47	13	330645502	📸 Фото профиля загружено	f	system	t	2026-03-15 11:09:26.468507	\N	\N	\N	\N
48	13	330645502	📝 Договор отправлен на подписание	f	system	t	2026-03-15 11:09:26.610381	\N	\N	\N	\N
49	13	330645502	🏙️ Город: Краснодар	f	system	t	2026-03-15 11:11:15.97088	\N	\N	\N	\N
50	14	5903117133	🆕 Начало регистрации через Telegram-бот	f	system	t	2026-03-15 11:42:20.60795	\N	\N	\N	\N
51	14	5903117133	✏️ Имя: Александр	f	system	t	2026-03-15 11:42:40.58397	\N	\N	\N	\N
52	14	5903117133	🏙️ Город: Краснодар	f	system	t	2026-03-15 11:43:26.952654	\N	\N	\N	\N
53	14	5903117133	🔧 Специальности: Поклейка обоев, Монтаж ламината, Покраска стен, Штукатурка стен	f	system	t	2026-03-15 11:44:41.073128	\N	\N	\N	\N
54	14	5903117133	📱 Телефон: +79530892393	f	system	t	2026-03-15 11:45:22.859727	\N	\N	\N	\N
65	15	1879917284	🏙️ Город: Краснодар	f	system	t	2026-03-16 10:29:52.227966	\N	\N	\N	\N
66	15	1879917284	🔧 Специальности: Укладка плитки, Покраска стен, Штукатурка стен, Монтаж ламината	f	system	t	2026-03-16 10:31:19.127889	\N	\N	\N	\N
67	15	1879917284	📱 Телефон: 89282858426	f	system	t	2026-03-16 10:31:48.696076	\N	\N	\N	\N
68	15	1879917284	📸 Фото профиля загружено	f	system	t	2026-03-16 10:33:38.790621	\N	\N	\N	\N
60	14	5903117133	Видимо грузится, телеграмм такой. Плохо ловит.	f	Администратор	t	2026-03-15 12:50:13.292323	\N	\N	\N	\N
56	14	5903117133	Пройти регистрацию в боте до конца	f	Администратор	t	2026-03-15 12:45:14.33305	\N	\N	\N	\N
61	14	5903117133	Попробуйте еще раз фото загрузить	f	Администратор	t	2026-03-15 12:55:47.336052	\N	\N	\N	\N
69	15	1879917284	📝 Договор отправлен на подписание	f	system	t	2026-03-16 10:33:38.928634	\N	\N	\N	\N
71	13	330645502		t	Евгений Белоус	t	2026-03-16 12:02:29.82164	/api/tg-file/AgACAgIAAxkBAAO8abaTZdbVwnNJ4vavzBwL7Z2GJLIAAoEWaxtE17hJCPVHBgr1260BAAMCAAN5AAM6BA	\N	\N	\N
70	15	1879917284	🤝	t	Геннадий	t	2026-03-16 10:52:59.129997	\N	\N	\N	\N
74	16	pwa_16	Здравствуйте, у меня вопрос по заказу!	t	Тест Мастер	t	2026-03-16 21:24:03.070518	\N	\N	\N	\N
79	14	5903117133	Тест рассылки — это тестовое сообщение	f	📢 Администратор	t	2026-03-28 10:49:01.240734	\N	\N	\N	\N
80	16	pwa_16	Тест рассылки — это тестовое сообщение	f	📢 Администратор	t	2026-03-28 10:49:01.241057	\N	\N	\N	\N
42	12	7260307561	Да	t	Краснодар	t	2026-03-15 10:35:13.898645	\N	\N	\N	\N
75	12	7260307561	Есть объекты?	t	Краснодар	t	2026-03-16 22:00:48.120771	\N	\N	\N	\N
72	12	7260307561	Привет, Артём	f	Администратор	t	2026-03-16 19:57:37.295385	\N	2026-03-16 19:57:56.433	\N	\N
76	54	pwa_54	🙋 Откликнулся на заявку #14 (Поклейка обоев, Москва, Южный)	t	Тест	f	2026-03-17 03:10:22.527461	\N	\N	\N	\N
81	13	330645502	Тест рассылки — это тестовое сообщение	f	📢 Администратор	t	2026-03-28 10:49:01.241059	\N	\N	\N	\N
82	54	pwa_54	Тест рассылки — это тестовое сообщение	f	📢 Администратор	t	2026-03-28 10:49:01.242603	\N	\N	\N	\N
83	12	7260307561	Тест рассылки — это тестовое сообщение	f	📢 Администратор	t	2026-03-28 10:49:01.242761	\N	\N	\N	\N
84	16	pwa_16	Тест по городу	f	📢 Администратор	t	2026-03-28 10:49:08.992714	\N	\N	\N	\N
85	54	pwa_54	Тест по городу	f	📢 Администратор	t	2026-03-28 10:49:08.992876	\N	\N	\N	\N
73	12	7260307561	Привет, )))	f	Администратор	t	2026-03-16 20:02:30.851407	\N	2026-03-16 20:02:40.759	266	\N
\.


--
-- Data for Name: master_reviews; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.master_reviews (id, master_id, order_id, sentiment, text, created_by, created_at) FROM stdin;
1	12	\N	positive	Всё хорошо	Администратор	2026-03-16 19:43:11.112885
\.


--
-- Data for Name: master_tasks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.master_tasks (id, master_id, text, due_at, is_completed, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: masters; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.masters (id, alias, city, specialization, telegram_id, phone, status, rating, total_orders, accepted_orders, avg_response_time, debt, created_at, voronka_column_id, is_test_master, specializations, tags, custom_avatar_url, contract_link, deleted_at, pwa_login, pwa_password_hash, working_hours, preferred_districts, min_area, contract_signed_at, contract_sign_ip, passport_photo_url, passport_verified, passport_verify_note, contract_full_name, contract_passport_number, contract_passport_date, contract_passport_issuer, contract_address, last_seen_at, passport_reg_photo_url, max_chat_id, service_prices, total_leads_received, suspended_at, suspension_reason, fomo_disabled, max_active_orders, consecutive_cancellations, blocked_from_orders, blocked_at, blocked_reason, last_cancel_at, last_completed_at, manual_unblocks_count) FROM stdin;
12	Краснодар	Краснодар	Монтаж ламината, Поклейка обоев, Покраска стен	7260307561	89892860863	active	5.00	1	1	\N	0.00	2026-03-14 23:21:11.766885	2	t	{"Монтаж ламината","Поклейка обоев","Покраска стен"}	{}	/api/tg-file/AgACAgIAAxUAAWm05WX6dS6C7BbDBglfAAGOaEnvCwACYO8xG9QkiEsu5isoSWqAngEAAwIAA2MAAzoE	\N	\N	admin	$2b$10$GmB/c6b4URbJFFLLy7E9o.D9NaJDULz4iHDoU1lXDvQjScn9uT83C	\N	{}	0	\N	\N	\N	t	\N	\N	\N	\N	\N	\N	2026-04-22 10:33:29.736	\N	\N	\N	1	\N	\N	f	1	0	f	\N	\N	\N	\N	0
15	Геннадий	Краснодар	Укладка плитки, Покраска стен, Штукатурка стен, Монтаж ламината	1879917284	89282858426	active	3.00	0	0	\N	0.00	2026-03-16 10:29:27.326126	2	t	{"Укладка плитки","Покраска стен","Штукатурка стен","Монтаж ламината"}	{}	/api/tg-file/AgACAgIAAxUAAWm378TJDYILa62iR3z8NJgrGGg-AAJX4DEbReNYSvJqH-JvwcmvAQADAgADYwADOgQ	\N	\N	79282858426	$2b$10$AeQTxUHgOL8/8HD5hM8o4uF8LyAE2TCBJFgL1oViFzbwhzJnyC0Z2	\N	{}	0	\N	\N	\N	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N	\N	f	1	0	f	\N	\N	\N	\N	0
13	Евгений Белоус	Краснодар	Поклейка обоев, Монтаж ламината, Покраска стен, Штукатурка стен, Комплексный ремонт	330645502	+79184207679	active	3.00	0	0	\N	0.00	2026-03-15 11:04:13.964965	2	t	{"Поклейка обоев","Монтаж ламината","Покраска стен","Штукатурка стен","Комплексный ремонт"}	{}	\N	\N	\N	79184207679	$2b$10$v9Ie9LnR.4c4Ux0/CWtknuEXIy6tnNldAxf9UYvRhYzx4m.4W3JeS	\N	{}	0	\N	\N	\N	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N	\N	f	1	0	f	\N	\N	\N	\N	0
14	Александр	Краснодар	Поклейка обоев, Монтаж ламината, Покраска стен, Штукатурка стен	5903117133	+79530892393	active	3.00	0	0	\N	0.00	2026-03-15 11:42:20.583956	1	t	{"Поклейка обоев","Монтаж ламината","Покраска стен","Штукатурка стен"}	{}	\N	\N	\N	79530892393	$2b$10$wCpbb6j6R47szo2DqTX/2eU4Y6HIQ/IHzfSX36T80asJ0m2Ubao4q	\N	{}	0	\N	\N	\N	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N	\N	f	1	0	f	\N	\N	\N	\N	0
16	Тест Мастер	Москва	Ремонт бытовой техники	\N	+7 999 000-00-00	active	3.00	0	0	\N	0.00	2026-03-16 21:23:57.434502	1	t	{"Ремонт бытовой техники"}	{}	\N	\N	\N	79990000000	$2b$10$3Ja4TviMA.v8OdwZjqWAT.XtCmXN7m7UAmu0NANwZtZKksfoEtq2G	\N	{}	0	\N	\N	\N	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N	\N	f	1	0	f	\N	\N	\N	\N	0
54	Тест	Москва	Укладка плитки	\N	\N	active	5.00	1	1	\N	0.00	2026-03-17 02:56:17.075837	3	f	{"Укладка плитки"}	{}	\N	\N	\N	testmaster	$2b$10$w/ZYywz5274IohVJyAiF6.s9xRfnwUT8vZLQ7h6BcYI2hwfT3euk.	\N	{}	0	\N	\N	\N	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	3	\N	\N	f	1	0	f	\N	\N	\N	\N	0
\.


--
-- Data for Name: max_bot_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.max_bot_logs (id, master_id, max_user_id, event, note, created_at) FROM stdin;
\.


--
-- Data for Name: order_broadcast_waves; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_broadcast_waves (id, order_id, current_wave, wave_1_sent_at, wave_2_sent_at, wave_3_sent_at, wave_4_sent_at, admin_alerted_at, wave_1_count, wave_2_count, wave_3_count, wave_4_count, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: order_dispatches; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_dispatches (id, order_id, master_id, telegram_chat_id, telegram_message_id, status, created_at, responded_at, rejection_reason, response_note) FROM stdin;
37	11	12	7260307561	175	assigned	2026-03-15 10:33:55.360761	2026-03-15 10:34:23.287	\N	\N
38	13	54	pwa_54	\N	assigned	2026-03-17 02:58:07.395056	2026-03-17 03:01:06.977	\N	\N
40	15	54	pwa_54	\N	responded	2026-03-17 08:26:34.103797	2026-03-17 08:26:34.204	\N	\N
39	14	54	pwa_54	\N	rejected	2026-03-17 03:10:11.498971	2026-03-17 03:10:22.523	\N	\N
\.


--
-- Data for Name: order_status_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_status_logs (id, order_id, old_status, new_status, user_id, user_alias, note, created_at) FROM stdin;
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (id, lead_id, city, district, service_type, area, scheduled_at, comment, status, master_id, order_amount, commission, client_rating, created_at, updated_at, dispatch_status, proposed_amount, cancel_reason, services, deleted_at, master_work_status, photos_before, photos_after, photo_act, operator_note, assigned_at, completed_at, cancel_type, broadcast_count, last_broadcast_at, response_window_close_at, dispatch_wave, avito_lead_id, avito_chat_id, client_name, client_phone, rooms_count, prepayment_amount, prepayment_deducted, client_review, reviewed_at, master_comment, photos, source) FROM stdin;
13	48	Москва	Центральный	Укладка плитки	45.00	\N	\N	master_assigned	54	\N	600.00	\N	2026-03-17 02:58:07.395056	2026-03-17 10:51:08.080198	assigned	\N	\N	\N	\N	accepted	{}	{}	\N	\N	\N	\N	\N	0	\N	\N	1	\N	\N	\N	\N	\N	0.00	f	\N	\N	\N	\N	crm
14	49	Москва	Южный	Поклейка обоев	30.00	\N	\N	cancelled	\N	\N	\N	\N	2026-03-17 03:10:11.498971	2026-03-23 12:57:34.530314	none	\N	\N	\N	\N	\N	{}	{}	\N	\N	\N	\N	\N	0	\N	\N	1	\N	\N	\N	\N	\N	0.00	f	\N	\N	\N	\N	crm
15	50	СПб	Невский	Штукатурка стен	60.00	\N	\N	cancelled	\N	\N	\N	\N	2026-03-17 08:26:34.103797	2026-04-12 09:33:23.397	dispatching	\N	Мастер не найден в течение 48 часов — заказ закрыт автоматически	\N	\N	\N	{}	{}	\N	\N	\N	\N	no_master_found	0	\N	\N	1	\N	\N	\N	\N	\N	0.00	f	\N	\N	\N	\N	crm
11	11	Краснодар	Сормовская	Натяжные потолки	100.00	\N		cancelled	\N	\N	\N	\N	2026-03-15 01:03:04.442693	2026-04-29 14:59:05.505	assigned	\N	Мастер не найден в течение 48 часов — заказ закрыт автоматически	[{"type":"Натяжные потолки","area":100,"pricePerM2":300}]	\N	completed	{}	{}	\N	\N	\N	\N	no_master_found	0	\N	\N	1	\N	\N	\N	\N	\N	0.00	f	\N	\N	\N	\N	crm
\.


--
-- Data for Name: push_subscriptions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.push_subscriptions (id, master_id, endpoint, p256dh, auth, created_at) FROM stdin;
\.


--
-- Data for Name: receipts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.receipts (id, token, order_id, master_id, client_name, client_phone, service_type, city, district, prepayment_amount, notes, created_at, total_amount, line_items, client_submitted_name, prepayment_submitted_at, prepayment_screenshot_url, prepayment_seen_at) FROM stdin;
4	design-preview-token-2024	15	15	Иванов Иван Иванович	+7 (999) 123-45-67	Укладка ламината	Ставрополь	Промышленный район	5000.00	Материал клиента. Работы выполняются с 9:00 до 18:00.	2026-03-28 19:45:50.596185	18500.00	[{"price": 3000, "description": "Демонтаж старого покрытия"}, {"price": 13500, "description": "Укладка ламината 32 кл, 45 м²"}, {"price": 2000, "description": "Установка плинтуса"}]	\N	\N	\N	\N
\.


--
-- Data for Name: scenario_notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.scenario_notifications (id, scenario_id, order_id, master_id, tier, sent_at) FROM stdin;
\.


--
-- Data for Name: scenario_runs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.scenario_runs (id, scenario, run_type, status, summary, error_text, duration_ms, created_at) FROM stdin;
1	broadcast-orders	manual	success	{"newOrders": 0, "totalSent": 0, "adminAlerts": 0, "totalOrders": 0, "wavesAdvanced": 0}	\N	10	2026-04-14 16:01:11.396091
2	broadcast-orders	manual	success	{"newOrders": 0, "totalSent": 0, "adminAlerts": 0, "totalOrders": 0, "wavesAdvanced": 0}	\N	1	2026-04-14 16:01:15.271828
3	broadcast-orders	manual	success	{"newOrders": 0, "totalSent": 0, "adminAlerts": 0, "totalOrders": 0}	\N	2	2026-04-14 16:08:06.037532
4	broadcast-orders	manual	success	{"newOrders": 0, "totalSent": 0, "adminAlerts": 0, "totalOrders": 0}	\N	11	2026-04-14 16:13:40.324214
\.


--
-- Data for Name: scenario_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.scenario_settings (scenario, auto_enabled, updated_at) FROM stdin;
\.


--
-- Data for Name: service_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.service_types (id, name) FROM stdin;
1	Укладка плитки
2	Поклейка обоев
3	Покраска стен
4	Монтаж ламината
5	Штукатурка стен
6	Электромонтаж
7	Сантехника
8	Натяжные потолки
9	Комплексный ремонт
11	Шпаклёвка стен и потолков
12	Монтаж гипсокартона
13	Демонтажные работы
14	Монтаж межкомнатных дверей
15	Монтаж напольных покрытий
16	Монтаж тёплого пола
17	Звукоизоляция
18	Отделка балкона и лоджии
19	Монтаж кухни
20	Черновая отделка
21	Чистовая отделка
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.system_settings (key, value, updated_at) FROM stdin;
commission_tier1_threshold	50000	2026-03-14 15:06:20.348
commission_tier1_fixed	5000	2026-03-14 15:06:20.384
commission_tier2_threshold	100000	2026-03-14 15:06:20.389
commission_tier2_pct	15	2026-03-14 15:06:20.392
commission_tier3_pct	20	2026-03-14 15:06:20.396
assignment_mode	auto	2026-04-10 23:05:56.194
checkin_last_broadcast_date	2026-04-30	2026-04-30 06:01:54.801
\.


--
-- Data for Name: system_tasks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.system_tasks (id, title, description, type, status, priority, category, assigned_to, related_master_id, related_order_id, due_at, completed_at, completed_by, ai_reason, created_by, created_at, updated_at) FROM stdin;
1	Позвонить мастеру Сергею	Уточнить статус заказа #42	manual	open	high	followup	\N	\N	\N	\N	\N	\N	\N	admin	2026-03-15 00:16:59.357228	2026-03-15 00:22:11.43
5	Подозрение на занижение суммы заказа #12	Площадь 85м², ожидаемая сумма ~70000₽, мастер указал 30000₽	manual	open	urgent	amount_check	\N	\N	\N	2026-03-18 09:00:00	\N	\N	\N	admin	2026-03-15 00:26:04.861898	2026-03-15 00:26:04.861
6	Обновить рейтинг мастера Сергея	\N	manual	open	low	rating	\N	\N	\N	2026-03-20 11:00:00	\N	\N	\N	admin	2026-03-15 00:26:04.910227	2026-03-15 00:26:04.909
3	Напомнить об оплате комиссии	\N	manual	open	high	payment	\N	\N	\N	2026-03-16 14:00:00	\N	\N	\N	admin	2026-03-15 00:26:04.767094	2026-03-15 00:37:38.708
2	Проверить созвон с клиентом	\N	manual	open	urgent	followup	\N	\N	\N	2026-03-15 10:00:00	\N	\N	\N	admin	2026-03-15 00:26:04.687847	2026-03-15 00:43:06.607
4	Проверить фото с объекта	\N	manual	done	medium	report_check	\N	\N	\N	2026-03-15 16:30:00	2026-03-15 00:59:17.799	admin	\N	admin	2026-03-15 00:26:04.814033	2026-03-15 00:59:17.799
\.


--
-- Data for Name: telegram_chats; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.telegram_chats (id, telegram_chat_id, username, first_name, last_name, avatar_url, stage, assigned_operator_id, last_message, last_message_at, unread_count, created_at, updated_at) FROM stdin;
10	1879917284	\N	Ксения	\N	/api/tg-file/AgACAgIAAxUAAWm378TJDYILa62iR3z8NJgrGGg-AAJX4DEbReNYSvJqH-JvwcmvAQADAgADYwADOgQ	new	\N	🤝	2026-03-16 10:52:59.104	6	2026-03-16 10:29:27.304674	2026-03-16 10:52:59.104
8	330645502	evgenb78	Евгений	Белоус	\N	new	\N	/orders	2026-03-16 18:30:53.437	10	2026-03-15 11:04:13.955028	2026-03-16 18:30:53.437
7	7260307561	artem_nechav	Артём Нечаев	\N	/api/tg-file/AgACAgIAAxUAAWm05WX6dS6C7BbDBglfAAGOaEnvCwACYO8xG9QkiEsu5isoSWqAngEAAwIAA2MAAzoE	new	\N	/start	2026-03-16 18:53:21.942	12	2026-03-14 23:21:11.7566	2026-03-16 18:53:21.942
9	5903117133	\N	Александр	\N	\N	new	\N	Фото выслал ни как не загружается	2026-03-15 12:47:58.698	9	2026-03-15 11:42:20.574147	2026-03-15 12:47:58.698
\.


--
-- Data for Name: telegram_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.telegram_messages (id, chat_id, telegram_message_id, text, from_bot, sender_name, created_at) FROM stdin;
55	7260307561	156	/start	f	Артём Нечаев	2026-03-14 23:21:11.756842
56	7260307561	158	Краснодар	f	Артём Нечаев	2026-03-14 23:22:06.653471
57	7260307561	160	Краснодар	f	Артём Нечаев	2026-03-14 23:23:01.710087
58	7260307561	164	89892860863	f	Артём Нечаев	2026-03-14 23:23:47.151505
59	7260307561	170	/start	f	Артём Нечаев	2026-03-15 10:29:07.841139
60	7260307561	173	/start	f	Артём Нечаев	2026-03-15 10:32:26.168802
61	7260307561	177	Да	f	Артём Нечаев	2026-03-15 10:35:13.89063
62	330645502	180	/start	f	Евгений Белоус	2026-03-15 11:04:13.955087
63	330645502	182	/profile	f	Евгений Белоус	2026-03-15 11:04:35.688118
64	330645502	185	+79184207679	f	Евгений Белоус	2026-03-15 11:06:54.084612
65	330645502	192	/start	f	Евгений Белоус	2026-03-15 11:11:01.31262
66	330645502	195	Краснодар	f	Евгений Белоус	2026-03-15 11:11:15.959663
67	330645502	198	/myorders	f	Евгений Белоус	2026-03-15 11:12:04.684337
68	5903117133	200	/start	f	Александр	2026-03-15 11:42:20.5742
69	5903117133	202	Александр	f	Александр	2026-03-15 11:42:40.572557
70	5903117133	204	Краснодар	f	Александр	2026-03-15 11:43:26.941804
71	5903117133	208	+79530892393	f	Александр	2026-03-15 11:45:02.760727
72	5903117133	211	/profile	f	Александр	2026-03-15 11:51:36.111216
73	5903117133	213	/orders	f	Александр	2026-03-15 11:53:01.717084
74	5903117133	215	Как получить заказ?	f	Александр	2026-03-15 11:53:37.4948
75	5903117133	218	Я всё прошёл, что ещё нужно сделать?	f	Александр	2026-03-15 12:46:18.911533
76	5903117133	221	Фото выслал ни как не загружается	f	Александр	2026-03-15 12:47:58.700361
77	7260307561	225	/orders	f	Артём Нечаев	2026-03-15 17:51:28.870783
78	7260307561	228	/orders	f	Артём Нечаев	2026-03-15 19:13:05.558068
79	1879917284	230	/start	f	Ксения	2026-03-16 10:29:27.304885
80	1879917284	232	Геннадий	f	Ксения	2026-03-16 10:29:42.665641
81	1879917284	234	Краснодар	f	Ксения	2026-03-16 10:29:52.223239
82	1879917284	238	89282858426	f	Ксения	2026-03-16 10:31:41.757528
83	7260307561	244	/profile	f	Артём Нечаев	2026-03-16 10:34:34.136772
84	1879917284	247	🤝	f	Ксения	2026-03-16 10:52:59.119073
85	330645502	255	/myorders	f	Евгений Белоус	2026-03-16 18:30:53.22988
86	330645502	256	/profile	f	Евгений Белоус	2026-03-16 18:30:53.246668
87	330645502	257	/profile	f	Евгений Белоус	2026-03-16 18:30:53.332652
88	330645502	258	/orders	f	Евгений Белоус	2026-03-16 18:30:53.441476
89	7260307561	263	/start	f	Артём Нечаев	2026-03-16 18:53:21.95356
\.


--
-- Data for Name: transaction_payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.transaction_payments (id, transaction_id, amount, note, paid_at, created_at) FROM stdin;
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.transactions (id, order_id, master_id, order_amount, commission, payment_status, created_at, paid_at, prepayment_deducted, source_type, snooze_until, snooze_note) FROM stdin;
9	13	54	8000.00	0.00	pending	2026-03-17 03:01:06.987792	\N	0.00	\N	\N	\N
\.


--
-- Data for Name: user_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_sessions (sid, sess, expire) FROM stdin;
nMMbCKO7POeLQs3aJSgsuBUKwOohJDt3	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-24T11:42:40.167Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-24 11:42:41
kkoKlCzY7vhqkgWfJA81RVpKkk4soCKH	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-24T12:12:59.680Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-24 12:13:00
ze8vwf3gPzQLBOxpouNKGkUvcMqLcoPX	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-24T09:59:09.221Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-24 09:59:53
WYSl_rKIjjZJ7EncNiQK8IGdfBWUrIH1	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-03T21:45:16.994Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-03 21:45:23
4-Wygbw5-YgqjSYVDN_-8mz9H6ma5Pff	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-03T18:22:59.349Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-03 18:23:40
7Tqyo70aG3ezrZQCVRMQUQaMwB6bzJe-	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-03T20:40:39.007Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-03 20:41:14
8PF_JhlFukv7uSOXc3ULzjbTg58wwsvt	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-04-27T10:48:55.704Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-04-27 11:11:54
IEDnQcjkgHU_-QcrAhVWE_SQi5g0R5IC	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-04-27T22:06:43.036Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-04-27 22:15:21
_EC0t5WJYrJSAzUp5tAkQXxhCfSNKysi	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-03T22:05:47.154Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-03 22:05:48
8r8GiaJmcKuWmuVY9lZzMCGJig10Ga5g	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-06T12:58:34.400Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-06 12:58:35
sumxAm_w96nDvsact4cwVRhXqS1Asl5E	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-07T18:32:20.571Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-07 18:32:38
atG2XBr5O-0hjFaUTwztEfJjLvgIx06H	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-03T20:53:56.452Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-03 20:54:36
beG2RHas1Or7DLp1Xvxq9qNkRQBw-pDm	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-03T21:43:21.878Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-03 21:43:29
FydCVJ0Ew2CV2Zcjj5kIRbwLubF3xYTP	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-07T18:40:39.174Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-07 18:40:40
HBSXzr5ztpP8HFKZ5k_0vl2PqUwxgdJA	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-03T21:44:26.388Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-03 21:44:58
X83uhRdXTIJTI5rQg9QK8U7FOgWyS4M_	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-07T18:49:15.266Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-07 18:49:16
vlWO9o6jrceXmSTulwVH2ESZvbPs__S-	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-08T19:17:35.864Z","secure":false,"httpOnly":true,"path":"/"},"masterId":13}	2026-05-08 19:17:36
XwrjezNzL0tgUEvS-x8aAEna1gCG_UbR	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-08T19:17:40.084Z","secure":false,"httpOnly":true,"path":"/"},"masterId":13}	2026-05-08 19:17:41
RpIXDKgmF9yQsNStVWmVKwCES5mkaE8Q	{"cookie":{"originalMaxAge":2591999999,"expires":"2026-05-08T19:20:37.423Z","secure":false,"httpOnly":true,"path":"/"},"masterId":13}	2026-05-08 19:20:38
pkxlpR6pwPnQhMq0uH3vH6CjrfIexR3V	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-08T19:20:37.556Z","secure":false,"httpOnly":true,"path":"/"},"masterId":13}	2026-05-08 19:20:38
BrOUYZHexiE8ui3rsBFwkxZW10zcRtMr	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-08T19:20:37.682Z","secure":false,"httpOnly":true,"path":"/"},"masterId":13}	2026-05-08 19:20:38
yHLKHJ3LLCmfqp6SJfQpXW3CNGeg5c9r	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-10T23:05:00.131Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-10 23:05:01
l3Em4LxHPsmyEYXSaDfkKcd24SoyDPz7	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-10T23:05:49.890Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-10 23:05:57
BRVQCCM0yClSxuZacvsz1eOH0TjaL5MR	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-13T15:34:52.601Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-13 15:34:53
gnm_P79IGZrre_sHlhNEVs4zleb4HTnD	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-17T17:02:16.029Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-17 17:02:17
dOyrGJkWdWdOb55EFyHf69vheaocxTxZ	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-17T17:03:19.900Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-17 17:03:20
90GkGKLv85_CXJ9TV7decB5XTr4rJa3V	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-17T17:04:07.664Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-17 17:04:43
K7MiFvJR-2Ir1DokCF9r5cdoIlzcHO72	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-17T17:05:00.894Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-17 17:05:01
-G4xVEkhBKFhTXiUYHpjAqLlMBdEVqVs	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-17T17:05:07.223Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-17 17:05:08
QRGGfJ5WwrRtI8aKZZcfxouQXAPpqrcn	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-17T17:05:14.669Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-17 17:05:15
_uO53tE21Vu5xjx4UerF22xVDO4o3zIi	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-17T17:06:06.583Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-17 17:06:07
e7qY1F_ZSQIRDlGL-0usMRWWJkHV8fB7	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-17T17:06:17.224Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-17 17:06:18
H_g6fPlklZCy-MyxKFweDaqGiXZufB25	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-17T17:06:27.149Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-17 17:06:28
awz-ZaRwlUjNZ5xVFnL92J30Szepm6Ei	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-17T17:06:50.209Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-17 17:06:51
KCpBqMtpN80NTEMmsEfoUVmIddWJ3ht5	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-18T09:23:05.240Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-18 09:23:06
5hwhu5UYE38ug8ChtslPiWZo-1qCwe1F	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-24T09:57:30.825Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-24 10:01:00
ZZ_pg1Z4OhXsdalgWEOJANhINJKaa0LG	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-18T09:23:18.414Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-18 09:23:25
7705xPuBOTLjyERH-tfQ5tXVRcZ1_bcn	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-18T09:23:54.303Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-18 09:23:55
N9GYDJo6KhTKWNQtrO9gWUZz_0SlWfin	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-18T09:23:54.466Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-18 09:23:55
XpcX2uQ3QCVdCEZOYrNueAzMk9PPPu4J	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-18T09:26:51.728Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-18 09:26:52
xvYurItiK1ZJ7DsWOSt0GaSLNX2NK0nz	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-18T09:27:44.467Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-18 09:27:45
ggOfeDF5hTxfCvbeUbqRAeJAQ2zVGZiq	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-22T07:21:54.410Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-22 07:48:32
NwWyCs_xnR48-heoaI7PkGZJ_KMzNLs6	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-19T11:39:17.449Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-19 11:39:26
XIzPeoURwcSuvqXucdfpF9SuRXRNuuUk	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-22T10:33:24.343Z","secure":false,"httpOnly":true,"path":"/"},"masterId":12}	2026-05-22 10:33:36
uzTOiuVMuBy-WjskuS_iBmoIWFSXKBQH	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-24T09:43:18.218Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-24 09:43:19
Oy8IkzTBmzHA8tpp-cPFGwdP5lb2-L1P	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-21T19:15:13.966Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-21 19:15:30
6LfJCA_a7cIBmapR9o-F1PTptyFrqAls	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-20T22:19:55.029Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-20 22:33:48
IPFkS9rRM79f5aonnNXC3Dv7-BHf5CJo	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-22T07:21:47.093Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-22 07:21:48
2vVgSF68Gbn605EiH16Mupn6l9IdGpJK	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-24T10:02:02.426Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-24 10:03:17
VHv3RJuRnG8vBuBEbDFJDFWzsQHldEHf	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-24T09:52:14.965Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-24 09:53:40
txjbJI09dfx-9UGflcz9pXwS17vxCtxX	{"cookie":{"originalMaxAge":2592000000,"expires":"2026-05-24T12:01:01.116Z","secure":false,"httpOnly":true,"path":"/"},"userId":1}	2026-05-24 12:03:57
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, login, password_hash, name, role, created_at, permissions) FROM stdin;
2	operator1	$2b$10$yqxel/usObTdNMxAdupo3.D0mPyk3hjaBBdAK8WsRI7NfhApu67IC	Иван Петров	lead_operator	2026-03-13 20:32:42.317654	[]
3	master_op	$2b$10$yyK5QpA0yxUpy73xH5xig.aRdJ7hlGabYCQlA3JawPXjgr7GURBR.	Сергей Козлов	master_operator	2026-03-13 20:32:42.317654	[]
1	admin	$2b$10$nLBJ.zGDQYaJcmN/t6/dWeMc.YIgQvj8ZH881aIN3jqxvF/Y0njha	Администратор	admin	2026-03-13 20:32:42.317654	[]
\.


--
-- Data for Name: voronka_columns; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.voronka_columns (id, name, "position", receives_orders, color, created_at) FROM stdin;
1	Новые	1	f	blue	2026-03-14 04:16:30.564545
2	Свободен	2	t	green	2026-03-14 04:16:30.564545
7	Свободен	1	t	green	2026-03-17 02:54:05.847483
8	Свободен	2	t	green	2026-03-17 02:56:16.976703
5	Ожидает оплаты	5	f	red	2026-03-14 15:45:06.306604
10	Отстраненные	6	f	grey	2026-03-20 19:35:44.197727
9	Занят	3	f	yellow	2026-03-18 19:55:26.142361
3	На объекте	4	t	orange	2026-03-14 04:16:30.564545
\.


--
-- Name: avito_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.avito_settings_id_seq', 1, true);


--
-- Name: bot_memory_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.bot_memory_id_seq', 1, false);


--
-- Name: bot_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.bot_sessions_id_seq', 1, false);


--
-- Name: browser_agent_credentials_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.browser_agent_credentials_id_seq', 1, false);


--
-- Name: browser_agent_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.browser_agent_logs_id_seq', 1, false);


--
-- Name: browser_agent_scenarios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.browser_agent_scenarios_id_seq', 6, true);


--
-- Name: chat_cases_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.chat_cases_id_seq', 2, true);


--
-- Name: cities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.cities_id_seq', 8, true);


--
-- Name: client_support_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.client_support_messages_id_seq', 1, true);


--
-- Name: dispatcher_followups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.dispatcher_followups_id_seq', 1, false);


--
-- Name: fomo_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.fomo_events_id_seq', 1, false);


--
-- Name: general_support_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.general_support_messages_id_seq', 1, true);


--
-- Name: lead_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.lead_events_id_seq', 1, false);


--
-- Name: leads_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.leads_id_seq', 52, true);


--
-- Name: master_checkins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.master_checkins_id_seq', 1, false);


--
-- Name: master_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.master_messages_id_seq', 85, true);


--
-- Name: master_reviews_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.master_reviews_id_seq', 1, true);


--
-- Name: master_tasks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.master_tasks_id_seq', 3, true);


--
-- Name: masters_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.masters_id_seq', 54, true);


--
-- Name: max_bot_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.max_bot_logs_id_seq', 1, false);


--
-- Name: order_broadcast_waves_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_broadcast_waves_id_seq', 1, false);


--
-- Name: order_dispatches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_dispatches_id_seq', 40, true);


--
-- Name: order_status_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_status_logs_id_seq', 1, false);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.orders_id_seq', 17, true);


--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.push_subscriptions_id_seq', 1, false);


--
-- Name: receipts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.receipts_id_seq', 4, true);


--
-- Name: scenario_notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.scenario_notifications_id_seq', 1, false);


--
-- Name: scenario_runs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.scenario_runs_id_seq', 4, true);


--
-- Name: service_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.service_types_id_seq', 11380, true);


--
-- Name: system_tasks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.system_tasks_id_seq', 6, true);


--
-- Name: telegram_chats_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.telegram_chats_id_seq', 10, true);


--
-- Name: telegram_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.telegram_messages_id_seq', 89, true);


--
-- Name: transaction_payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.transaction_payments_id_seq', 1, false);


--
-- Name: transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.transactions_id_seq', 11, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 3, true);


--
-- Name: voronka_columns_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.voronka_columns_id_seq', 10, true);


--
-- Name: avito_settings avito_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.avito_settings
    ADD CONSTRAINT avito_settings_pkey PRIMARY KEY (id);


--
-- Name: bot_memory bot_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bot_memory
    ADD CONSTRAINT bot_memory_pkey PRIMARY KEY (id);


--
-- Name: bot_sessions bot_sessions_bot_type_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bot_sessions
    ADD CONSTRAINT bot_sessions_bot_type_user_id_key UNIQUE (bot_type, user_id);


--
-- Name: bot_sessions bot_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bot_sessions
    ADD CONSTRAINT bot_sessions_pkey PRIMARY KEY (id);


--
-- Name: browser_agent_credentials browser_agent_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.browser_agent_credentials
    ADD CONSTRAINT browser_agent_credentials_pkey PRIMARY KEY (id);


--
-- Name: browser_agent_credentials browser_agent_credentials_site_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.browser_agent_credentials
    ADD CONSTRAINT browser_agent_credentials_site_key UNIQUE (site);


--
-- Name: browser_agent_logs browser_agent_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.browser_agent_logs
    ADD CONSTRAINT browser_agent_logs_pkey PRIMARY KEY (id);


--
-- Name: browser_agent_scenarios browser_agent_scenarios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.browser_agent_scenarios
    ADD CONSTRAINT browser_agent_scenarios_pkey PRIMARY KEY (id);


--
-- Name: chat_cases chat_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_cases
    ADD CONSTRAINT chat_cases_pkey PRIMARY KEY (id);


--
-- Name: cities cities_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_name_unique UNIQUE (name);


--
-- Name: cities cities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_pkey PRIMARY KEY (id);


--
-- Name: client_support_messages client_support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_support_messages
    ADD CONSTRAINT client_support_messages_pkey PRIMARY KEY (id);


--
-- Name: dispatcher_followups dispatcher_followups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dispatcher_followups
    ADD CONSTRAINT dispatcher_followups_pkey PRIMARY KEY (id);


--
-- Name: fomo_events fomo_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fomo_events
    ADD CONSTRAINT fomo_events_pkey PRIMARY KEY (id);


--
-- Name: general_support_messages general_support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.general_support_messages
    ADD CONSTRAINT general_support_messages_pkey PRIMARY KEY (id);


--
-- Name: lead_events lead_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_events
    ADD CONSTRAINT lead_events_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: master_checkins master_checkins_master_id_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.master_checkins
    ADD CONSTRAINT master_checkins_master_id_date_key UNIQUE (master_id, date);


--
-- Name: master_checkins master_checkins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.master_checkins
    ADD CONSTRAINT master_checkins_pkey PRIMARY KEY (id);


--
-- Name: master_messages master_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.master_messages
    ADD CONSTRAINT master_messages_pkey PRIMARY KEY (id);


--
-- Name: master_reviews master_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.master_reviews
    ADD CONSTRAINT master_reviews_pkey PRIMARY KEY (id);


--
-- Name: master_tasks master_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.master_tasks
    ADD CONSTRAINT master_tasks_pkey PRIMARY KEY (id);


--
-- Name: masters masters_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.masters
    ADD CONSTRAINT masters_pkey PRIMARY KEY (id);


--
-- Name: max_bot_logs max_bot_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.max_bot_logs
    ADD CONSTRAINT max_bot_logs_pkey PRIMARY KEY (id);


--
-- Name: order_broadcast_waves order_broadcast_waves_order_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_broadcast_waves
    ADD CONSTRAINT order_broadcast_waves_order_id_unique UNIQUE (order_id);


--
-- Name: order_broadcast_waves order_broadcast_waves_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_broadcast_waves
    ADD CONSTRAINT order_broadcast_waves_pkey PRIMARY KEY (id);


--
-- Name: order_dispatches order_dispatches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_dispatches
    ADD CONSTRAINT order_dispatches_pkey PRIMARY KEY (id);


--
-- Name: order_status_logs order_status_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_status_logs
    ADD CONSTRAINT order_status_logs_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: receipts receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);


--
-- Name: receipts receipts_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_token_key UNIQUE (token);


--
-- Name: scenario_notifications scenario_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scenario_notifications
    ADD CONSTRAINT scenario_notifications_pkey PRIMARY KEY (id);


--
-- Name: scenario_runs scenario_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scenario_runs
    ADD CONSTRAINT scenario_runs_pkey PRIMARY KEY (id);


--
-- Name: scenario_settings scenario_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scenario_settings
    ADD CONSTRAINT scenario_settings_pkey PRIMARY KEY (scenario);


--
-- Name: service_types service_types_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_types
    ADD CONSTRAINT service_types_name_unique UNIQUE (name);


--
-- Name: service_types service_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_types
    ADD CONSTRAINT service_types_pkey PRIMARY KEY (id);


--
-- Name: user_sessions session_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: system_tasks system_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_tasks
    ADD CONSTRAINT system_tasks_pkey PRIMARY KEY (id);


--
-- Name: telegram_chats telegram_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.telegram_chats
    ADD CONSTRAINT telegram_chats_pkey PRIMARY KEY (id);


--
-- Name: telegram_chats telegram_chats_telegram_chat_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.telegram_chats
    ADD CONSTRAINT telegram_chats_telegram_chat_id_unique UNIQUE (telegram_chat_id);


--
-- Name: telegram_messages telegram_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.telegram_messages
    ADD CONSTRAINT telegram_messages_pkey PRIMARY KEY (id);


--
-- Name: transaction_payments transaction_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: users users_login_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_login_unique UNIQUE (login);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: voronka_columns voronka_columns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.voronka_columns
    ADD CONSTRAINT voronka_columns_pkey PRIMARY KEY (id);


--
-- Name: browser_agent_logs_session_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX browser_agent_logs_session_idx ON public.browser_agent_logs USING btree (session_id);


--
-- Name: chat_cases_current_stage_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX chat_cases_current_stage_idx ON public.chat_cases USING btree (current_stage);


--
-- Name: chat_cases_deadline_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX chat_cases_deadline_idx ON public.chat_cases USING btree (next_action_deadline);


--
-- Name: chat_cases_master_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX chat_cases_master_id_idx ON public.chat_cases USING btree (master_id);


--
-- Name: chat_cases_order_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX chat_cases_order_id_idx ON public.chat_cases USING btree (order_id);


--
-- Name: chat_cases_risk_level_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX chat_cases_risk_level_idx ON public.chat_cases USING btree (risk_level);


--
-- Name: chat_cases_updated_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX chat_cases_updated_at_idx ON public.chat_cases USING btree (updated_at);


--
-- Name: fomo_events_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fomo_events_created_at_idx ON public.fomo_events USING btree (created_at);


--
-- Name: fomo_events_event_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fomo_events_event_type_idx ON public.fomo_events USING btree (event_type);


--
-- Name: fomo_events_master_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fomo_events_master_id_idx ON public.fomo_events USING btree (master_id);


--
-- Name: idx_scen_notif_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scen_notif_lookup ON public.scenario_notifications USING btree (scenario_id, order_id, master_id, tier, sent_at DESC);


--
-- Name: leads_phone_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX leads_phone_idx ON public.leads USING btree (client_phone);


--
-- Name: leads_status_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX leads_status_active_idx ON public.leads USING btree (status, deleted_at, created_at);


--
-- Name: orders_completed_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX orders_completed_at_idx ON public.orders USING btree (completed_at);


--
-- Name: orders_lead_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX orders_lead_id_idx ON public.orders USING btree (lead_id);


--
-- Name: orders_master_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX orders_master_status_idx ON public.orders USING btree (master_id, status, deleted_at);


--
-- Name: orders_status_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX orders_status_active_idx ON public.orders USING btree (status, deleted_at, last_broadcast_at);


--
-- Name: receipts_order_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX receipts_order_id_idx ON public.receipts USING btree (order_id);


--
-- Name: receipts_pending_confirm_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX receipts_pending_confirm_idx ON public.receipts USING btree (prepayment_submitted_at, prepayment_seen_at);


--
-- Name: scenario_runs_scenario_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX scenario_runs_scenario_idx ON public.scenario_runs USING btree (scenario, created_at DESC);


--
-- Name: bot_memory bot_memory_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bot_memory
    ADD CONSTRAINT bot_memory_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id) ON DELETE CASCADE;


--
-- Name: chat_cases chat_cases_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_cases
    ADD CONSTRAINT chat_cases_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id);


--
-- Name: chat_cases chat_cases_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chat_cases
    ADD CONSTRAINT chat_cases_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: lead_events lead_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_events
    ADD CONSTRAINT lead_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: master_checkins master_checkins_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.master_checkins
    ADD CONSTRAINT master_checkins_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id);


--
-- Name: master_reviews master_reviews_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.master_reviews
    ADD CONSTRAINT master_reviews_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id) ON DELETE CASCADE;


--
-- Name: master_reviews master_reviews_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.master_reviews
    ADD CONSTRAINT master_reviews_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: master_tasks master_tasks_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.master_tasks
    ADD CONSTRAINT master_tasks_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id) ON DELETE CASCADE;


--
-- Name: order_dispatches order_dispatches_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_dispatches
    ADD CONSTRAINT order_dispatches_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id);


--
-- Name: order_dispatches order_dispatches_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_dispatches
    ADD CONSTRAINT order_dispatches_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: order_status_logs order_status_logs_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_status_logs
    ADD CONSTRAINT order_status_logs_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: orders orders_lead_id_leads_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_lead_id_leads_id_fk FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: orders orders_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id);


--
-- Name: push_subscriptions push_subscriptions_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id) ON DELETE CASCADE;


--
-- Name: receipts receipts_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id);


--
-- Name: receipts receipts_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: system_tasks system_tasks_related_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_tasks
    ADD CONSTRAINT system_tasks_related_master_id_masters_id_fk FOREIGN KEY (related_master_id) REFERENCES public.masters(id) ON DELETE SET NULL;


--
-- Name: system_tasks system_tasks_related_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_tasks
    ADD CONSTRAINT system_tasks_related_order_id_orders_id_fk FOREIGN KEY (related_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: transaction_payments transaction_payments_transaction_id_transactions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_payments
    ADD CONSTRAINT transaction_payments_transaction_id_transactions_id_fk FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_master_id_masters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_master_id_masters_id_fk FOREIGN KEY (master_id) REFERENCES public.masters(id);


--
-- Name: transactions transactions_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- PostgreSQL database dump complete
--

\unrestrict uSbbvjsyaPlLcHnMHOaUlmDeHGVqB977X7aEgR41HEcoWgrv6U7XebvVqDH1weP

