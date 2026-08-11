-- Generated from database.sql
-- Source of truth for initial schema provisioning
BEGIN;
--
-- PostgreSQL database dump
--


-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10


--
-- Name: expense_payment_method; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
  CREATE TYPE public.expense_payment_method AS ENUM (
      'cash',
      'mpesa',
      'bank_transfer',
      'card'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: invoice_status; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM (
      'draft',
      'sent',
      'partial',
      'paid',
      'overdue',
      'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: movement_type; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
  CREATE TYPE public.movement_type AS ENUM (
      'receive',
      'adjustment',
      'transfer_in',
      'transfer_out',
      'sale',
      'purchase_return'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM (
      'cash',
      'mpesa',
      'bank_transfer',
      'card',
      'credit',
      'split'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: purchase_status; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
  CREATE TYPE public.purchase_status AS ENUM (
      'draft',
      'ordered',
      'received',
      'partial',
      'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: quotation_status; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
  CREATE TYPE public.quotation_status AS ENUM (
      'draft',
      'sent',
      'accepted',
      'rejected',
      'expired',
      'converted'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: sale_status; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
  CREATE TYPE public.sale_status AS ENUM (
      'completed',
      'refunded',
      'void'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

DO $$ BEGIN
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
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;




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



--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: branches; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: brands; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: business_settings; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: data_migrations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: document_sequences; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: invoice_items; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: invoice_payments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: login_history; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: product_stock; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: purchase_items; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: purchases; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: quotation_items; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: quotations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: sale_items; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: sales; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: stock_movements; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: stock_transfers; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Name: admin_notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: audit_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: branches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: brands_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: business_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: customers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: data_migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: expenses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: invoice_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: invoice_payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: invoices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: login_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: product_stock_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: purchase_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: purchases_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: quotation_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: quotations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: sale_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: sales_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: stock_movements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: stock_transfers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: suppliers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--



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



COMMIT;
