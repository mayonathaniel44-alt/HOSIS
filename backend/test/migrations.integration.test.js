const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs/promises')
const path=require('node:path')
test('additive integration migration preserves existing Front Office records',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const target=new URL(process.env.TEST_DATABASE_URL)
 assert.equal(target.pathname,'/hosis_test')
 assert.ok(['localhost','127.0.0.1'].includes(target.hostname))
 const {Pool}=require('pg')
 const pool=new Pool({connectionString:target.toString(),max:1,connectionTimeoutMillis:5000})
 const client=await pool.connect()
 try {
  await client.query('BEGIN')
  const schema=`migration_test_${process.pid}`
  await client.query(`CREATE SCHEMA ${schema}`)
  await client.query(`SET LOCAL search_path TO ${schema}`)
  const directory=path.resolve(__dirname,'../../database/schema')
  for(const file of ['01-users.sql','11-front-office.sql','12-admin.sql','13-admin-session-hardening.sql']) await client.query(await fs.readFile(path.join(directory,file),'utf8'))
  await client.query("INSERT INTO users(username,password_hash,role) VALUES('existing.staff','not-a-real-login-hash','FRONT_OFFICE')")
  await client.query("INSERT INTO guests(first_name,last_name) VALUES('Existing','Guest')")
  await client.query("INSERT INTO rooms(room_number,room_type,floor,status) VALUES('101','Suite','1','OCCUPIED')")
  await client.query("INSERT INTO reservations(confirmation_code,guest_id,room_id,room_type,check_in,check_out,status) VALUES('EXISTING',1,1,'Suite',CURRENT_DATE,CURRENT_DATE+1,'CHECKED_IN')")
  await client.query("INSERT INTO guest_requests(guest_id,guest_name,room_id,request_text,priority) VALUES(1,'Existing Guest',1,'Two towels','URGENT')")
  const before=(await client.query('SELECT row_to_json(r) AS record FROM reservations r')).rows[0].record
  for(const file of ['14-housekeeping-integration.sql','15-auth-hardening.sql']) await client.query(await fs.readFile(path.join(directory,file),'utf8'))
  const after=(await client.query('SELECT row_to_json(r) AS record FROM reservations r')).rows[0].record
  assert.deepEqual(after,before)
  assert.equal((await client.query('SELECT room_status FROM hk_rooms WHERE room_id=1')).rows[0].room_status,'OCCUPIED')
  assert.equal((await client.query('SELECT request_details FROM hk_guest_requests WHERE front_office_request_id=1')).rows[0].request_details,'Two towels')
 } finally { await client.query('ROLLBACK');client.release();await pool.end() }
})
