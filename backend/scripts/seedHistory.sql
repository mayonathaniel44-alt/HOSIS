-- Run through seedHistory.js against the local HOSIS database.
DO $$
DECLARE
  finish DATE := current_setting('hosis.history_end')::date;
  first_day DATE := (finish - interval '3 months')::date;
  day DATE;
  dep DATE;
  seq INTEGER := 0;
  slot INTEGER;
  ref TEXT;
  guest_key BIGINT;
  stay_key BIGINT;
  bill_key BIGINT;
  task_key INTEGER;
  request_key BIGINT;
  finding_key BIGINT;
  finance_key BIGINT;
  room_row rooms%ROWTYPE;
  clean_staff BIGINT;
  guest_name TEXT;
  given TEXT;
  family TEXT;
  amount NUMERIC;
  paid NUMERIC;
  stay_status TEXT;
  campaign_key TEXT;
  client_key TEXT;
  first_names TEXT[] := ARRAY['Amara','Gabriel','Isabel','Mateo','Nina','Rafael','Leona','Adrian','Tala','Nico','Mira','Joaquin','Lia','Elias','Alina','Enzo','Sofia'];
  last_names TEXT[] := ARRAY['Rivera','Mendoza','Cruz','Aquino','Santos','Villanueva','Del Rosario','Reyes','Tan','Castillo','Bautista','Lim','Valdez'];
  requests TEXT[] := ARRAY['Extra bath towels','Additional pillows','Water refill','Room refresh','Extra hangers','Fresh bed linen'];
