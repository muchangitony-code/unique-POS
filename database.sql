--
-- PostgreSQL database dump
--

\restrict M8GHadX7TW3LqwIXOTH1a0TiuIcijtSPWoKU1196cva01Fe7cHAL9jEgsf4Mc1F

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

DROP INDEX IF EXISTS public.users_branch_id_idx;
DROP INDEX IF EXISTS public.suppliers_branch_id_idx;
DROP INDEX IF EXISTS public.stock_transfers_status_idx;
DROP INDEX IF EXISTS public.stock_transfers_source_idx;
DROP INDEX IF EXISTS public.stock_transfers_dest_idx;
DROP INDEX IF EXISTS public.stock_transfers_created_at_idx;
DROP INDEX IF EXISTS public.stock_movements_branch_id_idx;
DROP INDEX IF EXISTS public.sales_branch_id_idx;
DROP INDEX IF EXISTS public.quotations_branch_id_idx;
DROP INDEX IF EXISTS public.purchases_branch_id_idx;
DROP INDEX IF EXISTS public.login_history_user_id_idx;
DROP INDEX IF EXISTS public.login_history_created_at_idx;
DROP INDEX IF EXISTS public.invoices_branch_id_idx;
DROP INDEX IF EXISTS public.expenses_branch_id_idx;
DROP INDEX IF EXISTS public.customers_branch_id_idx;
DROP INDEX IF EXISTS public.audit_log_created_at_idx;
DROP INDEX IF EXISTS public.audit_log_branch_id_idx;
DROP INDEX IF EXISTS public.audit_log_actor_id_idx;
DROP INDEX IF EXISTS public.audit_log_action_idx;
DROP INDEX IF EXISTS public.admin_notifications_read_at_idx;
DROP INDEX IF EXISTS public.admin_notifications_created_at_idx;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_email_unique;
ALTER TABLE IF EXISTS ONLY public.suppliers DROP CONSTRAINT IF EXISTS suppliers_pkey;
ALTER TABLE IF EXISTS ONLY public.stock_transfers DROP CONSTRAINT IF EXISTS stock_transfers_pkey;
ALTER TABLE IF EXISTS ONLY public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_pkey;
ALTER TABLE IF EXISTS ONLY public.sales DROP CONSTRAINT IF EXISTS sales_receipt_number_unique;
ALTER TABLE IF EXISTS ONLY public.sales DROP CONSTRAINT IF EXISTS sales_pkey;
ALTER TABLE IF EXISTS ONLY public.sale_items DROP CONSTRAINT IF EXISTS sale_items_pkey;
ALTER TABLE IF EXISTS ONLY public.quotations DROP CONSTRAINT IF EXISTS quotations_quotation_number_unique;
ALTER TABLE IF EXISTS ONLY public.quotations DROP CONSTRAINT IF EXISTS quotations_pkey;
ALTER TABLE IF EXISTS ONLY public.quotation_items DROP CONSTRAINT IF EXISTS quotation_items_pkey;
ALTER TABLE IF EXISTS ONLY public.purchases DROP CONSTRAINT IF EXISTS purchases_purchase_number_unique;
ALTER TABLE IF EXISTS ONLY public.purchases DROP CONSTRAINT IF EXISTS purchases_pkey;
ALTER TABLE IF EXISTS ONLY public.purchase_items DROP CONSTRAINT IF EXISTS purchase_items_pkey;
ALTER TABLE IF EXISTS ONLY public.products DROP CONSTRAINT IF EXISTS products_product_code_unique;
ALTER TABLE IF EXISTS ONLY public.products DROP CONSTRAINT IF EXISTS products_pkey;
ALTER TABLE IF EXISTS ONLY public.product_stock DROP CONSTRAINT IF EXISTS product_stock_pkey;
ALTER TABLE IF EXISTS ONLY public.product_stock DROP CONSTRAINT IF EXISTS product_stock_branch_product_unique;
ALTER TABLE IF EXISTS ONLY public.login_history DROP CONSTRAINT IF EXISTS login_history_pkey;
ALTER TABLE IF EXISTS ONLY public.invoices DROP CONSTRAINT IF EXISTS invoices_pkey;
ALTER TABLE IF EXISTS ONLY public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_unique;
ALTER TABLE IF EXISTS ONLY public.invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_pkey;
ALTER TABLE IF EXISTS ONLY public.invoice_items DROP CONSTRAINT IF EXISTS invoice_items_pkey;
ALTER TABLE IF EXISTS ONLY public.expenses DROP CONSTRAINT IF EXISTS expenses_pkey;
ALTER TABLE IF EXISTS ONLY public.document_sequences DROP CONSTRAINT IF EXISTS document_sequences_pkey;
ALTER TABLE IF EXISTS ONLY public.data_migrations DROP CONSTRAINT IF EXISTS data_migrations_pkey;
ALTER TABLE IF EXISTS ONLY public.data_migrations DROP CONSTRAINT IF EXISTS data_migrations_name_key;
ALTER TABLE IF EXISTS ONLY public.customers DROP CONSTRAINT IF EXISTS customers_pkey;
ALTER TABLE IF EXISTS ONLY public.categories DROP CONSTRAINT IF EXISTS categories_pkey;
ALTER TABLE IF EXISTS ONLY public.business_settings DROP CONSTRAINT IF EXISTS business_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.brands DROP CONSTRAINT IF EXISTS brands_pkey;
ALTER TABLE IF EXISTS ONLY public.branches DROP CONSTRAINT IF EXISTS branches_pkey;
ALTER TABLE IF EXISTS ONLY public.branches DROP CONSTRAINT IF EXISTS branches_code_key;
ALTER TABLE IF EXISTS ONLY public.audit_log DROP CONSTRAINT IF EXISTS audit_log_pkey;
ALTER TABLE IF EXISTS ONLY public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_pkey;
ALTER TABLE IF EXISTS public.users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.suppliers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.stock_transfers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.stock_movements ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.sales ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.sale_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.quotations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.quotation_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.purchases ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.purchase_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.products ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.product_stock ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.login_history ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.invoices ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.invoice_payments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.invoice_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.expenses ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.data_migrations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.customers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.categories ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.business_settings ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.brands ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.branches ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.audit_log ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.admin_notifications ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.users_id_seq;
DROP TABLE IF EXISTS public.users;
DROP SEQUENCE IF EXISTS public.suppliers_id_seq;
DROP TABLE IF EXISTS public.suppliers;
DROP SEQUENCE IF EXISTS public.stock_transfers_id_seq;
DROP TABLE IF EXISTS public.stock_transfers;
DROP SEQUENCE IF EXISTS public.stock_movements_id_seq;
DROP TABLE IF EXISTS public.stock_movements;
DROP SEQUENCE IF EXISTS public.sales_id_seq;
DROP TABLE IF EXISTS public.sales;
DROP SEQUENCE IF EXISTS public.sale_items_id_seq;
DROP TABLE IF EXISTS public.sale_items;
DROP SEQUENCE IF EXISTS public.quotations_id_seq;
DROP TABLE IF EXISTS public.quotations;
DROP SEQUENCE IF EXISTS public.quotation_items_id_seq;
DROP TABLE IF EXISTS public.quotation_items;
DROP SEQUENCE IF EXISTS public.purchases_id_seq;
DROP TABLE IF EXISTS public.purchases;
DROP SEQUENCE IF EXISTS public.purchase_items_id_seq;
DROP TABLE IF EXISTS public.purchase_items;
DROP SEQUENCE IF EXISTS public.products_id_seq;
DROP TABLE IF EXISTS public.products;
DROP SEQUENCE IF EXISTS public.product_stock_id_seq;
DROP TABLE IF EXISTS public.product_stock;
DROP SEQUENCE IF EXISTS public.login_history_id_seq;
DROP TABLE IF EXISTS public.login_history;
DROP SEQUENCE IF EXISTS public.invoices_id_seq;
DROP TABLE IF EXISTS public.invoices;
DROP SEQUENCE IF EXISTS public.invoice_payments_id_seq;
DROP TABLE IF EXISTS public.invoice_payments;
DROP SEQUENCE IF EXISTS public.invoice_items_id_seq;
DROP TABLE IF EXISTS public.invoice_items;
DROP SEQUENCE IF EXISTS public.expenses_id_seq;
DROP TABLE IF EXISTS public.expenses;
DROP TABLE IF EXISTS public.document_sequences;
DROP SEQUENCE IF EXISTS public.data_migrations_id_seq;
DROP TABLE IF EXISTS public.data_migrations;
DROP SEQUENCE IF EXISTS public.customers_id_seq;
DROP TABLE IF EXISTS public.customers;
DROP SEQUENCE IF EXISTS public.categories_id_seq;
DROP TABLE IF EXISTS public.categories;
DROP SEQUENCE IF EXISTS public.business_settings_id_seq;
DROP TABLE IF EXISTS public.business_settings;
DROP SEQUENCE IF EXISTS public.brands_id_seq;
DROP TABLE IF EXISTS public.brands;
DROP SEQUENCE IF EXISTS public.branches_id_seq;
DROP TABLE IF EXISTS public.branches;
DROP SEQUENCE IF EXISTS public.audit_log_id_seq;
DROP TABLE IF EXISTS public.audit_log;
DROP SEQUENCE IF EXISTS public.admin_notifications_id_seq;
DROP TABLE IF EXISTS public.admin_notifications;
DROP TYPE IF EXISTS public.user_role;
DROP TYPE IF EXISTS public.sale_status;
DROP TYPE IF EXISTS public.quotation_status;
DROP TYPE IF EXISTS public.purchase_status;
DROP TYPE IF EXISTS public.payment_method;
DROP TYPE IF EXISTS public.movement_type;
DROP TYPE IF EXISTS public.invoice_status;
DROP TYPE IF EXISTS public.expense_payment_method;
--
-- Name: expense_payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.expense_payment_method AS ENUM (
    'cash',
    'mpesa',
    'bank_transfer',
    'card'
);


--
-- Name: invoice_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_status AS ENUM (
    'draft',
    'sent',
    'partial',
    'paid',
    'overdue',
    'cancelled'
);


--
-- Name: movement_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.movement_type AS ENUM (
    'receive',
    'adjustment',
    'transfer_in',
    'transfer_out',
    'sale',
    'purchase_return'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'cash',
    'mpesa',
    'bank_transfer',
    'card',
    'credit',
    'split'
);


--
-- Name: purchase_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.purchase_status AS ENUM (
    'draft',
    'ordered',
    'received',
    'partial',
    'cancelled'
);


--
-- Name: quotation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.quotation_status AS ENUM (
    'draft',
    'sent',
    'accepted',
    'rejected',
    'expired',
    'converted'
);


