
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS guest (
    guest_id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT
);

CREATE TABLE IF NOT EXISTS corporate_client (
    corporate_client_id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    contact_person TEXT,
    email TEXT,
    phone TEXT,
    company_address TEXT
);

CREATE TABLE IF NOT EXISTS marketing_campaign (
    campaign_id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_name TEXT NOT NULL,
    campaign_type TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    campaign_status TEXT DEFAULT 'Draft',
    budget REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS promotion_offer (
    offer_id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    offer_name TEXT NOT NULL,
    discount_type TEXT,
    discount_value REAL DEFAULT 0,
    valid_from TEXT,
    valid_until TEXT,
    offer_status TEXT DEFAULT 'Active',
    FOREIGN KEY (campaign_id)
        REFERENCES marketing_campaign(campaign_id)
);

CREATE TABLE IF NOT EXISTS campaign_performance (
    performance_id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    report_date TEXT NOT NULL,
    inquiries_generated INTEGER DEFAULT 0,
    leads_generated INTEGER DEFAULT 0,
    bookings_generated INTEGER DEFAULT 0,
    revenue_generated REAL DEFAULT 0,
    FOREIGN KEY (campaign_id)
        REFERENCES marketing_campaign(campaign_id)
);

CREATE TABLE IF NOT EXISTS inquiry (
    inquiry_id INTEGER PRIMARY KEY AUTOINCREMENT,
    guest_id INTEGER NOT NULL,
    campaign_id INTEGER,
    offer_id INTEGER,
    inquiry_date TEXT NOT NULL,
    inquiry_type TEXT,
    inquiry_status TEXT DEFAULT 'New',
    message TEXT,
    FOREIGN KEY (guest_id) REFERENCES guest(guest_id),
    FOREIGN KEY (campaign_id) REFERENCES marketing_campaign(campaign_id),
    FOREIGN KEY (offer_id) REFERENCES promotion_offer(offer_id)
);

CREATE TABLE IF NOT EXISTS sales_lead (
    lead_id INTEGER PRIMARY KEY AUTOINCREMENT,
    inquiry_id INTEGER,
    guest_id INTEGER,
    corporate_client_id INTEGER,
    lead_date TEXT NOT NULL,
    lead_status TEXT DEFAULT 'New',
    estimated_value REAL DEFAULT 0,
    FOREIGN KEY (inquiry_id) REFERENCES inquiry(inquiry_id),
    FOREIGN KEY (guest_id) REFERENCES guest(guest_id),
    FOREIGN KEY (corporate_client_id)
        REFERENCES corporate_client(corporate_client_id)
);

CREATE TABLE IF NOT EXISTS booking (
    booking_id INTEGER PRIMARY KEY AUTOINCREMENT,
    guest_id INTEGER,
    lead_id INTEGER,
    offer_id INTEGER,
    booking_date TEXT,
    check_in_date TEXT,
    check_out_date TEXT,
    total_amount REAL DEFAULT 0,
    booking_status TEXT DEFAULT 'Pending',
    FOREIGN KEY (guest_id) REFERENCES guest(guest_id),
    FOREIGN KEY (lead_id) REFERENCES sales_lead(lead_id),
    FOREIGN KEY (offer_id) REFERENCES promotion_offer(offer_id)
);

CREATE TABLE IF NOT EXISTS room_type (
    room_type_id INTEGER PRIMARY KEY AUTOINCREMENT,
    type_name TEXT NOT NULL,
    capacity INTEGER,
    base_rate REAL DEFAULT 0,
    description TEXT
);

CREATE TABLE IF NOT EXISTS hotel_service (
    service_id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_name TEXT NOT NULL,
    description TEXT,
    service_rate REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS booking_item (
    booking_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    room_type_id INTEGER,
    service_id INTEGER,
    quantity INTEGER DEFAULT 1,
    unit_price REAL DEFAULT 0,
    subtotal REAL DEFAULT 0,
    FOREIGN KEY (booking_id) REFERENCES booking(booking_id),
    FOREIGN KEY (room_type_id) REFERENCES room_type(room_type_id),
    FOREIGN KEY (service_id) REFERENCES hotel_service(service_id)
);

CREATE TABLE IF NOT EXISTS reservation (
    reservation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    reservation_date TEXT,
    confirmation_code TEXT,
    reservation_status TEXT DEFAULT 'Pending',
    FOREIGN KEY (booking_id) REFERENCES booking(booking_id)
);

CREATE TABLE IF NOT EXISTS sales_record (
    sales_record_id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    sales_date TEXT NOT NULL,
    gross_amount REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    net_amount REAL DEFAULT 0,
    payment_status TEXT DEFAULT 'Unpaid',
    FOREIGN KEY (booking_id) REFERENCES booking(booking_id)
);