BEGIN
  SELECT id INTO STRICT clean_staff FROM users WHERE is_active AND role='HOUSEKEEPING' ORDER BY id LIMIT 1;
  FOR slot IN 0..2 LOOP
    day := (first_day + make_interval(months => slot))::date;
    campaign_key := 'GH-HIST-CAM-' || slot;
    client_key := 'GH-HIST-CLIENT-' || slot;
    INSERT INTO sales_marketing_records(kind,id,details,created_at) VALUES
      ('campaign',campaign_key,jsonb_build_object('name',(ARRAY['City Stay Weekends','Business Travel Offers','Holiday Room Packages'])[slot+1],
        'type','Website','channel','Website','budget',25000+slot*6000,'spent',14800+slot*3100,'start',day,'end',(day+interval '1 month - 1 day')::date,
        'status',CASE WHEN slot=2 THEN 'Active' ELSE 'Completed' END),day+time '09:00'),
      ('client',client_key,jsonb_build_object('name',(ARRAY['Luntian Events Studio','Bayani Travel Collective','Mapaglaum Business Group'])[slot+1],
        'contact','Group coordinator','email','group-'||slot||'@example.test'),day+time '09:30'),
      ('promotion','GH-HIST-PROMO-'||slot,jsonb_build_object('name',(ARRAY['Weekend Room Savings','Business Traveler Rate','Three-Night City Stay'])[slot+1],
        'type','Percentage','discount',5+slot*2,'start',day,'end',(day+interval '1 month - 1 day')::date,
        'terms','Room-only offer, subject to availability.','campaignId',campaign_key,
        'status',CASE WHEN slot=2 THEN 'Active' ELSE 'Expired' END),day+time '10:00');
  END LOOP;

  FOR day IN SELECT first_day + n FROM generate_series(2, finish-first_day-2) n LOOP
    FOR slot IN 1..CASE WHEN extract(isodow FROM day) IN (5,6,7) THEN 3 ELSE 2 END LOOP
      seq := seq+1;
      ref := 'GH-HIST-' || to_char(day,'YYMMDD') || '-' || slot;
      dep := LEAST(finish-1, day+1+seq%4);
      SELECT r.* INTO room_row FROM rooms r
      WHERE r.status <> 'OUT_OF_ORDER' AND NOT EXISTS (
        SELECT 1 FROM reservations a WHERE a.room_id=r.id AND a.status<>'CANCELLED'
          AND a.check_in<dep AND a.check_out>day
      ) ORDER BY md5(r.id::text || ref) LIMIT 1;
      IF NOT FOUND THEN CONTINUE; END IF;
      given := first_names[1+seq%array_length(first_names,1)];
      family := last_names[1+(seq*7+seq/17)%array_length(last_names,1)];
      guest_name := given||' '||family;
      INSERT INTO guests(first_name,last_name,email,loyalty_tier,created_at,updated_at)
      VALUES(given,family,lower(ref)||'@example.test',
        CASE WHEN seq%9=0 THEN 'Gold' WHEN seq%5=0 THEN 'Silver' ELSE 'Member' END,day-2,day-2)
      RETURNING id INTO guest_key;
      stay_status := CASE WHEN seq%13=0 THEN 'CANCELLED' ELSE 'CHECKED_OUT' END;
      INSERT INTO reservations(confirmation_code,guest_id,room_id,room_type,check_in,check_out,status,
        created_at,updated_at,actual_checkout_at)
      VALUES(ref,guest_key,room_row.id,room_row.room_type,day,dep,stay_status,day-2,
        CASE WHEN stay_status='CANCELLED' THEN day-1+time '13:00' ELSE dep+time '11:00' END,
        CASE WHEN stay_status='CHECKED_OUT' THEN dep+time '11:00' END) RETURNING id INTO stay_key;
      INSERT INTO front_office_activity(action,description,created_at) VALUES
        ('RESERVATION_CREATED','Reservation '||ref||' created for '||guest_name,day-2+time '14:00'),
        (CASE WHEN stay_status='CANCELLED' THEN 'RESERVATION_CANCELLED' ELSE 'RESERVATION_CHECKED_OUT' END,
          'Reservation '||ref||' '||replace(lower(stay_status),'_',' '),
          CASE WHEN stay_status='CANCELLED' THEN day-1+time '13:00' ELSE dep+time '11:00' END);
      IF stay_status='CANCELLED' THEN CONTINUE; END IF;

      amount := (dep-day) * (CASE lower(room_row.room_type) WHEN 'suite' THEN 7200 WHEN 'deluxe' THEN 4800 ELSE 3200 END + (seq%6)*150);
      INSERT INTO invoices(invoice_number,guest_id,reservation_id,amount,status,charge_type,issued_at,created_at,updated_at)
      VALUES('INV-'||ref,guest_key,stay_key,amount,'PAID','LODGING',day,day+time '15:00',dep+time '10:30') RETURNING id INTO bill_key;
      paid := CASE WHEN seq%4=0 THEN round(amount*.25,2) ELSE 0 END;
      IF paid>0 THEN
        INSERT INTO payments(invoice_id,amount,payment_method,reference,paid_at,created_at)
        VALUES(bill_key,paid,'BANK_TRANSFER','DEP-'||ref,day+time '15:30',day+time '15:30');
      END IF;
      INSERT INTO payments(invoice_id,amount,payment_method,reference,paid_at,created_at)
      VALUES(bill_key,amount-paid,(ARRAY['CARD','CASH','BANK_TRANSFER'])[1+seq%3],
        'RCPT-'||ref,dep+time '10:30',dep+time '10:30');
      INSERT INTO front_office_activity(action,description,created_at) VALUES
        ('PAYMENT_RECORDED','Posted lodging settlement for '||ref,dep+time '10:30');
      INSERT INTO hk_cleaning_tasks(room_id,staff_id,task_type,task_status,notes,reservation_reference,
        assigned_date,due_time,start_time,completion_time,created_at)
      VALUES(room_row.id,clean_staff,'CHECKOUT','INSPECTED','Checkout turnover completed',ref,dep,'14:00',
        dep+time '11:20',dep+time '12:20',dep+time '11:00') RETURNING task_id INTO task_key;
      INSERT INTO hk_inspections(task_id,inspected_by,inspection_result,remarks,inspected_at)
      VALUES(task_key,clean_staff,'PASSED','Room ready for release',dep+time '12:45');

      IF seq%3=0 THEN
        INSERT INTO guest_requests(guest_id,guest_name,room_id,reservation_id,request_text,status,
          created_at,updated_at,due_at)
        VALUES(guest_key,guest_name,room_row.id,stay_key,requests[1+seq%array_length(requests,1)],
          'COMPLETED',day+time '18:00',day+time '18:25',day+time '19:00') RETURNING id INTO request_key;
        UPDATE hk_guest_requests SET staff_id=clean_staff,reservation_reference=ref,
          requested_at=day+time '18:00',completed_at=day+time '18:25',completion_notes='Delivered to the guest'
        WHERE front_office_request_id=request_key;
      END IF;
      IF seq%11=0 THEN
        INSERT INTO hk_lost_found_items(room_id,found_by,item_description,found_location,storage_label,storage_location,item_status,found_at)
        VALUES(room_row.id,clean_staff,(ARRAY['Umbrella','Phone charger','Travel pouch'])[1+seq%3],
          'Guest room','LF-'||ref,'Housekeeping locker','STORED',dep+time '11:25');
      END IF;
      IF seq%12=0 THEN
        INSERT INTO hk_maintenance_requests(room_id,reported_by,issue_category,issue_description,status,reported_at,resolved_at)
        VALUES(room_row.id,clean_staff,(ARRAY['PLUMBING','AIRCON','ELECTRICAL'])[1+(seq/12)%3],
          (ARRAY['Adjusted bathroom tap','Serviced air filter','Replaced desk lamp'])[1+(seq/12)%3],
          'CLOSED',dep+time '11:45',dep+time '14:15');
      END IF;
      IF seq%17=0 THEN
        INSERT INTO finance_invoices(invoice_code,guest_name,reservation_code,room_number,subtotal,total_amount,paid_amount,
          balance_due,status,issue_date,due_date,created_at,updated_at)
        VALUES('HK-'||ref,guest_name,ref,room_row.room_number,650,650,650,0,'PAID',dep,dep,dep+time '10:00',dep+time '10:40')
        RETURNING id INTO finance_key;
        INSERT INTO finance_invoice_items(invoice_id,description,quantity,unit_price,amount,source)
        VALUES(finance_key,'Linen replacement',1,650,650,'HOUSEKEEPING_FINDING');
        INSERT INTO finance_payments(receipt_code,invoice_id,amount,payment_method,reference,paid_at,created_at)
        VALUES('HK-R-'||ref,finance_key,650,'CARD','HK-SET-'||ref,dep+time '10:40',dep+time '10:40');
        INSERT INTO hk_charge_findings(public_reference,room_id,reservation_id,reservation_reference,category,
          description,estimated_amount,status,reported_by,reported_at,front_office_reviewed_at,finance_decided_at,final_amount,finance_invoice_id,version)
        VALUES('HKF-'||ref,room_row.id,stay_key,ref,'LINEN_LOSS','Missing bath linen confirmed at checkout',
          650,'APPROVED',clean_staff,dep+time '09:15',dep+time '09:35',dep+time '10:00',650,finance_key,3)
        RETURNING finding_id INTO finding_key;
        INSERT INTO hk_charge_finding_events(finding_id,from_status,to_status,action,actor_role,created_at) VALUES
          (finding_key,null,'REPORTED','FINDING_REPORTED','HOUSEKEEPING',dep+time '09:15'),
          (finding_key,'REPORTED','FOR_FINANCE','FORWARDED_TO_FINANCE','FRONT_OFFICE',dep+time '09:35'),
          (finding_key,'FOR_FINANCE','APPROVED','CHARGE_APPROVED','FINANCE',dep+time '10:00');
      END IF;

      IF seq%5=0 THEN
        campaign_key := 'GH-HIST-CAM-' || LEAST(2,(day-first_day)/31);
        client_key := CASE WHEN seq%10=0 THEN 'GH-HIST-CLIENT-'||LEAST(2,(day-first_day)/31) END;
        INSERT INTO sales_marketing_records(kind,id,details,created_at,reservation_id) VALUES
          ('inquiry','INQ-'||ref,jsonb_build_object('name',guest_name,'subject','Accommodation enquiry','date',day-2,
            'source','Website','status','Converted','campaignId',campaign_key,'clientId',client_key,'leadId','LEAD-'||ref),day-2,NULL),
          ('lead','LEAD-'||ref,jsonb_build_object('name',guest_name,'subject','Accommodation enquiry','date',day-2,
            'source','Website','status','Converted','campaignId',campaign_key,'clientId',client_key,'inquiryId','INQ-'||ref,'saleId','SALE-'||ref),day-2,NULL),
          ('quotation','QUOTE-'||ref,jsonb_build_object('name','Room quote for '||guest_name,'date',day-2,
            'leadId','LEAD-'||ref,'status','Accepted','checkIn',day,'checkOut',dep,'validUntil',day-1,'gross',amount,
            'amount',amount,'discount',0,'campaignId',campaign_key,'clientId',client_key,'saleId','SALE-'||ref),day-2,NULL),
          ('sale','SALE-'||ref,jsonb_build_object('name',guest_name,'customer',guest_name,'item','Room accommodation','date',day-1,
            'status','Confirmed','payment','Paid','amount',amount,'reservationRef',ref,'campaignId',campaign_key,'clientId',client_key,
            'leadId','LEAD-'||ref,'quotationId','QUOTE-'||ref,'checkIn',day,'checkOut',dep),day-1,stay_key),
          ('payment','PAY-'||ref,jsonb_build_object('name',guest_name,'saleId','SALE-'||ref,'date',dep,
            'type','Receipt','amount',amount,'reference','REC-'||ref,'externalReference','RCPT-'||ref),dep,NULL);
        INSERT INTO front_office_activity(action,description,created_at,sales_record_id,sales_kind)
        VALUES('SALES_RECORD_CREATED','Converted quote linked to '||ref,day-1+time '15:00','SALE-'||ref,'sales');
      END IF;
    END LOOP;
  END LOOP;