--
-- Name: sale_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sale_status AS ENUM (
    'completed',
    'refunded',
    'void'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'super_admin',
    'business_owner',
    'branch_manager',
    'cashier',
    'storekeeper',
    'accountant',
    'sales_rep',
    'technician'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_notifications (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    severity text DEFAULT 'warning'::text NOT NULL,
    rule_id text NOT NULL,
    audit_log_id integer,
    metadata jsonb,
    read_at timestamp with time zone
);


--
-- Name: admin_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_notifications_id_seq OWNED BY public.admin_notifications.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id integer,
    actor_name text,
    actor_role text,
    ip_address text,
    action text NOT NULL,
    entity_type text,
    entity_id text,
    description text NOT NULL,
    metadata jsonb,
    branch_id integer
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id integer NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    address text,
    county text,
    phone text,
    phone2 text,
    email text,
    manager text,
    kra_pin text,
    paybill_number text,
    paybill_account text,
    till_number text,
    bank_name text,
    bank_account_name text,
    bank_account_number text,
    logo_url text,
    receipt_footer text,
    invoice_footer text,
    quotation_footer text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: branches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branches_id_seq OWNED BY public.branches.id;


--
-- Name: brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brands (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: brands_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.brands_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brands_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brands_id_seq OWNED BY public.brands.id;


--
-- Name: business_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_settings (
    id integer NOT NULL,
    business_name text DEFAULT 'UniquePOS Business'::text NOT NULL,
    business_address text,
    business_phone text,
    business_email text,
    tax_number text,
    currency text DEFAULT 'KES'::text NOT NULL,
    currency_symbol text DEFAULT 'KES'::text NOT NULL,
    vat_rate numeric(5,2) DEFAULT '16'::numeric NOT NULL,
    logo_url text,
    receipt_footer text,
    fiscal_year_start text DEFAULT '01-01'::text NOT NULL,
    country text DEFAULT 'Kenya'::text NOT NULL,
    timezone text DEFAULT 'Africa/Nairobi'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    smtp_host text,
    smtp_port integer DEFAULT 587,
    smtp_user text,
    smtp_from text,
    backup_alert_enabled boolean DEFAULT true NOT NULL,
    backup_success_notify boolean DEFAULT false NOT NULL,
    security_alert_enabled boolean DEFAULT true NOT NULL,
    alert_rules jsonb,
    mpesa_paybill text,
    mpesa_paybill_account text,
    mpesa_till text,
    mpesa_buy_goods text,
    bank_name text,
    bank_branch text,
    bank_account_name text,
    bank_account_number text,
    bank_swift_code text,
    other_payment_methods text,
    tagline text,
    website text,
    vat_number text,
    business_phone2 text,
    primary_color text,
    secondary_color text,
    stamp_url text,
    signature_url text,
    document_footer text,
    warranty_text text,
    return_policy text,
    quotation_validity_days integer,
    invoice_payment_terms text,
    payment_instructions text,
    body_font text,
    heading_font text,
    session_timeout_minutes integer DEFAULT 10080 NOT NULL,
    password_min_length integer DEFAULT 8 NOT NULL,
    password_require_uppercase boolean DEFAULT true NOT NULL,
    password_require_number boolean DEFAULT true NOT NULL,
    password_require_symbol boolean DEFAULT false NOT NULL,
    max_failed_logins integer DEFAULT 5 NOT NULL,
    lockout_minutes integer DEFAULT 15 NOT NULL
);


--
-- Name: business_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_settings_id_seq OWNED BY public.business_settings.id;


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id integer NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    address text,
    city text,
    tax_number text,
    credit_limit numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    balance numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company text,
    contact_person text,
    branch_id integer NOT NULL
);


--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- Name: data_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_migrations (
    id integer NOT NULL,
    name text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: data_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.data_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: data_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.data_migrations_id_seq OWNED BY public.data_migrations.id;


--
-- Name: document_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_sequences (
    doc_type text NOT NULL,
    year integer NOT NULL,
    last_number integer DEFAULT 0 NOT NULL
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id integer NOT NULL,
    description text NOT NULL,
    amount numeric(15,2) NOT NULL,
    category text NOT NULL,
    payment_method public.expense_payment_method DEFAULT 'cash'::public.expense_payment_method NOT NULL,
    reference text,
    notes text,
    date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id integer NOT NULL
);


--
-- Name: expenses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.expenses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: expenses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.expenses_id_seq OWNED BY public.expenses.id;


--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_items (
    id integer NOT NULL,
    invoice_id integer NOT NULL,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(15,2) NOT NULL,
    discount numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    vat_rate numeric(5,2) DEFAULT '16'::numeric NOT NULL,
    total numeric(15,2) NOT NULL,
    description text,
    unit text
);


--
-- Name: invoice_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoice_items_id_seq OWNED BY public.invoice_items.id;


--
-- Name: invoice_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_payments (
    id integer NOT NULL,
    invoice_id integer NOT NULL,
    amount numeric(15,2) NOT NULL,
    method public.payment_method NOT NULL,
    reference text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invoice_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoice_payments_id_seq OWNED BY public.invoice_payments.id;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id integer NOT NULL,
    invoice_number text NOT NULL,
    customer_id integer,
    subtotal numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    discount_amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    tax_amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    amount_paid numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    balance_due numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    status public.invoice_status DEFAULT 'draft'::public.invoice_status NOT NULL,
    due_date date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id integer NOT NULL
);


--
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;


--
-- Name: login_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_history (
    id integer NOT NULL,
    user_id integer,
    email text NOT NULL,
    success boolean NOT NULL,
    reason text,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: login_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.login_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: login_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.login_history_id_seq OWNED BY public.login_history.id;


--
-- Name: product_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_stock (
    id integer NOT NULL,
    branch_id integer NOT NULL,
    product_id integer NOT NULL,
    current_stock integer DEFAULT 0 NOT NULL,
    min_stock integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_stock_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_stock_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_stock_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_stock_id_seq OWNED BY public.product_stock.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id integer NOT NULL,
    product_code text NOT NULL,
    barcode text,
    product_name text NOT NULL,
    description text,
    category_id integer,
    brand_id integer,
    supplier_id integer,
    cost_price numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    selling_price numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    wholesale_price numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    vat_rate numeric(5,2) DEFAULT '16'::numeric NOT NULL,
    current_stock integer DEFAULT 0 NOT NULL,
    min_stock integer DEFAULT 0 NOT NULL,
    image_url text,
    unit text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: purchase_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_items (
    id integer NOT NULL,
    purchase_id integer NOT NULL,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    unit_cost numeric(15,2) NOT NULL,
    total numeric(15,2) NOT NULL
);


--
-- Name: purchase_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_items_id_seq OWNED BY public.purchase_items.id;


--
-- Name: purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchases (
    id integer NOT NULL,
    purchase_number text NOT NULL,
    supplier_id integer NOT NULL,
    subtotal numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    tax_amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    status public.purchase_status DEFAULT 'draft'::public.purchase_status NOT NULL,
    notes text,
    expected_date date,
    received_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id integer NOT NULL
);


--
-- Name: purchases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchases_id_seq OWNED BY public.purchases.id;


--
-- Name: quotation_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotation_items (
    id integer NOT NULL,
    quotation_id integer NOT NULL,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(15,2) NOT NULL,
    discount numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    vat_rate numeric(5,2) DEFAULT '16'::numeric NOT NULL,
    total numeric(15,2) NOT NULL,
    description text,
    unit text
);


--
-- Name: quotation_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quotation_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quotation_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quotation_items_id_seq OWNED BY public.quotation_items.id;


--
-- Name: quotations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotations (
    id integer NOT NULL,
    quotation_number text NOT NULL,
    customer_id integer,
    subtotal numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    discount_amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    tax_amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    status public.quotation_status DEFAULT 'draft'::public.quotation_status NOT NULL,
    notes text,
    valid_until date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    delivery_time text,
    warranty text,
    payment_terms text,
    branch_id integer NOT NULL
);


--
-- Name: quotations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quotations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quotations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quotations_id_seq OWNED BY public.quotations.id;


--
-- Name: sale_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_items (
    id integer NOT NULL,
    sale_id integer NOT NULL,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(15,2) NOT NULL,
    discount numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    vat_rate numeric(5,2) DEFAULT '16'::numeric NOT NULL,
    total numeric(15,2) NOT NULL
);


--
-- Name: sale_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sale_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sale_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sale_items_id_seq OWNED BY public.sale_items.id;


--
-- Name: sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales (
    id integer NOT NULL,
    receipt_number text NOT NULL,
    customer_id integer,
    subtotal numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    discount_amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    tax_amount numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    amount_paid numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    change numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    payment_method text DEFAULT 'cash'::text NOT NULL,
    cashier_name text,
    status public.sale_status DEFAULT 'completed'::public.sale_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id integer NOT NULL
);


--
-- Name: sales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sales_id_seq OWNED BY public.sales.id;


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id integer NOT NULL,
    product_id integer NOT NULL,
    type public.movement_type NOT NULL,
    quantity integer NOT NULL,
    quantity_before integer NOT NULL,
    quantity_after integer NOT NULL,
    reference text NOT NULL,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id integer NOT NULL
);


--
-- Name: stock_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_movements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_movements_id_seq OWNED BY public.stock_movements.id;


--
-- Name: stock_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_transfers (
    id integer NOT NULL,
    transfer_number text NOT NULL,
    source_branch_id integer NOT NULL,
    destination_branch_id integer NOT NULL,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    transfer_date timestamp with time zone DEFAULT now() NOT NULL,
    initiated_by_id integer,
    initiated_by_name text,
    decided_by_id integer,
    decided_by_name text,
    decided_at timestamp with time zone,
    decision_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_transfers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_transfers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_transfers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_transfers_id_seq OWNED BY public.stock_transfers.id;


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id integer NOT NULL,
    name text NOT NULL,
    contact_person text,
    email text,
    phone text,
    address text,
    city text,
    tax_number text,
    balance numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id integer NOT NULL
);


--
-- Name: suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.suppliers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: suppliers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.suppliers_id_seq OWNED BY public.suppliers.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role public.user_role DEFAULT 'cashier'::public.user_role NOT NULL,
    branch text,
    phone text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id integer,
    totp_secret text,
    totp_enabled boolean DEFAULT false NOT NULL,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    password_changed_at timestamp with time zone
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
-- Name: admin_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notifications ALTER COLUMN id SET DEFAULT nextval('public.admin_notifications_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: branches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches ALTER COLUMN id SET DEFAULT nextval('public.branches_id_seq'::regclass);


--
-- Name: brands id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands ALTER COLUMN id SET DEFAULT nextval('public.brands_id_seq'::regclass);


--
-- Name: business_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_settings ALTER COLUMN id SET DEFAULT nextval('public.business_settings_id_seq'::regclass);


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- Name: data_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_migrations ALTER COLUMN id SET DEFAULT nextval('public.data_migrations_id_seq'::regclass);


--
-- Name: expenses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses ALTER COLUMN id SET DEFAULT nextval('public.expenses_id_seq'::regclass);


--
-- Name: invoice_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items ALTER COLUMN id SET DEFAULT nextval('public.invoice_items_id_seq'::regclass);


--
-- Name: invoice_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_payments ALTER COLUMN id SET DEFAULT nextval('public.invoice_payments_id_seq'::regclass);


--
-- Name: invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);


--
-- Name: login_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_history ALTER COLUMN id SET DEFAULT nextval('public.login_history_id_seq'::regclass);


--
-- Name: product_stock id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_stock ALTER COLUMN id SET DEFAULT nextval('public.product_stock_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: purchase_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items ALTER COLUMN id SET DEFAULT nextval('public.purchase_items_id_seq'::regclass);


--
-- Name: purchases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases ALTER COLUMN id SET DEFAULT nextval('public.purchases_id_seq'::regclass);


--
-- Name: quotation_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_items ALTER COLUMN id SET DEFAULT nextval('public.quotation_items_id_seq'::regclass);


--
-- Name: quotations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations ALTER COLUMN id SET DEFAULT nextval('public.quotations_id_seq'::regclass);


--
-- Name: sale_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items ALTER COLUMN id SET DEFAULT nextval('public.sale_items_id_seq'::regclass);


--
-- Name: sales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales ALTER COLUMN id SET DEFAULT nextval('public.sales_id_seq'::regclass);


--
-- Name: stock_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements ALTER COLUMN id SET DEFAULT nextval('public.stock_movements_id_seq'::regclass);


--
-- Name: stock_transfers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfers ALTER COLUMN id SET DEFAULT nextval('public.stock_transfers_id_seq'::regclass);


--
-- Name: suppliers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers ALTER COLUMN id SET DEFAULT nextval('public.suppliers_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: admin_notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.admin_notifications (id, created_at, title, body, severity, rule_id, audit_log_id, metadata, read_at) FROM stdin;
\.


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_log (id, created_at, actor_id, actor_name, actor_role, ip_address, action, entity_type, entity_id, description, metadata, branch_id) FROM stdin;
1	2026-07-04 19:55:17.006569+00	\N	\N	\N	127.0.0.1	auth.login	user	4	"Super Administrator" logged in (super_admin)	\N	1
2	2026-07-04 19:57:06.490995+00	\N	\N	\N	127.0.0.1	auth.login	user	4	"Super Administrator" logged in (super_admin)	\N	1
3	2026-07-05 09:41:08.88675+00	2	A	super_admin	35.253.72.98	settings.payment_updated	settings	\N	Updated payment settings — changed: mpesaPaybill, bankName, bankAccountNumber	{"after": {"id": 1, "country": "Kenya", "currency": "KES", "logo_url": null, "timezone": "Africa/Nairobi", "vat_rate": 16, "bank_name": "Equity Bank", "smtp_from": null, "smtp_host": null, "smtp_port": 587, "smtp_user": null, "created_at": "2026-07-04T17:07:58.310Z", "mpesa_till": null, "tax_number": "P051234567X", "alert_rules": null, "bank_branch": null, "business_name": "Unique Solar Kenya Ltd", "mpesa_paybill": "400200", "business_email": "sales@uniquesolar.co.ke", "business_phone": "+254 722 000 000", "receipt_footer": "Thank you for choosing Unique Solar Kenya Ltd. Warranty claims require original receipt. All solar systems carry a 12-month installation warranty.", "bank_swift_code": null, "currency_symbol": "KES", "mpesa_buy_goods": null, "business_address": "Moi Avenue, Mombasa CBD, Mombasa County", "bank_account_name": null, "fiscal_year_start": "07-01", "bank_account_number": "0123456789", "backup_alert_enabled": true, "backup_success_notify": false, "mpesa_paybill_account": null, "other_payment_methods": null, "security_alert_enabled": true}, "before": {"id": 1, "country": "Kenya", "currency": "KES", "logo_url": null, "timezone": "Africa/Nairobi", "vat_rate": 16, "bank_name": null, "smtp_from": null, "smtp_host": null, "smtp_port": 587, "smtp_user": null, "created_at": "2026-07-04T17:07:58.310Z", "mpesa_till": null, "tax_number": "P051234567X", "alert_rules": null, "bank_branch": null, "business_name": "Unique Solar Kenya Ltd", "mpesa_paybill": null, "business_email": "sales@uniquesolar.co.ke", "business_phone": "+254 722 000 000", "receipt_footer": "Thank you for choosing Unique Solar Kenya Ltd. Warranty claims require original receipt. All solar systems carry a 12-month installation warranty.", "bank_swift_code": null, "currency_symbol": "KES", "mpesa_buy_goods": null, "business_address": "Moi Avenue, Mombasa CBD, Mombasa County", "bank_account_name": null, "fiscal_year_start": "07-01", "bank_account_number": null, "backup_alert_enabled": true, "backup_success_notify": false, "mpesa_paybill_account": null, "other_payment_methods": null, "security_alert_enabled": true}}	1
4	2026-07-05 11:18:26.471877+00	\N	\N	\N	35.238.15.11	auth.login	user	11	"E2E Tester" logged in (super_admin)	\N	1
5	2026-07-05 11:18:37.533976+00	\N	\N	\N	35.238.15.11	auth.login	user	11	"E2E Tester" logged in (super_admin)	\N	1
9	2026-07-05 11:20:39.191769+00	\N	\N	\N	35.238.15.11	auth.login	user	11	"E2E Tester" logged in (super_admin)	\N	1
16	2026-07-05 11:21:56.160602+00	\N	\N	\N	35.238.15.11	auth.login	user	12	"E2E Tester" logged in (super_admin)	\N	1
19	2026-07-05 12:25:30.980532+00	1	T	super_admin	35.238.15.11	settings.branding_updated	settings	\N	Updated branding & document settings — changed: tagline	{"after": {"id": 1, "country": "Kenya", "tagline": "Your Trusted Solar Energy Partner", "website": null, "currency": "KES", "logo_url": null, "timezone": "Africa/Nairobi", "vat_rate": 16, "bank_name": "Equity Bank", "smtp_from": null, "smtp_host": null, "smtp_port": 587, "smtp_user": null, "stamp_url": null, "created_at": "2026-07-04T17:07:58.310Z", "mpesa_till": null, "tax_number": "P051234567X", "vat_number": null, "alert_rules": null, "bank_branch": null, "business_name": "Unique Solar Kenya Ltd", "mpesa_paybill": "400200", "primary_color": null, "return_policy": null, "signature_url": null, "warranty_text": null, "business_email": "sales@uniquesolar.co.ke", "business_phone": "+254 722 000 000", "receipt_footer": "Thank you for choosing Unique Solar Kenya Ltd. Warranty claims require original receipt. All solar systems carry a 12-month installation warranty.", "bank_swift_code": null, "business_phone2": null, "currency_symbol": "KES", "document_footer": null, "mpesa_buy_goods": null, "secondary_color": null, "business_address": "Moi Avenue, Mombasa CBD, Mombasa County", "bank_account_name": null, "fiscal_year_start": "07-01", "bank_account_number": "0123456789", "backup_alert_enabled": true, "backup_success_notify": false, "invoice_payment_terms": null, "mpesa_paybill_account": null, "other_payment_methods": null, "security_alert_enabled": true, "quotation_validity_days": null}, "before": {"id": 1, "country": "Kenya", "tagline": null, "website": null, "currency": "KES", "logo_url": null, "timezone": "Africa/Nairobi", "vat_rate": 16, "bank_name": "Equity Bank", "smtp_from": null, "smtp_host": null, "smtp_port": 587, "smtp_user": null, "stamp_url": null, "created_at": "2026-07-04T17:07:58.310Z", "mpesa_till": null, "tax_number": "P051234567X", "vat_number": null, "alert_rules": null, "bank_branch": null, "business_name": "Unique Solar Kenya Ltd", "mpesa_paybill": "400200", "primary_color": null, "return_policy": null, "signature_url": null, "warranty_text": null, "business_email": "sales@uniquesolar.co.ke", "business_phone": "+254 722 000 000", "receipt_footer": "Thank you for choosing Unique Solar Kenya Ltd. Warranty claims require original receipt. All solar systems carry a 12-month installation warranty.", "bank_swift_code": null, "business_phone2": null, "currency_symbol": "KES", "document_footer": null, "mpesa_buy_goods": null, "secondary_color": null, "business_address": "Moi Avenue, Mombasa CBD, Mombasa County", "bank_account_name": null, "fiscal_year_start": "07-01", "bank_account_number": "0123456789", "backup_alert_enabled": true, "backup_success_notify": false, "invoice_payment_terms": null, "mpesa_paybill_account": null, "other_payment_methods": null, "security_alert_enabled": true, "quotation_validity_days": null}}	1
20	2026-07-05 13:50:25.270404+00	\N	\N	\N	35.238.15.11	auth.login	user	13	"QA Temp" logged in (super_admin)	\N	\N
21	2026-07-05 13:53:52.467579+00	13	QA Temp	super_admin	35.238.15.11	branch.created	branch	2	Created branch "rB6OKo" (Lvqp)	\N	1
22	2026-07-05 13:54:13.831368+00	13	QA Temp	super_admin	35.238.15.11	branch.updated	branch	2	Updated branch "rB6OKo" (Lvqp)	\N	1
23	2026-07-05 13:54:19.573431+00	13	QA Temp	super_admin	35.238.15.11	branch.updated	branch	2	Updated branch "rB6OKo" (Lvqp)	\N	1
24	2026-07-05 13:55:09.305565+00	13	QA Temp	super_admin	35.238.15.11	user.created	user	14	Created user "DiqEzE" (u-hc-Cqjw6@uniquepos.test) with role cashier	\N	1
25	2026-07-05 14:13:50.064767+00	\N	\N	\N	35.238.15.11	auth.login	user	1	"Super Admin" logged in (super_admin)	\N	\N
26	2026-07-05 14:13:50.28168+00	1	Super Admin	super_admin	35.238.15.11	stock.transfer_created	stock_transfer	1	Created transfer TRF-2026-000001: 20 × "100W Monocrystalline Solar Panel" from Main Branch to West Branch (pending approval)	{"quantity": 20, "source_stock": {"after": 30, "before": 50}, "source_branch": "Main Branch", "transfer_number": "TRF-2026-000001", "destination_branch": "West Branch"}	1
27	2026-07-05 14:13:50.414939+00	1	Super Admin	super_admin	35.238.15.11	stock.transfer_approved	stock_transfer	1	Approved transfer TRF-2026-000001: 20 × "100W Monocrystalline Solar Panel" credited to West Branch	{"quantity": 20, "transfer_number": "TRF-2026-000001", "destination_stock": {"after": 20, "before": 0}, "destination_branch": "West Branch"}	1
28	2026-07-05 14:14:02.667713+00	\N	\N	\N	35.238.15.11	auth.login	user	1	"Super Admin" logged in (super_admin)	\N	\N
29	2026-07-05 14:14:02.763507+00	1	Super Admin	super_admin	35.238.15.11	stock.transfer_created	stock_transfer	2	Created transfer TRF-2026-000002: 10 × "100W Monocrystalline Solar Panel" from Main Branch to West Branch (pending approval)	{"quantity": 10, "source_stock": {"after": 20, "before": 30}, "source_branch": "Main Branch", "transfer_number": "TRF-2026-000002", "destination_branch": "West Branch"}	1
30	2026-07-05 14:14:02.93687+00	1	Super Admin	super_admin	35.238.15.11	stock.transfer_rejected	stock_transfer	2	Rejected transfer TRF-2026-000002: 10 × "100W Monocrystalline Solar Panel" — hold released back to Main Branch. Reason: not needed	{"reason": "not needed", "quantity": 10, "source_stock": {"after": 30, "before": 20}, "source_branch": "Main Branch", "transfer_number": "TRF-2026-000002"}	1
31	2026-07-05 14:14:19.343857+00	\N	\N	\N	35.238.15.11	auth.login	user	15	"West Storekeeper" logged in (storekeeper)	\N	\N
32	2026-07-05 14:14:19.4632+00	15	West Storekeeper	storekeeper	35.238.15.11	stock.transfer_created	stock_transfer	3	Created transfer TRF-2026-000003: 5 × "100W Monocrystalline Solar Panel" from West Branch to Main Branch (pending approval)	{"quantity": 5, "source_stock": {"after": 15, "before": 20}, "source_branch": "West Branch", "transfer_number": "TRF-2026-000003", "destination_branch": "Main Branch"}	3
33	2026-07-05 14:17:39.899944+00	\N	\N	\N	35.238.15.11	auth.login	user	1	"Super Admin" logged in (super_admin)	\N	\N
34	2026-07-05 14:17:39.986943+00	1	Super Admin	super_admin	35.238.15.11	stock.transfer_created	stock_transfer	4	Created transfer TRF-2026-000001: 10 × "100W Monocrystalline Solar Panel" from Main Branch to West Branch (pending approval)	{"quantity": 10, "source_stock": {"after": 40, "before": 50}, "source_branch": "Main Branch", "transfer_number": "TRF-2026-000001", "destination_branch": "West Branch"}	1
35	2026-07-05 14:17:40.162505+00	1	Super Admin	super_admin	35.238.15.11	stock.transfer_approved	stock_transfer	4	Approved transfer TRF-2026-000001: 10 × "100W Monocrystalline Solar Panel" credited to West Branch	{"quantity": 10, "transfer_number": "TRF-2026-000001", "destination_stock": {"after": 10, "before": 0}, "destination_branch": "West Branch"}	1
36	2026-07-05 14:41:07.229424+00	\N	\N	\N	35.238.15.11	auth.login	user	1	"Super Admin" logged in (super_admin)	\N	\N
37	2026-07-05 14:41:19.989948+00	\N	\N	\N	35.238.15.11	auth.login	user	1	"Super Admin" logged in (super_admin)	\N	\N
38	2026-07-05 14:41:32.880089+00	\N	\N	\N	35.238.15.11	auth.login	user	1	"Super Admin" logged in (super_admin)	\N	\N
39	2026-07-05 14:41:49.609468+00	\N	\N	\N	35.238.15.11	auth.login	user	1	"Super Admin" logged in (super_admin)	\N	\N
40	2026-07-05 14:41:49.734762+00	\N	\N	\N	35.238.15.11	auth.login_failed	user	\N	Failed login attempt for "store@uniquepos.com" — user not found or inactive	\N	\N
41	2026-07-06 02:43:12.193196+00	\N	\N	\N	105.163.157.1	auth.login_failed	user	1	Failed login attempt for "admin@uniquepos.com" — wrong password	\N	\N
42	2026-07-06 02:45:27.038008+00	\N	\N	\N	105.163.157.1	auth.login_failed	user	1	Failed login attempt for "admin@uniquepos.com" — wrong password	\N	\N
43	2026-07-06 02:46:11.612814+00	\N	\N	\N	105.163.157.1	auth.login_failed	user	\N	Failed login attempt for "admin@uniquePOS.com" — user not found or inactive	\N	\N
44	2026-07-06 14:32:15.973747+00	\N	\N	\N	102.208.164.188	auth.login_failed	user	\N	Failed login attempt for "muchangi.tony@gmail.com" — user not found or inactive	\N	\N
45	2026-07-06 16:15:52.905434+00	\N	\N	\N	127.0.0.1	auth.login	user	1	"Super Admin" logged in (super_admin)	\N	\N
46	2026-07-06 16:22:38.575012+00	\N	\N	\N	127.0.0.1	auth.login	user	1	"Super Admin" logged in (super_admin)	\N	\N
47	2026-07-06 16:23:04.128803+00	\N	\N	\N	127.0.0.1	auth.login	user	1	"Super Admin" logged in (super_admin)	\N	\N
48	2026-07-06 19:07:55.164743+00	\N	\N	\N	127.0.0.1	auth.login	user	1	"Super Admin" logged in (super_admin)	\N	\N
\.


--
-- Data for Name: branches; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.branches (id, name, code, address, county, phone, phone2, email, manager, kra_pin, paybill_number, paybill_account, till_number, bank_name, bank_account_name, bank_account_number, logo_url, receipt_footer, invoice_footer, quotation_footer, is_active, created_at) FROM stdin;
1	Main Branch	MAIN	\N	\N	+254 722 000 000	\N	sales@uniquesolar.co.ke	\N	\N	400200	\N	\N	Equity Bank	\N	0123456789	\N	\N	\N	\N	t	2026-07-05 13:11:44.763009+00
3	West Branch	WEST	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	2026-07-05 14:13:14.086586+00
\.


--
-- Data for Name: brands; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.brands (id, name, description, created_at) FROM stdin;
1	Jinko Solar	One of the world's largest solar panel manufacturers, known for high-efficiency monocrystalline modules	2026-07-04 18:21:55.762535+00
2	Canadian Solar	Global solar module manufacturer with a strong presence in the East African market	2026-07-04 18:21:55.762535+00
3	LONGi Solar	World leading mono silicon solar manufacturer, Hi-MO series	2026-07-04 18:21:55.762535+00
4	Felicity Solar	Popular African-market solar brand offering panels, inverters, and complete solar systems	2026-07-04 18:21:55.762535+00
5	Victron Energy	Dutch manufacturer of premium solar charge controllers, inverters, and battery monitors	2026-07-04 18:21:55.762535+00
6	Growatt	Leading Chinese hybrid and off-grid inverter manufacturer widely used in Kenya	2026-07-04 18:21:55.762535+00
7	Voltronic Power	Manufacturer of the popular Axpert series hybrid inverters	2026-07-04 18:21:55.762535+00
8	Solarmax	Swiss-based solar inverter and system brand with East African distribution	2026-07-04 18:21:55.762535+00
9	Pylontech	World-class LiFePO4 battery manufacturer used in residential and commercial storage	2026-07-04 18:21:55.762535+00
10	Hubble Lithium	South African LiFePO4 battery manufacturer optimised for African solar applications	2026-07-04 18:21:55.762535+00
11	Epever	EPEVER MPPT and PWM solar charge controllers, widely used in off-grid systems	2026-07-04 18:21:55.762535+00
12	Schneider Electric	Global leader in energy management, switchgear, MCBs, and distribution boards	2026-07-04 18:21:55.762535+00
13	ABB	Swiss-Swedish multinational manufacturing MCBs, RCCBs, and industrial switchgear	2026-07-04 18:21:55.762535+00
14	Legrand	French electrical and data infrastructure specialist — sockets, switches, trunking	2026-07-04 18:21:55.762535+00
15	Hager	European manufacturer of MCBs, RCCBs, and consumer units	2026-07-04 18:21:55.762535+00
16	Havells	Indian electrical equipment manufacturer with strong Kenyan market presence	2026-07-04 18:21:55.762535+00
17	Polycab	Leading Indian manufacturer of wires and cables	2026-07-04 18:21:55.762535+00
18	Philips	Global lighting brand offering LED bulbs, floodlights, and commercial fittings	2026-07-04 18:21:55.762535+00
19	Osram	German lighting manufacturer, Ledvance LED range for commercial and residential	2026-07-04 18:21:55.762535+00
20	Grundfos	Danish world leader in pump manufacturing for water supply and solar pumping	2026-07-04 18:21:55.762535+00
21	Bosch	German multinational — power tools, drill bits, and professional installation equipment	2026-07-04 18:21:55.762535+00
22	Bruhm	Popular East African brand for energy-efficient domestic appliances	2026-07-04 18:21:55.762535+00
23	Samsung	Korean multinational — energy-efficient refrigerators and televisions	2026-07-04 18:21:55.762535+00
24	Lorentz	German manufacturer specialising in solar water pumping systems	2026-07-04 18:21:55.762535+00
25	Generic	Quality-assured unbranded or own-label products for accessories and consumables	2026-07-04 18:21:55.762535+00
\.


--
-- Data for Name: business_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.business_settings (id, business_name, business_address, business_phone, business_email, tax_number, currency, currency_symbol, vat_rate, logo_url, receipt_footer, fiscal_year_start, country, timezone, created_at, smtp_host, smtp_port, smtp_user, smtp_from, backup_alert_enabled, backup_success_notify, security_alert_enabled, alert_rules, mpesa_paybill, mpesa_paybill_account, mpesa_till, mpesa_buy_goods, bank_name, bank_branch, bank_account_name, bank_account_number, bank_swift_code, other_payment_methods, tagline, website, vat_number, business_phone2, primary_color, secondary_color, stamp_url, signature_url, document_footer, warranty_text, return_policy, quotation_validity_days, invoice_payment_terms, payment_instructions, body_font, heading_font, session_timeout_minutes, password_min_length, password_require_uppercase, password_require_number, password_require_symbol, max_failed_logins, lockout_minutes) FROM stdin;
1	Unique Solar Kenya Ltd	Moi Avenue, Mombasa CBD, Mombasa County	+254 722 000 000	sales@uniquesolar.co.ke	P051234567X	KES	KES	16.00	\N	Thank you for choosing Unique Solar Kenya Ltd. Warranty claims require original receipt. All solar systems carry a 12-month installation warranty.	07-01	Kenya	Africa/Nairobi	2026-07-04 17:07:58.310364+00	\N	587	\N	\N	t	f	t	\N	400200	\N	\N	\N	Equity Bank	\N	\N	0123456789	\N	\N	Your Trusted Solar Energy Partner	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	10080	8	t	t	f	5	15
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.categories (id, name, description, created_at) FROM stdin;
1	Solar Panels	Monocrystalline and polycrystalline photovoltaic panels for off-grid, hybrid, and grid-tied systems	2026-07-04 18:21:42.74701+00
2	Inverters	Pure sine wave inverters, hybrid inverters, and off-grid inverters for solar energy conversion	2026-07-04 18:21:42.74701+00
3	Lithium Batteries	LiFePO4 lithium iron phosphate battery banks for solar energy storage	2026-07-04 18:21:42.74701+00
4	Charge Controllers	PWM and MPPT solar charge controllers for battery regulation	2026-07-04 18:21:42.74701+00
5	Mounting Structures	Roof, ground, and pole mount frames and racking systems for solar panels	2026-07-04 18:21:42.74701+00
6	Solar Cables	UV-resistant PV solar cables, MC4 connectors, and DC wiring accessories	2026-07-04 18:21:42.74701+00
7	DC Protection	DC circuit breakers, fuses, ANL holders, surge arresters, and battery disconnect switches	2026-07-04 18:21:42.74701+00
8	AC Protection	AC surge protectors, RCCBs, RCBOs, and AC circuit breakers for inverter output protection	2026-07-04 18:21:42.74701+00
9	Electrical Cables	Single-core, twin-and-earth, and armoured cables for general electrical wiring	2026-07-04 18:21:42.74701+00
10	Switchgear	Isolator switches, main switches, manual and automatic transfer switches	2026-07-04 18:21:42.74701+00
11	Lighting	LED bulbs, floodlights, batten fittings, solar street lights, and DC LED products	2026-07-04 18:21:42.74701+00
12	Conduits & Trunking	PVC conduits, trunking, clips, elbows, and cable management accessories	2026-07-04 18:21:42.74701+00
13	Sockets & Switches	Single and double sockets, switches, USB outlets, fused spurs, and weatherproof sockets	2026-07-04 18:21:42.74701+00
14	Distribution Boards	Consumer units, DB boxes, split boards, and IP-rated enclosures	2026-07-04 18:21:42.74701+00
15	Circuit Breakers	Single-pole and double-pole MCBs for residential and commercial distribution	2026-07-04 18:21:42.74701+00
16	Tools	Electrical and solar installation tools, testers, crimpers, and site accessories	2026-07-04 18:21:42.74701+00
17	Water Pumps	Solar DC water pumps, AC submersible pumps, surface pumps, and pump controllers	2026-07-04 18:21:42.74701+00
18	Small Appliances	Energy-efficient DC and low-wattage AC appliances suitable for solar-powered homes	2026-07-04 18:21:42.74701+00
19	Accessories	Cable lugs, bus bars, battery monitors, din rails, earthing, and electrical consumables	2026-07-04 18:21:42.74701+00
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customers (id, name, email, phone, address, city, tax_number, credit_limit, balance, created_at, company, contact_person, branch_id) FROM stdin;
\.


--
-- Data for Name: data_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.data_migrations (id, name, applied_at) FROM stdin;
1	wipe-demo-transactional-data-2026-07-04	2026-07-04 19:11:20.719562+00
2	seed-main-branch-and-backfill-2026-07-05	2026-07-05 13:11:44.851525+00
\.


--
-- Data for Name: document_sequences; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.document_sequences (doc_type, year, last_number) FROM stdin;
\.


--
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.expenses (id, description, amount, category, payment_method, reference, notes, date, created_at, branch_id) FROM stdin;
\.


--
-- Data for Name: invoice_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invoice_items (id, invoice_id, product_id, quantity, unit_price, discount, vat_rate, total, description, unit) FROM stdin;
\.


--
-- Data for Name: invoice_payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invoice_payments (id, invoice_id, amount, method, reference, notes, created_at) FROM stdin;
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invoices (id, invoice_number, customer_id, subtotal, discount_amount, tax_amount, total, amount_paid, balance_due, status, due_date, notes, created_at, branch_id) FROM stdin;
\.


--
-- Data for Name: login_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.login_history (id, user_id, email, success, reason, ip_address, user_agent, created_at) FROM stdin;
1	13	qa-temp@uniquepos.test	t	\N	35.238.15.11	Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36	2026-07-05 13:50:25.094677+00
2	1	admin@uniquepos.com	t	\N	35.238.15.11	curl/8.14.1	2026-07-05 14:13:50.057271+00
3	1	admin@uniquepos.com	t	\N	35.238.15.11	curl/8.14.1	2026-07-05 14:14:02.660539+00
4	15	store@uniquepos.com	t	\N	35.238.15.11	curl/8.14.1	2026-07-05 14:14:19.336184+00
5	1	admin@uniquepos.com	t	\N	35.238.15.11	curl/8.14.1	2026-07-05 14:17:39.89145+00
6	1	admin@uniquepos.com	t	\N	35.238.15.11	curl/8.14.1	2026-07-05 14:41:07.222512+00
7	1	admin@uniquepos.com	t	\N	35.238.15.11	curl/8.14.1	2026-07-05 14:41:19.980082+00
8	1	admin@uniquepos.com	t	\N	35.238.15.11	curl/8.14.1	2026-07-05 14:41:32.773705+00
9	1	admin@uniquepos.com	t	\N	35.238.15.11	curl/8.14.1	2026-07-05 14:41:49.602549+00
10	\N	store@uniquepos.com	f	unknown_user	35.238.15.11	curl/8.14.1	2026-07-05 14:41:49.728508+00
11	1	admin@uniquepos.com	f	wrong_password	105.163.157.1	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36	2026-07-06 02:43:12.174807+00
12	1	admin@uniquepos.com	f	wrong_password	105.163.157.1	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36	2026-07-06 02:45:27.030743+00
13	\N	admin@uniquePOS.com	f	unknown_user	105.163.157.1	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36	2026-07-06 02:46:11.60458+00
14	\N	muchangi.tony@gmail.com	f	unknown_user	102.208.164.188	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	2026-07-06 14:32:15.66195+00
15	1	admin@uniquepos.com	t	\N	127.0.0.1	curl/8.14.1	2026-07-06 16:15:52.899401+00
16	1	admin@uniquepos.com	t	\N	127.0.0.1	curl/8.14.1	2026-07-06 16:22:38.570362+00
17	1	admin@uniquepos.com	t	\N	127.0.0.1	curl/8.14.1	2026-07-06 16:23:04.12483+00
18	1	admin@uniquepos.com	t	\N	127.0.0.1	node	2026-07-06 19:07:55.157921+00
\.


--
-- Data for Name: product_stock; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_stock (id, branch_id, product_id, current_stock, min_stock, created_at) FROM stdin;
1	1	125	0	60	2026-07-05 13:11:44.799711+00
3	1	2	0	8	2026-07-05 13:11:44.799711+00
4	1	3	0	6	2026-07-05 13:11:44.799711+00
5	1	4	0	10	2026-07-05 13:11:44.799711+00
6	1	5	0	15	2026-07-05 13:11:44.799711+00
7	1	6	0	10	2026-07-05 13:11:44.799711+00
8	1	7	0	8	2026-07-05 13:11:44.799711+00
9	1	8	0	5	2026-07-05 13:11:44.799711+00
10	1	9	0	5	2026-07-05 13:11:44.799711+00
11	1	10	0	4	2026-07-05 13:11:44.799711+00
12	1	11	0	3	2026-07-05 13:11:44.799711+00
13	1	12	0	3	2026-07-05 13:11:44.799711+00
14	1	69	0	10	2026-07-05 13:11:44.799711+00
15	1	13	0	3	2026-07-05 13:11:44.799711+00
16	1	14	0	3	2026-07-05 13:11:44.799711+00
17	1	15	0	2	2026-07-05 13:11:44.799711+00
18	1	16	0	2	2026-07-05 13:11:44.799711+00
19	1	17	0	2	2026-07-05 13:11:44.799711+00
20	1	18	0	2	2026-07-05 13:11:44.799711+00
21	1	19	0	5	2026-07-05 13:11:44.799711+00
22	1	20	0	5	2026-07-05 13:11:44.799711+00
23	1	21	0	4	2026-07-05 13:11:44.799711+00
24	1	22	0	3	2026-07-05 13:11:44.799711+00
25	1	23	0	3	2026-07-05 13:11:44.799711+00
26	1	24	0	2	2026-07-05 13:11:44.799711+00
27	1	25	0	2	2026-07-05 13:11:44.799711+00
28	1	26	0	10	2026-07-05 13:11:44.799711+00
29	1	27	0	10	2026-07-05 13:11:44.799711+00
30	1	28	0	8	2026-07-05 13:11:44.799711+00
31	1	29	0	6	2026-07-05 13:11:44.799711+00
32	1	30	0	5	2026-07-05 13:11:44.799711+00
33	1	31	0	4	2026-07-05 13:11:44.799711+00
34	1	32	0	3	2026-07-05 13:11:44.799711+00
35	1	33	0	8	2026-07-05 13:11:44.799711+00
36	1	34	0	5	2026-07-05 13:11:44.799711+00
37	1	35	0	4	2026-07-05 13:11:44.799711+00
38	1	36	0	6	2026-07-05 13:11:44.799711+00
39	1	37	0	3	2026-07-05 13:11:44.799711+00
40	1	38	0	80	2026-07-05 13:11:44.799711+00
41	1	39	0	80	2026-07-05 13:11:44.799711+00
42	1	40	0	40	2026-07-05 13:11:44.799711+00
43	1	41	0	4	2026-07-05 13:11:44.799711+00
44	1	42	0	120	2026-07-05 13:11:44.799711+00
45	1	43	0	120	2026-07-05 13:11:44.799711+00
46	1	44	0	80	2026-07-05 13:11:44.799711+00
47	1	45	0	80	2026-07-05 13:11:44.799711+00
48	1	46	0	80	2026-07-05 13:11:44.799711+00
49	1	47	0	40	2026-07-05 13:11:44.799711+00
50	1	48	0	10	2026-07-05 13:11:44.799711+00
51	1	49	0	5	2026-07-05 13:11:44.799711+00
52	1	50	0	15	2026-07-05 13:11:44.799711+00
53	1	51	0	12	2026-07-05 13:11:44.799711+00
54	1	52	0	8	2026-07-05 13:11:44.799711+00
55	1	53	0	8	2026-07-05 13:11:44.799711+00
56	1	54	0	20	2026-07-05 13:11:44.799711+00
57	1	55	0	20	2026-07-05 13:11:44.799711+00
58	1	56	0	20	2026-07-05 13:11:44.799711+00
59	1	57	0	15	2026-07-05 13:11:44.799711+00
60	1	58	0	10	2026-07-05 13:11:44.799711+00
61	1	59	0	10	2026-07-05 13:11:44.799711+00
62	1	60	0	8	2026-07-05 13:11:44.799711+00
63	1	61	0	4	2026-07-05 13:11:44.799711+00
64	1	62	0	10	2026-07-05 13:11:44.799711+00
65	1	63	0	8	2026-07-05 13:11:44.799711+00
66	1	64	0	12	2026-07-05 13:11:44.799711+00
67	1	65	0	12	2026-07-05 13:11:44.799711+00
68	1	66	0	10	2026-07-05 13:11:44.799711+00
69	1	67	0	8	2026-07-05 13:11:44.799711+00
70	1	68	0	10	2026-07-05 13:11:44.799711+00
71	1	70	0	8	2026-07-05 13:11:44.799711+00
72	1	71	0	6	2026-07-05 13:11:44.799711+00
73	1	72	0	4	2026-07-05 13:11:44.799711+00
74	1	73	0	200	2026-07-05 13:11:44.799711+00
75	1	74	0	200	2026-07-05 13:11:44.799711+00
76	1	75	0	150	2026-07-05 13:11:44.799711+00
77	1	76	0	150	2026-07-05 13:11:44.799711+00
78	1	77	0	100	2026-07-05 13:11:44.799711+00
79	1	78	0	100	2026-07-05 13:11:44.799711+00
80	1	79	0	80	2026-07-05 13:11:44.799711+00
81	1	80	0	60	2026-07-05 13:11:44.799711+00
82	1	81	0	50	2026-07-05 13:11:44.799711+00
83	1	82	0	120	2026-07-05 13:11:44.799711+00
84	1	83	0	100	2026-07-05 13:11:44.799711+00
85	1	84	0	60	2026-07-05 13:11:44.799711+00
86	1	85	0	50	2026-07-05 13:11:44.799711+00
87	1	86	0	40	2026-07-05 13:11:44.799711+00
88	1	87	0	30	2026-07-05 13:11:44.799711+00
89	1	88	0	10	2026-07-05 13:11:44.799711+00
90	1	89	0	8	2026-07-05 13:11:44.799711+00
91	1	90	0	4	2026-07-05 13:11:44.799711+00
92	1	91	0	6	2026-07-05 13:11:44.799711+00
93	1	92	0	6	2026-07-05 13:11:44.799711+00
94	1	93	0	4	2026-07-05 13:11:44.799711+00
95	1	94	0	4	2026-07-05 13:11:44.799711+00
96	1	95	0	3	2026-07-05 13:11:44.799711+00
97	1	96	0	2	2026-07-05 13:11:44.799711+00
98	1	97	0	60	2026-07-05 13:11:44.799711+00
99	1	98	0	50	2026-07-05 13:11:44.799711+00
100	1	99	0	40	2026-07-05 13:11:44.799711+00
101	1	100	0	20	2026-07-05 13:11:44.799711+00
102	1	101	0	15	2026-07-05 13:11:44.799711+00
103	1	102	0	15	2026-07-05 13:11:44.799711+00
104	1	103	0	10	2026-07-05 13:11:44.799711+00
105	1	104	0	15	2026-07-05 13:11:44.799711+00
106	1	105	0	15	2026-07-05 13:11:44.799711+00
107	1	106	0	8	2026-07-05 13:11:44.799711+00
108	1	107	0	5	2026-07-05 13:11:44.799711+00
109	1	108	0	3	2026-07-05 13:11:44.799711+00
110	1	109	0	15	2026-07-05 13:11:44.799711+00
111	1	110	0	80	2026-07-05 13:11:44.799711+00
112	1	111	0	60	2026-07-05 13:11:44.799711+00
113	1	112	0	50	2026-07-05 13:11:44.799711+00
114	1	113	0	120	2026-07-05 13:11:44.799711+00
115	1	114	0	80	2026-07-05 13:11:44.799711+00
116	1	115	0	80	2026-07-05 13:11:44.799711+00
117	1	116	0	30	2026-07-05 13:11:44.799711+00
118	1	117	0	60	2026-07-05 13:11:44.799711+00
119	1	118	0	50	2026-07-05 13:11:44.799711+00
120	1	119	0	40	2026-07-05 13:11:44.799711+00
121	1	120	0	80	2026-07-05 13:11:44.799711+00
122	1	121	0	50	2026-07-05 13:11:44.799711+00
123	1	122	0	50	2026-07-05 13:11:44.799711+00
124	1	123	0	40	2026-07-05 13:11:44.799711+00
125	1	124	0	30	2026-07-05 13:11:44.799711+00
126	1	126	0	50	2026-07-05 13:11:44.799711+00
127	1	127	0	40	2026-07-05 13:11:44.799711+00
128	1	128	0	20	2026-07-05 13:11:44.799711+00
129	1	129	0	20	2026-07-05 13:11:44.799711+00
130	1	130	0	10	2026-07-05 13:11:44.799711+00
131	1	131	0	10	2026-07-05 13:11:44.799711+00
132	1	132	0	8	2026-07-05 13:11:44.799711+00
133	1	133	0	8	2026-07-05 13:11:44.799711+00
134	1	134	0	6	2026-07-05 13:11:44.799711+00
135	1	135	0	4	2026-07-05 13:11:44.799711+00
136	1	136	0	5	2026-07-05 13:11:44.799711+00
137	1	137	0	8	2026-07-05 13:11:44.799711+00
138	1	138	0	6	2026-07-05 13:11:44.799711+00
139	1	139	0	5	2026-07-05 13:11:44.799711+00
140	1	140	0	40	2026-07-05 13:11:44.799711+00
141	1	141	0	50	2026-07-05 13:11:44.799711+00
142	1	142	0	60	2026-07-05 13:11:44.799711+00
143	1	143	0	40	2026-07-05 13:11:44.799711+00
144	1	144	0	30	2026-07-05 13:11:44.799711+00
145	1	145	0	30	2026-07-05 13:11:44.799711+00
146	1	146	0	20	2026-07-05 13:11:44.799711+00
147	1	147	0	15	2026-07-05 13:11:44.799711+00
148	1	148	0	20	2026-07-05 13:11:44.799711+00
149	1	149	0	25	2026-07-05 13:11:44.799711+00
150	1	150	0	20	2026-07-05 13:11:44.799711+00
151	1	151	0	20	2026-07-05 13:11:44.799711+00
152	1	152	0	15	2026-07-05 13:11:44.799711+00
153	1	153	0	8	2026-07-05 13:11:44.799711+00
154	1	154	0	6	2026-07-05 13:11:44.799711+00
155	1	155	0	4	2026-07-05 13:11:44.799711+00
156	1	156	0	8	2026-07-05 13:11:44.799711+00
157	1	157	0	5	2026-07-05 13:11:44.799711+00
158	1	158	0	3	2026-07-05 13:11:44.799711+00
159	1	159	0	2	2026-07-05 13:11:44.799711+00
160	1	160	0	8	2026-07-05 13:11:44.799711+00
161	1	161	0	60	2026-07-05 13:11:44.799711+00
162	1	162	0	30	2026-07-05 13:11:44.799711+00
163	1	163	0	8	2026-07-05 13:11:44.799711+00
164	1	164	0	4	2026-07-05 13:11:44.799711+00
165	1	165	0	5	2026-07-05 13:11:44.799711+00
166	1	166	0	4	2026-07-05 13:11:44.799711+00
167	1	167	0	3	2026-07-05 13:11:44.799711+00
168	1	168	0	3	2026-07-05 13:11:44.799711+00
169	1	169	0	3	2026-07-05 13:11:44.799711+00
170	1	170	0	3	2026-07-05 13:11:44.799711+00
171	1	171	0	3	2026-07-05 13:11:44.799711+00
172	1	172	0	3	2026-07-05 13:11:44.799711+00
173	1	173	0	3	2026-07-05 13:11:44.799711+00
174	1	174	0	10	2026-07-05 13:11:44.799711+00
175	1	175	0	3	2026-07-05 13:11:44.799711+00
176	1	176	0	2	2026-07-05 13:11:44.799711+00
177	1	177	0	2	2026-07-05 13:11:44.799711+00
178	1	178	0	3	2026-07-05 13:11:44.799711+00
179	1	179	0	4	2026-07-05 13:11:44.799711+00
180	1	180	0	2	2026-07-05 13:11:44.799711+00
181	1	181	0	2	2026-07-05 13:11:44.799711+00
182	1	182	0	4	2026-07-05 13:11:44.799711+00
183	1	183	0	4	2026-07-05 13:11:44.799711+00
184	1	184	0	4	2026-07-05 13:11:44.799711+00
185	1	185	0	2	2026-07-05 13:11:44.799711+00
186	1	186	0	10	2026-07-05 13:11:44.799711+00
187	1	187	0	15	2026-07-05 13:11:44.799711+00
188	1	188	0	15	2026-07-05 13:11:44.799711+00
189	1	189	0	15	2026-07-05 13:11:44.799711+00
190	1	190	0	6	2026-07-05 13:11:44.799711+00
191	1	191	0	20	2026-07-05 13:11:44.799711+00
192	1	192	0	15	2026-07-05 13:11:44.799711+00
193	1	193	0	12	2026-07-05 13:11:44.799711+00
194	1	194	0	20	2026-07-05 13:11:44.799711+00
195	1	195	0	8	2026-07-05 13:11:44.799711+00
196	1	196	0	15	2026-07-05 13:11:44.799711+00
197	1	197	0	25	2026-07-05 13:11:44.799711+00
198	1	198	0	12	2026-07-05 13:11:44.799711+00
199	1	199	0	10	2026-07-05 13:11:44.799711+00
200	1	200	0	8	2026-07-05 13:11:44.799711+00
2	1	1	50	10	2026-07-05 13:11:44.799711+00
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.products (id, product_code, barcode, product_name, description, category_id, brand_id, supplier_id, cost_price, selling_price, vat_rate, current_stock, min_stock, image_url, unit, created_at) FROM stdin;
125	USK-SS-005	\N	1-Gang 1-Way Light Switch (White, Flush)	1-gang 1-way switch, white flat plate, for standard lighting circuits	13	16	\N	150.00	260.00	16.00	0	60	\N	PCS	2026-07-04 18:26:24.823596+00
1	USK-SP-001	\N	100W Monocrystalline Solar Panel	Grade A 100W mono panel, 18V Voc, IP68 junction box, 25-year power output warranty	1	1	\N	4800.00	6800.00	16.00	0	10	\N	PCS	2026-07-04 18:24:23.042112+00
2	USK-SP-002	\N	200W Monocrystalline Solar Panel	Grade A 200W mono panel, 24V system compatible, aluminium frame, 5 busbars	1	2	\N	9500.00	13500.00	16.00	0	8	\N	PCS	2026-07-04 18:24:23.042112+00
3	USK-SP-003	\N	250W Polycrystalline Solar Panel	250W poly panel, cost-effective for large installations, 60-cell	1	2	\N	10500.00	15000.00	16.00	0	6	\N	PCS	2026-07-04 18:24:23.042112+00
4	USK-SP-004	\N	300W Monocrystalline Solar Panel	300W mono panel, 24V/48V system ready, high-efficiency 60-cell module	1	3	\N	12500.00	17500.00	16.00	0	10	\N	PCS	2026-07-04 18:24:23.042112+00
5	USK-SP-005	\N	400W Mono Half-Cell Solar Panel	400W half-cell PERC panel, dual-glass option, excellent low-light performance	1	1	\N	15500.00	22000.00	16.00	0	15	\N	PCS	2026-07-04 18:24:23.042112+00
6	USK-SP-006	\N	500W Mono Half-Cell Solar Panel	500W premium half-cell panel, 48V system optimised, 25-year linear warranty	1	3	\N	19000.00	27500.00	16.00	0	10	\N	PCS	2026-07-04 18:24:23.042112+00
7	USK-SP-007	\N	550W Mono Half-Cell Solar Panel	550W large format half-cell panel, ideal for commercial rooftop systems	1	1	\N	21000.00	30000.00	16.00	0	8	\N	PCS	2026-07-04 18:24:23.042112+00
8	USK-SP-008	\N	100W Flexible Solar Panel	Lightweight flexible mono panel, suitable for curved surfaces and marine use	1	4	\N	7500.00	12000.00	16.00	0	5	\N	PCS	2026-07-04 18:24:23.042112+00
9	USK-INV-001	\N	1kVA 12V Pure Sine Wave Inverter	1000VA/800W pure sine wave off-grid inverter, built-in charger 20A, LCD display	2	4	\N	8500.00	14000.00	16.00	0	5	\N	PCS	2026-07-04 18:24:23.042112+00
10	USK-INV-002	\N	2kVA 24V Pure Sine Wave Inverter	2000VA/1600W PSW inverter, 30A MPPT charger, USB output, over-load protection	2	4	\N	15000.00	24000.00	16.00	0	4	\N	PCS	2026-07-04 18:24:23.042112+00
11	USK-INV-003	\N	3kVA 24V Off-Grid Inverter Charger	3kVA pure sine wave with built-in 60A MPPT charge controller	2	6	\N	22000.00	36000.00	16.00	0	3	\N	PCS	2026-07-04 18:24:23.042112+00
12	USK-INV-004	\N	5kVA 48V Off-Grid Inverter Charger	5kVA/4000W off-grid, 60A MPPT, configurable AC/solar priority, RS485	2	6	\N	38000.00	62000.00	16.00	0	3	\N	PCS	2026-07-04 18:24:23.042112+00
69	USK-ACP-008	\N	40A RCCB 2-pole 30mA	40A 2-pole RCCB 30mA, Hager type, for 1-phase solar inverter output DB	8	15	\N	3000.00	5200.00	16.00	0	10	\N	PCS	2026-07-04 18:25:19.236848+00
13	USK-INV-005	\N	3kVA 24V Hybrid Inverter	3kVA hybrid inverter, 80A MPPT, grid-tie and off-grid, Wi-Fi monitoring	2	6	\N	32000.00	52000.00	16.00	0	3	\N	PCS	2026-07-04 18:24:23.042112+00
14	USK-INV-006	\N	5kVA 48V Hybrid Inverter	5kVA hybrid, 100A MPPT, parallel-able up to 9 units, app monitoring	2	6	\N	52000.00	85000.00	16.00	0	3	\N	PCS	2026-07-04 18:24:23.042112+00
15	USK-INV-007	\N	6kVA 48V Hybrid Inverter	6kVA hybrid, 120A MPPT, three-phase parallel capable, export-limited mode	2	7	\N	62000.00	98000.00	16.00	0	2	\N	PCS	2026-07-04 18:24:23.042112+00
16	USK-INV-008	\N	8kVA 48V Hybrid Inverter	8kVA hybrid, 120A MPPT, split-phase, compatible with lithium and lead-acid	2	7	\N	82000.00	132000.00	16.00	0	2	\N	PCS	2026-07-04 18:24:23.042112+00
17	USK-INV-009	\N	10kVA 48V Hybrid Inverter	10kVA three-phase hybrid, 180A MPPT, BMS communication, SCADA ready	2	6	\N	105000.00	168000.00	16.00	0	2	\N	PCS	2026-07-04 18:24:23.042112+00
18	USK-INV-010	\N	3kVA All-in-One Solar System (Hybrid)	3kVA hybrid inverter with 100Ah lithium battery and 300W panel bundled package	2	4	\N	65000.00	105000.00	16.00	0	2	\N	SET	2026-07-04 18:24:23.042112+00
19	USK-LB-001	\N	50Ah 12V LiFePO4 Battery	Slim 50Ah lithium iron phosphate, built-in BMS, 4000+ cycle life, rack-mountable	3	10	\N	13500.00	20000.00	16.00	0	5	\N	PCS	2026-07-04 18:24:23.042112+00
20	USK-LB-002	\N	100Ah 12V LiFePO4 Battery	100Ah 12V LiFePO4, built-in 100A BMS, Bluetooth monitor app compatible	3	10	\N	24000.00	35000.00	16.00	0	5	\N	PCS	2026-07-04 18:24:23.042112+00
21	USK-LB-003	\N	100Ah 24V LiFePO4 Battery	100Ah 24V lithium, suitable for 24V inverter systems, high discharge rate	3	9	\N	42000.00	62000.00	16.00	0	4	\N	PCS	2026-07-04 18:24:23.042112+00
22	USK-LB-004	\N	200Ah 12V LiFePO4 Battery	200Ah 12V heavy-duty lithium, 200A continuous discharge, drop-in lead-acid replacement	3	10	\N	45000.00	68000.00	16.00	0	3	\N	PCS	2026-07-04 18:24:23.042112+00
23	USK-LB-005	\N	100Ah 48V LiFePO4 Battery (5.12kWh)	5.12kWh 48V rack-mount lithium, BMS with RS485/CAN for Growatt/Victron/Voltronic	3	9	\N	78000.00	118000.00	16.00	0	3	\N	PCS	2026-07-04 18:24:23.042112+00
24	USK-LB-006	\N	200Ah 48V LiFePO4 Battery (9.6kWh)	9.6kWh 48V rack-mount lithium module, stackable up to 15 units, active balancing	3	9	\N	148000.00	225000.00	16.00	0	2	\N	PCS	2026-07-04 18:24:23.042112+00
25	USK-LB-007	\N	280Ah 12V LiFePO4 Grade A Cell Pack	Grade A CATL/EVE 280Ah cells assembled, 4S configuration, BMS included	3	25	\N	58000.00	88000.00	16.00	0	2	\N	PCS	2026-07-04 18:24:23.042112+00
26	USK-CC-001	\N	10A PWM Charge Controller 12/24V Auto	Basic 10A PWM controller, LCD display, USB 5V output, overcharge protection	4	4	\N	1200.00	2000.00	16.00	0	10	\N	PCS	2026-07-04 18:24:23.042112+00
27	USK-CC-002	\N	20A PWM Charge Controller 12/24V	20A PWM with dual USB, load timer function, temperature compensation	4	11	\N	1800.00	3000.00	16.00	0	10	\N	PCS	2026-07-04 18:24:23.042112+00
28	USK-CC-003	\N	30A MPPT Charge Controller 12/24V	Tracer 3210AN, 30A MPPT, MT50 display compatible, max PV 100V	4	11	\N	5500.00	9000.00	16.00	0	8	\N	PCS	2026-07-04 18:24:23.042112+00
29	USK-CC-004	\N	40A MPPT Charge Controller 12/24/48V	40A MPPT, Tracer 4215BN, 150V PV input, supports LiFePO4/AGM/Gel/Flooded	4	11	\N	7500.00	12500.00	16.00	0	6	\N	PCS	2026-07-04 18:24:23.042112+00
30	USK-CC-005	\N	60A MPPT Charge Controller 12-48V	60A MPPT, 150V PV input, RS485, remote monitoring via eBox-WiFi dongle	4	11	\N	11000.00	18000.00	16.00	0	5	\N	PCS	2026-07-04 18:24:23.042112+00
31	USK-CC-006	\N	80A MPPT Charge Controller 12-48V	80A MPPT, 150V, Epever Tracer AN series, data logging, load output 80A	4	11	\N	15000.00	24500.00	16.00	0	4	\N	PCS	2026-07-04 18:24:23.042112+00
32	USK-CC-007	\N	100A MPPT Charge Controller 12-48V	Victron SmartSolar 100/30A – premium MPPT, Bluetooth built-in, VE.Direct	4	5	\N	19000.00	31000.00	16.00	0	3	\N	PCS	2026-07-04 18:24:23.042112+00
33	USK-MS-001	\N	Roof Mount L-Feet & Rail Kit (2-panel)	Aluminium rail with L-feet, mid/end clamps, suitable for metal or tile roofs	5	25	\N	3500.00	5800.00	16.00	0	8	\N	SET	2026-07-04 18:25:19.236848+00
34	USK-MS-002	\N	Roof Mount Frame 4-panel	Complete 4-panel roof racking system, anodised aluminium, wind rated 160km/h	5	25	\N	6800.00	11000.00	16.00	0	5	\N	SET	2026-07-04 18:25:19.236848+00
35	USK-MS-003	\N	Ground Mount Frame 4-panel (Adjustable)	Steel galvanised ground mount, angle 15°-45° adjustable, 4-panel capacity	5	25	\N	8500.00	14000.00	16.00	0	4	\N	SET	2026-07-04 18:25:19.236848+00
36	USK-MS-004	\N	Pole Mount Single Panel (50mm pole)	Single-panel pole mount bracket, top-of-pole design, 360° rotation	5	25	\N	2800.00	4500.00	16.00	0	6	\N	PCS	2026-07-04 18:25:19.236848+00
37	USK-MS-005	\N	Flat Roof Ballast Frame 4-panel	Ballast-weighted frame, no roof penetration, suitable for concrete flat roofs	5	25	\N	7200.00	11500.00	16.00	0	3	\N	SET	2026-07-04 18:25:19.236848+00
38	USK-MS-006	\N	Aluminium Mid Clamp (35mm module frame)	Standard mid clamp for 35mm thick solar panel frames, anodised aluminium	5	25	\N	120.00	200.00	16.00	0	80	\N	PCS	2026-07-04 18:25:19.236848+00
39	USK-MS-007	\N	Aluminium End Clamp (35mm module frame)	End clamp for solar panel rail termination, anodised aluminium	5	25	\N	150.00	250.00	16.00	0	80	\N	PCS	2026-07-04 18:25:19.236848+00
40	USK-MS-008	\N	T-Bolt & Square Nut Set (10 pairs)	M8 T-bolt and square nut set for solar rail channel mounting	5	25	\N	250.00	420.00	16.00	0	40	\N	SET	2026-07-04 18:25:19.236848+00
41	USK-MS-009	\N	Tilt Adjustable Frame 2-panel (0-30°)	Adjustable-angle aluminium frame for flat surfaces, 0° to 30° tilt range	5	25	\N	5200.00	8500.00	16.00	0	4	\N	SET	2026-07-04 18:25:19.236848+00
42	USK-SC-001	\N	4mm² Solar PV Cable Red (per metre)	TÜV certified 4mm² single-core DC solar cable, 1.5kV rated, UV stabilised	6	25	\N	65.00	110.00	16.00	0	120	\N	MTR	2026-07-04 18:25:19.236848+00
43	USK-SC-002	\N	4mm² Solar PV Cable Black (per metre)	TÜV certified 4mm² DC solar cable black, temperature range -40°C to +90°C	6	25	\N	65.00	110.00	16.00	0	120	\N	MTR	2026-07-04 18:25:19.236848+00
44	USK-SC-003	\N	6mm² Solar PV Cable Red (per metre)	6mm² heavy-duty solar cable, for high-current panel strings, UV resistant	6	25	\N	98.00	160.00	16.00	0	80	\N	MTR	2026-07-04 18:25:19.236848+00
45	USK-SC-004	\N	6mm² Solar PV Cable Black (per metre)	6mm² solar cable black, XLPE insulated, suitable for outdoor direct burial	6	25	\N	98.00	160.00	16.00	0	80	\N	MTR	2026-07-04 18:25:19.236848+00
46	USK-SC-005	\N	MC4 Connector Pair (Male + Female)	IP68 rated MC4 compatible connectors, 1000V DC, 30A, UV resistant housing	6	25	\N	180.00	320.00	16.00	0	80	\N	PAIR	2026-07-04 18:25:19.236848+00
47	USK-SC-006	\N	MC4 Y-Branch T-Connector Pair (2-to-1)	MC4 parallel branch connector, connects 2 strings in parallel, IP67	6	25	\N	380.00	650.00	16.00	0	40	\N	PAIR	2026-07-04 18:25:19.236848+00
48	USK-SC-007	\N	MC4 Disconnect Spanner Tool Set	Pair of MC4 disconnect tools for safe unlocking of MC4 connectors in the field	6	25	\N	450.00	800.00	16.00	0	10	\N	SET	2026-07-04 18:25:19.236848+00
49	USK-SC-008	\N	4mm² Solar Cable Roll 50m (Red + Black)	50m each red and black 4mm² TÜV solar cable, factory-coiled for site use	6	25	\N	6500.00	11000.00	16.00	0	5	\N	ROLL	2026-07-04 18:25:19.236848+00
50	USK-DCP-001	\N	32A DC Circuit Breaker 1-pole (PV)	32A DC MCB for solar PV string protection, 250VDC rated, DIN rail mount	7	13	\N	850.00	1500.00	16.00	0	15	\N	PCS	2026-07-04 18:25:19.236848+00
51	USK-DCP-002	\N	63A DC Circuit Breaker 1-pole (PV)	63A DC circuit breaker, 250VDC, for battery-to-inverter protection	7	13	\N	1200.00	2000.00	16.00	0	12	\N	PCS	2026-07-04 18:25:19.236848+00
52	USK-DCP-003	\N	125A DC Circuit Breaker 1-pole	125A DC MCB, 250V, high-interrupt capacity for large battery banks	7	13	\N	2200.00	3800.00	16.00	0	8	\N	PCS	2026-07-04 18:25:19.236848+00
53	USK-DCP-004	\N	DC Surge Arrester SPD 600VDC Type 2	Class II DC SPD for solar array protection, 40kA Imax, DIN rail mount	7	12	\N	2800.00	4800.00	16.00	0	8	\N	PCS	2026-07-04 18:25:19.236848+00
54	USK-DCP-005	\N	Waterproof Blade Fuse Holder 30A	Inline waterproof fuse holder for 30A blade fuse, suitable for DC circuits	7	25	\N	350.00	620.00	16.00	0	20	\N	PCS	2026-07-04 18:25:19.236848+00
55	USK-DCP-006	\N	60A ANL Fuse + Holder Set	60A gold ANL fuse with clear cover holder, for battery cable protection	7	25	\N	650.00	1100.00	16.00	0	20	\N	SET	2026-07-04 18:25:19.236848+00
56	USK-DCP-007	\N	100A ANL Fuse + Holder Set	100A ANL fuse with holder, suitable for inverter battery cable protection	7	25	\N	850.00	1450.00	16.00	0	20	\N	SET	2026-07-04 18:25:19.236848+00
57	USK-DCP-008	\N	200A ANL Fuse + Holder Set	200A ANL fuse with heavy-duty holder for large inverter installations	7	25	\N	1200.00	2000.00	16.00	0	15	\N	SET	2026-07-04 18:25:19.236848+00
58	USK-DCP-009	\N	300A ANL Fuse + Holder Set	300A ANL bolt-down fuse and holder for commercial-scale battery systems	7	25	\N	1600.00	2700.00	16.00	0	10	\N	SET	2026-07-04 18:25:19.236848+00
59	USK-DCP-010	\N	100A Battery Disconnect Switch (DC)	100A rotary DC isolator switch for battery bank disconnection, IP65 rated	7	25	\N	1100.00	1900.00	16.00	0	10	\N	PCS	2026-07-04 18:25:19.236848+00
60	USK-DCP-011	\N	200A Battery Disconnect Switch (DC)	200A heavy-duty rotary DC isolator for large inverter and battery systems	7	25	\N	1800.00	3200.00	16.00	0	8	\N	PCS	2026-07-04 18:25:19.236848+00
61	USK-DCP-012	\N	4-in-1-out PV Combiner Box 10A Fused	4-string combiner box with 10A string fuses, DC SPD and monitoring terminals	7	25	\N	5500.00	9200.00	16.00	0	4	\N	PCS	2026-07-04 18:25:19.236848+00
62	USK-ACP-001	\N	AC Surge Protector SPD 2-pole Type 2	Type 2 AC surge arrester, 275V, 40kA Imax, for inverter AC output protection	8	12	\N	2200.00	3800.00	16.00	0	10	\N	PCS	2026-07-04 18:25:19.236848+00
63	USK-ACP-002	\N	AC Surge Protector SPD 4-pole Type 2	4-pole Type 2 SPD for 3-phase systems, 40kA Imax, DIN rail mount	8	12	\N	3500.00	6000.00	16.00	0	8	\N	PCS	2026-07-04 18:25:19.236848+00
64	USK-ACP-003	\N	16A RCBO 1P+N 30mA (MCB + RCD)	16A single-pole+neutral RCBO, 30mA sensitivity, 6kA breaking capacity	8	12	\N	1800.00	3200.00	16.00	0	12	\N	PCS	2026-07-04 18:25:19.236848+00
65	USK-ACP-004	\N	25A RCBO 1P+N 30mA	25A RCBO for ring circuit and cooker protection, type AC, 6kA	8	12	\N	2000.00	3500.00	16.00	0	12	\N	PCS	2026-07-04 18:25:19.236848+00
66	USK-ACP-005	\N	32A RCBO 1P+N 30mA	32A RCBO, suitable for shower and large appliance circuits, 6kA	8	13	\N	2200.00	3800.00	16.00	0	10	\N	PCS	2026-07-04 18:25:19.236848+00
67	USK-ACP-006	\N	40A RCBO 1P+N 30mA	40A RCBO, 30mA, type AC, for high-load circuits with earth fault protection	8	13	\N	2600.00	4500.00	16.00	0	8	\N	PCS	2026-07-04 18:25:19.236848+00
68	USK-ACP-007	\N	25A RCCB 2-pole 30mA	25A double-pole RCCB, 30mA, 6kA, type AC, for consumer unit main protection	8	15	\N	2500.00	4200.00	16.00	0	10	\N	PCS	2026-07-04 18:25:19.236848+00
70	USK-ACP-009	\N	63A RCCB 2-pole 30mA	63A 2-pole RCCB, 30mA, for main consumer unit incoming protection	8	15	\N	3800.00	6500.00	16.00	0	8	\N	PCS	2026-07-04 18:25:19.236848+00
71	USK-ACP-010	\N	63A RCCB 4-pole 30mA	63A 4-pole RCCB, 30mA, for 3-phase 3kW+ inverter systems	8	12	\N	5500.00	9500.00	16.00	0	6	\N	PCS	2026-07-04 18:25:19.236848+00
72	USK-ACP-011	\N	100A RCCB 4-pole 30mA	100A 4-pole RCCB for commercial 3-phase solar system AC protection	8	12	\N	7500.00	12800.00	16.00	0	4	\N	PCS	2026-07-04 18:25:19.236848+00
73	USK-EC-001	\N	1.5mm² Single Core Cable Red (per m)	PVC insulated 1.5mm² stranded copper cable, 300/500V, red	9	17	\N	28.00	48.00	16.00	0	200	\N	MTR	2026-07-04 18:25:19.236848+00
74	USK-EC-002	\N	1.5mm² Single Core Cable Black (per m)	PVC insulated 1.5mm² stranded copper, 300/500V, black sleeve	9	17	\N	28.00	48.00	16.00	0	200	\N	MTR	2026-07-04 18:25:19.236848+00
75	USK-EC-003	\N	2.5mm² Single Core Cable Red (per m)	2.5mm² stranded copper, PVC, 450/750V, suitable for lighting and socket circuits	9	17	\N	42.00	72.00	16.00	0	150	\N	MTR	2026-07-04 18:25:19.236848+00
76	USK-EC-004	\N	2.5mm² Single Core Cable Black (per m)	2.5mm² stranded copper black, PVC insulated, 450/750V rated	9	17	\N	42.00	72.00	16.00	0	150	\N	MTR	2026-07-04 18:25:19.236848+00
77	USK-EC-005	\N	4mm² Single Core Cable Red (per m)	4mm² stranded copper, for cooker circuits and sub-mains, 450/750V	9	17	\N	68.00	115.00	16.00	0	100	\N	MTR	2026-07-04 18:25:19.236848+00
78	USK-EC-006	\N	4mm² Single Core Cable Black (per m)	4mm² stranded copper black, 450/750V, PVC insulated	9	17	\N	68.00	115.00	16.00	0	100	\N	MTR	2026-07-04 18:25:19.236848+00
79	USK-EC-007	\N	6mm² Single Core Cable (per m)	6mm² stranded copper, 450/750V, for sub-mains and high-current outlets	9	16	\N	102.00	175.00	16.00	0	80	\N	MTR	2026-07-04 18:25:19.236848+00
80	USK-EC-008	\N	10mm² Single Core Cable (per m)	10mm² stranded copper for main distribution runs and large appliances	9	16	\N	170.00	290.00	16.00	0	60	\N	MTR	2026-07-04 18:25:19.236848+00
81	USK-EC-009	\N	16mm² Single Core Cable (per m)	16mm² stranded copper, suitable for main incoming supply sub-mains	9	16	\N	265.00	450.00	16.00	0	50	\N	MTR	2026-07-04 18:25:19.236848+00
82	USK-EC-010	\N	1.5mm² Twin & Earth Cable (per m)	1.5mm² T&E flat cable, PVC, for lighting circuits and standard wiring	9	17	\N	72.00	120.00	16.00	0	120	\N	MTR	2026-07-04 18:25:19.236848+00
83	USK-EC-011	\N	2.5mm² Twin & Earth Cable (per m)	2.5mm² T&E for power circuits, sockets, and ring mains	9	17	\N	108.00	185.00	16.00	0	100	\N	MTR	2026-07-04 18:25:19.236848+00
84	USK-EC-012	\N	4mm² Twin & Earth Cable (per m)	4mm² T&E for cooker and higher-load circuits	9	17	\N	165.00	280.00	16.00	0	60	\N	MTR	2026-07-04 18:25:19.236848+00
85	USK-EC-013	\N	16mm² 3-core Armoured Cable SWA (per m)	16mm² 3-core steel wire armoured cable, XLPE, for underground runs	9	16	\N	520.00	890.00	16.00	0	50	\N	MTR	2026-07-04 18:25:19.236848+00
86	USK-EC-014	\N	25mm² 3-core Armoured Cable SWA (per m)	25mm² 3-core SWA for mains incoming and large sub-main runs	9	16	\N	780.00	1350.00	16.00	0	40	\N	MTR	2026-07-04 18:25:19.236848+00
87	USK-EC-015	\N	35mm² 4-core Armoured Cable SWA (per m)	35mm² 4-core SWA for 3-phase distribution, XLPE insulated, aluminium wire armour	9	16	\N	1100.00	1900.00	16.00	0	30	\N	MTR	2026-07-04 18:25:19.236848+00
88	USK-SW-001	\N	63A Double Pole Isolator Switch	63A DP switch-disconnector, 240V AC, DIN rail or surface mount, IP20	10	12	\N	1800.00	3200.00	16.00	0	10	\N	PCS	2026-07-04 18:26:24.823596+00
89	USK-SW-002	\N	100A Double Pole Isolator Switch	100A DP isolator for main incoming protection, 240V, lockable handle	10	12	\N	2800.00	4800.00	16.00	0	8	\N	PCS	2026-07-04 18:26:24.823596+00
90	USK-SW-003	\N	200A Double Pole Isolator Switch	200A DP main switch, suitable for commercial and large residential systems	10	12	\N	5500.00	9200.00	16.00	0	4	\N	PCS	2026-07-04 18:26:24.823596+00
91	USK-SW-004	\N	63A 4-pole Isolator Switch	63A 4-pole switch-disconnector for 3-phase systems, 415V AC	10	13	\N	3200.00	5500.00	16.00	0	6	\N	PCS	2026-07-04 18:26:24.823596+00
92	USK-SW-005	\N	63A Manual Transfer Switch 2-pole	63A 2-pole changeover switch (mains/generator), surface mount, IP40	10	16	\N	4500.00	7800.00	16.00	0	6	\N	PCS	2026-07-04 18:26:24.823596+00
93	USK-SW-006	\N	100A Manual Transfer Switch 2-pole	100A 2-pole manual transfer switch for generator/solar changeover	10	16	\N	7000.00	12000.00	16.00	0	4	\N	PCS	2026-07-04 18:26:24.823596+00
94	USK-SW-007	\N	63A Automatic Transfer Switch (ATS)	63A single-phase ATS, 230V, selects mains/solar/generator automatically	10	16	\N	8500.00	14500.00	16.00	0	4	\N	PCS	2026-07-04 18:26:24.823596+00
95	USK-SW-008	\N	100A Automatic Transfer Switch (ATS)	100A ATS with LCD, priority selection, 50ms transfer time, DIN mount	10	16	\N	13000.00	22000.00	16.00	0	3	\N	PCS	2026-07-04 18:26:24.823596+00
96	USK-SW-009	\N	63A 3-phase Automatic Transfer Switch	63A 3-pole ATS for 3-phase commercial solar systems, programmable	10	12	\N	18500.00	32000.00	16.00	0	2	\N	PCS	2026-07-04 18:26:24.823596+00
97	USK-LT-001	\N	9W E27 LED Bulb Warm White 3000K	9W LED bulb, 810 lumens, 25,000hr lifespan, matte finish, 220-240V AC	11	18	\N	180.00	320.00	16.00	0	60	\N	PCS	2026-07-04 18:26:24.823596+00
98	USK-LT-002	\N	18W E27 LED Bulb Daylight 6500K	18W LED bulb, 1620 lumens, cool daylight, suitable for workshops	11	18	\N	280.00	480.00	16.00	0	50	\N	PCS	2026-07-04 18:26:24.823596+00
99	USK-LT-003	\N	7W E27 DC LED Bulb 12/24V	7W LED bulb, 12V and 24V DC compatible, 630 lumens, for solar-powered homes	11	25	\N	320.00	580.00	16.00	0	40	\N	PCS	2026-07-04 18:26:24.823596+00
100	USK-LT-004	\N	20W LED Floodlight (IP65, Cool White)	20W waterproof LED flood, 1800 lumens, 6500K, for outdoor security lighting	11	18	\N	950.00	1650.00	16.00	0	20	\N	PCS	2026-07-04 18:26:24.823596+00
101	USK-LT-005	\N	30W LED Floodlight (IP65)	30W outdoor floodlight, die-cast aluminium housing, 2700 lumens	11	18	\N	1350.00	2350.00	16.00	0	15	\N	PCS	2026-07-04 18:26:24.823596+00
102	USK-LT-006	\N	50W LED Floodlight (IP65)	50W LED flood, 4500 lumens, wide-angle beam, heavy-duty for large areas	11	18	\N	1900.00	3350.00	16.00	0	15	\N	PCS	2026-07-04 18:26:24.823596+00
103	USK-LT-007	\N	100W LED Floodlight (IP65)	100W high-power LED floodlight, 9000 lumens, stadium and yard use	11	18	\N	3200.00	5500.00	16.00	0	10	\N	PCS	2026-07-04 18:26:24.823596+00
104	USK-LT-008	\N	36W LED Batten 1.2m (IP65, Linkable)	36W LED batten fitting, 3240 lumens, IP65, surface mount, linkable	11	19	\N	1200.00	2100.00	16.00	0	15	\N	PCS	2026-07-04 18:26:24.823596+00
105	USK-LT-009	\N	18W LED Batten 0.6m (IP40)	18W slimline LED batten, 1620 lumens, 4000K neutral white, ceiling mount	11	19	\N	750.00	1300.00	16.00	0	15	\N	PCS	2026-07-04 18:26:24.823596+00
106	USK-LT-010	\N	30W All-in-One Solar Street Light	30W integrated solar street light, 3000lm, PIR sensor, 8hr backup	11	4	\N	6500.00	11000.00	16.00	0	8	\N	PCS	2026-07-04 18:26:24.823596+00
107	USK-LT-011	\N	60W All-in-One Solar Street Light	60W integrated solar street light, 6000lm, remote control, 12hr backup	11	4	\N	12000.00	19500.00	16.00	0	5	\N	PCS	2026-07-04 18:26:24.823596+00
108	USK-LT-012	\N	100W Split-Type Solar Street Light	100W solar street light with separate panel and lithium battery, pole mount	11	4	\N	22000.00	36000.00	16.00	0	3	\N	PCS	2026-07-04 18:26:24.823596+00
109	USK-LT-013	\N	5m DC 12V LED Strip Warm White (IP20)	5m flexible LED strip, 12V DC, warm white 3000K, 60 LEDs/m, self-adhesive	11	25	\N	850.00	1500.00	16.00	0	15	\N	ROLL	2026-07-04 18:26:24.823596+00
110	USK-CT-001	\N	20mm PVC Conduit 3m Length (White)	20mm circular PVC conduit, 3-metre length, impact resistant, flame retardant	12	25	\N	85.00	150.00	16.00	0	80	\N	LEN	2026-07-04 18:26:24.823596+00
111	USK-CT-002	\N	25mm PVC Conduit 3m Length (White)	25mm PVC conduit 3m, for larger cable bundles, British Standard compliant	12	25	\N	120.00	200.00	16.00	0	60	\N	LEN	2026-07-04 18:26:24.823596+00
112	USK-CT-003	\N	32mm PVC Conduit 3m Length (White)	32mm heavy-gauge PVC conduit, 3m length, for main cable runs	12	25	\N	165.00	280.00	16.00	0	50	\N	LEN	2026-07-04 18:26:24.823596+00
113	USK-CT-004	\N	20mm PVC Conduit Elbow 90°	20mm PVC conduit elbow, push-fit, for direction changes in conduit runs	12	25	\N	18.00	35.00	16.00	0	120	\N	PCS	2026-07-04 18:26:24.823596+00
114	USK-CT-005	\N	25mm PVC Conduit Elbow 90°	25mm PVC elbow for conduit direction changes, push-fit connection	12	25	\N	25.00	48.00	16.00	0	80	\N	PCS	2026-07-04 18:26:24.823596+00
115	USK-CT-006	\N	20mm PVC Conduit Coupler	20mm conduit coupler/joiner for extending conduit runs, twist-lock	12	25	\N	15.00	30.00	16.00	0	80	\N	PCS	2026-07-04 18:26:24.823596+00
116	USK-CT-007	\N	20mm Conduit Saddle Clips (25pcs bag)	Heavy-duty PVC conduit saddle clips, includes screws, 25 pieces per bag	12	25	\N	80.00	150.00	16.00	0	30	\N	BAG	2026-07-04 18:26:24.823596+00
117	USK-CT-008	\N	20×16mm PVC Trunking 2m Length	Mini PVC cable trunking with lid, 20×16mm, for surface cable management	12	14	\N	120.00	210.00	16.00	0	60	\N	LEN	2026-07-04 18:26:24.823596+00
118	USK-CT-009	\N	40×25mm PVC Trunking 2m Length	40×25mm PVC trunking, suitable for multi-cable socket and switch runs	12	14	\N	185.00	320.00	16.00	0	50	\N	LEN	2026-07-04 18:26:24.823596+00
119	USK-CT-010	\N	60×40mm PVC Trunking 2m Length	60×40mm heavy-duty PVC trunking with clip-on lid for large cable runs	12	14	\N	280.00	480.00	16.00	0	40	\N	LEN	2026-07-04 18:26:24.823596+00
120	USK-CT-011	\N	PVC 20mm 4-way Junction Box (Round)	20mm entry 4-way junction box, IP40, for conduit installations	12	25	\N	45.00	85.00	16.00	0	80	\N	PCS	2026-07-04 18:26:24.823596+00
121	USK-SS-001	\N	13A Single Switched Socket (White, Surface)	13A single switched socket, surface mount, white, BS1363 standard	13	16	\N	280.00	480.00	16.00	0	50	\N	PCS	2026-07-04 18:26:24.823596+00
122	USK-SS-002	\N	13A Double Switched Socket (White, Surface)	13A double switched socket, surface box, white, twin-gang	13	16	\N	380.00	650.00	16.00	0	50	\N	PCS	2026-07-04 18:26:24.823596+00
123	USK-SS-003	\N	13A Double Switched Socket (White, Flush)	13A twin gang flush socket with white flat plate, architrave finish	13	16	\N	420.00	720.00	16.00	0	40	\N	PCS	2026-07-04 18:26:24.823596+00
124	USK-SS-004	\N	13A Double Socket with USB 5V/2.1A (Flush)	13A twin socket with dual USB charging ports, white, flush fit	13	14	\N	520.00	900.00	16.00	0	30	\N	PCS	2026-07-04 18:26:24.823596+00
126	USK-SS-006	\N	2-Gang 1-Way Light Switch (White, Flush)	2-gang 1-way light switch, white, flush mount for dual lighting control	13	16	\N	220.00	380.00	16.00	0	50	\N	PCS	2026-07-04 18:26:24.823596+00
127	USK-SS-007	\N	2-Gang 2-Way Light Switch (White, Flush)	2-gang 2-way switch for staircase and corridor light switching	13	16	\N	280.00	480.00	16.00	0	40	\N	PCS	2026-07-04 18:26:24.823596+00
128	USK-SS-008	\N	13A Fused Connection Unit FCU (Switched)	13A FCU with neon indicator and 3A/13A fused outlet, white flush plate	13	14	\N	450.00	780.00	16.00	0	20	\N	PCS	2026-07-04 18:26:24.823596+00
129	USK-SS-009	\N	13A Weatherproof Socket (IP44, Surface)	13A IP44 weatherproof socket, grey, for outdoor and garage installations	13	16	\N	650.00	1100.00	16.00	0	20	\N	PCS	2026-07-04 18:26:24.823596+00
130	USK-SS-010	\N	16A Industrial Socket 3-pin 240V (IP44)	16A industrial blue plug socket, 3-pin 240V, IP44, for site equipment	13	14	\N	1200.00	2100.00	16.00	0	10	\N	PCS	2026-07-04 18:26:24.823596+00
131	USK-DB-001	\N	4-Way Surface Consumer Unit (Blanks incl.)	4-way surface-mount DB box, with blanks, suitable for 4 MCBs, steel	14	15	\N	1200.00	2100.00	16.00	0	10	\N	PCS	2026-07-04 18:26:24.823596+00
132	USK-DB-002	\N	8-Way Surface Consumer Unit	8-way surface-mount consumer unit, DIN rail, 100A busbar, with cover	14	15	\N	1800.00	3100.00	16.00	0	8	\N	PCS	2026-07-04 18:26:24.823596+00
133	USK-DB-003	\N	8-Way Flush Consumer Unit	8-way flush-fit DB box, recessed installation, white door with lock	14	15	\N	2000.00	3500.00	16.00	0	8	\N	PCS	2026-07-04 18:26:24.823596+00
134	USK-DB-004	\N	12-Way Flush Consumer Unit	12-way flush consumer unit, 100A rated busbar, transparent inner cover	14	12	\N	2800.00	4800.00	16.00	0	6	\N	PCS	2026-07-04 18:26:24.823596+00
135	USK-DB-005	\N	16-Way Flush Consumer Unit	16-way flush-fit DB, dual RCD section support, suitable for large homes	14	12	\N	3500.00	6000.00	16.00	0	4	\N	PCS	2026-07-04 18:26:24.823596+00
136	USK-DB-006	\N	6+6 Split Board Dual RCD Consumer Unit	6+6 way split load consumer unit with 2× 80A RCDs pre-fitted	14	12	\N	4200.00	7200.00	16.00	0	5	\N	PCS	2026-07-04 18:26:24.823596+00
137	USK-DB-007	\N	4-Way IP65 Steel Enclosure (Outdoor)	4-way IP65 powder-coated steel enclosure for outdoor solar DB applications	14	25	\N	1800.00	3200.00	16.00	0	8	\N	PCS	2026-07-04 18:26:24.823596+00
138	USK-DB-008	\N	8-Way IP65 Steel Enclosure (Outdoor)	8-way IP65 steel DB enclosure, lockable, for external metering/solar DBs	14	25	\N	2600.00	4500.00	16.00	0	6	\N	PCS	2026-07-04 18:26:24.823596+00
139	USK-DB-009	\N	12-Way IP65 Enclosure with DIN Rail	12-way IP65 enclosure with pre-fitted DIN rail for MPPT and controller mounting	14	25	\N	3500.00	6000.00	16.00	0	5	\N	PCS	2026-07-04 18:26:24.823596+00
140	USK-CB-001	\N	6A MCB Single Pole B-Curve (DIN Rail)	6A 1-pole B-curve MCB, 6kA breaking capacity, 230/400V, DIN rail	15	12	\N	220.00	380.00	16.00	0	40	\N	PCS	2026-07-04 18:27:32.569077+00
141	USK-CB-002	\N	10A MCB Single Pole B-Curve	10A 1-pole B-curve MCB, for lighting and small socket circuits, 6kA	15	12	\N	220.00	380.00	16.00	0	50	\N	PCS	2026-07-04 18:27:32.569077+00
142	USK-CB-003	\N	16A MCB Single Pole B-Curve	16A 1-pole B-curve MCB, for ring main circuits, 6kA, DIN rail	15	12	\N	220.00	380.00	16.00	0	60	\N	PCS	2026-07-04 18:27:32.569077+00
143	USK-CB-004	\N	20A MCB Single Pole B-Curve	20A 1-pole MCB for cooker and high-load socket circuits	15	12	\N	220.00	380.00	16.00	0	40	\N	PCS	2026-07-04 18:27:32.569077+00
144	USK-CB-005	\N	25A MCB Single Pole B-Curve	25A 1-pole MCB, suitable for shower and water-heater circuits	15	13	\N	240.00	420.00	16.00	0	30	\N	PCS	2026-07-04 18:27:32.569077+00
145	USK-CB-006	\N	32A MCB Single Pole B-Curve	32A 1-pole MCB, for electric shower and high-demand appliances	15	13	\N	250.00	440.00	16.00	0	30	\N	PCS	2026-07-04 18:27:32.569077+00
146	USK-CB-007	\N	40A MCB Single Pole C-Curve	40A 1-pole C-curve MCB for inductive loads and motor starting	15	13	\N	280.00	480.00	16.00	0	20	\N	PCS	2026-07-04 18:27:32.569077+00
147	USK-CB-008	\N	63A MCB Single Pole C-Curve	63A 1-pole C-curve MCB for sub-mains and motor protection	15	13	\N	380.00	650.00	16.00	0	15	\N	PCS	2026-07-04 18:27:32.569077+00
148	USK-CB-009	\N	10A MCB Double Pole B-Curve	10A 2-pole MCB for small inverter AC outputs and lighting panels	15	12	\N	480.00	820.00	16.00	0	20	\N	PCS	2026-07-04 18:27:32.569077+00
149	USK-CB-010	\N	16A MCB Double Pole B-Curve	16A 2-pole MCB, for inverter AC breaker and circuit isolation	15	12	\N	500.00	860.00	16.00	0	25	\N	PCS	2026-07-04 18:27:32.569077+00
150	USK-CB-011	\N	20A MCB Double Pole B-Curve	20A 2-pole MCB for water heaters and double-pole isolation circuits	15	12	\N	540.00	920.00	16.00	0	20	\N	PCS	2026-07-04 18:27:32.569077+00
151	USK-CB-012	\N	32A MCB Double Pole B-Curve	32A 2-pole MCB, for main-switch duties in small consumer units	15	12	\N	580.00	980.00	16.00	0	20	\N	PCS	2026-07-04 18:27:32.569077+00
152	USK-CB-013	\N	63A MCB Double Pole C-Curve	63A 2-pole C-curve MCB, for main incoming protection in large DBs	15	12	\N	850.00	1450.00	16.00	0	15	\N	PCS	2026-07-04 18:27:32.569077+00
153	USK-CB-014	\N	100A MCB Double Pole C-Curve	100A 2-pole C-curve MCB for commercial main incoming supply protection	15	12	\N	1400.00	2400.00	16.00	0	8	\N	PCS	2026-07-04 18:27:32.569077+00
154	USK-TL-001	\N	Digital Multimeter Auto-Ranging (600V CAT III)	Auto-ranging DMM, AC/DC voltage 0-600V, resistance, continuity, diode test	16	21	\N	1800.00	3200.00	16.00	0	6	\N	PCS	2026-07-04 18:27:32.569077+00
155	USK-TL-002	\N	Clamp Meter 400A AC/DC True RMS	True RMS clamp meter, AC/DC 400A, voltage, resistance, frequency, data hold	16	21	\N	4500.00	7800.00	16.00	0	4	\N	PCS	2026-07-04 18:27:32.569077+00
156	USK-TL-003	\N	Wire Stripper & Cutter (0.5–6mm²)	Automatic wire stripper, adjustable jaw, handles 0.5–6mm² cable	16	21	\N	950.00	1650.00	16.00	0	8	\N	PCS	2026-07-04 18:27:32.569077+00
157	USK-TL-004	\N	MC4 Solar Connector Crimping Tool Set	MC4 crimping pliers with 2.5mm² and 4mm² dies, connector assembly tool	16	25	\N	2800.00	4800.00	16.00	0	5	\N	SET	2026-07-04 18:27:32.569077+00
158	USK-TL-005	\N	Hydraulic Cable Lug Crimper 10-300mm²	Hydraulic hand crimper for copper/aluminium cable lugs, 10 dies included	16	21	\N	8500.00	14500.00	16.00	0	3	\N	PCS	2026-07-04 18:27:32.569077+00
159	USK-TL-006	\N	Insulation Resistance Tester 500V (Megger)	500V digital insulation tester, 200MΩ range, continuity test, data hold	16	25	\N	12000.00	20000.00	16.00	0	2	\N	PCS	2026-07-04 18:27:32.569077+00
160	USK-TL-007	\N	Non-Contact Voltage Tester 12-1000V AC	Pen-type non-contact voltage detector, LED + beep alert, 12-1000V AC	16	21	\N	650.00	1150.00	16.00	0	8	\N	PCS	2026-07-04 18:27:32.569077+00
161	USK-TL-008	\N	Electrical Insulating Tape 19mm×20m	PVC electrical insulation tape, self-adhesive, flame retardant, black	16	25	\N	80.00	150.00	16.00	0	60	\N	ROLL	2026-07-04 18:27:32.569077+00
162	USK-TL-009	\N	Cable Ties 200mm Nylon (100pcs bag)	Natural nylon 200mm cable ties, 2.5mm width, reusable ratchet locking	16	25	\N	180.00	320.00	16.00	0	30	\N	BAG	2026-07-04 18:27:32.569077+00
163	USK-TL-010	\N	Masonry Drill Bit Set 5–13mm (8pcs)	Tungsten carbide-tipped masonry drill bits, SDS-compatible shank, 8 sizes	16	21	\N	850.00	1500.00	16.00	0	8	\N	SET	2026-07-04 18:27:32.569077+00
164	USK-TL-011	\N	Safety Helmet (Electrician, White, EN397)	White ABS hard hat, EN397, adjustable ratchet harness, with brim	16	25	\N	1200.00	2100.00	16.00	0	4	\N	PCS	2026-07-04 18:27:32.569077+00
165	USK-TL-012	\N	Insulating Safety Gloves 1000V Class 0	Latex insulating gloves, Class 0 (1000V AC), EN60903, size 10 (XL)	16	25	\N	1800.00	3200.00	16.00	0	5	\N	PAIR	2026-07-04 18:27:32.569077+00
166	USK-WP-001	\N	12/24V DC Solar Surface Pump 40W	12V/24V DC surface pump, 2400 L/hr, max head 15m, for tank filling	17	25	\N	5500.00	9200.00	16.00	0	4	\N	PCS	2026-07-04 18:27:32.569077+00
167	USK-WP-002	\N	24V DC Solar Submersible Pump 200W	200W DC submersible, 1200 L/hr, max head 60m, 2-inch outlet, MPPT compatible	17	24	\N	18000.00	30000.00	16.00	0	3	\N	PCS	2026-07-04 18:27:32.569077+00
168	USK-WP-003	\N	48V DC Solar Submersible Pump 500W	500W 48V solar-direct submersible, 3000 L/hr, 80m head, 4-inch borehole	17	24	\N	32000.00	52000.00	16.00	0	3	\N	PCS	2026-07-04 18:27:32.569077+00
169	USK-WP-004	\N	AC Submersible Pump 0.5HP 240V 2"	0.5HP 240V AC submersible, stainless body, 1500 L/hr, thermal overload	17	20	\N	14000.00	23500.00	16.00	0	3	\N	PCS	2026-07-04 18:27:32.569077+00
170	USK-WP-005	\N	AC Submersible Pump 1HP 240V 4"	1HP 240V submersible, 4-inch borehole, 2800 L/hr, 60m max head	17	20	\N	22000.00	36000.00	16.00	0	3	\N	PCS	2026-07-04 18:27:32.569077+00
171	USK-WP-006	\N	AC Surface Centrifugal Pump 0.5HP 240V	0.5HP surface centrifugal pump, self-priming, 2400 L/hr, stainless impeller	17	20	\N	9500.00	16000.00	16.00	0	3	\N	PCS	2026-07-04 18:27:32.569077+00
172	USK-WP-007	\N	Solar Pump Controller MPPT 1.5kW 220V	MPPT solar pump VFD controller, 1.5kW, compatible with AC submersibles	17	24	\N	12000.00	20000.00	16.00	0	3	\N	PCS	2026-07-04 18:27:32.569077+00
173	USK-WP-008	\N	Pressure Vessel Tank 24L (for pump systems)	24-litre diaphragm pressure tank, 10 bar rated, for AC pump systems	17	25	\N	5500.00	9500.00	16.00	0	3	\N	PCS	2026-07-04 18:27:32.569077+00
174	USK-WP-009	\N	Float Switch for Water Tank (Normally Open)	Universal float switch, 240V/10A, for automatic tank level control	17	25	\N	450.00	800.00	16.00	0	10	\N	PCS	2026-07-04 18:27:32.569077+00
175	USK-SA-001	\N	DC Chest Freezer 12/24V 45L (Solar-Powered)	45-litre 12/24V DC chest freezer, A++ energy class, foam insulated	18	22	\N	28000.00	45000.00	16.00	0	3	\N	PCS	2026-07-04 18:27:32.569077+00
176	USK-SA-002	\N	DC Chest Freezer 12/24V 90L (Solar-Powered)	90L 12/24V DC compressor freezer, ideal for solar off-grid homes	18	22	\N	42000.00	68000.00	16.00	0	2	\N	PCS	2026-07-04 18:27:32.569077+00
177	USK-SA-003	\N	DC Chest Freezer 12/24V 130L	130L 12/24V chest freezer, digital thermostat, energy-efficient compressor	18	22	\N	58000.00	92000.00	16.00	0	2	\N	PCS	2026-07-04 18:27:32.569077+00
178	USK-SA-004	\N	DC Ceiling Fan 12V 56-inch (Solar)	56-inch 12V DC ceiling fan, 3 blades, 5 speeds, remote control, for solar homes	18	22	\N	5500.00	9200.00	16.00	0	3	\N	PCS	2026-07-04 18:27:32.569077+00
179	USK-SA-005	\N	DC Table Fan 12/24V 16-inch (Solar)	16-inch 12/24V oscillating table fan, 3-speed, low-energy for solar homes	18	22	\N	3200.00	5500.00	16.00	0	4	\N	PCS	2026-07-04 18:27:32.569077+00
180	USK-SA-006	\N	LED Smart TV 32" 12/24V DC (Solar Compatible)	32-inch HD LED TV, 12/24V DC direct, Android OS, HDMI×2, USB×2	18	22	\N	22000.00	36000.00	16.00	0	2	\N	PCS	2026-07-04 18:27:32.569077+00
181	USK-SA-007	\N	LED Smart TV 43" Full HD (AC, Low Wattage 70W)	43-inch FHD LED smart TV, 70W consumption, Android 11, Wi-Fi, for solar homes	18	23	\N	38000.00	62000.00	16.00	0	2	\N	PCS	2026-07-04 18:27:32.569077+00
182	USK-SA-008	\N	Blender 1.5L 300W Energy Efficient	1.5L glass jar blender, 300W, stainless blades, 3-speed + pulse, 240V AC	18	22	\N	2800.00	4800.00	16.00	0	4	\N	PCS	2026-07-04 18:27:32.569077+00
183	USK-SA-009	\N	Electric Kettle 1.7L 1500W (Stainless)	1.7L stainless steel kettle, 1500W, auto shut-off, boil-dry protection	18	22	\N	2200.00	3800.00	16.00	0	4	\N	PCS	2026-07-04 18:27:32.569077+00
184	USK-SA-010	\N	Rice Cooker 1L 350W (Non-stick Bowl)	1-litre rice cooker, 350W, non-stick pot, warm function, glass lid	18	22	\N	1800.00	3200.00	16.00	0	4	\N	PCS	2026-07-04 18:27:32.569077+00
185	USK-SA-011	\N	Semi-Automatic Washing Machine 6kg 240V	6kg twin-tub washing machine, 480W, low water consumption, for solar homes	18	22	\N	24000.00	40000.00	16.00	0	2	\N	PCS	2026-07-04 18:27:32.569077+00
186	USK-ACC-001	\N	70mm² Battery Cable Set Red+Black 1m Pair	1m each red and black 70mm² tinned copper welding cable with lugs	19	25	\N	1200.00	2100.00	16.00	0	10	\N	SET	2026-07-04 18:27:32.569077+00
187	USK-ACC-002	\N	16mm² Battery Cable Set Red+Black 1m Pair	1m each red and black 16mm² cable with ring lugs, for small inverters	19	25	\N	380.00	680.00	16.00	0	15	\N	SET	2026-07-04 18:27:32.569077+00
188	USK-ACC-003	\N	4-way Positive Copper Bus Bar (10mm hole)	4-way copper bus bar, positive, for parallel battery connections, 200A	19	25	\N	650.00	1150.00	16.00	0	15	\N	PCS	2026-07-04 18:27:32.569077+00
189	USK-ACC-004	\N	4-way Negative Copper Bus Bar (10mm hole)	4-way copper bus bar, negative terminal block for DC distribution	19	25	\N	650.00	1150.00	16.00	0	15	\N	PCS	2026-07-04 18:27:32.569077+00
190	USK-ACC-005	\N	Battery Monitor 500A Shunt + LCD Display	500A shunt-based battery monitor, LCD, measures voltage/current/AH/time	19	25	\N	3200.00	5500.00	16.00	0	6	\N	PCS	2026-07-04 18:27:32.569077+00
191	USK-ACC-006	\N	35mm DIN Rail Aluminium 1m	1-metre aluminium DIN 35mm rail for MCB, RCCB, and DIN-mount components	19	25	\N	280.00	500.00	16.00	0	20	\N	LEN	2026-07-04 18:27:32.569077+00
192	USK-ACC-007	\N	Copper Cable Lugs Assorted Set (50pcs)	50-piece copper cable lug assortment: 6, 10, 16, 25, 35, 50mm² sizes	19	25	\N	380.00	680.00	16.00	0	15	\N	SET	2026-07-04 18:27:32.569077+00
193	USK-ACC-008	\N	Heat Shrink Tubing Set (5 colours, 5m each)	Adhesive-lined heat shrink tube set, 5 sizes/colours, 2:1 ratio, 5m each	19	25	\N	450.00	800.00	16.00	0	12	\N	SET	2026-07-04 18:27:32.569077+00
194	USK-ACC-009	\N	IP66 Waterproof Junction Box (Small, 100×68mm)	IP66 polycarbonate junction box, 100×68×50mm, cable gland holes, lockable	19	25	\N	350.00	620.00	16.00	0	20	\N	PCS	2026-07-04 18:27:32.569077+00
195	USK-ACC-010	\N	Copper-Clad Earthing Rod 1.5m (14mm diameter)	1.5m copper-bonded steel earthing rod, 14mm diameter, with drive-cap	19	25	\N	1200.00	2100.00	16.00	0	8	\N	PCS	2026-07-04 18:27:32.569077+00
196	USK-ACC-011	\N	Earthing Rod Clamp (Acorn Type)	Acorn-type earthing clamp for connecting earth wire to earthing rod	19	25	\N	180.00	320.00	16.00	0	15	\N	PCS	2026-07-04 18:27:32.569077+00
197	USK-ACC-012	\N	Nylon Cable Gland M20 (10pcs bag)	M20 nylon cable glands, IP68, suitable for 6–12mm cables, grey, 10pcs	19	25	\N	180.00	320.00	16.00	0	25	\N	BAG	2026-07-04 18:27:32.569077+00
198	USK-ACC-013	\N	Electrical Safety Warning Labels Set (30pcs)	Self-adhesive electrical hazard, earthing, lockout and solar DC warning labels	19	25	\N	350.00	620.00	16.00	0	12	\N	SET	2026-07-04 18:27:32.569077+00
199	USK-ACC-014	\N	Silicone Sealant Clear 280ml (Weatherproof)	Clear neutral-cure silicone sealant, UV resistant, for outdoor enclosures	19	25	\N	650.00	1150.00	16.00	0	10	\N	TUB	2026-07-04 18:27:32.569077+00
200	USK-ACC-015	\N	Thermal Compound Paste 5g (Heatsink Grade)	High-conductivity thermal paste for inverter/charge controller heatsinks	19	25	\N	280.00	500.00	16.00	0	8	\N	TUB	2026-07-04 18:27:32.569077+00
\.


--
-- Data for Name: purchase_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.purchase_items (id, purchase_id, product_id, quantity, unit_cost, total) FROM stdin;
\.


--
-- Data for Name: purchases; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.purchases (id, purchase_number, supplier_id, subtotal, tax_amount, total, status, notes, expected_date, received_date, created_at, branch_id) FROM stdin;
\.


--
-- Data for Name: quotation_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.quotation_items (id, quotation_id, product_id, quantity, unit_price, discount, vat_rate, total, description, unit) FROM stdin;
\.


--
-- Data for Name: quotations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.quotations (id, quotation_number, customer_id, subtotal, discount_amount, tax_amount, total, status, notes, valid_until, created_at, delivery_time, warranty, payment_terms, branch_id) FROM stdin;
\.


--
-- Data for Name: sale_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sale_items (id, sale_id, product_id, quantity, unit_price, discount, vat_rate, total) FROM stdin;
\.


--
-- Data for Name: sales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sales (id, receipt_number, customer_id, subtotal, discount_amount, tax_amount, total, amount_paid, change, payment_method, cashier_name, status, created_at, branch_id) FROM stdin;
\.


--
-- Data for Name: stock_movements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.stock_movements (id, product_id, type, quantity, quantity_before, quantity_after, reference, notes, created_by, created_at, branch_id) FROM stdin;
\.


--
-- Data for Name: stock_transfers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.stock_transfers (id, transfer_number, source_branch_id, destination_branch_id, product_id, quantity, status, notes, transfer_date, initiated_by_id, initiated_by_name, decided_by_id, decided_by_name, decided_at, decision_notes, created_at) FROM stdin;
\.


--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.suppliers (id, name, contact_person, email, phone, address, city, tax_number, balance, created_at, branch_id) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, name, email, password_hash, role, branch, phone, is_active, created_at, branch_id, totp_secret, totp_enabled, failed_login_attempts, locked_until, password_changed_at) FROM stdin;
4	Super Administrator	admin@uniquepos.africa	$2b$10$jAtcnL/fHGUD0nvns2tNOu/ko6P7J93kEHV.k6u47kOJq4l/GZE2O	super_admin	\N	\N	t	2026-07-04 17:17:47.174196+00	1	\N	f	0	\N	\N
1	Super Admin	admin@uniquepos.com	$2b$10$I2ovrSrAfStrqEtkxAjPL.MwIu.WKz/eM2KymLL7reXPtR1Wlci5O	super_admin	\N	\N	t	2026-07-04 17:06:57.224656+00	1	\N	f	0	\N	\N
\.


--
-- Name: admin_notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.admin_notifications_id_seq', 1, false);


--
-- Name: audit_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_log_id_seq', 48, true);


--
-- Name: branches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.branches_id_seq', 3, true);


--
-- Name: brands_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.brands_id_seq', 1, false);


--
-- Name: business_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.business_settings_id_seq', 1, true);


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.categories_id_seq', 1, false);


--
-- Name: customers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customers_id_seq', 2, true);


--
-- Name: data_migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.data_migrations_id_seq', 2, true);


--
-- Name: expenses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.expenses_id_seq', 1, false);


--
-- Name: invoice_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.invoice_items_id_seq', 4, true);


--
-- Name: invoice_payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.invoice_payments_id_seq', 1, false);


--
-- Name: invoices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.invoices_id_seq', 4, true);


--
-- Name: login_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.login_history_id_seq', 18, true);


--
-- Name: product_stock_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_stock_id_seq', 204, true);


--
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.products_id_seq', 1, false);


--
-- Name: purchase_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.purchase_items_id_seq', 1, false);


--
-- Name: purchases_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.purchases_id_seq', 1, false);


--
-- Name: quotation_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.quotation_items_id_seq', 7, true);


--
-- Name: quotations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.quotations_id_seq', 7, true);


--
-- Name: sale_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sale_items_id_seq', 1, false);


--
-- Name: sales_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sales_id_seq', 1, false);


--
-- Name: stock_movements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.stock_movements_id_seq', 10, true);


--
-- Name: stock_transfers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.stock_transfers_id_seq', 4, true);


--
-- Name: suppliers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.suppliers_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 15, true);


--
-- Name: admin_notifications admin_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notifications
    ADD CONSTRAINT admin_notifications_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: branches branches_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_code_key UNIQUE (code);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);


--
-- Name: business_settings business_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_settings
    ADD CONSTRAINT business_settings_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: data_migrations data_migrations_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_migrations
    ADD CONSTRAINT data_migrations_name_key UNIQUE (name);


--
-- Name: data_migrations data_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_migrations
    ADD CONSTRAINT data_migrations_pkey PRIMARY KEY (id);


--
-- Name: document_sequences document_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_sequences
    ADD CONSTRAINT document_sequences_pkey PRIMARY KEY (doc_type, year);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- Name: invoice_payments invoice_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_invoice_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_unique UNIQUE (invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: login_history login_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_history
    ADD CONSTRAINT login_history_pkey PRIMARY KEY (id);


--
-- Name: product_stock product_stock_branch_product_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_stock
    ADD CONSTRAINT product_stock_branch_product_unique UNIQUE (branch_id, product_id);


--
-- Name: product_stock product_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_stock
    ADD CONSTRAINT product_stock_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_product_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_product_code_unique UNIQUE (product_code);


--
-- Name: purchase_items purchase_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_pkey PRIMARY KEY (id);


--
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- Name: purchases purchases_purchase_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_purchase_number_unique UNIQUE (purchase_number);


--
-- Name: quotation_items quotation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_items
    ADD CONSTRAINT quotation_items_pkey PRIMARY KEY (id);


--
-- Name: quotations quotations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_pkey PRIMARY KEY (id);


--
-- Name: quotations quotations_quotation_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_quotation_number_unique UNIQUE (quotation_number);


--
-- Name: sale_items sale_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- Name: sales sales_receipt_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_receipt_number_unique UNIQUE (receipt_number);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: stock_transfers stock_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfers
    ADD CONSTRAINT stock_transfers_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: admin_notifications_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_notifications_created_at_idx ON public.admin_notifications USING btree (created_at DESC);


--
-- Name: admin_notifications_read_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_notifications_read_at_idx ON public.admin_notifications USING btree (read_at) WHERE (read_at IS NULL);


--
-- Name: audit_log_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_action_idx ON public.audit_log USING btree (action);


--
-- Name: audit_log_actor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_actor_id_idx ON public.audit_log USING btree (actor_id);


--
-- Name: audit_log_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_branch_id_idx ON public.audit_log USING btree (branch_id);


--
-- Name: audit_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_created_at_idx ON public.audit_log USING btree (created_at DESC);


--
-- Name: customers_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customers_branch_id_idx ON public.customers USING btree (branch_id);


--
-- Name: expenses_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_branch_id_idx ON public.expenses USING btree (branch_id);


--
-- Name: invoices_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_branch_id_idx ON public.invoices USING btree (branch_id);


--
-- Name: login_history_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_history_created_at_idx ON public.login_history USING btree (created_at DESC);


--
-- Name: login_history_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_history_user_id_idx ON public.login_history USING btree (user_id);


--
-- Name: purchases_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchases_branch_id_idx ON public.purchases USING btree (branch_id);


--
-- Name: quotations_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quotations_branch_id_idx ON public.quotations USING btree (branch_id);


--
-- Name: sales_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_branch_id_idx ON public.sales USING btree (branch_id);


--
-- Name: stock_movements_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_branch_id_idx ON public.stock_movements USING btree (branch_id);


--
-- Name: stock_transfers_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_transfers_created_at_idx ON public.stock_transfers USING btree (created_at DESC);


--
-- Name: stock_transfers_dest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_transfers_dest_idx ON public.stock_transfers USING btree (destination_branch_id);


--
-- Name: stock_transfers_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_transfers_source_idx ON public.stock_transfers USING btree (source_branch_id);


--
-- Name: stock_transfers_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_transfers_status_idx ON public.stock_transfers USING btree (status);


--
-- Name: suppliers_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX suppliers_branch_id_idx ON public.suppliers USING btree (branch_id);


--
-- Name: users_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_branch_id_idx ON public.users USING btree (branch_id);


--
-- PostgreSQL database dump complete
--

\unrestrict M8GHadX7TW3LqwIXOTH1a0TiuIcijtSPWoKU1196cva01Fe7cHAL9jEgsf4Mc1F