END $$;

DO $$
DECLARE
  finish DATE := current_setting('hosis.history_end')::date;
  start_day DATE := (finish - interval '3 months')::date;
  d DATE;
  n INTEGER;
  p INTEGER;
  spend NUMERIC;
  worker TEXT;
  key TEXT;
  source_id TEXT;
  hr_names TEXT[] := ARRAY['Arielle Velasco','Marco Navarro','Celina Flores','Dante Ramos','Nadine Agustin','Julio Ortega'];
  departments TEXT[] := ARRAY['frontdesk','housekeeping','maintenance','finance','housekeeping','sales'];
BEGIN
  FOR n IN 1..6 LOOP
    worker := 'EMP-HIST-'||n;
    INSERT INTO hr_employees(id,name,dept,pos,status,hired,rate,assignment,week,today,time_in,days,late,absences,overtime,contact)
    VALUES(worker,hr_names[n],CASE WHEN n=6 THEN 'frontdesk' ELSE departments[n] END,
      (ARRAY['Guest Services Associate','Room Attendant','Maintenance Technician','Finance Clerk','Housekeeping Attendant','Reservations Agent'])[n],
      CASE WHEN n%3=0 THEN 'Probationary' ELSE 'Regular' END,start_day-40,570+n*45,'Hotel Operations',
      '["AM","AM","AM","AM","AM","OFF","OFF"]','Present','07:00',9+n,n%3,n%2,n%4,'staff-'||n||'@example.test');
    d := start_day + n*10;
    INSERT INTO hr_leave_requests(id,emp,type,start_date,end_date,days,status,reason,submitted_at,decided_at)
    VALUES('LV-HIST-'||n,worker,CASE WHEN n%2=0 THEN 'Sick Leave' ELSE 'Vacation Leave' END,
      d,d,1,'Approved','Scheduled time off',d-3+time '08:00',d-2+time '14:00');
    INSERT INTO finance_leave_requests(request_code,employee_id,employee_name,department,leave_type,start_date,end_date,
      total_days,reason,status,approved_at,created_at,updated_at)
    VALUES('FLV-HIST-'||n,worker,hr_names[n],CASE WHEN n=6 THEN 'frontdesk' ELSE departments[n] END,
      CASE WHEN n%2=0 THEN 'Sick Leave (SL)' ELSE 'Vacation Leave (VL)' END,
      d,d,1,'Scheduled time off','APPROVED',d-2+time '14:00',d-3+time '08:00',d-2+time '14:00');
    FOR p IN 0..5 LOOP
      d := start_day + p*15 + 13;
      spend := (570+n*45) * (10+n%3);
      INSERT INTO finance_payroll(payroll_code,employee_id,employee_name,department,role_title,regular_hours,
        basic_pay,gross_pay,total_deductions,net_payable,period_start,period_end,status,disbursed_at,created_at)
      VALUES('PR-HIST-'||n||'-'||p,worker,hr_names[n],CASE WHEN n=6 THEN 'frontdesk' ELSE departments[n] END,
        'Hotel Operations',(10+n%3)*8,spend,spend,0,spend,d-13,d,
        CASE WHEN p=5 THEN 'APPROVED' ELSE 'DISBURSED' END,
        CASE WHEN p<5 THEN d+1+time '14:00' END,d+time '15:00');
    END LOOP;
  END LOOP;

  PERFORM revision FROM engineering.engineering_state WHERE id=1 FOR UPDATE;
  FOR n IN 1..24 LOOP
    d := start_day + n*3;
    spend := 900+(n%7)*420+n*75;
    source_id := CASE WHEN n%3=0 THEN 'ENG-HIST-'||n END;
    key := 'EXP-HIST-'||n;
    IF source_id IS NOT NULL THEN
      INSERT INTO engineering.engineering_records(collection,record_id,payload) VALUES
        ('finance',source_id,jsonb_build_object('id',source_id,'date',d,'type','Contractor',
          'description',(ARRAY['Preventive AC servicing','Guest room fixture replacement','Pump inspection'])[1+(n/3)%3],
          'amount',spend,'payee','Pacific Facilities Supply','status','Unpaid','reference','PO-'||source_id));
    END IF;
    IF n=24 THEN CONTINUE; END IF;
    INSERT INTO finance_expenses(voucher_code,department,category,amount,status,notes,expense_date,
      created_at,approved_at,settlement_reference,settled_at,engineering_record_id,work_order_id,expense_classification)
    VALUES(key,CASE WHEN source_id IS NOT NULL THEN 'Engineering & Maintenance'
        WHEN n%2=0 THEN 'Housekeeping' ELSE 'Front Office' END,
      CASE WHEN source_id IS NOT NULL THEN 'Preventive maintenance' WHEN n%2=0 THEN 'Linen and supplies' ELSE 'Guest service supplies' END,
      spend,CASE WHEN n>=21 THEN 'PENDING' WHEN n%5=0 THEN 'APPROVED' ELSE 'PAID' END,
      'Operating cost',d,d+time '09:00',CASE WHEN n<21 THEN d+time '14:00' END,
      CASE WHEN n<21 AND n%5<>0 THEN 'BANK-'||key END,
      CASE WHEN n<21 AND n%5<>0 THEN d+1+time '10:00' END,source_id,source_id,'OPEX');
    INSERT INTO finance_audit_log(transaction_code,activity,reference_code,amount,source,user_name,created_at)
    VALUES('FIN-HIST-'||n,'Expense voucher recorded',key,spend,'Finance','Historical sample',d+time '09:00');
  END LOOP;
  UPDATE engineering.engineering_state SET revision=revision+1 WHERE id=1;

  FOR n IN 1..15 LOOP
    d := finish - (1+n*2);
    key := 'GH-HIST-PIPE-'||n;
    INSERT INTO sales_marketing_records(kind,id,details,created_at) VALUES
      ('inquiry','INQ-'||key,jsonb_build_object('name',(ARRAY['Luntian Events Studio','Bayani Travel Collective','Mapaglaum Business Group'])[1+n%3],
        'subject',(ARRAY['Weekend stay','Project team accommodation','Family room package'])[1+n%3],'date',d,
        'source',(ARRAY['Email','Website','Referral'])[1+n%3],'status',CASE WHEN n%2=0 THEN 'New' ELSE 'In Progress' END,
        'followUp',finish+1+n%6,'clientId','GH-HIST-CLIENT-'||n%3,'campaignId','GH-HIST-CAM-2'),d+time '13:00'),
      ('lead','LEAD-'||key,jsonb_build_object('name',(ARRAY['Luntian Events Studio','Bayani Travel Collective','Mapaglaum Business Group'])[1+n%3],
        'subject','Upcoming room block','date',d,'source','Referral','status',CASE WHEN n%2=0 THEN 'Qualified' ELSE 'New' END,
        'followUp',finish+n%6,'clientId','GH-HIST-CLIENT-'||n%3,'campaignId','GH-HIST-CAM-2'),d+time '14:00');
    IF n%3=0 THEN
      INSERT INTO sales_marketing_records(kind,id,details,created_at) VALUES
        ('quotation','QUOTE-'||key,jsonb_build_object('name','Accommodation proposal','date',d,'leadId','LEAD-'||key,
          'status','Draft','checkIn',finish+n,'checkOut',finish+n+3,'validUntil',finish+n-1,
          'gross',13500+n*500,'amount',13500+n*500,'discount',0,'campaignId','GH-HIST-CAM-2'),d+time '15:00');
    END IF;
  END LOOP;

  INSERT INTO finance_night_audits(audit_date,total_room_revenue,total_payments_collected,
    occupied_rooms_count,status,audited_by,audited_at,notes)
  SELECT d.day,COALESCE(b.amount,0),COALESCE(p.amount,0),COALESCE(o.rooms,0),
    'COMPLETED','Historical sample',d.day+time '23:45','Historical day close'
  FROM (SELECT start_day + offsets.day_offset AS day FROM generate_series(2,finish-start_day-1) AS offsets(day_offset)) d
  LEFT JOIN LATERAL (SELECT SUM(amount) AS amount FROM invoices
    WHERE invoice_number LIKE 'INV-GH-HIST-%' AND issued_at=d.day) b ON true
  LEFT JOIN LATERAL (SELECT SUM(amount) AS amount FROM payments
    WHERE (reference LIKE 'RCPT-GH-HIST-%' OR reference LIKE 'DEP-GH-HIST-%') AND paid_at::date=d.day) p ON true
  LEFT JOIN LATERAL (SELECT count(*) AS rooms FROM reservations
    WHERE confirmation_code LIKE 'GH-HIST-%' AND status='CHECKED_OUT' AND check_in<=d.day AND check_out>d.day) o ON true
  ON CONFLICT(audit_date) DO NOTHING;
END $$;
